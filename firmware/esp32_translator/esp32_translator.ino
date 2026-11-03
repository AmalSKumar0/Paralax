/**
 * ============================================================================
 * PARALAX IoT Push-to-Talk AI Voice Translator - ESP32 Firmware
 * ============================================================================
 * Microcontroller: ESP32-WROOM-32 (CP2102 38-pin DevKit MicroUSB)
 * Backend API:     https://paralax.amalskumar.dev
 * Serial Baud:     115200 baud
 *
 * HARDWARE PERIPHERALS & WIRING TABLE:
 * ----------------------------------------------------------------------------
 * 1. INMP441 MEMS Microphone (Voice Input via I2S_NUM_0)
 *    - VDD   -> 3.3V
 *    - GND   -> GND
 *    - SCK   -> GPIO 26 (I2S0 Bit Clock)
 *    - WS    -> GPIO 25 (I2S0 Word Select)
 *    - SD    -> GPIO 33 (I2S0 Serial Data In)
 *    - L/R   -> GND     (Left Channel selected)
 *
 * 2. MAX98357A I2S Class-D Mono Amplifier (Voice Output via I2S_NUM_1)
 *    - VIN   -> 5V (or VIN pin of ESP32)
 *    - GND   -> GND
 *    - BCLK  -> GPIO 14 (I2S1 Bit Clock)
 *    - LRC   -> GPIO 27 (I2S1 Word Select / LR Clock)
 *    - DIN   -> GPIO 22 (I2S1 Serial Data Out)
 *    - GAIN  -> Floating (12 dB gain)
 *    - SD    -> Unconnected (Shut Down pin high = active)
 *    - OUT+  -> 8 Ohm 0.5W Speaker (+)
 *    - OUT-  -> 8 Ohm 0.5W Speaker (-)
 *
 * 3. 0.96" OLED I2C Display (SSD1306 128x64)
 *    - VCC   -> 3.3V (or 5V)
 *    - GND   -> GND
 *    - SDA   -> GPIO 21
 *    - SCL   -> GPIO 19  (Note: SCL on 19 because GPIO 22 is MAX98357A DIN)
 *
 * 4. Push Button (6x6mm Tact Switch - Push to Talk)
 *    - Pin 1 -> GPIO 32
 *    - Pin 2 -> GND (Internal pull-up enabled: Active LOW)
 *
 * 5. Power Supply
 *    - 5V 2A Power Source via MicroUSB or 5V/VIN & GND pins
 * ----------------------------------------------------------------------------
 * REQUIRED ARDUINO LIBRARIES (Install via Arduino Library Manager):
 * 1. Adafruit SSD1306 (by Adafruit)
 * 2. Adafruit GFX Library (by Adafruit)
 * 3. ArduinoJson (by Benoit Blanchon, v6 or v7)
 * ============================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <driver/i2s.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include <math.h>

// ============================================================================
// USER CONFIGURATION (Wi-Fi & Device Credentials)
// ============================================================================
const char* WIFI_SSID     = "Aurora";
const char* WIFI_PASSWORD = "amalskumar";

// Target Paralax production server
const char* API_HOST      = "paralax.amalskumar.dev";
const int   API_PORT      = 443;
const char* TRANSLATE_URL = "https://paralax.amalskumar.dev/api/v1/device/translate";
const char* HEARTBEAT_URL = "https://paralax.amalskumar.dev/api/v1/device/heartbeat";
const char* CONFIG_URL    = "https://paralax.amalskumar.dev/api/v1/device/config";

// Paste your device secret key from the Paralax Dashboard (Devices -> Device Key)
const char* DEVICE_KEY    = "key_YOUR_DEVICE_KEY_HERE";

// Firmware version
const char* FIRMWARE_VER  = "1.0.0";

// ============================================================================
// HARDWARE PIN DEFINITIONS
// ============================================================================
#define PIN_BUTTON       32

// OLED Display (I2C)
#define OLED_SDA         21
#define OLED_SCL         19
#define OLED_RESET       -1
#define SCREEN_WIDTH     128
#define SCREEN_HEIGHT    64
#define OLED_I2C_ADDR    0x3C

// INMP441 Microphone (I2S_NUM_0 - Master RX)
#define I2S_MIC_SCK      26
#define I2S_MIC_WS       25
#define I2S_MIC_SD       33

// MAX98357A Audio Amplifier (I2S_NUM_1 - Master TX)
#define I2S_SPK_BCLK     14
#define I2S_SPK_LRC      27
#define I2S_SPK_DIN      22

// Audio Sampling Settings
#define SAMPLE_RATE      16000
#define CHUNK_SAMPLES    512
#define MAX_RECORD_SEC   5       // 5 seconds max utterance
#define BUFFER_CAPACITY  (SAMPLE_RATE * 2 * MAX_RECORD_SEC) // 160,000 bytes

// ============================================================================
// GLOBAL OBJECTS & STATE
// ============================================================================
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

int16_t* audioRecordBuffer = NULL;
size_t   audioRecordedBytes = 0;

int  lastAudioLevelPercent = 0;
int  lastMicPeakPercent    = 0;
int  deviceConfigVersion   = 1;
unsigned long lastHeartbeatMs = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

String currentLanguageA = "en-US";
String currentLanguageB = "es-US";
String currentDirection = "a_to_b";

// Serial Diagnostic Helpers
void printHeaderBox(const char* title);
void printDivider();
const char* getRssiQuality(int rssi);
void printAsciiBar(int percent, int width);

// Peripheral and Flow Declarations
void initOled();
void initI2sMic();
void initI2sSpeaker();
void connectWiFi();
void playTone(int frequencyHz, int durationMs);
void renderHeader(const char* title);
void showScreenMessage(const char* title, const char* msg1, const char* msg2 = NULL);
void showRecordingScreen(int levelPercent, float elapsedSec);
void showResultScreen(const String& transcript, const String& translation, int totalMs);
void recordAudio();
void sendTranslationRequest();
void sendHeartbeat();
String generateUUID();
String decodeBase64Url(String input);

// ============================================================================
// ARDUINO SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  printHeaderBox("PARALAX IoT AI Voice Translator - Boot Diagnostics");
  Serial.printf("[System] ESP32 Chip Revision: %d | CPU Freq: %d MHz\n", ESP.getChipRevision(), ESP.getCpuFreqMHz());
  Serial.printf("[System] Flash Chip Size:     %u MB\n", ESP.getFlashChipSize() / (1024 * 1024));
  Serial.printf("[System] Free Heap at Boot:   %u bytes\n", ESP.getFreeHeap());
  Serial.printf("[System] Firmware Version:     %s\n", FIRMWARE_VER);
  Serial.printf("[System] Target Server:        https://%s\n", API_HOST);
  Serial.printf("[System] MAC Address:          %s\n", WiFi.macAddress().c_str());
  printDivider();

  // 1. Initialize Push Button
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  Serial.println("[Hardware] Button configured on GPIO 32 (INPUT_PULLUP, Active LOW)");

  // 2. Initialize OLED Display (SDA=21, SCL=19)
  Serial.printf("[Hardware] Initializing SSD1306 OLED via I2C (SDA=%d, SCL=%d, Addr=0x%02X)...\n",
                OLED_SDA, OLED_SCL, OLED_I2C_ADDR);
  initOled();
  showScreenMessage("PARALAX AI", "Booting system...", "ESP32 WROOM-32");

  // 3. Allocate Audio Recording Buffer
  Serial.printf("[Memory] Allocating audio recording buffer (%u bytes in SRAM)...\n", BUFFER_CAPACITY);
  audioRecordBuffer = (int16_t*) malloc(BUFFER_CAPACITY);
  if (!audioRecordBuffer) {
    Serial.println("[Memory] [FATAL ERROR] Audio buffer allocation failed! Halting.");
    showScreenMessage("MEMORY ERROR", "Audio buffer allocation", "failed in heap!");
    while (1) { delay(1000); }
  }
  Serial.printf("[Memory] [SUCCESS] Audio buffer ready (%u bytes). Free heap remaining: %u bytes\n",
                BUFFER_CAPACITY, ESP.getFreeHeap());
  printDivider();

  // 4. Initialize Dual-I2S Hardware Peripherals
  initI2sMic();      // INMP441 on I2S_NUM_0
  initI2sSpeaker();  // MAX98357A on I2S_NUM_1
  printDivider();

  // 5. Connect to Wi-Fi
  showScreenMessage("CONNECTING...", "Joining Wi-Fi SSID:", WIFI_SSID);
  connectWiFi();
  printDivider();

  // 6. Audio Startup Chime on Speaker
  Serial.println("[Speaker] Playing startup sound chime (880Hz -> 1320Hz)...");
  playTone(880, 80);
  delay(60);
  playTone(1320, 140);
  Serial.println("[Speaker] Startup sound complete.");
  printDivider();

  // 7. Initial Heartbeat & Config Sync
  sendHeartbeat();
  printDivider();

  printHeaderBox("SYSTEM READY - HOLD BUTTON ON GPIO 32 TO SPEAK");
  showScreenMessage("READY TO SPEAK", "Press button to talk", "en-US <-> es-US");
}

// ============================================================================
// ARDUINO MAIN LOOP
// ============================================================================
void loop() {
  // Check Wi-Fi Connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n[WiFi] [WARN] Connection lost! Initiating reconnection...");
    showScreenMessage("WIFI LOST", "Reconnecting to:", WIFI_SSID);
    connectWiFi();
    showScreenMessage("READY TO SPEAK", "Press button to talk", "en-US <-> es-US");
  }

  // Handle Periodic Background Heartbeat
  if (millis() - lastHeartbeatMs > HEARTBEAT_INTERVAL_MS) {
    sendHeartbeat();
  }

  // Check Push Button (Active LOW)
  if (digitalRead(PIN_BUTTON) == LOW) {
    delay(40); // Debounce
    if (digitalRead(PIN_BUTTON) == LOW) {
      Serial.println("\n>>> [Button] Tact switch PRESSED on GPIO 32 -> Starting Voice Capture");
      playTone(1200, 70); // Gentle start tone

      recordAudio();

      if (audioRecordedBytes > SAMPLE_RATE * 2 * 0.4) { // At least 0.4s speech
        sendTranslationRequest();
      } else {
        Serial.printf("[Audio] [WARN] Utterance too short (%u bytes < 0.4s). Discarding.\n", audioRecordedBytes);
        playTone(350, 100);
      }

      delay(800);
      showScreenMessage("READY TO SPEAK", "Press button to talk", "en-US <-> es-US");
      Serial.println("<<< [System] Ready for next voice turn\n");
    }
  }

  delay(20);
}

// ============================================================================
// I2S HARDWARE INITIALIZATION
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
  Serial.printf("[I2S_0] [SUCCESS] INMP441 Microphone initialized on SCK=%d, WS=%d, SD=%d (16kHz 16-bit Mono)\n",
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
  Serial.printf("[I2S_1] [SUCCESS] MAX98357A Amplifier initialized on BCLK=%d, LRC=%d, DIN=%d (16kHz 16-bit Mono)\n",
                I2S_SPK_BCLK, I2S_SPK_LRC, I2S_SPK_DIN);
}

// ============================================================================
// AUDIO RECORDING & SERIAL VU METER
// ============================================================================
void recordAudio() {
  int32_t raw_i2s_buffer[CHUNK_SAMPLES];
  size_t bytes_read = 0;
  audioRecordedBytes = 0;
  unsigned long startRecordMs = millis();
  unsigned long lastPrintMs = 0;

  memset(audioRecordBuffer, 0, BUFFER_CAPACITY);
  Serial.println("[Voice] >>> Recording in progress... (keep button pressed)");

  while (digitalRead(PIN_BUTTON) == LOW && audioRecordedBytes < BUFFER_CAPACITY) {
    esp_err_t res = i2s_read(I2S_NUM_0, raw_i2s_buffer, sizeof(raw_i2s_buffer), &bytes_read, 100 / portTICK_PERIOD_MS);
    if (res == ESP_OK && bytes_read > 0) {
      size_t samples_read = bytes_read / sizeof(int32_t);
      int64_t sum_squares = 0;
      int16_t peak_val = 0;

      for (size_t i = 0; i < samples_read; i++) {
        // Shift right by 14 bits for +12dB digital gain into 16-bit PCM
        int16_t sample16 = (int16_t)(raw_i2s_buffer[i] >> 14);

        if (audioRecordedBytes + sizeof(int16_t) <= BUFFER_CAPACITY) {
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
      showRecordingScreen(levelPercent, elapsedSec);

      // Print live Serial VU Meter every 200 ms
      if (millis() - lastPrintMs > 200) {
        lastPrintMs = millis();
        Serial.printf("[Voice]  %.1fs / %ds  |  RMS Level: %3d%%  ", elapsedSec, MAX_RECORD_SEC, levelPercent);
        printAsciiBar(levelPercent, 16);
        Serial.printf("  |  Peak: %3d%%\n", peakPercent);
      }
    }
  }

  float totalSec = (float)audioRecordedBytes / (SAMPLE_RATE * 2);
  Serial.printf("[Voice] <<< Recording finished: %.2f seconds captured (%u bytes raw PCM)\n", totalSec, audioRecordedBytes);
  playTone(800, 60); // Gentle stop tone
}

// ============================================================================
// PARALAX HTTPS API TRANSLATION REQUEST (Detailed Serial Trace)
// ============================================================================
void sendTranslationRequest() {
  printHeaderBox("HTTPS TRANSLATION REQUEST - PARALAX CLOUD API");
  showScreenMessage("TRANSLATING...", "Contacting Paralax AI", "Processing speech...");

  Serial.printf("[API] Target URL:    %s\n", TRANSLATE_URL);
  Serial.printf("[API] Host / Port:   %s : %d\n", API_HOST, API_PORT);
  Serial.printf("[API] Direction:     %s (Primary -> Target)\n", currentDirection.c_str());
  Serial.printf("[API] Payload Size:  %u bytes (16 kHz 16-bit Mono PCM)\n", audioRecordedBytes);

  WiFiClientSecure client;
  client.setInsecure(); // SSL connection without manual root CA bundle
  client.setTimeout(15000);

  Serial.print("[API] Establishing SSL/TLS handshake with server...");
  unsigned long connectStart = millis();

  if (!client.connect(API_HOST, API_PORT)) {
    Serial.println("\n[API] [FATAL ERROR] Failed to connect to Paralax server!");
    Serial.println("[API] Check your internet connection or verify DNS lookup for paralax.amalskumar.dev.");
    showScreenMessage("NETWORK ERROR", "Failed to connect", "to Paralax server");
    playTone(300, 250);
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
  Serial.printf("[API]     X-Direction: %s\n", currentDirection.c_str());
  Serial.println("[API]     Content-Type: audio/L16;rate=16000");
  Serial.println("[API]     Accept: application/octet-stream");
  Serial.printf("[API]     Content-Length: %u\n", audioRecordedBytes);
  Serial.println("[API]     Connection: close");

  client.println("POST /api/v1/device/translate HTTP/1.1");
  client.println("Host: " + String(API_HOST));
  client.println("X-Device-Key: " + String(DEVICE_KEY));
  client.println("Idempotency-Key: " + idempotencyKey);
  client.println("X-Direction: " + currentDirection);
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
  Serial.printf("[API] Upload complete in %lu ms (%.1f KB/s). Awaiting AI processing...\n", uploadDuration, speedKbps);

  // 3. Read Status Line
  unsigned long waitStart = millis();
  while (!client.available()) {
    if (millis() - waitStart > 15000) {
      Serial.println("[API] [TIMEOUT ERROR] Server pipeline did not respond within 15 seconds!");
      showScreenMessage("TIMEOUT", "API request timed out", "Please try again");
      client.stop();
      playTone(300, 250);
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
    } else if (statusLine.indexOf("503") != -1) {
      Serial.println("[API] [DIAGNOSTIC] HTTP 503: Service is currently disabled in dashboard Settings.");
    }

    showScreenMessage("API ERROR", statusLine.c_str(), "Check Serial Monitor");
    playTone(350, 300);
    return;
  }

  // 5. Parse Response Headers
  Serial.println("[API] <<< Parsing Server Pipeline Response Headers:");
  String headerTranscript = "";
  String headerTranslation = "";
  int totalMs = 0;
  size_t responseContentLength = 0;

  while (client.connected()) {
    String line = client.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) break; // Blank line = body start

    if (line.startsWith("X-Transcript:")) {
      headerTranscript = decodeBase64Url(line.substring(13));
      headerTranscript.trim();
      Serial.printf("[API]     [Transcript]  \"%s\"\n", headerTranscript.c_str());
    } else if (line.startsWith("X-Translation:")) {
      headerTranslation = decodeBase64Url(line.substring(14));
      headerTranslation.trim();
      Serial.printf("[API]     [Translation] \"%s\"\n", headerTranslation.c_str());
    } else if (line.startsWith("X-Total-Ms:")) {
      totalMs = line.substring(11).toInt();
      Serial.printf("[API]     [Total Latency] %d ms\n", totalMs);
    } else if (line.startsWith("Content-Length:")) {
      responseContentLength = line.substring(15).toInt();
      Serial.printf("[API]     [Audio Length]  %u bytes\n", responseContentLength);
    } else if (line.startsWith("Content-Type:")) {
      Serial.printf("[API]     [Content-Type]  %s\n", line.substring(13).c_str());
    }
  }

  // 6. Display Result on Screen
  showResultScreen(headerTranscript, headerTranslation, totalMs);

  // 7. Direct HTTP-to-I2S Audio Streaming to MAX98357A Speaker!
  Serial.println("[Audio] Direct streaming translated speech from HTTP to MAX98357A I2S...");
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
  Serial.printf("[Audio] Playback complete: %u bytes rendered through speaker in %lu ms\n", totalAudioPlayed, playbackMs);
  printDivider();
}

// ============================================================================
// PERIODIC HEARTBEAT & TELEMETRY
// ============================================================================
void sendHeartbeat() {
  lastHeartbeatMs = millis();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Heartbeat] Skipping heartbeat (Wi-Fi not connected)");
    return;
  }

  Serial.println("[Heartbeat] Sending periodic device telemetry to cloud...");

  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(6000);

  HTTPClient http;
  if (!http.begin(client, HEARTBEAT_URL)) {
    Serial.println("[Heartbeat] [ERROR] Unable to begin HTTP client connection");
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  // Prepare JSON Telemetry Payload
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
  Serial.printf("[Heartbeat] >>> Outgoing JSON: %s\n", requestJson.c_str());

  int httpCode = http.POST(requestJson);
  if (httpCode == 200) {
    String response = http.getString();
    Serial.printf("[Heartbeat] <<< Success (200 OK): %s\n", response.c_str());

    StaticJsonDocument<512> resDoc;
    if (!deserializeJson(resDoc, response)) {
      if (resDoc.containsKey("config_version")) {
        int newVersion = resDoc["config_version"].as<int>();
        if (newVersion > deviceConfigVersion) {
          Serial.printf("[Heartbeat] [Config Sync] New remote config version: v%d (local v%d)\n",
                        newVersion, deviceConfigVersion);
          deviceConfigVersion = newVersion;
        }
      }

      JsonArray commands = resDoc["pending_commands"].as<JsonArray>();
      for (JsonObject cmd : commands) {
        String cmdType = cmd["type"].as<String>();
        Serial.printf("[Heartbeat] [Remote Command] Received command: %s\n", cmdType.c_str());
        if (cmdType == "reboot") {
          Serial.println("[Heartbeat] Executing remote reboot command in 1 second...");
          showScreenMessage("REBOOTING", "Remote command", "received from cloud");
          delay(1000);
          ESP.restart();
        }
      }
    }
  } else {
    Serial.printf("[Heartbeat] [WARN] HTTP returned status code: %d\n", httpCode);
  }
  http.end();
}

// ============================================================================
// OLED DISPLAY FUNCTIONS
// ============================================================================
void initOled() {
  Wire.begin(OLED_SDA, OLED_SCL, 400000);
  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
    Serial.println("[OLED] [SUCCESS] SSD1306 128x64 display initialized at 400kHz I2C");
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.display();
  } else {
    Serial.println("[OLED] [WARN] Display not detected on 0x3C! Check wiring on SDA=21, SCL=19");
  }
}

void renderHeader(const char* title) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(title);

  display.setCursor(85, 0);
  if (WiFi.status() == WL_CONNECTED) {
    display.printf("%ddBm", WiFi.RSSI());
  } else {
    display.print("No-WiFi");
  }
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);
}

void showScreenMessage(const char* title, const char* msg1, const char* msg2) {
  renderHeader(title);
  display.setTextSize(1);
  display.setCursor(0, 20);
  display.println(msg1);
  if (msg2) {
    display.setCursor(0, 36);
    display.println(msg2);
  }
  display.display();
}

void showRecordingScreen(int levelPercent, float elapsedSec) {
  renderHeader("RECORDING SPEECH");
  display.setTextSize(1);
  display.setCursor(0, 16);
  display.printf("Time: %.1fs / %ds", elapsedSec, MAX_RECORD_SEC);

  display.setCursor(0, 30);
  display.print("MIC VU:");
  int barWidth = 76;
  int barX = 46;
  int barY = 28;
  display.drawRect(barX, barY, barWidth, 10, SSD1306_WHITE);

  int fillWidth = map(levelPercent, 0, 100, 0, barWidth - 4);
  fillWidth = constrain(fillWidth, 0, barWidth - 4);
  if (fillWidth > 0) {
    display.fillRect(barX + 2, barY + 2, fillWidth, 6, SSD1306_WHITE);
  }

  display.setCursor(0, 48);
  display.print("Release button to send");
  display.display();
}

void showResultScreen(const String& transcript, const String& translation, int totalMs) {
  renderHeader("TRANSLATION READY");
  display.setTextSize(1);
  display.setCursor(0, 14);
  display.print("In: ");
  display.println(transcript.substring(0, 18));

  display.setCursor(0, 30);
  display.print("Out: ");
  display.println(translation.substring(0, 18));

  display.setCursor(0, 52);
  display.printf("Latency: %d ms", totalMs);
  display.display();
}

// ============================================================================
// AUDIBLE TONE GENERATOR (Sine Wave via I2S_NUM_1)
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

// ============================================================================
// WI-FI CONNECTION WITH DETAILED DIAGNOSTICS
// ============================================================================
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  Serial.printf("[WiFi] Initiating connection to SSID: \"%s\" (Password: %d characters)...\n",
                WIFI_SSID, strlen(WIFI_PASSWORD));
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttempt = millis();
  int attempts = 0;
  Serial.print("[WiFi] Connecting");

  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    unsigned long elapsed = millis() - startAttempt;
    int rssi = WiFi.RSSI();
    Serial.println("[WiFi] ==========================================");
    Serial.println("[WiFi]   [SUCCESS] Wi-Fi Connected!");
    Serial.printf("[WiFi]   SSID:         %s\n", WiFi.SSID().c_str());
    Serial.printf("[WiFi]   IP Address:   %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[WiFi]   Subnet Mask:  %s\n", WiFi.subnetMask().toString().c_str());
    Serial.printf("[WiFi]   Gateway IP:   %s\n", WiFi.gatewayIP().toString().c_str());
    Serial.printf("[WiFi]   DNS Server:   %s\n", WiFi.dnsIP().toString().c_str());
    Serial.printf("[WiFi]   MAC Address:  %s\n", WiFi.macAddress().c_str());
    Serial.printf("[WiFi]   Signal (RSSI):%d dBm (%s)\n", rssi, getRssiQuality(rssi));
    Serial.printf("[WiFi]   Connect Time: %lu ms\n", elapsed);
    Serial.println("[WiFi] ==========================================");
  } else {
    Serial.println("[WiFi] [ERROR] Failed to connect after 20 seconds.");
    Serial.println("[WiFi] Troubleshooting tips:");
    Serial.println("[WiFi]   1. Ensure 2.4 GHz Wi-Fi band is active (ESP32 does NOT support 5 GHz).");
    Serial.println("[WiFi]   2. Check that SSID and password match exactly.");
  }
}

// ============================================================================
// DIAGNOSTIC HELPERS
// ============================================================================
void printHeaderBox(const char* title) {
  Serial.println();
  Serial.println("+----------------------------------------------------------------------+");
  Serial.printf("| %-68s |\n", title);
  Serial.println("+----------------------------------------------------------------------+");
}

void printDivider() {
  Serial.println("------------------------------------------------------------------------");
}

const char* getRssiQuality(int rssi) {
  if (rssi >= -55) return "Excellent (Strong)";
  if (rssi >= -70) return "Good";
  if (rssi >= -85) return "Fair (Moderate)";
  return "Weak (Unstable)";
}

void printAsciiBar(int percent, int width) {
  int filled = (percent * width) / 100;
  Serial.print("[");
  for (int i = 0; i < width; i++) {
    if (i < filled) Serial.print("#");
    else Serial.print("-");
  }
  Serial.print("]");
}

// ============================================================================
// UTILITIES: UUID & BASE64URL DECODING
// ============================================================================
String generateUUID() {
  uint32_t r1 = esp_random();
  uint32_t r2 = esp_random();
  uint32_t r3 = esp_random();
  uint32_t r4 = esp_random();
  char uuid[37];
  snprintf(uuid, sizeof(uuid), "%08x-%04x-4%03x-%04x-%08x%04x",
           r1,
           (uint16_t)(r2 >> 16),
           (uint16_t)(r2 & 0x0FFF),
           (uint16_t)((r3 >> 16) & 0x3FFF) | 0x8000,
           r4,
           (uint16_t)(r3 & 0xFFFF));
  return String(uuid);
}

String decodeBase64Url(String input) {
  input.replace('-', '+');
  input.replace('_', '/');
  while (input.length() % 4 != 0) {
    input += '=';
  }

  const char b64_lookup[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  String output = "";
  int val = 0, valb = -8;

  for (size_t i = 0; i < input.length(); i++) {
    char c = input[i];
    if (c == '=') break;
    const char* p = strchr(b64_lookup, c);
    if (!p) continue;
    val = (val << 6) + (p - b64_lookup);
    valb += 6;
    if (valb >= 0) {
      output += (char)((val >> valb) & 0xFF);
      valb -= 8;
    }
  }
  return output;
}
