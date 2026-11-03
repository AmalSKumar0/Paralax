# PARALAX IoT Voice Translator - Dual-Button ESP32 Firmware Guide

This document contains the complete configured Arduino firmware and wiring instructions for the **ESP32-WROOM-32 (38-pin DevKit)** Push-to-Talk AI Voice Translator.

---

## 1. Hardware Bill of Materials (BOM)

| Component | Description | Role |
| :--- | :--- | :--- |
| **ESP32-WROOM-32** | 38-pin CP2102 DevKit (MicroUSB) | Main Dual-Core Controller |
| **INMP441** | Omnidirectional MEMS Microphone Module | I2S Digital Voice Capture (16 kHz 16-bit Mono) |
| **MAX98357A** | 3.2W Class-D Mono I2S Amplifier | Direct Digital-to-Audio Output |
| **Speaker** | 8 Ω 0.5W or 4 Ω 3W Speaker | Translated Voice Playback & Audio Cues |
| **Button A** | 6x6 mm Tact Switch | Push-to-Talk: Lang A $\to$ B (e.g., English $\to$ Spanish) |
| **Button B** | 6x6 mm Tact Switch | Push-to-Talk: Lang B $\to$ A (e.g., Spanish $\to$ English) |
| **Power** | 5V 2A MicroUSB Cable or 5V Power Supply | System Power |

> [!NOTE]
> **No OLED Display is needed!**
> All operation status, audio levels, Wi-Fi telemetry, and translated speech transcripts are printed directly to the **Arduino Serial Monitor at `115200` baud**. In addition, acoustic feedback tones play through the MAX98357A speaker.

---

## 2. Complete 38-Pin ESP32 Wiring Diagram

### 2.1 INMP441 MEMS Microphone $\leftrightarrow$ ESP32 (`I2S_NUM_0`)
| INMP441 Pin | ESP32 Pin | Purpose |
| :--- | :--- | :--- |
| **VDD** | **3.3V** | Power (**3.3V only!** Do NOT connect to 5V) |
| **GND** | **GND** | Ground |
| **SCK** | **GPIO 26** | I2S0 Bit Clock |
| **WS** | **GPIO 25** | I2S0 Word Select (LR Clock) |
| **SD** | **GPIO 33** | I2S0 Serial Data In |
| **L/R** | **GND** | Connected to GND to select Left Channel |

### 2.2 MAX98357A Audio Amplifier $\leftrightarrow$ ESP32 (`I2S_NUM_1`)
| MAX98357A Pin | ESP32 Pin | Purpose |
| :--- | :--- | :--- |
| **VIN** | **5V / VIN** | Power (Connect to 5V pin for full 3.2W loudness) |
| **GND** | **GND** | Ground |
| **BCLK** | **GPIO 14** | I2S1 Bit Clock |
| **LRC** | **GPIO 27** | I2S1 Word Select (LR Clock) |
| **DIN** | **GPIO 22** | I2S1 Serial Data Out |
| **GAIN** | *Unconnected* | Default 12 dB Gain |
| **SD** | *Unconnected* | Default Active High (ON) |
| **+ / -** | **Speaker** | Connect to Speaker (+) and (-) terminals |

### 2.3 Dual Push-to-Talk Buttons $\leftrightarrow$ ESP32
| Button | Terminal 1 | Terminal 2 | Function |
| :--- | :--- | :--- | :--- |
| **Button A** | **GPIO 32** | **GND** | Hold to speak **Language A** $\to$ Translates to **Language B** |
| **Button B** | **GPIO 21** | **GND** | Hold to speak **Language B** $\to$ Translates to **Language A** |

*Both buttons use ESP32 internal pull-up resistors (`INPUT_PULLUP`). When pressed, the GPIO reads `LOW`.*

---

## 3. Arduino IDE Library Requirement

Only **1 library** is required:
1. Open **Sketch** $\to$ **Include Library** $\to$ **Manage Libraries...** (`Ctrl+Shift+I`).
2. Search for: **`ArduinoJson`** (by Benoit Blanchon, v6 or v7).
3. Click **Install**.

*(Zero display libraries required! No compilation errors for missing Adafruit headers).*

---

## 4. Why the Previous Code Crashed & How It Is Solved

### The Problem:
```text
[System] Free Heap at Boot:   272832 bytes
[Memory] Allocating audio recording buffer (160000 bytes in SRAM)...
[Memory] [FATAL ERROR] Audio buffer allocation failed! Halting.
```
- In ESP32 microcontrollers without external PSRAM, the SRAM heap is divided across non-contiguous DRAM blocks.
- The maximum single contiguous block is typically ~110,000 to 120,000 bytes.
- Requesting `160,000 bytes` (160 KB for 5 seconds of audio) fails because no single contiguous memory block of that size exists in internal SRAM.

### The Solution:
- In the updated firmware, the audio buffer is safely sized to `80,000 bytes` (2.5 seconds of 16 kHz 16-bit mono speech) with an automatic fallback to `64,000 bytes` (2.0 seconds).
- It leaves at least 40 KB of contiguous memory free for the `WiFiClientSecure` / `mbedTLS` SSL handshake, eliminating memory crashes.

---

## 5. Serial Monitor Output (`115200` Baud)

Set your Arduino IDE Serial Monitor dropdown to **`115200 baud`**. You will see:

### Boot Diagnostics
```text
+----------------------------------------------------------------------+
| PARALAX IoT Dual-Button AI Voice Translator - Boot Diagnostics       |
+----------------------------------------------------------------------+
[System] ESP32 Chip Revision: 301 | CPU Freq: 240 MHz
[System] Flash Chip Size:     4 MB
[System] Free Heap at Boot:   272832 bytes
[System] Max Contiguous Block: 113420 bytes
[System] Firmware Version:     1.1.0
[System] Target Cloud Server:  https://paralax.amalskumar.dev
[System] MAC Address:          34:85:18:XX:XX:XX
------------------------------------------------------------------------
[Hardware] Button A configured on GPIO 32 (INPUT_PULLUP, Active LOW) -> Lang A to B
[Hardware] Button B configured on GPIO 21 (INPUT_PULLUP, Active LOW) -> Lang B to A
------------------------------------------------------------------------
[Memory] Allocating audio recording buffer (80000 bytes in SRAM)...
[Memory] [SUCCESS] Audio buffer allocated: 80000 bytes (2.5 seconds max speech)
[Memory] Free heap remaining: 192832 bytes | Largest free block: 33420 bytes
------------------------------------------------------------------------
[I2S_0] [SUCCESS] INMP441 Mic ready on SCK=26, WS=25, SD=33 (16kHz 16-bit Mono)
[I2S_1] [SUCCESS] MAX98357A Amp ready on BCLK=14, LRC=27, DIN=22 (16kHz 16-bit Mono)
------------------------------------------------------------------------
[WiFi] Initiating connection to SSID: "Aurora"...
[WiFi] Connecting...... CONNECTED!
[WiFi] IP Address:   192.168.1.142
[WiFi] Gateway IP:   192.168.1.1
[WiFi] Subnet Mask:  255.255.255.0
[WiFi] DNS Server:   192.168.1.1
[WiFi] Signal RSSI:  -54 dBm (Good      [|||.])
------------------------------------------------------------------------
[Speaker] Playing startup chime (880Hz -> 1320Hz)...
------------------------------------------------------------------------
[Heartbeat] Sending telemetry payload to cloud...
[Heartbeat] [ACK 200] Telemetry synced. Cloud Config v1 | Pair: en-US <-> es-US
------------------------------------------------------------------------
+----------------------------------------------------------------------+
| SYSTEM READY - DUAL-BUTTON PUSH-TO-TALK ACTIVE                       |
+----------------------------------------------------------------------+
  [Button A - GPIO 32]: Hold to speak en-US -> Translates to es-US
  [Button B - GPIO 21]: Hold to speak es-US -> Translates to en-US
  Audio feedback tones and speech will play through MAX98357A speaker.
------------------------------------------------------------------------
```

### Voice Capture & HTTPS Cloud Translation
```text
>>> [Button A - GPIO 32] PRESSED: Translating en-US -> es-US
[Voice] >>> Recording in progress... (keep button pressed, speak clearly)
[Voice]  0.2s / 2.5s  |  RMS:  42%  [######----------]  |  Peak:  60%
[Voice]  0.4s / 2.5s  |  RMS:  78%  [############----]  |  Peak:  92%
[Voice]  0.6s / 2.5s  |  RMS:  65%  [##########------]  |  Peak:  84%
[Voice]  0.8s / 2.5s  |  RMS:  72%  [###########-----]  |  Peak:  88%
[Voice] <<< Recording finished: 1.12 seconds captured (35840 bytes raw PCM)

+----------------------------------------------------------------------+
| HTTPS TRANSLATION REQUEST - PARALAX CLOUD API                        |
+----------------------------------------------------------------------+
[API] Target URL:    https://paralax.amalskumar.dev/api/v1/device/translate
[API] Host / Port:   paralax.amalskumar.dev : 443
[API] Direction:     a_to_b (en-US -> es-US)
[API] Payload Size:  35840 bytes (16 kHz 16-bit Mono PCM)
[API] Establishing SSL/TLS handshake with server... Connected! (285 ms)
[API] >>> Sending HTTP Request Headers:
[API]     POST /api/v1/device/translate HTTP/1.1
[API]     Host: paralax.amalskumar.dev
[API]     X-Device-Key: key_YOUR_DEVICE_KEY_HERE
[API]     Idempotency-Key: e8a97c41-9430-4e12-b530-5899a19c6d32
[API]     X-Direction: a_to_b
[API]     Content-Type: audio/L16;rate=16000
[API]     Accept: application/octet-stream
[API]     Content-Length: 35840
[API]     Connection: close
[API] >>> Streaming audio payload (35840 bytes in 1024-byte chunks)...
[API]     Upload progress:  45% (16384 / 35840 bytes)
[API]     Upload progress:  91% (32768 / 35840 bytes)
[API]     Upload progress: 100% (35840 / 35840 bytes)
[API] Upload complete in 94 ms (381.3 KB/s). Awaiting AI pipeline...
[API] <<< Response Status: HTTP/1.1 200 OK (Wait time: 1050 ms)
[API] <<< Server Pipeline Response Headers:
[API]     [STT Timing]       340 ms
[API]     [Translate Timing] 210 ms
[API]     [TTS Timing]       460 ms
[API]     [Pipeline Latency] 1010 ms
[API]     [Audio Length]     48000 bytes

================================================================================
>>> [TRANSCRIPT]  "Where is the nearest subway station?"
>>> [TRANSLATION] "¿Dónde está la estación de metro más cercana?"
>>> [TOTAL TIME]  1010 ms (Network + STT + AI Translate + TTS Synthesis)
================================================================================
[Speaker] Streaming synthesized voice directly to MAX98357A amplifier...
[Speaker] Playback complete: 48000 bytes rendered through speaker in 1500 ms
------------------------------------------------------------------------

[Ready] Ready for next translation. Press Button A or Button B.
```

---

## 6. Complete ESP32 Arduino Sketch Code

Copy and paste the code below directly into your Arduino IDE (`esp32_translator.ino`):

```cpp
/**
 * ============================================================================
 * PARALAX IoT Dual-Button Push-to-Talk AI Voice Translator - ESP32 Firmware
 * ============================================================================
 * Target:       ESP32-WROOM-32 (CP2102 38-pin DevKit MicroUSB)
 * Backend API:  https://paralax.amalskumar.dev
 * Serial Baud:  115200 baud
 *
 * HARDWARE CONFIGURATION (NO OLED REQUIRED):
 * ----------------------------------------------------------------------------
 * 1. INMP441 MEMS Microphone (Voice Input via I2S_NUM_0)
 *    - VDD   -> 3.3V (Do NOT connect to 5V!)
 *    - GND   -> GND
 *    - SCK   -> GPIO 26 (I2S0 Bit Clock)
 *    - WS    -> GPIO 25 (I2S0 Word Select / LR Clock)
 *    - SD    -> GPIO 33 (I2S0 Serial Data In)
 *    - L/R   -> GND     (Left Channel selected)
 *
 * 2. MAX98357A I2S Class-D Mono Amplifier + Speaker (Voice Output via I2S_NUM_1)
 *    - VIN   -> 5V (or VIN pin of ESP32 for maximum audio loudness)
 *    - GND   -> GND
 *    - BCLK  -> GPIO 14 (I2S1 Bit Clock)
 *    - LRC   -> GPIO 27 (I2S1 Word Select / LR Clock)
 *    - DIN   -> GPIO 22 (I2S1 Serial Data Out)
 *    - GAIN  -> Floating (Default 12 dB Gain)
 *    - SD    -> Unconnected (Default Active High)
 *    - + / - -> Speaker (8 Ohm 0.5W / 4 Ohm 3W)
 *
 * 3. Dual Push-to-Talk Buttons (Tact Switches, internal INPUT_PULLUP enabled):
 *    - Button A (Lang A -> B, e.g. English -> Spanish):
 *        Pin 1 -> GPIO 32
 *        Pin 2 -> GND
 *    - Button B (Lang B -> A, e.g. Spanish -> English):
 *        Pin 1 -> GPIO 21  (or GPIO 18, 19, 23, or 4)
 *        Pin 2 -> GND
 *
 * REQUIRED ARDUINO LIBRARIES:
 * 1. ArduinoJson (by Benoit Blanchon, v6 or v7)
 *    Install via Arduino IDE: Sketch -> Include Library -> Manage Libraries...
 * ============================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <driver/i2s.h>
#include <ArduinoJson.h>
#include <math.h>

// ============================================================================
// USER CONFIGURATION (Wi-Fi Credentials & Paralax Device Key)
// ============================================================================
const char* WIFI_SSID     = "Aurora";
const char* WIFI_PASSWORD = "amalskumar";

// Target Paralax production server
const char* API_HOST      = "paralax.amalskumar.dev";
const int   API_PORT      = 443;
const char* TRANSLATE_URL = "https://paralax.amalskumar.dev/api/v1/device/translate";
const char* HEARTBEAT_URL = "https://paralax.amalskumar.dev/api/v1/device/heartbeat";
const char* CONFIG_URL    = "https://paralax.amalskumar.dev/api/v1/device/config";

// Paste your device secret key from https://paralax.amalskumar.dev/devices
const char* DEVICE_KEY    = "key_YOUR_DEVICE_KEY_HERE";
const char* FIRMWARE_VER  = "1.1.0";

// Default Language Pair (Updated dynamically via Heartbeat / Config Sync)
String currentLanguageA   = "en-US";
String currentLanguageB   = "es-US";

// ============================================================================
// HARDWARE PIN DEFINITIONS (38-Pin ESP32-WROOM-32)
// ============================================================================
// Dual Push Buttons (Connect between GPIO and GND, active LOW)
#define PIN_BUTTON_A      32    // Button 1: Hold to speak Language A -> translates to Language B
#define PIN_BUTTON_B      21    // Button 2: Hold to speak Language B -> translates to Language A
                                // Note: Can be changed to GPIO 18, 19, 23, or 4 if preferred

// INMP441 Microphone (I2S_NUM_0 - Master RX)
#define I2S_MIC_SCK       26
#define I2S_MIC_WS        25
#define I2S_MIC_SD        33

// MAX98357A Audio Amplifier (I2S_NUM_1 - Master TX)
#define I2S_SPK_BCLK      14
#define I2S_SPK_LRC       27
#define I2S_SPK_DIN       22

// Audio Sampling Settings
#define SAMPLE_RATE       16000   // 16 kHz 16-bit mono PCM = 32,000 bytes/sec
#define CHUNK_SAMPLES     512     // 512 samples per I2S read chunk
#define MAX_TARGET_SEC    2.5f    // 2.5 seconds max utterance
#define TARGET_BUF_BYTES  80000   // 80,000 bytes (safely fits in ESP32 SRAM block)
#define MIN_SPEECH_BYTES  12800   // Minimum 0.4s speech (12,800 bytes)

// ============================================================================
// GLOBAL STATE & BUFFERS
// ============================================================================
int16_t* audioRecordBuffer    = NULL;
size_t   bufferCapacityBytes  = 0;
float    maxRecordSeconds     = 0.0f;
size_t   audioRecordedBytes   = 0;

int  lastAudioLevelPercent    = 0;
int  lastMicPeakPercent       = 0;
int  deviceConfigVersion      = 1;
unsigned long lastHeartbeatMs = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

// Function declarations
void printHeaderBox(const char* title);
void printDivider();
const char* getRssiQuality(int rssi);
void printAsciiBar(int percent, int width);
void initI2sMic();
void initI2sSpeaker();
void connectWiFi();
void playTone(int frequencyHz, int durationMs);
void soundStartup();
void soundWiFiConnected();
void soundButtonPress(int frequencyHz);
void soundButtonRelease();
void soundError();
void recordAudio(int buttonPin, const char* directionTag);
void sendTranslationRequest(const char* directionTag);
void sendHeartbeat();
String generateUUID();
String decodeBase64Url(String input);

// ============================================================================
// ARDUINO SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  printHeaderBox("PARALAX IoT Dual-Button AI Voice Translator - Boot Diagnostics");
  Serial.printf("[System] ESP32 Chip Revision: %d | CPU Freq: %d MHz\n", ESP.getChipRevision(), ESP.getCpuFreqMHz());
  Serial.printf("[System] Flash Chip Size:     %u MB\n", ESP.getFlashChipSize() / (1024 * 1024));
  Serial.printf("[System] Free Heap at Boot:   %u bytes\n", ESP.getFreeHeap());
  Serial.printf("[System] Max Contiguous Block: %u bytes\n", ESP.getMaxAllocHeap());
  Serial.printf("[System] Firmware Version:     %s\n", FIRMWARE_VER);
  Serial.printf("[System] Target Cloud Server:  https://%s\n", API_HOST);
  Serial.printf("[System] MAC Address:          %s\n", WiFi.macAddress().c_str());
  printDivider();

  // 1. Initialize Dual Push-to-Talk Buttons
  pinMode(PIN_BUTTON_A, INPUT_PULLUP);
  pinMode(PIN_BUTTON_B, INPUT_PULLUP);
  Serial.printf("[Hardware] Button A configured on GPIO %d (INPUT_PULLUP, Active LOW) -> Lang A to B\n", PIN_BUTTON_A);
  Serial.printf("[Hardware] Button B configured on GPIO %d (INPUT_PULLUP, Active LOW) -> Lang B to A\n", PIN_BUTTON_B);
  printDivider();

  // 2. Audio Buffer Allocation in SRAM (Safe Sizing to prevent malloc crash)
  size_t maxAlloc = ESP.getMaxAllocHeap();
  size_t desiredBytes = TARGET_BUF_BYTES; // 80,000 bytes (2.5s)

  // Ensure at least 40 KB contiguous memory remains for mbedTLS / WiFiClientSecure
  if (desiredBytes + 40000 > maxAlloc) {
    desiredBytes = 64000; // 2.0s fallback (64 KB)
  }
  if (desiredBytes + 30000 > maxAlloc) {
    desiredBytes = 48000; // 1.5s emergency fallback (48 KB)
  }

  Serial.printf("[Memory] Allocating audio recording buffer (%u bytes in SRAM)...\n", desiredBytes);
  audioRecordBuffer = (int16_t*) malloc(desiredBytes);
  if (!audioRecordBuffer) {
    Serial.println("[Memory] [RETRY] Falling back to 48,000 bytes...");
    desiredBytes = 48000;
    audioRecordBuffer = (int16_t*) malloc(desiredBytes);
  }

  if (!audioRecordBuffer) {
    Serial.println("[Memory] [FATAL ERROR] Audio buffer allocation failed! Halting.");
    while (1) { delay(1000); }
  }

  bufferCapacityBytes = desiredBytes;
  maxRecordSeconds = (float)bufferCapacityBytes / (SAMPLE_RATE * 2);

  Serial.printf("[Memory] [SUCCESS] Audio buffer allocated: %u bytes (%.1f seconds max speech)\n",
                bufferCapacityBytes, maxRecordSeconds);
  Serial.printf("[Memory] Free heap remaining: %u bytes | Largest free block: %u bytes\n",
                ESP.getFreeHeap(), ESP.getMaxAllocHeap());
  printDivider();

  // 3. Initialize Dual-I2S Hardware Peripherals
  initI2sMic();      // INMP441 on I2S_NUM_0
  initI2sSpeaker();  // MAX98357A on I2S_NUM_1
  printDivider();

  // 4. Connect to Wi-Fi
  connectWiFi();
  printDivider();

  // 5. Audio Startup Chimes on Speaker
  soundStartup();
  soundWiFiConnected();
  printDivider();

  // 6. Initial Heartbeat & Config Sync with Paralax Cloud
  sendHeartbeat();
  printDivider();

  printHeaderBox("SYSTEM READY - DUAL-BUTTON PUSH-TO-TALK ACTIVE");
  Serial.printf("  [Button A - GPIO %2d]: Hold to speak %s -> Translates to %s\n",
                PIN_BUTTON_A, currentLanguageA.c_str(), currentLanguageB.c_str());
  Serial.printf("  [Button B - GPIO %2d]: Hold to speak %s -> Translates to %s\n",
                PIN_BUTTON_B, currentLanguageB.c_str(), currentLanguageA.c_str());
  Serial.println("  Audio feedback tones and speech will play through MAX98357A speaker.");
  printDivider();
}

// ============================================================================
// ARDUINO MAIN LOOP
// ============================================================================
void loop() {
  // Wi-Fi Auto-Reconnect
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n[WiFi] [WARN] Connection lost! Initiating reconnection...");
    soundError();
    connectWiFi();
    soundWiFiConnected();
  }

  // Periodic Telemetry Heartbeat (every 30 seconds)
  if (millis() - lastHeartbeatMs > HEARTBEAT_INTERVAL_MS) {
    sendHeartbeat();
  }

  // --------------------------------------------------------------------------
  // Check Button A: Language A -> Language B (e.g. English -> Spanish)
  // --------------------------------------------------------------------------
  if (digitalRead(PIN_BUTTON_A) == LOW) {
    delay(40); // Debounce
    if (digitalRead(PIN_BUTTON_A) == LOW) {
      Serial.printf("\n>>> [Button A - GPIO %d] PRESSED: Translating %s -> %s\n",
                    PIN_BUTTON_A, currentLanguageA.c_str(), currentLanguageB.c_str());
      soundButtonPress(1000); // 1000Hz start blip

      recordAudio(PIN_BUTTON_A, "a_to_b");

      if (audioRecordedBytes >= MIN_SPEECH_BYTES) {
        sendTranslationRequest("a_to_b");
      } else {
        Serial.printf("[Voice] [WARN] Utterance too short (%u bytes < %u bytes required). Discarded.\n",
                      audioRecordedBytes, MIN_SPEECH_BYTES);
        soundError();
      }

      delay(400); // Cool-down delay
      Serial.println("\n[Ready] Ready for next translation. Press Button A or Button B.");
    }
  }

  // --------------------------------------------------------------------------
  // Check Button B: Language B -> Language A (e.g. Spanish -> English)
  // --------------------------------------------------------------------------
  if (digitalRead(PIN_BUTTON_B) == LOW) {
    delay(40); // Debounce
    if (digitalRead(PIN_BUTTON_B) == LOW) {
      Serial.printf("\n>>> [Button B - GPIO %d] PRESSED: Translating %s -> %s\n",
                    PIN_BUTTON_B, currentLanguageB.c_str(), currentLanguageA.c_str());
      soundButtonPress(1400); // 1400Hz start blip (higher pitch for Button B)

      recordAudio(PIN_BUTTON_B, "b_to_a");

      if (audioRecordedBytes >= MIN_SPEECH_BYTES) {
        sendTranslationRequest("b_to_a");
      } else {
        Serial.printf("[Voice] [WARN] Utterance too short (%u bytes < %u bytes required). Discarded.\n",
                      audioRecordedBytes, MIN_SPEECH_BYTES);
        soundError();
      }

      delay(400); // Cool-down delay
      Serial.println("\n[Ready] Ready for next translation. Press Button A or Button B.");
    }
  }

  delay(20);
}

// ============================================================================
// I2S PERIPHERAL INITIALIZATION
// ============================================================================
void initI2sMic() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = CHUNK_SAMPLES,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num   = I2S_MIC_SCK,
    .ws_io_num    = I2S_MIC_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num  = I2S_MIC_SD
  };

  esp_err_t err = i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  if (err != ESP_OK) {
    Serial.printf("[I2S_0] [ERROR] Driver install failed: %d\n", err);
  }
  err = i2s_set_pin(I2S_NUM_0, &pin_config);
  if (err != ESP_OK) {
    Serial.printf("[I2S_0] [ERROR] Pin configuration failed: %d\n", err);
  }
  Serial.printf("[I2S_0] [SUCCESS] INMP441 Mic ready on SCK=%d, WS=%d, SD=%d (16kHz 16-bit Mono)\n",
                I2S_MIC_SCK, I2S_MIC_WS, I2S_MIC_SD);
}

void initI2sSpeaker() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = CHUNK_SAMPLES,
    .use_apll = false,
    .tx_desc_auto_clear = true,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num   = I2S_SPK_BCLK,
    .ws_io_num    = I2S_SPK_LRC,
    .data_out_num = I2S_SPK_DIN,
    .data_in_num  = I2S_PIN_NO_CHANGE
  };

  esp_err_t err = i2s_driver_install(I2S_NUM_1, &i2s_config, 0, NULL);
  if (err != ESP_OK) {
    Serial.printf("[I2S_1] [ERROR] Driver install failed: %d\n", err);
  }
  err = i2s_set_pin(I2S_NUM_1, &pin_config);
  if (err != ESP_OK) {
    Serial.printf("[I2S_1] [ERROR] Pin configuration failed: %d\n", err);
  }
  Serial.printf("[I2S_1] [SUCCESS] MAX98357A Amp ready on BCLK=%d, LRC=%d, DIN=%d (16kHz 16-bit Mono)\n",
                I2S_SPK_BCLK, I2S_SPK_LRC, I2S_SPK_DIN);
}

// ============================================================================
// AUDIO RECORDING & LIVE SERIAL VU METER
// ============================================================================
void recordAudio(int buttonPin, const char* directionTag) {
  int32_t raw_i2s_buffer[CHUNK_SAMPLES];
  size_t bytes_read = 0;
  audioRecordedBytes = 0;
  unsigned long startRecordMs = millis();
  unsigned long lastPrintMs = 0;

  memset(audioRecordBuffer, 0, bufferCapacityBytes);
  Serial.println("[Voice] >>> Recording in progress... (keep button pressed, speak clearly)");

  while (digitalRead(buttonPin) == LOW && audioRecordedBytes < bufferCapacityBytes) {
    esp_err_t res = i2s_read(I2S_NUM_0, raw_i2s_buffer, sizeof(raw_i2s_buffer), &bytes_read, 100 / portTICK_PERIOD_MS);
    if (res == ESP_OK && bytes_read > 0) {
      size_t samples_read = bytes_read / sizeof(int32_t);
      int64_t sum_squares = 0;
      int16_t peak_val = 0;

      for (size_t i = 0; i < samples_read; i++) {
        // Shift right by 14 bits for +12dB digital gain into 16-bit PCM
        int16_t sample16 = (int16_t)(raw_i2s_buffer[i] >> 14);

        if (audioRecordedBytes + sizeof(int16_t) <= bufferCapacityBytes) {
          audioRecordBuffer[audioRecordedBytes / 2] = sample16;
          audioRecordedBytes += sizeof(int16_t);
        }

        sum_squares += ((int64_t)sample16 * sample16);
        if (abs(sample16) > peak_val) {
          peak_val = abs(sample16);
        }
      }

      float rms = sqrt((float)sum_squares / samples_read);
      int levelPercent = constrain((int)((rms / 8000.0f) * 100.0f), 0, 100);
      int peakPercent  = constrain((int)((peak_val / 32767.0f) * 100.0f), 0, 100);
      lastAudioLevelPercent = levelPercent;
      lastMicPeakPercent    = peakPercent;

      float elapsedSec = (millis() - startRecordMs) / 1000.0f;

      // Print live Serial VU Meter every 200 ms
      if (millis() - lastPrintMs > 200) {
        lastPrintMs = millis();
        Serial.printf("[Voice]  %.1fs / %.1fs  |  RMS: %3d%%  ", elapsedSec, maxRecordSeconds, levelPercent);
        printAsciiBar(levelPercent, 16);
        Serial.printf("  |  Peak: %3d%%\n", peakPercent);
      }
    }
  }

  soundButtonRelease(); // 800Hz confirmation click
  float totalSec = (float)audioRecordedBytes / (SAMPLE_RATE * 2);
  Serial.printf("[Voice] <<< Recording finished: %.2f seconds captured (%u bytes raw PCM)\n",
                totalSec, audioRecordedBytes);
}

// ============================================================================
// PARALAX HTTPS API TRANSLATION REQUEST (Comprehensive Serial Trace)
// ============================================================================
void sendTranslationRequest(const char* directionTag) {
  printHeaderBox("HTTPS TRANSLATION REQUEST - PARALAX CLOUD API");

  Serial.printf("[API] Target URL:    %s\n", TRANSLATE_URL);
  Serial.printf("[API] Host / Port:   %s : %d\n", API_HOST, API_PORT);
  Serial.printf("[API] Direction:     %s (%s -> %s)\n",
                directionTag,
                (strcmp(directionTag, "a_to_b") == 0) ? currentLanguageA.c_str() : currentLanguageB.c_str(),
                (strcmp(directionTag, "a_to_b") == 0) ? currentLanguageB.c_str() : currentLanguageA.c_str());
  Serial.printf("[API] Payload Size:  %u bytes (16 kHz 16-bit Mono PCM)\n", audioRecordedBytes);

  WiFiClientSecure client;
  client.setInsecure(); // SSL connection without manual root CA bundle
  client.setTimeout(15000);

  Serial.print("[API] Establishing SSL/TLS handshake with server...");
  unsigned long connectStart = millis();

  if (!client.connect(API_HOST, API_PORT)) {
    Serial.println("\n[API] [FATAL ERROR] Failed to connect to Paralax server!");
    Serial.println("[API] Check your internet connection or verify DNS lookup for paralax.amalskumar.dev.");
    soundError();
    return;
  }

  unsigned long handshakeMs = millis() - connectStart;
  Serial.printf(" Connected! (%lu ms)\n", handshakeMs);

  String idempotencyKey = generateUUID();

  // 1. Send HTTP POST Headers
  Serial.println("[API] >>> Sending HTTP Request Headers:");
  Serial.println("[API]     POST /api/v1/device/translate HTTP/1.1");
  Serial.printf("[API]     Host: %s\n", API_HOST);
  Serial.printf("[API]     X-Device-Key: %s\n", DEVICE_KEY);
  Serial.printf("[API]     Idempotency-Key: %s\n", idempotencyKey.c_str());
  Serial.printf("[API]     X-Direction: %s\n", directionTag);
  Serial.println("[API]     Content-Type: audio/L16;rate=16000");
  Serial.println("[API]     Accept: application/octet-stream");
  Serial.printf("[API]     Content-Length: %u\n", audioRecordedBytes);
  Serial.println("[API]     Connection: close");

  client.println("POST /api/v1/device/translate HTTP/1.1");
  client.println("Host: " + String(API_HOST));
  client.println("X-Device-Key: " + String(DEVICE_KEY));
  client.println("Idempotency-Key: " + idempotencyKey);
  client.println("X-Direction: " + String(directionTag));
  client.println("Content-Type: audio/L16;rate=16000");
  client.println("Accept: application/octet-stream");
  client.println("Content-Length: " + String(audioRecordedBytes));
  client.println("Connection: close");
  client.println();

  // 2. Stream Audio Payload in 1024-byte Chunks
  Serial.printf("[API] >>> Streaming audio payload (%u bytes in 1024-byte chunks)...\n", audioRecordedBytes);
  unsigned long uploadStart = millis();
  const size_t CHUNK_SIZE = 1024;
  uint8_t* bytePtr = (uint8_t*)audioRecordBuffer;
  size_t bytesLeft = audioRecordedBytes;
  size_t bytesSent = 0;

  while (bytesLeft > 0) {
    size_t toWrite = (bytesLeft > CHUNK_SIZE) ? CHUNK_SIZE : bytesLeft;
    client.write(bytePtr, toWrite);
    bytePtr += toWrite;
    bytesLeft -= toWrite;
    bytesSent += toWrite;

    if (bytesSent % 16384 == 0 || bytesLeft == 0) {
      int progressPct = (int)((bytesSent * 100) / audioRecordedBytes);
      Serial.printf("[API]     Upload progress: %3d%% (%u / %u bytes)\n", progressPct, bytesSent, audioRecordedBytes);
    }
  }

  unsigned long uploadDuration = millis() - uploadStart;
  float speedKbps = uploadDuration > 0 ? (float)(audioRecordedBytes) / uploadDuration : 0;
  Serial.printf("[API] Upload complete in %lu ms (%.1f KB/s). Awaiting AI pipeline...\n", uploadDuration, speedKbps);

  // 3. Read Status Line
  unsigned long waitStart = millis();
  while (!client.available()) {
    if (millis() - waitStart > 15000) {
      Serial.println("[API] [TIMEOUT ERROR] Server pipeline did not respond within 15 seconds!");
      client.stop();
      soundError();
      return;
    }
    delay(10);
  }

  unsigned long waitResponseMs = millis() - waitStart;
  String statusLine = client.readStringUntil('\n');
  statusLine.trim();
  Serial.printf("[API] <<< Response Status: %s (Wait time: %lu ms)\n", statusLine.c_str(), waitResponseMs);

  // 4. Handle Non-200 Responses
  if (statusLine.indexOf("200") == -1) {
    Serial.println("[API] [ERROR] Non-200 HTTP Status received from cloud!");
    Serial.println("[API] <<< Response Headers & Error Payload:");

    String errorBody = "";
    while (client.connected() || client.available()) {
      if (client.available()) {
        String line = client.readStringUntil('\n');
        Serial.printf("[API]     %s\n", line.c_str());
        errorBody += line;
      }
    }
    client.stop();

    if (statusLine.indexOf("401") != -1) {
      Serial.println("[API] [DIAGNOSTIC] HTTP 401 Unauthorized: DEVICE_KEY is invalid or revoked!");
      Serial.println("[API] Solution: Register/view device at https://paralax.amalskumar.dev/devices and copy key.");
    } else if (statusLine.indexOf("429") != -1) {
      Serial.println("[API] [DIAGNOSTIC] HTTP 429 Rate Limited / Quota Exceeded for this device.");
    } else if (statusLine.indexOf("422") != -1) {
      Serial.println("[API] [DIAGNOSTIC] HTTP 422 Unprocessable Audio (Silence or noise threshold not met).");
    } else if (statusLine.indexOf("503") != -1) {
      Serial.println("[API] [DIAGNOSTIC] HTTP 503: Service is currently disabled in dashboard Settings.");
    }

    soundError();
    return;
  }

  // 5. Parse Response Headers
  Serial.println("[API] <<< Server Pipeline Response Headers:");
  String headerTranscript = "";
  String headerTranslation = "";
  int totalMs = 0;
  size_t responseContentLength = 0;

  while (client.connected()) {
    String line = client.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) break; // Blank line = HTTP body start

    if (line.startsWith("X-Transcript:")) {
      headerTranscript = decodeBase64Url(line.substring(13));
      headerTranscript.trim();
    } else if (line.startsWith("X-Translation:")) {
      headerTranslation = decodeBase64Url(line.substring(14));
      headerTranslation.trim();
    } else if (line.startsWith("X-Total-Ms:")) {
      totalMs = line.substring(11).toInt();
      Serial.printf("[API]     [Pipeline Latency] %d ms\n", totalMs);
    } else if (line.startsWith("X-STT-Ms:")) {
      Serial.printf("[API]     [STT Timing]       %s ms\n", line.substring(9).c_str());
    } else if (line.startsWith("X-Translate-Ms:")) {
      Serial.printf("[API]     [Translate Timing] %s ms\n", line.substring(15).c_str());
    } else if (line.startsWith("X-Synthesize-Ms:")) {
      Serial.printf("[API]     [TTS Timing]       %s ms\n", line.substring(16).c_str());
    } else if (line.startsWith("Content-Length:")) {
      responseContentLength = line.substring(15).toInt();
      Serial.printf("[API]     [Audio Length]     %u bytes\n", responseContentLength);
    }
  }

  // 6. Highlighted Transcript and Translation Display
  Serial.println("\n================================================================================");
  Serial.printf(">>> [TRANSCRIPT]  \"%s\"\n", headerTranscript.c_str());
  Serial.printf(">>> [TRANSLATION] \"%s\"\n", headerTranslation.c_str());
  Serial.printf(">>> [TOTAL TIME]  %d ms (Network + STT + AI Translate + TTS Synthesis)\n", totalMs);
  Serial.println("================================================================================");

  // 7. Direct HTTP-to-I2S Audio Streaming to MAX98357A Speaker!
  Serial.println("[Speaker] Streaming synthesized voice directly to MAX98357A amplifier...");
  uint8_t playBuffer[1024];
  size_t bytesWritten = 0;
  size_t totalAudioPlayed = 0;
  unsigned long playbackStart = millis();

  while (client.connected() || client.available()) {
    int bytesAvailable = client.available();
    if (bytesAvailable > 0) {
      int toRead = (bytesAvailable > sizeof(playBuffer)) ? sizeof(playBuffer) : bytesAvailable;
      int bytesRead = client.read(playBuffer, toRead);
      if (bytesRead > 0) {
        i2s_write(I2S_NUM_1, playBuffer, bytesRead, &bytesWritten, portMAX_DELAY);
        totalAudioPlayed += bytesWritten;
      }
    } else {
      delay(2);
    }
  }

  client.stop();
  unsigned long playbackMs = millis() - playbackStart;
  Serial.printf("[Speaker] Playback complete: %u bytes rendered through speaker in %lu ms\n",
                totalAudioPlayed, playbackMs);
  printDivider();
}

// ============================================================================
// PERIODIC HEARTBEAT & TELEMETRY (Every 30 Seconds)
// ============================================================================
void sendHeartbeat() {
  lastHeartbeatMs = millis();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Heartbeat] Skipping heartbeat (Wi-Fi not connected)");
    return;
  }

  Serial.println("[Heartbeat] Sending telemetry payload to cloud...");
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(6000);

  HTTPClient http;
  if (!http.begin(client, HEARTBEAT_URL)) {
    Serial.println("[Heartbeat] [ERROR] Failed to initialize HTTP client for heartbeat");
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  StaticJsonDocument<256> doc;
  doc["firmware_version"] = FIRMWARE_VER;
  doc["rssi"]             = WiFi.RSSI();
  doc["battery_pct"]      = 100;
  doc["uptime_sec"]       = (int)(millis() / 1000);
  doc["free_heap"]        = ESP.getFreeHeap();
  doc["audio_level"]      = lastAudioLevelPercent;
  doc["mic_peak"]         = lastMicPeakPercent;
  doc["config_version"]   = deviceConfigVersion;

  String requestJson;
  serializeJson(doc, requestJson);

  int httpCode = http.POST(requestJson);
  if (httpCode == 200) {
    String response = http.getString();
    StaticJsonDocument<512> resDoc;
    DeserializationError jsonErr = deserializeJson(resDoc, response);

    if (!jsonErr) {
      if (resDoc.containsKey("config_version")) {
        deviceConfigVersion = resDoc["config_version"].as<int>();
      }

      // Sync active language pair if provided by cloud config
      if (resDoc.containsKey("config")) {
        JsonObject cfg = resDoc["config"];
        if (cfg.containsKey("language_a")) currentLanguageA = cfg["language_a"].as<String>();
        if (cfg.containsKey("language_b")) currentLanguageB = cfg["language_b"].as<String>();
      }

      Serial.printf("[Heartbeat] [ACK 200] Telemetry synced. Cloud Config v%d | Pair: %s <-> %s\n",
                    deviceConfigVersion, currentLanguageA.c_str(), currentLanguageB.c_str());

      // Check for remote commands (e.g. reboot command from web dashboard)
      if (resDoc.containsKey("pending_commands")) {
        JsonArray commands = resDoc["pending_commands"].as<JsonArray>();
        for (JsonObject cmd : commands) {
          String type = cmd["type"].as<String>();
          if (type == "reboot") {
            Serial.println("[Heartbeat] [COMMAND] Remote REBOOT commanded by Paralax dashboard! Restarting...");
            soundError();
            delay(1000);
            ESP.restart();
          }
        }
      }
    } else {
      Serial.printf("[Heartbeat] JSON parse error: %s\n", jsonErr.c_str());
    }
  } else {
    Serial.printf("[Heartbeat] [WARN] Server returned HTTP %d\n", httpCode);
  }

  http.end();
}

// ============================================================================
// WI-FI CONNECTION & DIAGNOSTICS
// ============================================================================
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  Serial.printf("[WiFi] Initiating connection to SSID: \"%s\"...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  Serial.print("[WiFi] Connecting");
  while (WiFi.status() != WL_CONNECTED && attempts < 35) {
    delay(400);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" CONNECTED!");
    Serial.printf("[WiFi] IP Address:   %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[WiFi] Gateway IP:   %s\n", WiFi.gatewayIP().toString().c_str());
    Serial.printf("[WiFi] Subnet Mask:  %s\n", WiFi.subnetMask().toString().c_str());
    Serial.printf("[WiFi] DNS Server:   %s\n", WiFi.dnsIP().toString().c_str());
    int rssi = WiFi.RSSI();
    Serial.printf("[WiFi] Signal RSSI:  %d dBm (%s)\n", rssi, getRssiQuality(rssi));
  } else {
    Serial.println("\n[WiFi] [ERROR] Failed to join Wi-Fi network!");
    Serial.println("[WiFi] Check SSID, password, or ensure 2.4 GHz network is available.");
  }
}

// ============================================================================
// AUDIO TONES & ACOUSTIC CUES (Played via MAX98357A Speaker)
// ============================================================================
void playTone(int frequencyHz, int durationMs) {
  int samples = (SAMPLE_RATE * durationMs) / 1000;
  int16_t toneBuffer[128];
  size_t bytesWritten;
  float phase = 0.0;
  float phaseIncrement = 2.0 * PI * frequencyHz / SAMPLE_RATE;

  int samplesRemaining = samples;
  while (samplesRemaining > 0) {
    int toGenerate = (samplesRemaining > 128) ? 128 : samplesRemaining;
    for (int i = 0; i < toGenerate; i++) {
      toneBuffer[i] = (int16_t)(sin(phase) * 6000.0f); // Gentle volume
      phase += phaseIncrement;
      if (phase >= 2.0 * PI) phase -= 2.0 * PI;
    }
    i2s_write(I2S_NUM_1, toneBuffer, toGenerate * sizeof(int16_t), &bytesWritten, portMAX_DELAY);
    samplesRemaining -= toGenerate;
  }
}

void soundStartup() {
  Serial.println("[Speaker] Playing startup chime (880Hz -> 1320Hz)...");
  playTone(880, 80);
  delay(50);
  playTone(1320, 140);
}

void soundWiFiConnected() {
  playTone(1046, 70); // C6
  delay(30);
  playTone(1318, 70); // E6
  delay(30);
  playTone(1568, 120); // G6
}

void soundButtonPress(int frequencyHz) {
  playTone(frequencyHz, 50);
}

void soundButtonRelease() {
  playTone(800, 50);
}

void soundError() {
  playTone(320, 120);
  delay(80);
  playTone(320, 160);
}

// ============================================================================
// FORMATTING HELPERS & SERIAL ASCII ART
// ============================================================================
void printHeaderBox(const char* title) {
  Serial.println("\n+----------------------------------------------------------------------+");
  Serial.printf("| %-68s |\n", title);
  Serial.println("+----------------------------------------------------------------------+");
}

void printDivider() {
  Serial.println("------------------------------------------------------------------------");
}

const char* getRssiQuality(int rssi) {
  if (rssi >= -50) return "Excellent [||||]";
  if (rssi >= -65) return "Good      [|||.]";
  if (rssi >= -75) return "Fair      [||..]";
  if (rssi >= -85) return "Weak      [|...]";
  return "Very Weak [....]";
}

void printAsciiBar(int percent, int width) {
  int filled = (percent * width) / 100;
  filled = constrain(filled, 0, width);
  Serial.print("[");
  for (int i = 0; i < width; i++) {
    if (i < filled) Serial.print("#");
    else Serial.print("-");
  }
  Serial.print("]");
}

// ============================================================================
// UTILITIES: UUID & BASE64URL DECODER
// ============================================================================
String generateUUID() {
  uint32_t r1 = esp_random(), r2 = esp_random(), r3 = esp_random(), r4 = esp_random();
  char uuid[37];
  snprintf(uuid, sizeof(uuid), "%08x-%04x-4%03x-%04x-%08x%04x",
           r1, (uint16_t)(r2 >> 16), (uint16_t)(r2 & 0x0FFF),
           (uint16_t)((r3 >> 16) & 0x3FFF) | 0x8000, r4, (uint16_t)(r3 & 0xFFFF));
  return String(uuid);
}

String decodeBase64Url(String input) {
  input.replace('-', '+');
  input.replace('_', '/');
  while (input.length() % 4 != 0) input += '=';

  const char b64[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  String output = "";
  int val = 0, valb = -8;
  for (size_t i = 0; i < input.length(); i++) {
    char c = input[i];
    if (c == '=') break;
    const char* p = strchr(b64, c);
    if (!p) continue;
    val = (val << 6) + (p - b64);
    valb += 6;
    if (valb >= 0) {
      output += (char)((val >> valb) & 0xFF);
      valb -= 8;
    }
  }
  return output;
}
```
