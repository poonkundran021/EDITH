/* EDITH | Environmental Data Intelligence And Tracking Hub
   ESP32 Dev Module. No SD card. BMP280 is the ONLY temperature source.
   Libraries: Adafruit BMP280, Adafruit MPU6050, Adafruit Unified Sensor,
   Adafruit BusIO, DHT sensor library, ArduinoJson 7.
   Configure config.h before upload. Keep still for 3 seconds after boot.
*/
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_BMP280.h>
#include <Adafruit_MPU6050.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <esp_arduino_version.h>
#include <time.h>
#include <sys/time.h>
#include "config.h"
#include "trust.h"
#include "imu_mount.h"

Adafruit_BMP280 bmp;
Adafruit_MPU6050 mpu;
DHT dht(DHT_PIN, DHT11);
uint8_t bmpAddress=0,mpuAddress=0;
bool bmpOK=false,dhtOK=false,mpuOK=false,calibrated=false,smokeDetected=false;
float temperature=NAN,pressure=NAN,humidity=NAN;
float qw=1,qx=0,qy=0,qz=0,biasX=0,biasY=0,biasZ=0;
float sumX=0,sumY=0,sumZ=0,previousAX=0,previousAY=0,previousAZ=0;
uint16_t calibrationSamples=0;uint32_t sequence=0;String bootId;
int gas=0;unsigned int railSamples=0;
const char *mqState="warming",*smokeState="warming";
uint32_t lastImu=0,lastEnvironment=0,lastDht=0,lastRetry=0,lastPacket=0;
struct Packet {char json[1200];uint32_t sampledAt;};
QueueHandle_t uplinkQueue;

bool ping(uint8_t addr){if(!addr)return false;Wire.beginTransmission(addr);return Wire.endTransmission()==0;}
bool hasI2CSensors(){return ping(0x76)||ping(0x77)||ping(0x68)||ping(0x69);}
void configureI2C(){
 Wire.begin(I2C_SDA,I2C_SCL);Wire.setClock(100000);Wire.setTimeOut(25);
 int selectedSDA=I2C_SDA;
 // The original sketch's header and executable pin disagree. Prefer its configured
 // pin; try standard ESP32 SDA21 only when neither sensor responds on that bus.
 if(!hasI2CSensors() && I2C_SDA!=21 && I2C_SCL!=21){
   Wire.end();Wire.begin(21,I2C_SCL);Wire.setClock(100000);Wire.setTimeOut(25);
   if(hasI2CSensors())selectedSDA=21;
   else{Wire.end();Wire.begin(I2C_SDA,I2C_SCL);Wire.setClock(100000);Wire.setTimeOut(25);}
 }
 Serial.printf("I2C: SDA=%d SCL=%d\n",selectedSDA,I2C_SCL);
 int found=0;for(uint8_t a=1;a<127;a++)if(ping(a)){Serial.printf("  I2C device: 0x%02X\n",a);found++;}
 if(!found)Serial.println("No I2C devices: check sensor power, project switch, common GND and SDA/SCL.");
}
void initBMP(){for(uint8_t a: {uint8_t(0x76),uint8_t(0x77)}){if(bmp.begin(a)){bmpAddress=a;return;}}bmpOK=false;}
void resetCalibration(){calibrated=false;calibrationSamples=0;sumX=sumY=sumZ=0;qw=1;qx=qy=qz=0;}
void initMPU(){for(uint8_t a: {uint8_t(0x68),uint8_t(0x69)}){if(mpu.begin(a)){mpuAddress=a;mpu.setAccelerometerRange(MPU6050_RANGE_4_G);mpu.setGyroRange(MPU6050_RANGE_500_DEG);mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);mpuOK=true;resetCalibration();return;}}mpuOK=false;}

// Read exactly 14 bytes: detect a disconnected MPU instead of trusting cached values.
bool rawIMU(float &ax,float &ay,float &az,float &gx,float &gy,float &gz){
 Wire.beginTransmission(mpuAddress);Wire.write(0x3B);
 if(Wire.endTransmission(false)!=0)return false;
 if(Wire.requestFrom(mpuAddress,uint8_t(14),uint8_t(true))!=14)return false;
 int16_t v[7];for(int i=0;i<7;i++){uint16_t hi=Wire.read(),lo=Wire.read();v[i]=int16_t((hi<<8)|lo);}
 ax=v[0]/8192.0f;ay=v[1]/8192.0f;az=v[2]/8192.0f;
 gx=v[4]/65.5f*DEG_TO_RAD;gy=v[5]/65.5f*DEG_TO_RAD;gz=v[6]/65.5f*DEG_TO_RAD;
 // Align before calibration, gravity initialization and gyro integration.
 alignImuVector(ax,ay,az,IMU_MOUNT_UPSIDE_DOWN,IMU_MOUNT_YAW_DEG);
 alignImuVector(gx,gy,gz,IMU_MOUNT_UPSIDE_DOWN,IMU_MOUNT_YAW_DEG);
 return isfinite(ax+ay+az+gx+gy+gz)&&(fabsf(ax)+fabsf(ay)+fabsf(az)>.001f);
}
void seedAttitude(float ax,float ay,float az){
 float roll=atan2f(ay,az),pitch=atan2f(-ax,sqrtf(ay*ay+az*az));
 qw=cosf(roll/2)*cosf(pitch/2);qx=sinf(roll/2)*cosf(pitch/2);qy=cosf(roll/2)*sinf(pitch/2);qz=-sinf(roll/2)*sinf(pitch/2);
}
// Quaternion complementary filter (gravity-corrected gyro). No magnetometer => relative yaw.
void updateAttitude(float ax,float ay,float az,float gx,float gy,float gz,float dt){
 const float norm=sqrtf(ax*ax+ay*ay+az*az);
 if(!calibrated){
   float change=fabsf(ax-previousAX)+fabsf(ay-previousAY)+fabsf(az-previousAZ);
   previousAX=ax;previousAY=ay;previousAZ=az;
   if(norm<.92f||norm>1.08f||fabsf(gx)+fabsf(gy)+fabsf(gz)>.12f||change>.03f){calibrationSamples=0;sumX=sumY=sumZ=0;return;}
   sumX+=gx;sumY+=gy;sumZ+=gz;calibrationSamples++;
   if(calibrationSamples>=300){biasX=sumX/calibrationSamples;biasY=sumY/calibrationSamples;biasZ=sumZ/calibrationSamples;seedAttitude(ax,ay,az);calibrated=true;Serial.println("IMU calibrated. Ready for movement.");}
   return;
 }
 gx-=biasX;gy-=biasY;gz-=biasZ;
 // Suppress gravity corrections under strong linear acceleration.
 if(norm>.85f&&norm<1.15f){ax/=norm;ay/=norm;az/=norm;
   float vx=2*(qx*qz-qw*qy),vy=2*(qw*qx+qy*qz),vz=qw*qw-qx*qx-qy*qy+qz*qz;
   gx+=2.0f*(ay*vz-az*vy);gy+=2.0f*(az*vx-ax*vz);gz+=2.0f*(ax*vy-ay*vx);
 }
 const float w=qw,x=qx,y=qy,z=qz,half=.5f*dt;
 qw+=(-x*gx-y*gy-z*gz)*half;qx+=(w*gx+y*gz-z*gy)*half;qy+=(w*gy-x*gz+z*gx)*half;qz+=(w*gz+x*gy-y*gx)*half;
 const float length=sqrtf(qw*qw+qx*qx+qy*qy+qz*qz);
 if(!isfinite(length)||length<.01f){resetCalibration();return;}
 qw/=length;qx/=length;qy/=length;qz/=length;
}
void sampleEnvironment(uint32_t now){
 if(bmpAddress&&ping(bmpAddress)){
   float t=bmp.readTemperature(),p=bmp.readPressure()/100.0f;
   bmpOK=isfinite(t)&&isfinite(p)&&t>=-40&&t<=85&&p>=300&&p<=1100;
   temperature=bmpOK?t:NAN;pressure=bmpOK?p:NAN;
 }else{bmpOK=false;temperature=pressure=NAN;}
 long total=0;for(int i=0;i<16;i++)total+=analogRead(MQ2_PIN);gas=total/16;
 railSamples=(gas<=5||gas>=4090)?min(railSamples+1,100U):0;
 if(railSamples>=8){mqState="suspect";smokeState="unknown";smokeDetected=false;}
 else if(now<MQ_WARMUP_MS){mqState="warming";smokeState="warming";}
 else{mqState="monitoring";if(gas>=MQ_THRESHOLD)smokeDetected=true;else if(gas<=MQ_THRESHOLD-MQ_HYSTERESIS)smokeDetected=false;smokeState=smokeDetected?"detected":"clear";}
}
void queuePacket(uint32_t now){
 JsonDocument doc;doc["device"]="edith-01";doc["boot"]=bootId;doc["seq"]=++sequence;doc["location"]=STATION_NAME;
 struct timeval clockNow;gettimeofday(&clockNow,nullptr);doc["capturedAt"]=uint64_t(clockNow.tv_sec)*1000+clockNow.tv_usec/1000;
 if(bmpOK){doc["temperature"]=temperature;doc["pressure"]=pressure;}else{doc["temperature"]=nullptr;doc["pressure"]=nullptr;}
 if(dhtOK)doc["humidity"]=humidity;else doc["humidity"]=nullptr;
 doc["gas"]=gas;doc["smoke"]=smokeState;
 if(mpuOK&&calibrated){
   // Already expressed in the main board's frame; do not flip again in the UI.
   JsonArray q=doc["quaternion"].to<JsonArray>();q.add(qw);q.add(qx);q.add(qy);q.add(qz);
 }else doc["quaternion"]=nullptr;
 JsonObject h=doc["health"].to<JsonObject>();h["bmp"]=bmpOK;h["dht"]=dhtOK;h["mpu"]=mpuOK;h["mq"]=mqState;h["calibrated"]=calibrated;
 doc["uptime"]=now/1000;doc["rssi"]=WiFi.status()==WL_CONNECTED?WiFi.RSSI():-127;
 Packet packet{};packet.sampledAt=now;serializeJson(doc,packet.json,sizeof(packet.json));xQueueOverwrite(uplinkQueue,&packet);
}
void writeBreathingLED(uint8_t brightness){
 if(LED_ACTIVE_LOW)brightness=255-brightness;
 #if ESP_ARDUINO_VERSION_MAJOR >= 3
 ledcWrite(LED_PIN,brightness);
 #else
 ledcWrite(0,brightness);
 #endif
}
// Physical LED only. A gentle four-second fade, unaffected by any sensor fault.
void breathingTask(void*){
 for(;;){
   float phase=(millis()%4000)/4000.0f;
   float level=.5f-.5f*cosf(phase*2*PI);
   writeBreathingLED(uint8_t(3+252*level*level));
   vTaskDelay(pdMS_TO_TICKS(10));
 }
}
void uplinkTask(void*){
 WiFiClientSecure client;client.setCACert(EDITH_ROOT_CA);client.setHandshakeTimeout(8);
 HTTPClient http;http.setConnectTimeout(5000);http.setTimeout(4000);http.setReuse(true);
 bool begun=false,announcedWiFi=false;uint32_t lastReconnect=0,lastNotice=0,lastSuccessLog=0,accepted=0;
 for(;;){
   if(WiFi.status()!=WL_CONNECTED){announcedWiFi=false;if(begun){http.end();begun=false;}if(millis()-lastReconnect>=10000){lastReconnect=millis();Serial.printf("Wi-Fi not connected (status %d). Check configured 2.4 GHz hotspot and internet.\n",int(WiFi.status()));WiFi.reconnect();}vTaskDelay(pdMS_TO_TICKS(250));continue;}
   if(!announcedWiFi){Serial.printf("Wi-Fi connected. IP: %s; signal: %d dBm\n",WiFi.localIP().toString().c_str(),WiFi.RSSI());announcedWiFi=true;}
   if(time(nullptr)<1700000000){if(millis()-lastNotice>=10000){lastNotice=millis();Serial.println("Waiting for NTP clock. Internet and UDP port 123 must be available for HTTPS.");}vTaskDelay(pdMS_TO_TICKS(500));continue;} // TLS needs synchronized time.
   Packet packet;if(xQueueReceive(uplinkQueue,&packet,pdMS_TO_TICKS(500))!=pdTRUE)continue;
   if(millis()-packet.sampledAt>2000)continue; // Never present queued old samples as live.
   if(!begun){begun=http.begin(client,TELEMETRY_URL);if(!begun){vTaskDelay(pdMS_TO_TICKS(2000));continue;}http.addHeader("Content-Type","application/json");http.addHeader("Authorization",String("Bearer ")+DEVICE_TOKEN);}
   int result=http.POST((uint8_t*)packet.json,strlen(packet.json));
   String response=result>0?http.getString():String(); // Consume response for keep-alive.
   JsonDocument reply;bool stored=result==200&&!deserializeJson(reply,response)&&reply["accepted"].as<bool>();
   if(!stored){
     Serial.printf("Uplink not accepted (HTTP %d). ",result);
     if(result==401)Serial.println("Device token mismatch.");
     else if(result==422)Serial.println("Check sample values and NTP clock.");
     else if(result==200)Serial.println("Duplicate sequence; next fresh sample will be sent.");
     else Serial.println("Check internet, receiver URL and TLS clock.");
     http.end();begun=false;vTaskDelay(pdMS_TO_TICKS(2000));
   }else{
     accepted++;if(accepted==1||millis()-lastSuccessLog>=10000){lastSuccessLog=millis();Serial.printf("LIVE: website accepted %lu sensor packets.\n",(unsigned long)accepted);}
     vTaskDelay(pdMS_TO_TICKS(UPLOAD_INTERVAL_MS));
   }
 }
}
void setup(){
 #if ESP_ARDUINO_VERSION_MAJOR >= 3
 ledcAttach(LED_PIN,5000,8);
 #else
 ledcSetup(0,5000,8);ledcAttachPin(LED_PIN,0);
 #endif
 writeBreathingLED(3);
 xTaskCreate(breathingTask,"led-breathing",2048,nullptr,1,nullptr);
 Serial.begin(115200);Serial.println("\nEDITH: keep the board STILL for gyro calibration.");
 Serial.println("LED: gentle 4-second breathing, no fault blinking. IMU mounting compensation enabled in config.h.");
 configureI2C();
 analogReadResolution(12);analogSetPinAttenuation(MQ2_PIN,ADC_11db);
 initBMP();initMPU();dht.begin();
 Serial.printf("BMP280 initialization: %s; MPU6050: %s; DHT11 GPIO: %d; MQ-2 GPIO: %d\n",bmpAddress?"found":"not found",mpuOK?"found":"not found",DHT_PIN,MQ2_PIN);
 bootId=String((uint32_t)esp_random(),HEX)+String((uint32_t)esp_random(),HEX);
 uplinkQueue=xQueueCreate(1,sizeof(Packet));if(!uplinkQueue){Serial.println("Unable to allocate uplink queue");while(true)delay(1000);}
 WiFi.mode(WIFI_STA);WiFi.setSleep(false);WiFi.setAutoReconnect(true);WiFi.begin(WIFI_SSID,WIFI_PASSWORD);
 configTime(0,0,"pool.ntp.org","time.cloudflare.com");
 xTaskCreate(uplinkTask,"https-uplink",12288,nullptr,1,nullptr);
 lastImu=micros();Serial.println("Sensor loop ready. No SD card required.");
}
void loop(){
 uint32_t now=millis(),us=micros();
 if(us-lastImu>=10000){float dt=(us-lastImu)*.000001f;lastImu=us;
   if(mpuOK){float ax,ay,az,gx,gy,gz;if(rawIMU(ax,ay,az,gx,gy,gz)){if(dt>.2f)resetCalibration();else updateAttitude(ax,ay,az,gx,gy,gz,dt);}else{mpuOK=false;resetCalibration();}}
 }
 if(now-lastEnvironment>=500){lastEnvironment=now;sampleEnvironment(now);}
 if(now-lastDht>=2100){lastDht=now;float h=dht.readHumidity();dhtOK=isfinite(h)&&h>=0&&h<=100;humidity=dhtOK?h:NAN;}
 if(now-lastRetry>=5000){lastRetry=now;if(!bmpOK)initBMP();if(!mpuOK)initMPU();}
 static uint32_t lastDiagnostic=0;
 if(now-lastDiagnostic>=5000){lastDiagnostic=now;Serial.printf("Sensors: BMP=%s T=%.1f C P=%.1f hPa | DHT=%s H=%.1f %% | MPU=%s calibration=%s | MQ2=%d (%s)\n",bmpOK?"OK":"FAULT",temperature,pressure,dhtOK?"OK":"FAULT",humidity,mpuOK?"OK":"FAULT",calibrated?"ready":"keep still",gas,strcmp(mqState,"suspect")==0?"raw signal":mqState);}
 if(now-lastPacket>=UPLOAD_INTERVAL_MS){lastPacket=now;queuePacket(now);}
 delay(1);
}
