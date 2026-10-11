// EDITH local Wi-Fi sensor diagnostics. No cloud writes or SD card.
// Tests one sensor at a time. Terminal: a=all b=BMP d=DHT g=MQ2 m=MPU l=LED.
#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_BMP280.h>
#include <Adafruit_MPU6050.h>
#include <DHT.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include "wifi_config.h"

WebServer server(80);
class DiagnosticLog : public Print {
 public:
 String buffer;
 size_t write(uint8_t c) override {
   Serial.write(c);
   if(buffer.length()>=8192){int end=buffer.indexOf('\n',1024);buffer.remove(0,end<0?1024:end+1);}
   buffer+=char(c);return 1;
 }
} diagnosticLog;
char pendingCommand=0;
bool stationWasConnected=false;
uint32_t lastReconnect=0;

const char PAGE[] PROGMEM=R"HTML(<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EDITH Wi-Fi Sensor Tests</title><style>body{font:16px system-ui;background:#0a1323;color:#dbeafe;max-width:1000px;margin:30px auto;padding:20px}button{padding:12px;margin:4px;border:0;border-radius:8px;background:#8ce9d0;color:#061c22;cursor:pointer}pre{background:#111e32;padding:18px;white-space:pre-wrap;overflow-wrap:anywhere;border-radius:12px;min-height:200px}#status{color:#8ce9d0}</style>
<h1>EDITH / sensor diagnostics</h1><p>Live readings directly from your ESP32. Choose one sensor or cycle through all tests.</p>
<nav><button data-test="a">All sensors</button><button data-test="b">BMP280</button><button data-test="d">Humidity</button><button data-test="g">MQ-2</button><button data-test="m">MPU6050</button><button data-test="l">LED</button></nav>
<p id="status" role="status">Connecting...</p><pre id="log">Waiting for hardware...</pre>
<p>MQ-2 values are raw signals, not calibrated smoke concentration. LED operation needs visual confirmation. This firmware does not update the public dashboard.</p>
<script>
const status=document.getElementById('status'),log=document.getElementById('log');
document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{try{const r=await fetch('/test?sensor='+b.dataset.test,{method:'POST',signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error();status.textContent='Test requested';}catch{status.textContent='Request failed. Check ESP32 power and Wi-Fi.';}});
async function poll(){try{const r=await fetch('/logs',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error();log.textContent=await r.text();status.textContent='Connected / refreshed '+new Date().toLocaleTimeString();}catch{status.textContent='Disconnected / readings below are old. Check ESP32 power and Wi-Fi.';}setTimeout(poll,1000);}poll();
</script></html>)HTML";

constexpr int SDA_PRIMARY=26, SDA_ALTERNATE=21, SCL_PIN=22;
constexpr int DHT_PIN=4, MQ_PIN=34, LED_PIN=25;
constexpr int SAMPLES=8;
Adafruit_BMP280 bmp;
Adafruit_MPU6050 mpu;
DHT dht(DHT_PIN,DHT11);
uint8_t bmpAddress=0,mpuAddress=0;
bool initialized=false,all=true;
int stage=0,samples=0,valid=0;
uint32_t nextSample=0;
const char* names[]={"BMP280 temperature + pressure","DHT11 humidity","MQ-2 analog signal","MPU6050 acceleration + gyro","LED visual test"};

bool ping(uint8_t address){Wire.beginTransmission(address);return Wire.endTransmission()==0;}
int readRegister(uint8_t address,uint8_t reg){
 Wire.beginTransmission(address);Wire.write(reg);if(Wire.endTransmission(false))return -1;
 if(Wire.requestFrom(address,uint8_t(1),uint8_t(true))!=1)return -1;
 return Wire.read();
}
bool sensorResponds(){return ping(0x76)||ping(0x77)||ping(0x68)||ping(0x69);}
void scanBus(){
 Wire.end();Wire.begin(SDA_PRIMARY,SCL_PIN);Wire.setTimeOut(25);Wire.setClock(100000);
 int sda=SDA_PRIMARY;
 if(!sensorResponds()){
   Wire.end();Wire.begin(SDA_ALTERNATE,SCL_PIN);Wire.setTimeOut(25);Wire.setClock(100000);
   if(sensorResponds())sda=SDA_ALTERNATE;
   else {Wire.end();Wire.begin(SDA_PRIMARY,SCL_PIN);Wire.setTimeOut(25);Wire.setClock(100000);}
 }
 diagnosticLog.printf("\nI2C bus: SDA=%d, SCL=%d\n",sda,SCL_PIN);
 int found=0;
 for(uint8_t a=1;a<127;a++)if(ping(a)){diagnosticLog.printf("  Device ACK: 0x%02X\n",a);found++;}
 if(!found)diagnosticLog.println("NO I2C DEVICES: check project switch, power, common ground and SDA/SCL.");
 for(uint8_t a: {uint8_t(0x76),uint8_t(0x77)})if(ping(a))diagnosticLog.printf("  0x%02X chip ID=0x%02X (BMP280 usually 0x58; BME280 0x60)\n",a,readRegister(a,0xD0));
 for(uint8_t a: {uint8_t(0x68),uint8_t(0x69)})if(ping(a))diagnosticLog.printf("  0x%02X WHO_AM_I=0x%02X (MPU6050 expected 0x68)\n",a,readRegister(a,0x75));
}
void help(){
 diagnosticLog.println("\nEDITH SENSOR TEST | 115200 baud | 8 samples per sensor");
 diagnosticLog.println("Commands: a=all sequentially, b=BMP280, d=DHT11, g=MQ-2, m=MPU6050, l=LED, ?=help");
 diagnosticLog.println("Type a letter in this terminal. Each selected test repeats until another command.");
 diagnosticLog.println("No cloud uploads during diagnostics. Upload normal EDITH firmware to restore website data.");
}
void beginStage(int selected){
 stage=selected;samples=valid=0;initialized=false;digitalWrite(LED_PIN,HIGH);
 diagnosticLog.printf("\n========== %s ==========\n",names[stage]);
 if(stage==0){bmpAddress=0;for(uint8_t a:{uint8_t(0x76),uint8_t(0x77)})if(bmp.begin(a)){bmpAddress=a;break;}initialized=bmpAddress!=0;}
 if(stage==1){initialized=true;diagnosticLog.println("GPIO4, configured as DHT11. Failed reads can mean power/wiring or incorrect sensor type.");}
 if(stage==2){initialized=true;diagnosticLog.println("GPIO34 must receive MQ-2 AO (not DO). Raw ADC is not ppm or a calibrated smoke result.");diagnosticLog.println("Heater needs its specified supply and warm-up. Keep ESP32 analog input <=3.3V.");}
 if(stage==3){mpuAddress=0;for(uint8_t a:{uint8_t(0x68),uint8_t(0x69)})if(mpu.begin(a)){mpuAddress=a;break;}initialized=mpuAddress!=0;
   if(initialized){mpu.setAccelerometerRange(MPU6050_RANGE_4_G);mpu.setGyroRange(MPU6050_RANGE_500_DEG);mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);}
   diagnosticLog.println("Keep still for a baseline, then tilt gently: acceleration/gyro should change.");
 }
 if(stage==4){initialized=true;diagnosticLog.println("Observe GPIO25 LED steadily ON. Blinking is disabled. No electrical feedback is available.");}
 nextSample=millis()+(stage==1?2200:500);
}
bool sampleBMP(){
 if(!initialized||!ping(bmpAddress)){diagnosticLog.println("FAIL: BMP280 not responding.");return false;}
 float t=bmp.readTemperature(),p=bmp.readPressure()/100.0f;
 bool ok=isfinite(t)&&isfinite(p)&&t>=-40&&t<=85&&p>=300&&p<=1100;
 diagnosticLog.printf("%s | temperature=%.2f C | pressure=%.2f hPa\n",ok?"VALID":"FAIL",t,p);return ok;
}
bool sampleDHT(){float h=dht.readHumidity();bool ok=isfinite(h)&&h>=0&&h<=100;
 diagnosticLog.printf("%s | humidity=%.1f %%\n",ok?"VALID":"FAIL (no valid DHT response)",h);return ok;}
bool sampleMQ(){
 uint32_t sum=0,millivolts=0;int lo=4095,hi=0;
 for(int i=0;i<32;i++){int raw=analogRead(MQ_PIN);sum+=raw;lo=min(lo,raw);hi=max(hi,raw);millivolts+=analogReadMilliVolts(MQ_PIN);delay(1);}
 int mean=sum/32;bool usable=mean>5&&mean<4090;
 diagnosticLog.printf("ADC mean=%d min=%d max=%d | GPIO34 ~= %lu mV | %s | uptime=%lu s\n",mean,lo,hi,(unsigned long)(millivolts/32),mean<=5?"LOW RAIL: check AO/power/GND":mean>=4090?"HIGH RAIL: check input voltage":"IN RANGE: sensor health still unverified",(unsigned long)(millis()/1000));
 return usable;
}
bool sampleMPU(){
 if(!initialized){diagnosticLog.println("FAIL: MPU6050 initialization failed.");return false;}
 Wire.beginTransmission(mpuAddress);Wire.write(0x3B);
 if(Wire.endTransmission(false)||Wire.requestFrom(mpuAddress,uint8_t(14),uint8_t(true))!=14){diagnosticLog.println("FAIL: incomplete I2C sample.");return false;}
 int16_t raw[7];for(int i=0;i<7;i++){uint16_t hi=Wire.read(),lo=Wire.read();raw[i]=int16_t((hi<<8)|lo);}
 float ax=raw[0]/8192.0f,ay=raw[1]/8192.0f,az=raw[2]/8192.0f;
 bool ok=fabsf(ax)+fabsf(ay)+fabsf(az)>.001f;
 diagnosticLog.printf("%s | acceleration(g) X=%.3f Y=%.3f Z=%.3f | gyro(deg/s) X=%.2f Y=%.2f Z=%.2f\n",ok?"VALID":"SUSPECT all-zero",ax,ay,az,raw[4]/65.5f,raw[5]/65.5f,raw[6]/65.5f);return ok;
}
void handleCommand(char key){
 int selected=-1;
 if(key=='?')help();
 else if(key=='a'){all=true;scanBus();beginStage(0);}
 else{if(key=='b')selected=0;if(key=='d')selected=1;if(key=='g')selected=2;if(key=='m')selected=3;if(key=='l')selected=4;
   if(selected>=0){all=false;if(selected==0||selected==3)scanBus();beginStage(selected);}}
}
void startWifi(){
 WiFi.mode(WIFI_AP_STA);WiFi.setSleep(false);
 bool apReady=WiFi.softAP("EDITH-Test","edithtest");
 WiFi.begin(WIFI_SSID,WIFI_PASSWORD);
 MDNS.begin("edith-test");MDNS.addService("http","tcp",80);
 server.on("/",HTTP_GET,[]{server.send_P(200,"text/html",PAGE);});
 server.on("/logs",HTTP_GET,[]{server.sendHeader("Cache-Control","no-store");server.send(200,"text/plain; charset=utf-8",diagnosticLog.buffer);});
 server.on("/test",HTTP_POST,[]{
   String key=server.arg("sensor");
   if(key.length()!=1||!strchr("abdgml",key[0])){server.send(400,"text/plain","Use sensor=a,b,d,g,m,l");return;}
   pendingCommand=key[0];server.send(202,"text/plain","Test queued");
 });
 server.begin();
 diagnosticLog.printf("\nWi-Fi: joining %s; browser address http://edith-test.local\n",WIFI_SSID);
 if(apReady)diagnosticLog.println("Direct access: connect laptop to EDITH-Test (password edithtest), then http://192.168.4.1");
 else diagnosticLog.println("ERROR: diagnostic access point did not start.");
}
void setup(){
 Serial.begin(115200);pinMode(LED_PIN,OUTPUT);digitalWrite(LED_PIN,HIGH);
 analogReadResolution(12);analogSetPinAttenuation(MQ_PIN,ADC_11db);dht.begin();
 delay(2500);help();startWifi();scanBus();beginStage(0);
}
void loop(){
 server.handleClient();
 bool connected=WiFi.status()==WL_CONNECTED;
 if(connected&&!stationWasConnected)diagnosticLog.printf("Wi-Fi connected. Laptop on same Wi-Fi: http://%s or http://edith-test.local\n",WiFi.localIP().toString().c_str());
 if(!connected&&stationWasConnected)diagnosticLog.println("Station Wi-Fi disconnected; EDITH-Test direct access remains available.");
 stationWasConnected=connected;
 if(!connected&&millis()-lastReconnect>20000){lastReconnect=millis();WiFi.reconnect();}
 if(pendingCommand){char key=pendingCommand;pendingCommand=0;handleCommand(key);}
 while(Serial.available())handleCommand(tolower(Serial.read()));
 if(int32_t(millis()-nextSample)<0){delay(1);return;}
 if(samples>=SAMPLES){
   if(stage==4)diagnosticLog.println("LED commands completed. Confirm operation visually.");
   else diagnosticLog.printf("SUMMARY: %d/%d %s. This is a response/range test, not calibration.\n",valid,SAMPLES,stage==2?"ADC samples away from rails":"valid sensor responses");
   beginStage(all?(stage+1)%5:stage);return;
 }
 diagnosticLog.printf("[%d/%d] ",samples+1,SAMPLES);bool ok=false;
 switch(stage){case 0:ok=sampleBMP();break;case 1:ok=sampleDHT();break;case 2:ok=sampleMQ();break;case 3:ok=sampleMPU();break;case 4:digitalWrite(LED_PIN,HIGH);diagnosticLog.println("LED held steadily ON");break;}
 if(ok)valid++;samples++;nextSample=millis()+(stage==1?2200:stage==0?1000:500);
}
