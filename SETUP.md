# EDITH — start here

Website: https://edith-environment-hub.mrltech.chatgpt.site

The public website is an observatory for **EDITH Field Station**. It shows BMP280 temperature once, DHT11 humidity, BMP280 pressure, MQ-2 smoke/gas indication, sensor health, and MPU6050 orientation. There is no SD-card code or requirement.

## Upload to your ESP32

1. Open `firmware/EDITH/EDITH.ino` in Arduino IDE. Keep `config.h` and `trust.h` in the same sketch folder.
2. Copy `firmware/EDITH/config.example.h` to `config.h`, then enter your 2.4 GHz Wi-Fi credentials and private receiver token. Select your actual USB serial port (COM5 on the original setup). Never share or commit config.h.
3. Install **esp32 by Espressif Systems** in Boards Manager. The sketch was compiled with Arduino ESP32 **2.0.17** via PlatformIO. The LED uses LEDC PWM for a four-second breathing cycle; core 3.x compatibility is included but was not compiled here. Choose **ESP32 Dev Module** and your USB serial port.
4. In Library Manager install **Adafruit BMP280 Library 2.6.8**, **Adafruit MPU6050 2.2.6**, **DHT sensor library 1.4.6**, **ArduinoJson 7.4.2**, and requested Adafruit Unified Sensor / BusIO dependencies.
5. Upload. Open Serial Monitor at **115200 baud**. Keep the board stationary for at least 3 seconds until `IMU calibrated. Ready for movement.` appears. Movement restarts calibration.
6. Open the public website. Real data should arrive after Wi-Fi connects and NTP synchronizes. The device requires internet access; it does not create a backup hotspot or serve the dashboard itself.

For PlatformIO, from the `firmware` folder: `python -m platformio run --target upload --upload-port COM5`. Rebuild after changing Wi-Fi credentials; the rebuilt binary includes your local configuration.

## Wiring preserved from your executable code

| Connection | ESP32 GPIO |
|---|---:|
| BMP280 + MPU6050 SDA | 26 |
| BMP280 + MPU6050 SCL | 22 |
| DHT11 data | 4 |
| MQ-2 analog | 34 |
| External LED through resistor | 25 |

Your original comment said SDA 21, but its actual `#define` was 26. This firmware tries **26 first**, then checks **21** if neither sensor responds. If both attempts fail, it restores 26 and reports missing devices. Both common addresses are tried for BMP280 (0x76/0x77) and MPU6050 (0x68/0x69). The selected pins and scanned I2C addresses are printed at startup.

Check that the signal reaching GPIO34 stays within **0–3.3 V**. A 5 V MQ-2 module may produce an analog output above that; use an appropriate divider/level interface when needed. ADC attenuation does not make the ESP32 pin 5 V tolerant. Photos cannot verify voltage, continuity, or battery protection.

## Physical breathing LED and sensor status

- The external LED on GPIO25 gently brightens and dims over a four-second cycle. A separate task keeps the fade smooth during network uploads. The website LED and 3D model LED remain unanimated.
- Missing/invalid sensors and incomplete IMU calibration remain visible in telemetry and serial diagnostics, but never trigger rapid blinking or change the breathing cycle. The standalone diagnostic sketch continues to hold the LED ON for visual inspection.
- I²C sensors are checked during operation and retried every 5 seconds. DHT11 is sampled every 2.1 seconds; failed reads become null instead of keeping a stale valid value.
- Wi-Fi loss affects the website's link status, not sensor health. The LED and sensor loop continue independently of HTTPS uploads.
- Software cannot detect every electrical failure. There is no battery-voltage, power-converter, or LED feedback measurement. The site does not claim these are tested.

## Smoke/gas setup

The MQ-2 needs proper heater supply, initial conditioning per its module documentation, and warm-up after startup. A configurable **180-second startup warm-up** is included; this is not a substitute for initial burn-in.

`MQ_THRESHOLD = 1800` is a **starting value, not a calibrated smoke threshold**. Record the stable raw ADC value in clean air after conditioning, then set the threshold for your intended demonstration. `MQ_HYSTERESIS = 150` avoids rapid switching near the boundary. The UI reports raw ADC, not invented ppm or AQI. MQ-2 responds to multiple gases and cannot distinguish smoke from other combustible gas exposure. Do not use the project as a certified life-safety smoke alarm.

A reading near 0 or 4095 for four seconds remains visible as raw ADC, with smoke classification unknown. The website shows neutral “Raw mode” instead of declaring a broken sensor; this channel does not affect the breathing cycle. A disconnected analog wire can float at a plausible voltage, so “Monitoring” does not guarantee full MQ-2 hardware health. Upload the updated main firmware to apply the new physical LED behavior.

## Live model

The model is a procedural approximation of your photos, including the perfboard, ESP32, converter, sensors, LED, switch and two underside batteries. It is not a dimensionally measured CAD model.

The MPU6050 is sampled at approximately 100 Hz. A gravity-corrected quaternion filter combines acceleration and gyro data. Latest measurements are posted about every 250 ms plus network request time; the website polls and interpolates rotation. Internet latency means this is near-real-time, not guaranteed zero-latency motion.

MPU6050 provides **rotation and tilt, not accurate 3D position**. Without a magnetometer, yaw is relative and will drift. Keep still on startup to estimate gyro bias. `Zero model` changes only the browser's model reference; the displayed angles remain main-board-frame values. Reset camera restores the viewing angle, not calibration.

Physical axis test: place the board flat, then tilt its right edge and front edge separately. If directions are rotated by 90/180 degrees, adjust `IMU_MOUNT_YAW_DEG` in config.h and repeat. IMU_MOUNT_UPSIDE_DOWN = true corrects the user-confirmed inverted mount with a 180-degree rotation about sensor X (Y and Z signs inverted). The same proper rotation is applied to acceleration and gyro before calibration and filtering. IMU_MOUNT_YAW_DEG is applied afterward to align the remaining in-plane direction. The browser uses the corrected quaternion directly without another flip. Hold the main board level and still on startup, then verify each tilt direction after upload.

## Data and access

- Anyone with the URL can read environmental telemetry. No public control or configuration endpoints exist.
- A private bearer token authorizes device uploads. TLS certificate validation remains enabled; NTP sets the clock before upload. `trust.h` contains public GTS R1/R4 and ISRG X1 roots. If hosting changes CA, update trust roots; do not disable TLS verification.
- Server validates types, ranges, normalized quaternions, sensor state consistency and packet size. Expired samples are rejected; same-boot sequence replays do not refresh freshness.
- After eight seconds without fresh readings the page shows offline values as dashes. Demo mode is explicitly labeled and never uploads simulated data to the server.
- Storage retains one latest sample only. Charts and CSV export contain this browser's last 120 received samples, not permanent historical logging.
- Device secrets stay in local config.h and the server's secret environment. They are not included in the website bundle.

## Verification and limitations

Completed: ESP32 compilation (2.0.17), website production build, TypeScript checks, six contract/freshness tests, eight local API checks, browser rendering of the 3D board, public deployment, and live receiver authentication/TLS checks using the ESP32 HTTP user-agent.

Not completed: physical upload, real sensor measurements, MQ-2 calibration, axis matching, battery/power checks. No attached USB board was flashed. Follow the upload steps to activate real telemetry.

Firmware compile footprint: about 48 KB static RAM and 990 KB flash (task stacks and dynamic TLS memory are additional runtime allocations).

## Connected-board check and commands

The CP210x serial adapter was detected on **COM5**. Existing firmware reported null temperature, pressure and humidity, and MQ-2 raw 0. These are not verified healthy sensor readings. Ensure the project switch and sensor power are on. The new startup scan and periodic diagnostics identify missing sensors without fabricating data.

The esptool connection check returned **Wrong boot mode (0x13)**. For upload, hold **BOOT** when `Connecting...` appears; release when writing starts. If it still fails, hold BOOT, tap EN/RESET, and retry. Close other serial monitors before upload.

```powershell
cd "C:\WorkSpace\POONKUNDRAN\EDITH\firmware"
python -m platformio run -e esp32dev --target upload --upload-port COM5
if ($LASTEXITCODE -eq 0) {
    Start-Process "https://edith-environment-hub.mrltech.chatgpt.site"
    python -m platformio device monitor --port COM5 --baud 115200
}
```

The firmware runs automatically after upload. Keep still for calibration. Look for `Wi-Fi connected` then `LIVE: website accepted ... sensor packets.` The hosted website is already running; no local web server is necessary.

## Developer commands

Website: `npm install`, `npm run dev`, `npm run build`. Local dev URL is http://127.0.0.1:5173.

Contract tests: `node --test tests/telemetry.test.mjs` from `website` (Node 24). API checks: `python tools/test_api.py` from this project, with the local server running and `.dev.vars` containing the local test token specified in the test. Production has a separate secret. The local test writes a clearly labeled synthetic sample; clear that local row after testing.

The Windows Sites npm launcher did not resolve its npm shim correctly in this environment. Verified alternatives are `node scripts/run-framework.mjs dev` and `node scripts/run-framework.mjs build` in `website`; the native Sites source/deployment workflow still owns packaging and publication.

Primary technical references: [ESP32 LEDC](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/ledc.html), [Adafruit MPU6050 library](https://github.com/adafruit/Adafruit_MPU6050), [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/).
