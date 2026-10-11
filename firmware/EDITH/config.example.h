#pragma once
// Copy to config.h. Never publish your Wi-Fi password or DEVICE_TOKEN.
static const char WIFI_SSID[] = "YOUR_2_4_GHZ_WIFI";
static const char WIFI_PASSWORD[] = "YOUR_WIFI_PASSWORD";
static const char TELEMETRY_URL[] = "https://edith-environment-hub.mrltech.chatgpt.site/api/telemetry";
static const char DEVICE_TOKEN[] = "REPLACE_WITH_PRIVATE_RECEIVER_TOKEN";
static const char STATION_NAME[] = "EDITH Field Station";
constexpr int I2C_SDA = 26; // Preserves the executable code you supplied (header said 21).
constexpr int I2C_SCL = 22;
constexpr int DHT_PIN = 4;
constexpr int MQ2_PIN = 34;
constexpr int LED_PIN = 25;
constexpr bool LED_ACTIVE_LOW = false;
constexpr unsigned long MQ_WARMUP_MS = 180000; // Initial commissioning requires longer burn-in.
constexpr int MQ_THRESHOLD = 1800; // Raw ADC: tune on YOUR powered, warmed sensor.
constexpr int MQ_HYSTERESIS = 150;
constexpr unsigned long UPLOAD_INTERVAL_MS = 250;
// This project's MPU6050 faces the opposite side of the main board.
constexpr bool IMU_MOUNT_UPSIDE_DOWN = true;
// In-plane rotation after correcting the upside-down mount.
constexpr float IMU_MOUNT_YAW_DEG = 0.0f;
