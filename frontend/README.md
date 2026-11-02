# paralax — IoT Two-Way Voice Translator Cloud Dashboard

A single-page admin dashboard for the **paralax** IoT two-way voice translator service, built with React, TypeScript, React Router, TanStack Query, and cookie-based JWT authentication. Styled in Warm Minimalist Neo-Brutalism (Velora Design System) with high-contrast ink borders, zero-blur hard offset drop shadows, tactile button presses, and warm parchment surfaces.

---

## Features & Pages

1. **Overview**
   - KPI cards: Devices Online / Total, Utterances Today, Jobs in Progress, Failure Rate, Total Audio Minutes.
   - Latency Profile: p50 and p95 benchmarks for End-to-End Total, STT, Translation, and TTS Synthesis.
   - 30-day jobs volume chart (completed vs. failed daily counts) and top language translation routes.
   - Service ON / OFF master toggle with confirmation dialog, plus auto-refresh countdown (15s) and manual refresh.

2. **Devices**
   - Hardware fleet table: Friendly name, device ID, online/offline status, last seen, firmware version, signal strength (RSSI with quality indicator), language pair, operating mode, and config sync state (up to date vs. pending).
   - Search by name, ID, or language; filter by online/offline state.
   - **Register Device**: Provisions new hardware with Language A, Language B, voice assignments, and mode. Validates language pairs against the backend. On success, displays the Device ID and Device Key **ONCE** in a copy dialog with instant download of a credentials snippet (`paralax_device_credentials.json`) for firmware flashing.
   - **Device Detail**:
     - Live status and multi-metric telemetry charts (Signal Strength, Free Heap Memory, Battery %, Uptime) with time-range selector (`1h`, `6h`, `24h`, `7d`).
     - Interactive Config Editor: Edit primary/secondary languages, mode (physical buttons vs. auto-detect), speech rate (60–150%), volume (20–100%), max recording seconds, and heartbeat interval. Shows unsaved changes indicator, reset, save, and a "pending until the device syncs" badge that clears when the hardware acknowledges the new config version.
     - Remote Command Panel: Dispatch `Identify` (LED flash), `Sync Config`, or `Reboot` (with confirmation modal). Tracks live command delivery status (`pending` → `delivered` → `done`).
     - Security & Identity: Rotate device secret key (new key shown once), revoke credentials, and permanent deletion with confirmation.

3. **Conversations**
   - Filter conversations by hardware device or search dialogue transcripts.
   - Conversation Turn View: Chronological dialogue turns showing speaker utterance and translated speech, dual audio players, per-stage latency timings, and error status.
   - Export conversation transcript as `.txt` or full metadata as `.json`.

4. **Test Console (Browser-Simulated Translator Hardware)**
   - Select an existing device configuration preset or manually configure source and target languages.
   - **Hold-to-Record Microphone**: Captures browser audio, displays a real-time decibel level meter, encodes audio to **16 kHz 16-bit Mono PCM WAV** directly in the browser, and previews before sending.
   - Warns on insecure origins or denied microphone permissions, with an instant **"Simulate Speech Utterance"** option for environments without physical mics.
   - Submits to `/v1/utterances` and renders transcript, detected language, translation, synthesized audio player, and stage timing breakdowns (`stt_ms`, `translate_ms`, `synthesize_ms`, `total_ms`).
   - Maintains a live session attempt history.
   - **Direct File Job Upload**: Upload audio files directly via multipart/form-data to `/v1/utterances?kind=file` with client-side 4 MB cap enforcement and live upload progress.

5. **Jobs**
   - Unified jobs queue: ID, kind (live utterance vs. file upload), device/filename, languages, status, latency, and creation time.
   - Filters for status (`queued`, `stt`, `translating`, `synthesizing`, `completed`, `failed`), kind, device, and search by ID.
   - Live polling for non-final jobs.
   - Actions: Open details, retry failed jobs (when `can_retry` is true), and permanent deletion with confirmation.
   - Bulk selection with multi-job retry and multi-job delete.

6. **Job Detail**
   - Visual pipeline progress timeline with timestamps and human-readable error messages.
   - Side-by-side original and translated audio players with download.
   - Copyable transcripts and `.txt` log download.
   - Stage latency breakdown (STT, Translate, Synthesize, Total).

7. **Language Support & Pair Checker**
   - Global Language Matrix: Locales with capability flags for Speech Recognition (`stt`), Machine Translation (`translate`), and Voice Synthesis (`tts`).
   - **Pair Checker**: Pick any source and target language to test compatibility. Displays whether the pair is valid and, if not, pinpoints exactly which capability is missing (e.g., missing translation model, unsupported TTS voice).

8. **Settings**
   - Manage service enablement, max utterance seconds, audio retention days, raw audio storage toggle, language-ID minimum confidence threshold, rate limits per minute, daily quota, default heartbeat interval, allowed languages multi-select, and voice mappings.
   - Read-only active provider fallback chains and free-tier status block.
   - Unsaved changes indicator, reset, save, and success feedback.

9. **System Health**
   - Health status of STT, Translation, TTS providers, Upstash Redis, and Neon Postgres with latency and manual "Re-check Health" action.
   - Real-time list of offline devices linking directly to device details.
   - Last 20 failed jobs with plain-language error mapping.

10. **API Keys (Machine Clients)**
    - List machine client credentials, generate new API keys (secret shown once in copy dialog), and revoke with confirmation.

---

## Environment Variables

Copy `.env.example` to `.env` or configure runtime environment variables:

```bash
# API Base URL for paralax cloud backend
VITE_API_BASE_URL="/api/v1"

# Mock Mode (default: false)
# When 'true', activates in-browser simulation
VITE_MOCK_MODE="false"

# Enable Streaming Sessions tab in navigation (default: false)
VITE_ENABLE_STREAMING="false"
```

---

## Local Development & Testing

```bash
# Install dependencies
npm install

# Run unit tests
npm test

# Run Vite development server
npm run dev

# Build production bundle
npm run build
```
