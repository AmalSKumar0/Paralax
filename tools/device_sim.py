#!/usr/bin/env python3
"""ESP32 IoT Voice Translator Device Simulator.

Simulates the physical ESP32 device lifecycle without hardware:
1. Heartbeat (/v1/device/heartbeat) - sends telemetry & syncs config version
2. Fetch Config (/v1/device/config) - retrieves language pair, mode, audio parameters
3. Translate Utterance (/v1/device/translate) - sends PCM or WAV audio, receives
   translated audio (with Accept: application/octet-stream for single round trip),
   and saves response as a playable WAV file.
4. Command Ack (/v1/device/commands/{id}/ack) - acknowledges commands
"""

import argparse
import base64
import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.shared.audio import create_sine_pcm, parse_and_validate_audio, pcm_to_wav


class DeviceSimulator:
    def __init__(
        self,
        api_url: str,
        device_key: str,
        device_id: str = "esp32-wroom-dev-01",
        firmware_version: str = "1.0.0",
    ):
        self.api_url = api_url.rstrip("/")
        self.device_key = device_key
        self.device_id = device_id
        self.firmware_version = firmware_version
        self.config_version = 1
        self.config: Dict[str, Any] = {}

    def _get_headers(self, additional_headers: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        headers = {
            "X-Device-Key": self.device_key,
            "User-Agent": f"ESP32-Translator/{self.firmware_version} (FreeRTOS)",
        }
        if additional_headers:
            headers.update(additional_headers)
        return headers

    def send_heartbeat(
        self,
        rssi: int = -58,
        free_heap: int = 142380,
        battery_pct: int = 88,
        uptime_sec: int = 3600,
    ) -> Dict[str, Any]:
        """Send device heartbeat payload."""
        import requests

        url = f"{self.api_url}/v1/device/heartbeat"
        payload = {
            "firmware_version": self.firmware_version,
            "rssi": rssi,
            "free_heap": free_heap,
            "uptime_sec": uptime_sec,
            "battery_pct": battery_pct,
            "config_version": self.config_version,
        }
        print(f"--> [Heartbeat] POST {url}")
        resp = requests.post(url, json=payload, headers=self._get_headers({"Content-Type": "application/json"}))
        print(f"<-- [Heartbeat] HTTP {resp.status_code}: {resp.text}")
        if resp.status_code == 200:
            data = resp.json()
            if data.get("config_changed"):
                print("    Config version drift detected. Fetching latest device config...")
                self.fetch_config()
            return data
        resp.raise_for_status()
        return {}

    def fetch_config(self) -> Dict[str, Any]:
        """Fetch current device configuration."""
        import requests

        url = f"{self.api_url}/v1/device/config"
        print(f"--> [Config] GET {url}")
        resp = requests.get(url, headers=self._get_headers())
        print(f"<-- [Config] HTTP {resp.status_code}: {resp.text}")
        if resp.status_code == 200:
            self.config = resp.json()
            self.config_version = self.config.get("config_version", self.config_version)
            return self.config
        resp.raise_for_status()
        return {}

    def ack_command(self, command_id: str, status: str = "done", detail: str = "") -> Dict[str, Any]:
        """Acknowledge executed command."""
        import requests

        url = f"{self.api_url}/v1/device/commands/{command_id}/ack"
        payload = {"status": status, "detail": detail}
        print(f"--> [Command Ack] POST {url} ({status})")
        resp = requests.post(url, json=payload, headers=self._get_headers({"Content-Type": "application/json"}))
        print(f"<-- [Command Ack] HTTP {resp.status_code}: {resp.text}")
        return resp.json() if resp.status_code == 200 else {}

    def translate_audio(
        self,
        audio_bytes: bytes,
        source: str = "auto",
        target: Optional[str] = None,
        use_binary_mode: bool = True,
        output_wav_path: str = "output_translated.wav",
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """POST audio to /v1/device/translate and process audio response."""
        import requests

        if not idempotency_key:
            idempotency_key = str(uuid.uuid4())

        params = {"source": source, "format": "pcm"}
        if target:
            params["target"] = target

        headers = self._get_headers({
            "Content-Type": "audio/L16;rate=16000",
            "Idempotency-Key": idempotency_key,
        })

        if use_binary_mode:
            headers["Accept"] = "application/octet-stream"
        else:
            headers["Accept"] = "application/json"

        url = f"{self.api_url}/v1/device/translate"
        print(f"--> [Translate] POST {url} ({len(audio_bytes)} bytes audio, Accept: {headers['Accept']})")

        t0 = time.perf_counter()
        resp = requests.post(url, params=params, data=audio_bytes, headers=headers)
        elapsed_sec = time.perf_counter() - t0

        print(f"<-- [Translate] HTTP {resp.status_code} received in {elapsed_sec * 1000:.1f} ms")

        if resp.status_code != 200:
            print(f"    Error Response: {resp.text}")
            return {"status_code": resp.status_code, "error": resp.text}

        if use_binary_mode:
            # Binary PCM response with metadata in X-* headers
            raw_output_pcm = resp.content
            job_id = resp.headers.get("X-Job-Id")
            source_lang = resp.headers.get("X-Source-Language")
            detected_lang = resp.headers.get("X-Detected-Language")
            target_lang = resp.headers.get("X-Target-Language")

            # Decode base64url text headers
            def decode_b64url(val: Optional[str]) -> str:
                if not val:
                    return ""
                padded = val + "=" * ((4 - len(val) % 4) % 4)
                return base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")

            transcript = decode_b64url(resp.headers.get("X-Transcript"))
            translation = decode_b64url(resp.headers.get("X-Translation"))

            # Save raw PCM as playable WAV
            wav_data = pcm_to_wav(raw_output_pcm, sample_rate=16000, channels=1, bits_per_sample=16)
            with open(output_wav_path, "wb") as f:
                f.write(wav_data)

            print(f"\n=== Translation Successful (Single Round-Trip Binary) ===")
            print(f"  Job ID:        {job_id}")
            print(f"  Detected Lang: {detected_lang} -> Target: {target_lang}")
            print(f"  Transcript:    \"{transcript}\"")
            print(f"  Translation:   \"{translation}\"")
            print(f"  Audio Out:     {len(raw_output_pcm)} bytes PCM ({len(raw_output_pcm)/32000:.2f}s audio)")
            print(f"  Saved WAV:     {output_wav_path}")
            print(f"  Total Latency: {resp.headers.get('X-Timings-Total-Ms', '-')} ms (Network RTT: {elapsed_sec*1000:.1f} ms)")

            return {
                "job_id": job_id,
                "detected_language": detected_lang,
                "target_language": target_lang,
                "transcript": transcript,
                "translation": translation,
                "output_wav": output_wav_path,
                "audio_bytes": len(raw_output_pcm),
                "total_ms": resp.headers.get("X-Timings-Total-Ms"),
            }
        else:
            # JSON response
            data = resp.json()
            print(f"\n=== Translation Successful (JSON Response) ===")
            print(f"  Job ID:      {data.get('job_id')}")
            print(f"  Transcript:  \"{data.get('transcript')}\"")
            print(f"  Translation: \"{data.get('translation')}\"")
            print(f"  Audio URL:   {data.get('audio', {}).get('url')}")
            return data


def main():
    parser = argparse.ArgumentParser(description="ESP32 IoT Voice Translator Device Simulator")
    parser.add_argument("--api-url", default=os.environ.get("API_URL", "http://localhost:3000"), help="Base API URL")
    parser.add_argument("--device-key", default=os.environ.get("DEVICE_KEY", "dev_secret_key_12345"), help="Device auth key")
    parser.add_argument("--device-id", default="esp32-wroom-dev-01", help="Device ID")
    parser.add_argument("--action", choices=["full-sim", "heartbeat", "config", "translate"], default="full-sim")
    parser.add_argument("--input-wav", help="Optional path to existing WAV file to translate")
    parser.add_argument("--source", default="auto", help="Source language (or 'auto')")
    parser.add_argument("--target", default="es-ES", help="Target language")
    parser.add_argument("--json-mode", action="store_true", help="Request JSON instead of octet-stream binary")
    parser.add_argument("--output-wav", default="output_translated.wav", help="Output file path for translated audio")

    args = parser.parse_args()
    sim = DeviceSimulator(api_url=args.api_url, device_key=args.device_key, device_id=args.device_id)

    if args.action in ["full-sim", "heartbeat"]:
        sim.send_heartbeat()

    if args.action in ["full-sim", "config"]:
        sim.fetch_config()

    if args.action in ["full-sim", "translate"]:
        if args.input_wav and os.path.exists(args.input_wav):
            with open(args.input_wav, "rb") as f:
                audio_bytes = f.read()
        else:
            print("Generating 2.0s synthetic 440Hz test audio...")
            audio_bytes = create_sine_pcm(frequency_hz=440, duration_sec=2.0)

        sim.translate_audio(
            audio_bytes=audio_bytes,
            source=args.source,
            target=args.target,
            use_binary_mode=not args.json_mode,
            output_wav_path=args.output_wav,
        )


if __name__ == "__main__":
    main()
