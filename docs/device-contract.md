# ESP32 Firmware Integration & Device Contract (Vercel Edition)

This document provides the definitive technical specification for firmware engineers building the ESP32 (WROOM-32) push-to-talk voice translator communicating with the Node.js API hosted on Vercel.

---

## 1. Hardware Architecture & Platform Constraints

- **Microcontroller**: ESP32-WROOM-32 (Dual-core Xtensa LX6, 240 MHz, ~320 KB usable SRAM heap, no external PSRAM).
- **Audio Input**: INMP441 omnidirectional MEMS microphone via I2S bus.
- **Audio Output**: MAX98357A I2S 3.2W Class-D mono amplifier + 4Ω 3W speaker.
- **Interaction**: Single momentary push-to-talk button or dual directional buttons (A -> B / B -> A).
- **Hosting Platform**: Vercel Serverless Functions (Node.js runtime).
- **Vercel Constraints to Note**:
  - **No Inbound WebSocket Server**: The backend runs as serverless Vercel Functions. Real-time streaming translation is out of scope; all audio transactions execute as single synchronous HTTP requests.
  - **Cache-Control: no-store**: All `/api/*` routes return `Cache-Control: no-store, no-cache`. The ESP32 must not attempt caching.
  - **Payload Size Cap**: 4.5 MB request and response body limit (enforced at the Vercel edge). Maximum utterance duration is capped at 20 seconds (640 KB for 16 kHz 16-bit PCM).

---

## 2. Audio Pipeline & INMP441 Sample Conversion

### 2.1 Audio Ingestion Specification
- **Format**: Raw PCM (L16), mono, little-endian, signed 16-bit.
- **Sample Rate**: 16,000 Hz (16 kHz).
- **Bit Depth**: 16-bit signed integer (`int16_t`).
- **Data Rate**: 32,000 bytes per second (32 KB/sec).
- **HTTP Content-Type**: `audio/L16;rate=16000` (or `audio/wav`).

### 2.2 INMP441 24-bit to 16-bit Downsampling
The INMP441 output consists of 24-bit two's complement samples padded into 32-bit I2S data frames on the I2S bus.
To convert these raw 32-bit frame words into standard 16-bit PCM for the cloud:

```c
#include <stdint.h>

/**
 * Convert INMP441 32-bit I2S frames (24-bit valid data) to 16-bit signed PCM.
 *
 * The INMP441 delivers MSB-aligned 24-bit data in the 32-bit frame:
 * [31:8] = 24-bit signed sample, [7:0] = 0 padding.
 * Shifting right by 14 bits provides +12dB digital gain.
 */
void convert_inmp441_to_pcm16(const int32_t *i2s_buffer, int16_t *pcm16_out, size_t sample_count) {
    for (size_t i = 0; i < sample_count; i++) {
        pcm16_out[i] = (int16_t)(i2s_buffer[i] >> 14);
    }
}
```

### 2.3 MAX98357A Playback Setup
- When `Accept: application/octet-stream` is requested, the cloud returns raw 16 kHz 16-bit mono PCM bytes directly.
- The ESP32 does **not** require any MP3, AAC, or Opus software decoder!
- Stream incoming HTTP response buffer directly to `i2s_write()` in 2 KB chunks:

```c
size_t bytes_written = 0;
i2s_write(I2S_NUM_0, audio_chunk, chunk_len, &bytes_written, portMAX_DELAY);
```

---

## 3. Single HTTP Round-Trip Translation (`POST /api/v1/device/translate`)

### 3.1 Network Optimization: One HTTPS Request Per Utterance
The ESP32 holds the TLS connection open. No pre-signed S3 download flows are used. The response body is the synthesized audio itself.

### 3.2 Request Headers
```http
POST /api/v1/device/translate HTTP/1.1
Host: your-paralax-app.vercel.app
X-Device-Key: <your_device_key>
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
X-Direction: a_to_b
Content-Type: audio/L16;rate=16000
Accept: application/octet-stream
Content-Length: 64000

<64,000 bytes of raw 16-bit PCM audio (2.0 seconds)>
```

### 3.3 Response Headers & Body
```http
HTTP/1.1 200 OK
Content-Type: application/octet-stream
X-Job-Id: job_98a3f8b0a29d42bc
X-Source-Language: en-US
X-Target-Language: es-US
X-Duration-Ms: 2400
X-Transcribe-Ms: 380
X-Translate-Ms: 210
X-Synthesize-Ms: 420
X-Total-Ms: 1040
X-Transcript: V2hlcmUgaXMgdGhlIHN1YndheT8
X-Translation: C8%2FDw7NuZGUgZXN0w6EgbGEgZXN0YWNpw7NuPw
Content-Length: 76800

<76,800 bytes of raw 16-bit PCM synthesized Spanish audio>
```

Text headers `X-Transcript` and `X-Translation` are encoded as **base64url UTF-8** truncated to 300 characters each (guaranteeing total HTTP headers remain under ~4 KB). If the device has an attached OLED/LCD screen, decode them for display; otherwise, they may be safely ignored.

---

## 4. Error Code Reference & Firmware Behavior Matrix

| Error Code | HTTP Status | Retry Policy | Audible Cue Sound on Device | Meaning & Firmware Action |
| :--- | :--- | :--- | :--- | :--- |
| `no_speech_detected` | 422 | **Do NOT retry** | Single gentle beep ("Please speak louder") | User pressed button without speaking, or mic was muffled / silent. |
| `low_confidence_language` | 422 | **Do NOT retry** | Two short beeps ("Repeat, please") | Auto-detection detected language other than device Language A or B. |
| `unsupported_language_pair` | 422 | **Do NOT retry** | Low error buzz | Language pair unsupported. Fetch latest config via `/api/v1/device/config`. |
| `audio_too_long` | 413 / 422 | **Do NOT retry** | Error buzz | Audio exceeded `max_utterance_sec` (default 15s, cap 20s) or 4 MB cap. |
| `invalid_audio_format` | 400 / 422 | **Do NOT retry** | Error buzz | Check I2S sample rate (must be 16,000 Hz) and bit depth (16-bit signed). |
| `missing_idempotency_key` | 400 | **Fix Firmware** | Error tone | Header `Idempotency-Key` was omitted. Must send unique UUID/hash per utterance. |
| `device_rate_limited` | 429 | **Backoff** | Double descending chirp | Device exceeded rate limit (e.g. 20 req/min). Read `retry_after_sec`. |
| `daily_quota_exceeded` | 429 | **Do NOT retry** | Long error tone | Device daily quota reached. Resets at midnight UTC. |
| `provider_rate_limited` | 429 | **Retry with backoff** | Double chirp | Upstream AI provider is temporarily rate limited. Read `retry_after_sec`. |
| `idempotent_in_progress` | 409 | **Retry (500ms)** | Silent / Wait | Request with this idempotency key is currently computing in cloud. Retry in 500ms. |
| Network / Wi-Fi Timeout | - | **Exp backoff** | Fast tick | Connection dropped. Re-send exact same buffer with same `Idempotency-Key`. |

---

## 5. Control Plane: Heartbeat & Commands

### 5.1 Heartbeat Request (`POST /api/v1/device/heartbeat`)
Frequency: Every `heartbeat_interval_sec` (default: 30 seconds).

```json
{
  "firmware_version": "1.0.2",
  "rssi": -62,
  "battery_pct": 85,
  "uptime_sec": 14200,
  "config_version": 2
}
```

### 5.2 Heartbeat Response
```json
{
  "config_up_to_date": true,
  "config_version": 2,
  "pending_commands": [
    {
      "id": "cmd_7f8a91",
      "type": "reboot",
      "payload": {}
    }
  ]
}
```

### 5.3 Handling Configuration Updates
When `config_up_to_date: false`:
1. Immediately issue `GET /api/v1/device/config`.
2. Update local NVS (Non-Volatile Storage) flash with new languages, modes, volume, and config version.
3. On subsequent heartbeat, send the new `config_version`. The backend will mark it applied.

### 5.4 Command Execution:
- `reboot`: Acknowledge command via `POST /api/v1/device/commands/:id/ack`, delay 500ms, call `esp_restart()`.
- `ping`: Acknowledge command immediately with `{"status": "done"}`.
- `update_firmware`: Download binary from URL in payload, flash via OTA, acknowledge command, reboot.

---

## 6. Heap & Buffer Memory Budget (ESP32-WROOM-32)

With only ~320 KB usable SRAM heap and no external PSRAM, buffer sizing is critical:

| Memory Component | Allocation Size | Lifetime |
| :--- | :--- | :--- |
| **I2S DMA Ring Buffers** | 8 KB (4 buffers × 512 samples) | Permanent |
| **Audio Capture Buffer** | 160 KB (5.0s recording @ 32 KB/s) | Allocated on button-press, freed after HTTP POST |
| **mbedTLS Handshake Scratch** | ~35 KB | Allocated during TLS handshake, reused across session |
| **HTTP Receive Buffer** | 32 KB (streaming direct to I2S DAC) | Permanent |
| **Free Heap Headroom** | **> 85 KB** | Always maintained for Wi-Fi stack & OS stability |

> **Firmware Rule**: Stream playback audio directly from the HTTP socket into `i2s_write()` in 2 KB chunks. **Never buffer the entire response audio file in RAM.**
