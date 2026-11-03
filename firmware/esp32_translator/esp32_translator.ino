/**
 * ============================================================================
 * PARALAX IoT Push-to-Talk AI Voice Translator - ESP32 Firmware
 * ============================================================================
 * Microcontroller: ESP32-WROOM-32 (CP2102 38-pin DevKit MicroUSB)
 * Backend API:     https://paralax.amalskumar.dev
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
 *    - SCL   -> GPIO 19  (Note: SCL remapped to 19 because GPIO 22 is used by MAX98357A DIN)
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
// USER CONFIGURATION (Fill with your Wi-Fi & Device Credentials)
// ============================================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

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
// Push Button
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
#define BUFFER_CAPACITY  (SAMPLE_RATE * 2 * MAX_RECORD_SEC) // 160,000 bytes (156.25 KB)

// ============================================================================
// GLOBAL OBJECTS & STATE
// ============================================================================
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Audio buffer in SRAM (allocated on heap during setup)
int16_t* audioRecordBuffer = NULL;
size_t   audioRecordedBytes = 0;

// Device status & telemetry
int  lastAudioLevelPercent = 0;
int  lastMicPeakPercent    = 0;
int  deviceConfigVersion   = 1;
unsigned long lastHeartbeatMs = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

// Translation direction
String currentLanguageA = "en-US";
String currentLanguageB = "es-US";
String currentDirection = "a_to_b";

// UI States
enum AppState {
  STATE_BOOT,
  STATE_READY,
  STATE_RECORDING,
  STATE_PROCESSING,
  STATE_PLAYING,
  STATE_ERROR
};
AppState currentState = STATE_BOOT;

// ============================================================================
// FUNCTION DECLARATIONS
// ============================================================================
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
  delay(500);
  Serial.println("\n\n==========================================");
  Serial.println("  PARALAX IoT AI Voice Translator Starting");
  Serial.println("==========================================");

  // 1. Initialize Push Button
  pinMode(PIN_BUTTON, INPUT_PULLUP);

  // 2. Initialize OLED Display (SDA=21, SCL=19)
  initOled();
  showScreenMessage("PARALAX AI", "Initializing...", "ESP32 WROOM-32");

  // 3. Allocate Audio Recording Buffer
  Serial.printf("[Memory] Free heap before buffer: %u bytes\n", ESP.getFreeHeap());
  audioRecordBuffer = (int16_t*) malloc(BUFFER_CAPACITY);
  if (!audioRecordBuffer) {
    Serial.println("[Error] Failed to allocate audio buffer!");
    showScreenMessage("MEMORY ERROR", "Audio buffer allocation", "failed in heap!");
    while (1) { delay(1000); }
  }
  Serial.printf("[Memory] Audio buffer allocated (%u bytes). Free heap: %u bytes\n",
                BUFFER_CAPACITY, ESP.getFreeHeap());

  // 4. Initialize Dual-I2S Hardware Peripherals
  initI2sMic();      // INMP441 on I2S_NUM_0
  initI2sSpeaker();  // MAX98357A on I2S_NUM_1

  // 5. Connect to Wi-Fi
  showScreenMessage("CONNECTING...", "Joining Wi-Fi SSID:", WIFI_SSID);
  connectWiFi();

  // 6. Audio Startup Chime on Speaker
  playTone(880, 80);
  delay(60);
  playTone(1320, 140);

  // 7. Initial Heartbeat & Config Sync
  sendHeartbeat();

  currentState = STATE_READY;
  showScreenMessage("READY TO SPEAK", "Press button to talk", "en-US <-> es-US");
}

// ============================================================================
// ARDUINO MAIN LOOP
// ============================================================================
void loop() {
  // Check Wi-Fi Connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Lost connection, reconnecting...");
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
      Serial.println("[Button] Pressed - Starting Voice Capture");
      currentState = STATE_RECORDING;
      playTone(1200, 70); // Gentle start beep

      recordAudio();

      if (audioRecordedBytes > SAMPLE_RATE * 2 * 0.4) { // At least 0.4s speech
        currentState = STATE_PROCESSING;
        sendTranslationRequest();
      } else {
        Serial.println("[Audio] Too short - discarded");
        playTone(350, 100);
      }

      currentState = STATE_READY;
      delay(800);
      showScreenMessage("READY TO SPEAK", "Press button to talk", "en-US <-> es-US");
    }
  }

  delay(20);
}

// ============================================================================
// I2S HARDWARE INITIALIZATION
// ============================================================================

/**
 * Configure I2S_NUM_0 for INMP441 Microphone (Master RX)
 * INMP441 transmits 24-bit samples left-aligned in a 32-bit I2S frame.
 */
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
    Serial.printf("[I2S_0] Driver install failed: %d\n", err);
  }
  err = i2s_set_pin(I2S_NUM_0, &pin_config);
  if (err != ESP_OK) {
    Serial.printf("[I2S_0] Pin configuration failed: %d\n", err);
  }
  Serial.println("[I2S_0] INMP441 Microphone initialized on GPIO 26(SCK), 25(WS), 33(SD)");
}

/**
 * Configure I2S_NUM_1 for MAX98357A Class-D Amplifier (Master TX)
 * Plays 16 kHz 16-bit signed PCM audio.
 */
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
    Serial.printf("[I2S_1] Driver install failed: %d\n", err);
  }
  err = i2s_set_pin(I2S_NUM_1, &pin_config);
  if (err != ESP_OK) {
    Serial.printf("[I2S_1] Pin configuration failed: %d\n", err);
  }
  Serial.println("[I2S_1] MAX98357A Amplifier initialized on GPIO 14(BCLK), 27(LRC), 22(DIN)");
}

// ============================================================================
// AUDIO RECORDING & REAL-TIME VU METER
// ============================================================================
void recordAudio() {
  int32_t raw_i2s_buffer[CHUNK_SAMPLES];
  size_t bytes_read = 0;
  audioRecordedBytes = 0;
  unsigned long startRecordMs = millis();

  // Clear recording buffer
  memset(audioRecordBuffer, 0, BUFFER_CAPACITY);

  Serial.println("[Audio] Recording voice...");

  // Keep recording while button is held (or until buffer capacity reached)
  while (digitalRead(PIN_BUTTON) == LOW && audioRecordedBytes < BUFFER_CAPACITY) {
    esp_err_t res = i2s_read(I2S_NUM_0, raw_i2s_buffer, sizeof(raw_i2s_buffer), &bytes_read, 100 / portTICK_PERIOD_MS);
    if (res == ESP_OK && bytes_read > 0) {
      size_t samples_read = bytes_read / sizeof(int32_t);
      int64_t sum_squares = 0;
      int16_t peak_val = 0;

      // Downsample 32-bit frame (24-bit MSB) to 16-bit PCM with +12dB digital gain
      for (size_t i = 0; i < samples_read; i++) {
        // Shift right 14 bits as specified in Paralax device contract
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

      // Compute RMS amplitude and signal percentage
      float rms = sqrt((float)sum_squares / samples_read);
      int levelPercent = constrain((int)((rms / 8000.0f) * 100.0f), 0, 100);
      int peakPercent  = constrain((int)((peak_val / 32767.0f) * 100.0f), 0, 100);
      lastAudioLevelPercent = levelPercent;
      lastMicPeakPercent    = peakPercent;

      // Update OLED with dynamic VU Meter
      float elapsedSec = (millis() - startRecordMs) / 1000.0f;
      showRecordingScreen(levelPercent, elapsedSec);
    }
  }

  float totalSec = (float)audioRecordedBytes / (SAMPLE_RATE * 2);
  Serial.printf("[Audio] Capture complete: %u bytes (%.2f seconds)\n", audioRecordedBytes, totalSec);
  playTone(800, 60); // Gentle stop beep
}

// ============================================================================
// PARALAX HTTPS API TRANSLATION REQUEST
// ============================================================================
void sendTranslationRequest() {
  showScreenMessage("TRANSLATING...", "Contacting Paralax AI", "Processing speech...");

  WiFiClientSecure client;
  client.setInsecure(); // Uses TLS without manual root CA bundle verification
  client.setTimeout(15000); // 15 second timeout

  Serial.println("[HTTP] Connecting to " + String(API_HOST) + "...");
  if (!client.connect(API_HOST, API_PORT)) {
    Serial.println("[HTTP] Connection failed!");
    showScreenMessage("NETWORK ERROR", "Failed to connect", "to Paralax server");
    playTone(300, 250);
    return;
  }

  String idempotencyKey = generateUUID();

  // 1. Send HTTP POST Headers
  client.println("POST /api/v1/device/translate HTTP/1.1");
  client.println("Host: " + String(API_HOST));
  client.println("X-Device-Key: " + String(DEVICE_KEY));
  client.println("Idempotency-Key: " + idempotencyKey);
  client.println("X-Direction: " + currentDirection);
  client.println("Content-Type: audio/L16;rate=16000");
  client.println("Accept: application/octet-stream");
  client.println("Content-Length: " + String(audioRecordedBytes));
  client.println("Connection: close");
  client.println(); // Blank line ending headers

  // 2. Stream Audio Payload in 1024-byte Chunks
  const size_t CHUNK_SIZE = 1024;
  uint8_t* bytePtr = (uint8_t*)audioRecordBuffer;
  size_t bytesLeft = audioRecordedBytes;

  while (bytesLeft > 0) {
    size_t toWrite = (bytesLeft > CHUNK_SIZE) ? CHUNK_SIZE : bytesLeft;
    client.write(bytePtr, toWrite);
    bytePtr += toWrite;
    bytesLeft -= toWrite;
  }

  Serial.println("[HTTP] Request sent, awaiting translation response...");

  // 3. Read HTTP Response Status Line
  unsigned long timeout = millis();
  while (!client.available()) {
    if (millis() - timeout > 12000) {
      Serial.println("[HTTP] Response timeout!");
      showScreenMessage("TIMEOUT", "API request timed out", "Please try again");
      client.stop();
      playTone(300, 250);
      return;
    }
    delay(10);
  }

  String statusLine = client.readStringUntil('\n');
  Serial.println("[HTTP] " + statusLine);

  if (statusLine.indexOf("200") == -1) {
    Serial.println("[HTTP] Non-200 response received");
    showScreenMessage("API ERROR", statusLine.c_str(), "Check device key");
    client.stop();
    playTone(350, 300);
    return;
  }

  // 4. Parse Response Headers
  String headerTranscript = "";
  String headerTranslation = "";
  int totalMs = 0;

  while (client.connected()) {
    String line = client.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) break; // Empty line signals start of body

    if (line.startsWith("X-Transcript:")) {
      headerTranscript = decodeBase64Url(line.substring(13));
      headerTranscript.trim();
    } else if (line.startsWith("X-Translation:")) {
      headerTranslation = decodeBase64Url(line.substring(14));
      headerTranslation.trim();
    } else if (line.startsWith("X-Total-Ms:")) {
      totalMs = line.substring(11).toInt();
    }
  }

  Serial.println("[Translation] Transcript:  " + headerTranscript);
  Serial.println("[Translation] Translation: " + headerTranslation);
  Serial.printf("[Translation] Latency:    %d ms\n", totalMs);

  // 5. Display Result on Screen
  currentState = STATE_PLAYING;
  showResultScreen(headerTranscript, headerTranslation, totalMs);

  // 6. Direct HTTP-to-I2S Audio Streaming to MAX98357A Speaker!
  // No memory allocation needed - reads straight from TLS stream to DAC
  uint8_t playBuffer[1024];
  size_t bytesWritten = 0;
  size_t totalAudioPlayed = 0;

  Serial.println("[Audio] Streaming synthesized audio to speaker...");

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
      delay(5);
    }
  }

  client.stop();
  Serial.printf("[Audio] Playback complete (%u bytes played)\n", totalAudioPlayed);
}

// ============================================================================
// PERIODIC HEARTBEAT & TELEMETRY
// ============================================================================
void sendHeartbeat() {
  lastHeartbeatMs = millis();
  if (WiFi.status() != WL_CONNECTED) return;

  Serial.println("[Heartbeat] Sending device telemetry...");

  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(6000);

  HTTPClient http;
  if (!http.begin(client, HEARTBEAT_URL)) {
    Serial.println("[Heartbeat] Unable to begin connection");
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

  int httpCode = http.POST(requestJson);
  if (httpCode == 200) {
    String response = http.getString();
    Serial.println("[Heartbeat] Success (200 OK): " + response);

    StaticJsonDocument<512> resDoc;
    DeserializationError error = deserializeJson(resDoc, response);
    if (!error) {
      if (resDoc.containsKey("config_version")) {
        deviceConfigVersion = resDoc["config_version"].as<int>();
      }

      // Check for pending remote commands (e.g. reboot)
      JsonArray commands = resDoc["pending_commands"].as<JsonArray>();
      for (JsonObject cmd : commands) {
        String type = cmd["type"].as<String>();
        if (type == "reboot") {
          Serial.println("[Command] Remote reboot ordered by Paralax dashboard!");
          showScreenMessage("REBOOTING", "Remote command", "received from cloud");
          delay(1000);
          ESP.restart();
        }
      }
    }
  } else {
    Serial.printf("[Heartbeat] Failed, HTTP response code: %d\n", httpCode);
  }

  http.end();
}

// ============================================================================
// OLED DISPLAY ROUTINES (SSD1306 128x64)
// ============================================================================
void initOled() {
  Wire.begin(OLED_SDA, OLED_SCL, 400000); // 400 kHz Fast I2C
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
    Serial.println("[OLED] Display allocation failed!");
  } else {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.display();
    Serial.println("[OLED] SSD1306 initialized on SDA(21), SCL(19)");
  }
}

void renderHeader(const char* title) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(title);

  // WiFi icon / RSSI indicator in top-right
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

  // Draw 16-Segment VU Meter Bar
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
// WI-FI CONNECTION
// ============================================================================
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WiFi] Connecting");

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected!");
    Serial.print("[WiFi] IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.printf("[WiFi] RSSI: %d dBm\n", WiFi.RSSI());
  } else {
    Serial.println("\n[WiFi] Connection timeout. Continuing in retry mode...");
  }
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

/**
 * Base64URL to plain text decoder for X-Transcript & X-Translation headers
 */
String decodeBase64Url(String input) {
  // Convert URL-safe base64 to standard base64
  input.replace('-', '+');
  input.replace('_', '/');
  while (input.length() % 4 != 0) {
    input += '=';
  }

  // Standard Base64 decoding lookup table
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
