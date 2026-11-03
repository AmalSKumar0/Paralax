/**
 * ============================================================================
 * PARALAX IoT Dual-Button AI Voice Translator - WebSocket Streaming Firmware
 * ============================================================================
 * Target:       ESP32-WROOM-32 (CP2102 38-pin DevKit MicroUSB)
 * Serial Baud:  115200 baud
 * Mode:         Full Bidirectional WebSocket Audio Streaming
 *
 * ADVANTAGES OVER HTTPS:
 * 1. Zero audio length limits (no SRAM overflow; streams 1 KB chunks in real time)
 * 2. Instant round-trip (no per-utterance TLS handshake overhead)
 * 3. Streaming speaker playback directly to MAX98357A as binary frames arrive
 *
 * HARDWARE CONFIGURATION:
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
 *    - VIN   -> 5V (or VIN pin of ESP32 for maximum loudness)
 *    - GND   -> GND
 *    - BCLK  -> GPIO 14 (I2S1 Bit Clock)
 *    - LRC   -> GPIO 27 (I2S1 Word Select / LR Clock)
 *    - DIN   -> GPIO 22 (I2S1 Serial Data Out)
 *    - GAIN  -> Floating (Default 12 dB Gain)
 *    - + / - -> Speaker (8 Ohm 0.5W or 4 Ohm 3W)
 *
 * 3. Dual Push-to-Talk Buttons (Active LOW with internal INPUT_PULLUP):
 *    - Button A (Lang A -> B, e.g. English -> Spanish):
 *        Pin 1 -> GPIO 32, Pin 2 -> GND
 *    - Button B (Lang B -> A, e.g. Spanish -> English):
 *        Pin 1 -> GPIO 21, Pin 2 -> GND
 *
 * REQUIRED ARDUINO LIBRARIES (Install via Library Manager):
 * 1. WebSockets by Markus Sattler (v2.4.x or latest)
 * 2. ArduinoJson by Benoit Blanchon (v6 or v7)
 * ============================================================================
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <driver/i2s.h>
#include <math.h>

// ============================================================================
// USER CONFIGURATION (Fill with your Wi-Fi & Server Address)
// ============================================================================
const char *WIFI_SSID     = "Aurora";
const char *WIFI_PASSWORD = "amalskumar";

// Backend WebSocket host & port
// When running locally with 'npm run server:ws', use your computer's local Wi-Fi IP:
const char *WS_HOST       = "192.168.55.158"; // Local IP on Wi-Fi 'Aurora'
const int   WS_PORT       = 8000;
const bool  WS_USE_SSL    = false; 

// Paste your device secret key from https://paralax.amalskumar.dev/devices
const char *DEVICE_KEY    = "key_ed506f3405ff2002bc61351b37c1322132d36e0a84686a44";
const char *FIRMWARE_VER  = "2.1.0-ws";

// ============================================================================
// HARDWARE PIN DEFINITIONS
// ============================================================================
#define PIN_BUTTON_A      32  // Button A: Lang A -> B
#define PIN_BUTTON_B      21  // Button B: Lang B -> A

// INMP441 Microphone (I2S_NUM_0)
#define I2S_MIC_SCK       26
#define I2S_MIC_WS        25
#define I2S_MIC_SD        33

// MAX98357A Amplifier (I2S_NUM_1)
#define I2S_SPK_BCLK      14
#define I2S_SPK_LRC       27
#define I2S_SPK_DIN       22

// Audio Stream Parameters
#define SAMPLE_RATE       16000
#define DMA_BUFFER_LEN    512 // 512 samples = 1024 bytes per frame

// ============================================================================
// GLOBAL STATE & OBJECTS
// ============================================================================
WebSocketsClient webSocket;

bool wsConnected        = false;
bool isRecording        = false;
int  activeButton       = 0;  // 1 = Button A, 2 = Button B
uint32_t recordStartTime = 0;
uint32_t bytesStreamed  = 0;
uint32_t speakerBytesRcv = 0;

// Reusable audio frame buffer (1 KB)
int16_t micChunkBuffer[DMA_BUFFER_LEN];

// UI/Telemetry Status
String currentLangA     = "en-US";
String currentLangB     = "es-US";
uint32_t lastHeartbeatMs = 0;

// ============================================================================
// I2S HARDWARE INITIALIZATION
// ============================================================================
void initI2sMicrophone() {
  i2s_config_t mic_config = {
    .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate          = SAMPLE_RATE,
    .bits_per_sample      = I2S_BITS_PER_SAMPLE_32BIT, // INMP441 outputs 24-bit in 32-bit slot
    .channel_format       = I2S_CHANNEL_FMT_RIGHT_LEFT, // Stereo: auto-detects Left & Right channels
    .communication_format = i2s_comm_format_t(I2S_COMM_FORMAT_STAND_I2S),
    .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count        = 4,
    .dma_buf_len          = DMA_BUFFER_LEN,
    .use_apll             = false,
    .tx_desc_auto_clear   = false,
    .fixed_mclk           = 0
  };

  i2s_pin_config_t mic_pins = {
    .bck_io_num   = I2S_MIC_SCK,
    .ws_io_num    = I2S_MIC_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num  = I2S_MIC_SD
  };

  esp_err_t err = i2s_driver_install(I2S_NUM_0, &mic_config, 0, NULL);
  if (err != ESP_OK) {
    Serial.printf("[I2S] [ERROR] Failed to install I2S0 (Mic): 0x%x\n", err);
  }
  i2s_set_pin(I2S_NUM_0, &mic_pins);
  Serial.printf("[Hardware] I2S0 (INMP441 Mic) ready on SCK=%d, WS=%d, SD=%d (Stereo Auto-Detect)\n",
                I2S_MIC_SCK, I2S_MIC_WS, I2S_MIC_SD);

  // Diagnostic Ambient Noise Check
  delay(50);
  int32_t testBuf[128];
  size_t testBytes = 0;
  i2s_read(I2S_NUM_0, testBuf, sizeof(testBuf), &testBytes, 100 / portTICK_PERIOD_MS);
  int32_t maxL = 0, maxR = 0;
  if (testBytes > 0) {
    size_t testPairs = testBytes / (sizeof(int32_t) * 2);
    for (size_t i = 0; i < testPairs; i++) {
      if (abs(testBuf[i * 2]) > maxL) maxL = abs(testBuf[i * 2]);
      if (abs(testBuf[i * 2 + 1]) > maxR) maxR = abs(testBuf[i * 2 + 1]);
    }
  }
  int16_t noiseFloorL = (int16_t)(maxL >> 14);
  int16_t noiseFloorR = (int16_t)(maxR >> 14);
  Serial.printf("[I2S_0] [DIAGNOSTIC] Ambient Noise Check -> Left: %d | Right: %d\n", noiseFloorL, noiseFloorR);
  if (noiseFloorL == 0 && noiseFloorR == 0) {
    Serial.println("[I2S_0] [HARDWARE NOTICE] Mic returned 0 amplitude on both channels!");
    Serial.println("        -> Check physical wiring: VDD->3.3V, GND->GND, SD->GPIO33, SCK->GPIO26, WS->GPIO25, L/R->GND.");
  } else {
    Serial.printf("[I2S_0] [ACTIVE] Mic signal detected on %s channel!\n",
                  (noiseFloorL >= noiseFloorR) ? "LEFT (L/R grounded)" : "RIGHT (L/R 3.3V or floating)");
  }
}

void initI2sSpeaker() {
  i2s_config_t spk_config = {
    .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate          = SAMPLE_RATE,
    .bits_per_sample      = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format       = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = i2s_comm_format_t(I2S_COMM_FORMAT_STAND_I2S),
    .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count        = 8,
    .dma_buf_len          = DMA_BUFFER_LEN,
    .use_apll             = false,
    .tx_desc_auto_clear   = true,
    .fixed_mclk           = 0
  };

  i2s_pin_config_t spk_pins = {
    .bck_io_num   = I2S_SPK_BCLK,
    .ws_io_num    = I2S_SPK_LRC,
    .data_out_num = I2S_SPK_DIN,
    .data_in_num  = I2S_PIN_NO_CHANGE
  };

  esp_err_t err = i2s_driver_install(I2S_NUM_1, &spk_config, 0, NULL);
  if (err != ESP_OK) {
    Serial.printf("[I2S] [ERROR] Failed to install I2S1 (Speaker): 0x%x\n", err);
  }
  i2s_set_pin(I2S_NUM_1, &spk_pins);
  Serial.printf("[Hardware] I2S1 (MAX98357A Speaker) ready on BCLK=%d, LRC=%d, DIN=%d\n",
                I2S_SPK_BCLK, I2S_SPK_LRC, I2S_SPK_DIN);
}

// Tone generator for audio feedback chimes
void playTone(float freqHz, int durationMs) {
  int samples = (SAMPLE_RATE * durationMs) / 1000;
  int16_t toneBuf[128];
  int sent = 0;
  while (sent < samples) {
    int toWrite = min(128, samples - sent);
    for (int i = 0; i < toWrite; i++) {
      float t = (float)(sent + i) / SAMPLE_RATE;
      toneBuf[i] = (int16_t)(sin(2 * M_PI * freqHz * t) * 12000.0f);
    }
    size_t written = 0;
    i2s_write(I2S_NUM_1, (const char *)toneBuf, toWrite * sizeof(int16_t), &written, portMAX_DELAY);
    sent += toWrite;
  }
}

// ============================================================================
// WEBSOCKET EVENT HANDLER
// ============================================================================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      wsConnected = false;
      Serial.printf("\n[WebSocket] Disconnected from server (ws://%s:%d)!\n", WS_HOST, WS_PORT);
      Serial.println("  -> Reconnecting in 3s... (Ensure 'npm run server:ws' is running)");
      break;

    case WStype_CONNECTED:
      wsConnected = true;
      Serial.println("\n+----------------------------------------------------------------------+");
      Serial.println("| [WebSocket] CONNECTED & AUTHENTICATED WITH PARALAX STREAM GATEWAY    |");
      Serial.printf("| Server:  ws://%s:%d%s\n", WS_HOST, WS_PORT, (WS_PORT == 3000 ? " (Local Node Server)" : ""));
      Serial.println("+----------------------------------------------------------------------+");
      playTone(880.0f, 100);
      playTone(1760.0f, 120);
      break;

    case WStype_TEXT: {
      String jsonText = String((char *)payload);
      StaticJsonDocument<1024> doc;
      DeserializationError err = deserializeJson(doc, jsonText);
      if (err) {
        Serial.printf("[WebSocket] JSON parse error: %s\n", err.c_str());
        return;
      }

      const char *msgType = doc["type"] | "";

      if (strcmp(msgType, "ready") == 0) {
        const char *devId = doc["device_id"] | "unknown";
        currentLangA = doc["config"]["language_a"] | "en-US";
        currentLangB = doc["config"]["language_b"] | "es-US";
        Serial.printf("[WebSocket] Session Ready! Device: %s | Mode: [%s <-> %s]\n", devId, currentLangA.c_str(), currentLangB.c_str());
      }
      else if (strcmp(msgType, "recording_started") == 0) {
        const char *src = doc["source_language"] | "";
        const char *tgt = doc["target_language"] | "";
        Serial.printf("[Pipeline] Recording session started: %s -> %s\n", src, tgt);
      }
      else if (strcmp(msgType, "processing") == 0) {
        int bytes = doc["bytes_received"] | 0;
        int durMs = doc["duration_ms"] | 0;
        int rms   = doc["rms"] | 0;
        Serial.printf("[Pipeline] Server processing: %d bytes (%.2fs captured), Server RMS: %d\n", bytes, durMs / 1000.0f, rms);
      }
      else if (strcmp(msgType, "transcript") == 0) {
        const char *text = doc["text"] | "";
        int sttMs = doc["stt_ms"] | 0;
        Serial.println("\n------------------------------------------------------------------------");
        Serial.printf("[Speech-to-Text] (%d ms): \"%s\"\n", sttMs, text);
      }
      else if (strcmp(msgType, "translation") == 0) {
        const char *text = doc["text"] | "";
        int transMs = doc["translate_ms"] | 0;
        Serial.printf("[AI Translation] (%d ms): \"%s\"\n", transMs, text);
        Serial.println("------------------------------------------------------------------------");
      }
      else if (strcmp(msgType, "audio_stream_start") == 0) {
        int byteLen = doc["byte_length"] | 0;
        int totalMs = doc["total_ms"] | 0;
        speakerBytesRcv = 0;
        Serial.printf("[Speaker] Playing synthesized voice (%d bytes, AI pipeline latency: %d ms)...\n", byteLen, totalMs);
      }
      else if (strcmp(msgType, "audio_stream_end") == 0) {
        int totalMs = doc["total_ms"] | 0;
        Serial.printf("[Speaker] Playback complete! Total round-trip: %d ms | Speaker received: %d bytes\n", totalMs, speakerBytesRcv);
        Serial.println("[Ready] Ready for next translation. Press Button A or Button B.\n");
      }
      else if (strcmp(msgType, "error") == 0) {
        const char *code = doc["code"] | "error";
        const char *msg  = doc["message"] | "unknown error";
        Serial.printf("[Pipeline] [ERROR] %s: %s\n", code, msg);
        playTone(300.0f, 300); // Low error buzz
      }
      break;
    }

    case WStype_BIN: {
      // Incoming raw 16-bit PCM binary frame from server -> send directly to MAX98357A speaker!
      size_t written = 0;
      i2s_write(I2S_NUM_1, (const char *)payload, length, &written, portMAX_DELAY);
      speakerBytesRcv += written;
      break;
    }

    case WStype_ERROR:
      Serial.println("[WebSocket] Protocol Error occurred!");
      break;

    default:
      break;
  }
}

// ============================================================================
// MICROPHONE STREAMING LOOP (Active while button is held)
// ============================================================================
void streamMicrophoneChunk() {
  int32_t rawSampleBuf[DMA_BUFFER_LEN * 2]; // 512 stereo pairs (Left + Right)
  size_t bytesRead = 0;

  esp_err_t res = i2s_read(I2S_NUM_0, rawSampleBuf, sizeof(rawSampleBuf), &bytesRead, 100 / portTICK_PERIOD_MS);
  if (res != ESP_OK || bytesRead == 0) return;

  size_t pairsRead = bytesRead / (sizeof(int32_t) * 2);
  int64_t sumSquares = 0;
  int16_t peakVal = 0;

  for (size_t i = 0; i < pairsRead; i++) {
    int32_t leftSample  = rawSampleBuf[i * 2];
    int32_t rightSample = rawSampleBuf[i * 2 + 1];

    // Pick whichever channel has higher amplitude (handles L/R pin tied to GND or 3.3V)
    int32_t activeSample = (abs(leftSample) > abs(rightSample)) ? leftSample : rightSample;

    // +12dB digital gain boost with saturation clipping
    int32_t shifted = activeSample >> 14;
    if (shifted > 32767) shifted = 32767;
    if (shifted < -32768) shifted = -32768;
    int16_t s16 = (int16_t)shifted;
    micChunkBuffer[i] = s16;

    sumSquares += ((int64_t)s16 * s16);
    if (abs(s16) > peakVal) peakVal = abs(s16);
  }

  // Stream binary PCM frame directly over WebSocket
  size_t pcmBytes = pairsRead * sizeof(int16_t);
  webSocket.sendBIN((uint8_t *)micChunkBuffer, pcmBytes);
  bytesStreamed += pcmBytes;

  // Print live VU meter to Serial every 200 ms with visual ASCII bar
  static uint32_t lastVuMs = 0;
  if (millis() - lastVuMs > 200) {
    lastVuMs = millis();
    float rms = sqrt((float)sumSquares / pairsRead);
    int levelPct = constrain((int)((rms / 6000.0f) * 100.0f), 0, 100);
    int peakPct = constrain((int)((peakVal / 32767.0f) * 100.0f), 0, 100);
    float elapsedSec = (millis() - recordStartTime) / 1000.0f;

    // ASCII VU Bar: [========--------]
    char bar[17];
    int filled = (levelPct * 16) / 100;
    for (int b = 0; b < 16; b++) bar[b] = (b < filled) ? '=' : '-';
    bar[16] = '\0';

    Serial.printf("[Stream VU] %4.1fs | RMS: %3d%% [%s] | Peak: %3d%% | Sent: %6u B\n",
                  elapsedSec, levelPct, bar, peakPct, bytesStreamed);
  }
}

// ============================================================================
// ARDUINO SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n+----------------------------------------------------------------------+");
  Serial.println("| PARALAX IoT Push-to-Talk AI Voice Translator - WebSocket Client     |");
  Serial.println("+----------------------------------------------------------------------+");
  Serial.printf("[System] ESP32 Chip Revision: %d | CPU Freq: %d MHz\n", ESP.getChipRevision(), ESP.getCpuFreqMHz());
  Serial.printf("[System] Free Heap:          %u bytes\n", ESP.getFreeHeap());
  Serial.printf("[System] Firmware Version:   %s\n", FIRMWARE_VER);
  Serial.printf("[System] Target Server:      ws://%s:%d\n", WS_HOST, WS_PORT);

  // Configure Buttons
  pinMode(PIN_BUTTON_A, INPUT_PULLUP);
  pinMode(PIN_BUTTON_B, INPUT_PULLUP);
  Serial.println("[Hardware] Button A (GPIO 32, Active LOW) & Button B (GPIO 21, Active LOW) configured.");

  // Initialize Audio Hardware
  initI2sMicrophone();
  initI2sSpeaker();

  // Connect to Wi-Fi
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_17dBm); // Prevents current spikes from causing brownout reset
  Serial.printf("[Network] Connecting to Wi-Fi SSID: %s ", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[Network] Wi-Fi Connected!");
    Serial.printf("[Network] IP Address:  %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[Network] MAC Address: %s\n", WiFi.macAddress().c_str());
    Serial.printf("[Network] Signal RSSI: %d dBm\n", WiFi.RSSI());
  } else {
    Serial.println("\n[Network] [ERROR] Wi-Fi Connection failed. Please check credentials.");
  }

  // Configure WebSocket Client
  String wsUrl = "/ws/device/stream?key=" + String(DEVICE_KEY);
  if (WS_USE_SSL) {
    webSocket.beginSSL(WS_HOST, WS_PORT, wsUrl.c_str());
  } else {
    webSocket.begin(WS_HOST, WS_PORT, wsUrl.c_str());
  }
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(3000);
  webSocket.enableHeartbeat(15000, 3000, 2);

  Serial.printf("[Network] Connecting to Paralax WebSocket gateway at ws://%s:%d%s...\n",
                WS_HOST, WS_PORT, wsUrl.c_str());
  Serial.println("[Ready] Hold Button A (GPIO 32) to speak Lang A->B, or Button B (GPIO 21) for Lang B->A.\n");
}

// ============================================================================
// ARDUINO MAIN LOOP
// ============================================================================
void loop() {
  // Service WebSocket pump
  webSocket.loop();

  // Read button states (Active LOW)
  bool btnAPressed = (digitalRead(PIN_BUTTON_A) == LOW);
  bool btnBPressed = (digitalRead(PIN_BUTTON_B) == LOW);

  // 1. Button Press Event
  if (!isRecording) {
    if (btnAPressed || btnBPressed) {
      if (!wsConnected) {
        static uint32_t lastWarnMs = 0;
        if (millis() - lastWarnMs > 1500) {
          lastWarnMs = millis();
          Serial.println("\n------------------------------------------------------------------------");
          Serial.printf("[Button] Button %s PRESSED!\n", btnAPressed ? "A (GPIO 32)" : "B (GPIO 21)");
          Serial.printf("[Button] [WARN] Cannot stream: WebSocket is DISCONNECTED from %s:%d!\n", WS_HOST, WS_PORT);
          Serial.println("[Button] -> Make sure your server is running: 'npm run server:ws'");
          Serial.printf("[Button] -> Current Wi-Fi Status: %s (IP: %s)\n",
                        (WiFi.status() == WL_CONNECTED) ? "CONNECTED" : "DISCONNECTED",
                        WiFi.localIP().toString().c_str());
          Serial.println("------------------------------------------------------------------------");
          playTone(300.0f, 150);
        }
      } else {
        if (btnAPressed) {
          isRecording = true;
          activeButton = 1;
          recordStartTime = millis();
          bytesStreamed = 0;
          Serial.println("\n>>> [Button A - GPIO 32] PRESSED: Streaming Audio (Lang A -> B)...");
          playTone(1000.0f, 60);

          // Send start control message
          StaticJsonDocument<128> doc;
          doc["type"] = "start";
          doc["direction"] = "a_to_b";
          String json;
          serializeJson(doc, json);
          webSocket.sendTXT(json);
        }
        else if (btnBPressed) {
          isRecording = true;
          activeButton = 2;
          recordStartTime = millis();
          bytesStreamed = 0;
          Serial.println("\n>>> [Button B - GPIO 21] PRESSED: Streaming Audio (Lang B -> A)...");
          playTone(1200.0f, 60);

          // Send start control message
          StaticJsonDocument<128> doc;
          doc["type"] = "start";
          doc["direction"] = "b_to_a";
          String json;
          serializeJson(doc, json);
          webSocket.sendTXT(json);
        }
      }
    }
  }

  // 2. Continuous Recording & Streaming (while button remains held)
  if (isRecording) {
    bool stillPressed = (activeButton == 1) ? (digitalRead(PIN_BUTTON_A) == LOW) : (digitalRead(PIN_BUTTON_B) == LOW);

    if (stillPressed) {
      streamMicrophoneChunk();
    } else {
      // 3. Button Released (Stop Recording)
      isRecording = false;
      uint32_t durMs = millis() - recordStartTime;
      Serial.printf("<<< Button Released: Streamed %d bytes (%.2fs) to cloud\n", bytesStreamed, durMs / 1000.0f);
      playTone(600.0f, 60);

      // Send stop control message
      webSocket.sendTXT("{\"type\":\"stop\"}");
      activeButton = 0;
    }
  }

  // Periodic Telemetry Heartbeat (every 30 seconds)
  if (wsConnected && millis() - lastHeartbeatMs > 30000) {
    lastHeartbeatMs = millis();
    StaticJsonDocument<128> hb;
    hb["type"] = "heartbeat";
    hb["rssi"] = WiFi.RSSI();
    hb["uptime_sec"] = millis() / 1000;
    String out;
    serializeJson(hb, out);
    webSocket.sendTXT(out);
  }
}
