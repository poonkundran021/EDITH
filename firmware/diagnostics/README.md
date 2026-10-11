# Wireless sensor diagnostics

Upload once with USB while the ESP32 is accessible:

```powershell
cd "C:\WorkSpace\POONKUNDRAN\EDITH\firmware\diagnostics"
python -m platformio run -e edith-test -t upload --upload-port COM5
```

Hold BOOT during Connecting if required; release when writing begins. Power off before putting the ESP32 back into the circuit, then power the complete board normally. USB is no longer needed.

The local ignored `src/wifi_config.h` contains your configured Wi-Fi. On the same Wi-Fi, open http://edith-test.local. If name resolution fails, join Wi-Fi **EDITH-Test**, password **edithtest**, and open http://192.168.4.1. The direct network works without an internet connection; remain connected if Windows reports no internet. No router configuration is required.

Select a sensor using the page buttons, or use PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\Test-Sensors.ps1 -Sensor gas
# Direct connection alternative:
powershell -ExecutionPolicy Bypass -File .\Test-Sensors.ps1 -Address http://192.168.4.1 -Sensor gas
```

Sensor choices: all, bmp, humidity, gas, mpu, led. Ctrl+C stops the laptop monitor; the ESP32 continues testing. Eight samples are taken per cycle. A bounded log retains recent output, so it can initially include earlier tests. Serial commands remain available over USB.

BMP280 supplies temperature and pressure; DHT11 supplies humidity; MQ-2 provides raw ADC and input voltage, not calibrated ppm or proof of safe air; MPU6050 provides acceleration and gyro values. The LED stays steadily ON during every test, including the LED visual check; blinking is disabled. LED state is commanded and must be checked visually. The program cannot verify power modules or other uninstrumented components. MQ-2 AO must be within the ESP32 input voltage limit and requires appropriate warm-up.

This diagnostic firmware does not send to the public website. Restore normal EDITH firmware afterward:

```powershell
cd "C:\WorkSpace\POONKUNDRAN\EDITH\firmware"
python -m platformio run -e esp32dev -t upload --upload-port COM5
```
