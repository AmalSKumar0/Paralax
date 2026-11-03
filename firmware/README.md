# PARALAX ESP32 Firmware Guide & Setup Instructions

This directory contains the production-ready Arduino firmware for the **Paralax IoT Push-to-Talk AI Voice Translator**.

---

## 1. Hardware Bill of Materials (BOM)

| Component | Description | Role |
| :--- | :--- | :--- |
| **ESP32-WROOM-32** | 38-pin CP2102 DevKit (MicroUSB) | Dual-core 240 MHz Main Controller |
| **INMP441** | Omnidirectional MEMS Microphone Module | I2S Digital Voice Input (16 kHz 16-bit Mono) |
| **MAX98357A** | 3.2W Class-D Mono I2S Amplifier | I2S Digital Audio Output (DAC) |
| **Speaker** | 8 Ω 0.5 W (or 4 Ω 3W) | Voice Output Playback & Chimes |
| **Button A** | 6x6 mm Tact Switch | Push-to-Talk: Lang A $\to$ B (e.g., English $\to$ Spanish) |
| **Button B** | 6x6 mm Tact Switch | Push-to-Talk: Lang B $\to$ A (e.g., Spanish $\to$ English) |
| **Power Supply** | 5V 2A Switching Power Supply | MicroUSB or 5V/GND Rail Power |

*Note: No OLED display is required! Full operational telemetry, transcripts, and VU meters are printed via Serial Monitor at 115200 baud.*

---

## 2. Complete Wiring Table

### 2.1 INMP441 MEMS Microphone $\leftrightarrow$ ESP32 (`I2S_NUM_0`)
| INMP441 Pin | ESP32 Pin | Function / Description |
| :--- | :--- | :--- |
| **VDD** | **3.3V** | Power (Do NOT connect to 5V!) |
| **GND** | **GND** | Ground |
| **SCK** | **GPIO 26** | I2S0 Serial Clock (Bit Clock) |
| **WS** | **GPIO 25** | I2S0 Word Select (L/R Clock) |
| **SD** | **GPIO 33** | I2S0 Serial Data In |
| **L/R** | **GND** | Tied to GND to select Left Channel |

### 2.2 MAX98357A Audio Amplifier $\leftrightarrow$ ESP32 (`I2S_NUM_1`)
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

### 2.3 Dual Push-to-Talk Buttons $\leftrightarrow$ ESP32
| Button | Terminal 1 | Terminal 2 | Function |
| :--- | :--- | :--- | :--- |
| **Button A** | **GPIO 32** | **GND** | Active LOW input (internal `INPUT_PULLUP`): Lang A $\to$ B |
| **Button B** | **GPIO 21** | **GND** | Active LOW input (internal `INPUT_PULLUP`): Lang B $\to$ A |

---

## 3. Arduino IDE Setup Instructions

### Step 1: Install ESP32 Board Package
1. Open **Arduino IDE** (v2.x recommended).
2. Go to **File -> Preferences**.
3. In **Additional boards manager URLs**, add:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
4. Open **Tools -> Board -> Boards Manager...**, search for `esp32` by Espressif Systems, and click **Install**.

### Step 2: Install ArduinoJson Library
1. Open **Sketch -> Include Library -> Manage Libraries...** (`Ctrl+Shift+I`).
2. Search for: **`ArduinoJson`** (by Benoit Blanchon, v6 or v7).
3. Click **Install**.

### Step 3: Configure Board Settings
Under the **Tools** menu, select:
- **Board**: `ESP32 Dev Module`
- **Upload Speed**: `921600`
- **CPU Frequency**: `240MHz (WiFi/BT)`
- **Flash Frequency**: `80MHz`
- **Flash Mode**: `QIO`
- **Flash Size**: `4MB (32Mb)`
- **Partition Scheme**: `Default 4MB with spiffs (1.2MB APP/1.5MB SPIFFS)`
- **Port**: Select the COM/ttyUSB port corresponding to your CP2102 chip.

### Step 4: Flash & Monitor
1. Click **Upload** (`Ctrl+U`).
2. Open **Tools -> Serial Monitor** (`Ctrl+Shift+M`).
3. Set baud rate to **`115200 baud`**.
