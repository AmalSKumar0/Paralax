# PARALAX ESP32 Firmware Guide & Setup Instructions

This directory contains the production-ready Arduino firmware for the **Paralax IoT Push-to-Talk AI Voice Translator**.

---

## 1. Hardware Bill of Materials (BOM)

| Component | Description | Role |
| :--- | :--- | :--- |
| **ESP32-WROOM-32** | 38-pin CP2102 DevKit (MicroUSB) | Dual-core 240 MHz Main Controller |
| **INMP441** | Omnidirectional MEMS Microphone Module | I2S Digital Voice Input |
| **MAX98357A** | 3.2W Class-D Mono I2S Amplifier | I2S Digital Audio Output (DAC) |
| **Speaker** | 8 Ω 0.5 W (or 4 Ω 3W) | Voice Output Playback |
| **Tact Switch** | 6x6 mm 4-pin Push Button | Push-to-Talk Start/Stop Trigger |
| **SSD1306 OLED** | 0.96" I2C Monochrome 128x64 Display | Status, VU Meter & Text Display |
| **Power Supply** | 5V 2A Switching Power Supply | MicroUSB or 5V/GND Rail Power |

---

## 2. Complete Wiring Table

### 2.1 INMP441 MEMS Microphone $\leftrightarrow$ ESP32 (I2S_NUM_0)
| INMP441 Pin | ESP32 Pin | Function / Description |
| :--- | :--- | :--- |
| **VDD** | **3.3V** | Power (Do NOT connect to 5V!) |
| **GND** | **GND** | Ground |
| **SCK** | **GPIO 26** | I2S0 Serial Clock (Bit Clock) |
| **WS** | **GPIO 25** | I2S0 Word Select (L/R Clock) |
| **SD** | **GPIO 33** | I2S0 Serial Data In |
| **L/R** | **GND** | Tied to GND to select Left Channel |

### 2.2 MAX98357A Audio Amplifier $\leftrightarrow$ ESP32 (I2S_NUM_1)
| MAX98357A Pin | ESP32 Pin | Function / Description |
| :--- | :--- | :--- |
| **VIN** | **5V / VIN** | Power (Connect to 5V for maximum audio headroom) |
| **GND** | **GND** | Ground |
| **BCLK** | **GPIO 14** | I2S1 Bit Clock |
| **LRC** | **GPIO 27** | I2S1 Left/Right Clock (Word Select) |
| **DIN** | **GPIO 22** | I2S1 Serial Data Out |
| **GAIN** | *Leave Floating* | Default 12 dB Gain |
| **SD** | *Leave Unconnected* | Active High (internal pull-up enabled) |
| **OUT+** | Speaker Positive (+) | Audio Signal Out |
| **OUT-** | Speaker Negative (-) | Audio Signal Out |

### 2.3 0.96" SSD1306 OLED Display $\leftrightarrow$ ESP32 (I2C)
> **Note on I2C Pin Selection**: Default ESP32 SCL is GPIO 22, but GPIO 22 is allocated to the MAX98357A DIN signal. The OLED I2C bus is remapped in firmware to **SDA = GPIO 21** and **SCL = GPIO 19**.

| OLED Pin | ESP32 Pin | Function / Description |
| :--- | :--- | :--- |
| **VCC** | **3.3V** (or 5V) | Power |
| **GND** | **GND** | Ground |
| **SDA** | **GPIO 21** | I2C Data |
| **SCL** | **GPIO 19** | I2C Clock (`Wire.begin(21, 19)`) |

### 2.4 Push Button $\leftrightarrow$ ESP32
| Button Terminal | ESP32 Pin | Function / Description |
| :--- | :--- | :--- |
| **Terminal 1** | **GPIO 32** | Active LOW input (internal `INPUT_PULLUP` enabled) |
| **Terminal 2** | **GND** | Ground |

---

## 3. Arduino IDE Setup Instructions

### Step 1: Install ESP32 Board Package
1. Open **Arduino IDE** (v2.x recommended).
2. Go to **File -> Preferences**.
3. In **Additional boards manager URLs**, add:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
4. Go to **Tools -> Board -> Boards Manager**, search for `esp32` by **Espressif Systems**, and install the latest version.
5. Under **Tools -> Board -> ESP32 Arduino**, select:
   - **ESP32 Dev Module** (or NodeMCU-32S / DOIT ESP32 DEVKIT V1).
   - **Flash Frequency**: `80MHz`
   - **Upload Speed**: `921600` (or `115200` if upload fails)
   - **Partition Scheme**: `Default 4MB with spiffs (1.2MB APP/1.5MB SPIFFS)`

### Step 2: Install Required Libraries
Open **Tools -> Manage Libraries...** and install:
1. `Adafruit SSD1306` (by Adafruit)
2. `Adafruit GFX Library` (by Adafruit)
3. `ArduinoJson` (by Benoit Blanchon, v6 or v7)

### Step 3: Configure Credentials in Sketch
Open `esp32_translator.ino` and update the top configuration section:
```cpp
const char* WIFI_SSID     = "Your_WiFi_Network";
const char* WIFI_PASSWORD = "Your_WiFi_Password";

// Get your device key from https://paralax.amalskumar.dev/devices
const char* DEVICE_KEY    = "key_YOUR_COPIED_KEY_HERE";
```

### Step 4: Compile & Upload
1. Connect the ESP32 to your computer using a MicroUSB data cable.
2. Select your serial COM port under **Tools -> Port**.
3. Click the **Upload** button.
   *(If the upload sticks at `Connecting......_____.....`, hold down the **BOOT** button on the ESP32 until the flashing progress percentage begins).*

---

## 4. How It Works

1. **Boot**: The ESP32 connects to Wi-Fi and issues an initial heartbeat to `https://paralax.amalskumar.dev/api/v1/device/heartbeat`. The OLED shows the assigned IP address and signal strength in dBm.
2. **Push to Talk**: Hold the tact switch on GPIO 32. The speaker emits a gentle start tone, and the INMP441 captures audio at **16 kHz 16-bit signed PCM**. The OLED renders a real-time **VU Meter** reflecting speech volume.
3. **Translation Request**: On button release, the ESP32 issues a single HTTPS POST to `/api/v1/device/translate`.
4. **Direct Audio Streaming**: When the response arrives, synthesized translation audio is streamed in 1 KB chunks directly to `i2s_write(I2S_NUM_1, ...)` for instant speaker output, with zero RAM buffering penalty!
5. **Real-time Dashboard**: The device telemetry (Wi-Fi RSSI, Free Heap, Uptime, and Microphone Signal VU level) updates live on your Paralax Admin Dashboard.
