# Serverless Cost Analysis & Economics

This document details the cost structure, pricing models, and operational economics for the IoT voice translator backend on AWS (US East, N. Virginia pricing).

---

## 1. Service Pricing Unit Breakdown

| Service Component | Metric | Rate (USD) |
| :--- | :--- | :--- |
| **Amazon Transcribe Streaming** | Audio Duration (1-second increments) | **$0.0240 / minute** ($0.0004 / sec) |
| **Amazon Translate** | Character Count | **$15.00 / 1,000,000 chars** ($0.000015 / char) |
| **Amazon Polly (Neural)** | Character Count | **$16.00 / 1,000,000 chars** ($0.000016 / char) |
| **Amazon Polly (Standard)** | Character Count | **$4.00 / 1,000,000 chars** ($0.000004 / char) |
| **AWS Lambda** | Invocations + Compute (1024 MB @ 2.0s) | **$0.20 / 1M reqs** + $0.0000166667 / GB-s |
| **Amazon API Gateway (HTTP API)** | Request Count | **$1.00 / 1,000,000 requests** |
| **Amazon DynamoDB (On-Demand)** | Read/Write Request Units | WRU: $1.25 / 1M, RRU: $0.25 / 1M |
| **Amazon S3** | Storage & Ingestion | $0.023 / GB-month, PUT: $0.005 / 1K |

---

## 2. Unit Economics: Cost Per 1,000 Utterances (Path A)

### Baseline Assumptions:
- Average utterance speech duration: **4.0 seconds** (128 KB PCM).
- Average transcript length: **60 characters** (approx. 10 words).
- Average translated text length: **65 characters**.
- Average Lambda execution duration: **1,800 ms** at 1024 MB memory.
- Polly voice engine: **Neural**.
- Audio stored to S3 with 30-day retention.

| Service Step | Calculation | Cost per 1,000 Utterances |
| :--- | :--- | :--- |
| **Transcribe Streaming** | 1,000 utterances × 4.0s = 66.67 minutes × $0.024 | **$1.600** |
| **Amazon Translate** | 1,000 × 60 chars = 60,000 chars × $0.000015 | **$0.0009** |
| **Amazon Polly (Neural)** | 1,000 × 65 chars = 65,000 chars × $0.000016 | **$0.0010** |
| **AWS Lambda Compute** | 1,000 reqs × 1.8s × 1.0 GB × $0.0000166667 + $0.0002 reqs | **$0.0302** |
| **API Gateway HTTP API** | 1,000 requests × $0.000001 | **$0.0010** |
| **DynamoDB Writes & Reads** | ~3 WRUs + 2 RRUs per utterance × 1,000 | **$0.0042** |
| **S3 Storage & PUTs** | 2,000 PUTs (input + output) + 256 MB storage (30 days) | **$0.0159** |
| **TOTAL COST PER 1,000 UTTERANCES** | | **$1.653** |

> **Key Economic Takeaway**: Amazon Transcribe Streaming accounts for **~96.8%** of the total cost. All compute, database, API gateway, and translation costs combined are **less than $0.06 per 1,000 utterances**.

---

## 3. Scale Projections & Fleet Sizing

Assuming an active push-to-talk device generates **50 utterances per day** (1,500 utterances/month per device) and 1 heartbeat every 30 seconds (86,400 heartbeats/month):

| Metric | 10 Devices | 100 Devices | 1,000 Devices |
| :--- | :--- | :--- | :--- |
| **Monthly Utterances** | 15,000 | 150,000 | 1,500,000 |
| **Monthly Translation Cost** | $24.80 | $248.00 | $2,480.00 |
| **Heartbeat & Telemetry Overhead** | $1.20 | $12.00 | $120.00 |
| **DynamoDB & S3 Storage Cost** | $0.80 | $8.00 | $80.00 |
| **TOTAL ESTIMATED MONTHLY BILL** | **~$26.80** | **~$268.00** | **~$2,680.00** |
| **Effective Cost Per Active Device / Month** | **$2.68** | **$2.68** | **$2.68** |

---

## 4. Cost Optimization Recommendations

1. **VAD (Voice Activity Detection) on ESP32**:
   - Implementing software VAD on the ESP32 trims leading and trailing silence before transmission.
   - Reducing average utterance duration from 4.0s to 3.0s yields an immediate **25% reduction in Transcribe costs**.
2. **Audio Storage Toggle (`store_audio = false`)**:
   - If audio compliance or playback review is not required, setting `store_audio: false` in `ParalaxSettings` eliminates all S3 PUT requests and storage fees, keeping only text metadata in DynamoDB.
3. **Heartbeat Cadence Optimization**:
   - Increasing heartbeat interval from 30s to 60s when the device is idle cuts control-plane API Gateway and Lambda invocations by 50%.
4. **AWS Budget Alarm**:
   - SAM parameter `MonthlyBudgetAmount` (default: $50) triggers automatic CloudWatch alerts when total operational spend crosses 80% and 100% of threshold.
