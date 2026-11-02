#!/usr/bin/env python3
"""Load testing and latency profiling tool for IoT Voice Translator.

Simulates concurrent ESP32 devices sending push-to-talk utterances:
- Measures throughput (requests/sec)
- Calculates latency distributions: min, p50, p90, p95, p99, max
- Evaluates concurrency scaling and error rates
"""

import argparse
import base64
import concurrent.futures
import json
import math
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.shared.audio import create_sine_pcm


def calculate_percentile(sorted_vals: List[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return round(sorted_vals[int(k)], 2)
    return round(sorted_vals[int(f)] * (c - k) + sorted_vals[int(c)] * (k - f), 2)


def run_worker(
    worker_id: int,
    api_url: str,
    device_key: str,
    audio_bytes: bytes,
    iterations: int,
) -> List[Dict[str, Any]]:
    import requests

    results = []
    url = f"{api_url.rstrip('/')}/v1/device/translate?source=auto&format=pcm"

    for i in range(iterations):
        idem_key = f"load-{worker_id}-{i}-{uuid.uuid4().hex[:6]}"
        headers = {
            "X-Device-Key": device_key,
            "Idempotency-Key": idem_key,
            "Content-Type": "audio/L16;rate=16000",
            "Accept": "application/octet-stream",
        }

        t0 = time.perf_counter()
        status_code = 0
        error = None
        server_timings = {}

        try:
            resp = requests.post(url, data=audio_bytes, headers=headers, timeout=30)
            status_code = resp.status_code
            elapsed_ms = (time.perf_counter() - t0) * 1000.0

            if resp.status_code == 200:
                server_timings = {
                    "total_ms": float(resp.headers.get("X-Timings-Total-Ms", 0)),
                    "transcribe_ms": float(resp.headers.get("X-Timings-Transcribe-Ms", 0)),
                    "translate_ms": float(resp.headers.get("X-Timings-Translate-Ms", 0)),
                    "synthesize_ms": float(resp.headers.get("X-Timings-Synthesize-Ms", 0)),
                }
            else:
                error = resp.text[:100]
        except Exception as e:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            error = str(e)

        results.append({
            "worker_id": worker_id,
            "iteration": i,
            "status_code": status_code,
            "latency_ms": elapsed_ms,
            "server_timings": server_timings,
            "error": error,
        })

    return results


def main():
    parser = argparse.ArgumentParser(description="Load test IoT Voice Translator endpoint")
    parser.add_argument("--url", default="http://localhost:3000", help="Base API URL")
    parser.add_argument("--key", default="load_test_key_123", help="Device authentication key")
    parser.add_argument("--concurrency", type=int, default=5, help="Number of concurrent workers")
    parser.add_argument("--requests-per-worker", type=int, default=10, help="Requests per worker")
    parser.add_argument("--duration-sec", type=float, default=2.0, help="Utterance audio duration in seconds")

    args = parser.parse_args()

    print(f"=== Starting Load Test ===")
    print(f"  Target URL:            {args.url}")
    print(f"  Concurrency:           {args.concurrency}")
    print(f"  Requests Per Worker:   {args.requests_per_worker}")
    print(f"  Total Requests:        {args.concurrency * args.requests_per_worker}")
    print(f"  Audio Sample Duration: {args.duration_sec}s")

    test_audio = create_sine_pcm(frequency_hz=440, duration_sec=args.duration_sec)

    t_start = time.perf_counter()
    all_results: List[Dict[str, Any]] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = [
            executor.submit(
                run_worker,
                worker_id=wid,
                api_url=args.url,
                device_key=args.key,
                audio_bytes=test_audio,
                iterations=args.requests_per_worker,
            )
            for wid in range(args.concurrency)
        ]
        for f in concurrent.futures.as_completed(futures):
            all_results.extend(f.result())

    total_time = time.perf_counter() - t_start

    # Metrics summary
    latencies = sorted([r["latency_ms"] for r in all_results])
    successful = [r for r in all_results if r["status_code"] == 200]
    errors = [r for r in all_results if r["status_code"] != 200]

    throughput = len(all_results) / total_time if total_time > 0 else 0.0

    print(f"\n=== Load Test Results ===")
    print(f"  Total Time:     {total_time:.2f} s")
    print(f"  Throughput:     {throughput:.2f} req/s")
    print(f"  Successful:     {len(successful)} ({len(successful)/len(all_results)*100:.1f}%)")
    print(f"  Failures:       {len(errors)}")

    if latencies:
        print(f"\n--- Latency Distribution (End-to-End Network RTT) ---")
        print(f"  Min:  {min(latencies):.1f} ms")
        print(f"  p50:  {calculate_percentile(latencies, 50):.1f} ms")
        print(f"  p90:  {calculate_percentile(latencies, 90):.1f} ms")
        print(f"  p95:  {calculate_percentile(latencies, 95):.1f} ms")
        print(f"  p99:  {calculate_percentile(latencies, 99):.1f} ms")
        print(f"  Max:  {max(latencies):.1f} ms")


if __name__ == "__main__":
    main()
