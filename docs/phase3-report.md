# Phase 3 Implementation & Test Report

## 1. Overview of Delivered Components

Phase 3 delivers the asynchronous Path B processing pipeline for file-based audio jobs, powered by AWS Step Functions.

### 1.1 Uploads Ingestion (`src/handlers/uploads.py`)
- **Presigned Uploads (`POST /v1/uploads`)**:
  - Validates requested content type (`audio/wav`, `audio/mpeg`, `audio/L16`, `audio/flac`, `audio/ogg`).
  - Generates secure presigned S3 PUT URL pointing to `uploads/{job_id}/original{ext}`.
  - Enforces `max_file_size_mb` (default 50 MB) and sets a 15-minute expiration.
  - Pre-allocates and returns the authoritative `job_id`.

### 1.2 Step Functions Pipeline (`src/handlers/path_b_*.py`)
- **State Machine Task Architecture**:
  1. `PathBTranscribeFunction` (`src/handlers/path_b_transcribe.py`):
     - Transitions job to `TRANSCRIBING`.
     - Utilizes **deterministic naming** (`paralax-{job_id}`) for the Amazon Transcribe job. Step Functions retries never create duplicate transcription jobs.
     - Supports `IdentifyLanguage=True` when `source_language = "auto"`.
     - Extracts the completed transcript and language confidence.
  2. `PathBTranslateFunction` (`src/handlers/path_b_translate.py`):
     - Transitions job to `TRANSLATING`.
     - Translates text via Amazon Translate.
     - Records `translate_ms` timing.
  3. `PathBSynthesizeFunction` (`src/handlers/path_b_synthesize.py`):
     - Transitions job to `SYNTHESIZING`.
     - Synthesizes speech using Amazon Polly into a deterministic S3 key (`jobs/{job_id}/synthesized.mp3`).
     - Employs neural voice engine preference with standard fallback.
     - Records `synthesize_ms` timing and output byte length.
  4. `PathBFinalizeFunction` (`src/handlers/path_b_finalize.py`):
     - Calculates `total_ms = transcribe_ms + translate_ms + synthesize_ms`.
     - Updates Job record in DynamoDB to `COMPLETED` with all metadata, timings, and S3 keys.
     - Emits CloudWatch EMF latency metrics.
     - **Error Catch Handler**: Catches any failure from the task chain, records a readable error code and cause, sets status to `FAILED`, and logs the event.

### 1.3 Client & Admin Job Control APIs (`src/handlers/jobs.py`)
- `POST /v1/jobs`:
  - Validates language pair capabilities against the registry for batch STT.
  - Creates Job record in `QUEUED` status.
  - Initiates Step Functions execution (`sfn.start_execution`) with execution name `exec-{job_id}`.
  - Returns HTTP 202 Accepted.
- `GET /v1/jobs/{job_id}`:
  - Returns complete job record with presigned S3 GET URLs for input and output audio.
- `GET /v1/languages`:
  - Returns capability flags and list of valid target languages per source language.
- `GET /v1/admin/jobs`:
  - Scans and filters jobs with cursor pagination (`status`, `kind`, `device_id`, `conversation_id`, `language`, date range).
- `POST /v1/admin/jobs/{id}/retry`:
  - Reschedules failed job back to `QUEUED` and starts a new Step Functions execution.
- `POST /v1/admin/jobs/{id}/cancel`:
  - Halts the active Step Functions execution (`sfn.stop_execution`).
  - Returns 409 `already_completed` if the job has already finished.
- `DELETE /v1/admin/jobs/{id}`:
  - Deletes job record and purges S3 audio objects.

---

## 2. Test Execution & Results

```
platform linux -- Python 3.14.7, pytest-9.2.0
rootdir: /home/amalskumar/projects/College Projects/Continues/Paralax

tests/test_path_b_step_functions.py::test_uploads_presigned_url PASSED   [ 16%]
tests/test_path_b_step_functions.py::test_jobs_submission_and_query PASSED [ 33%]
tests/test_path_b_step_functions.py::test_jobs_unsupported_language_pair PASSED [ 50%]
tests/test_path_b_step_functions.py::test_jobs_cancellation_and_conflict PASSED [ 66%]
tests/test_path_b_step_functions.py::test_path_b_step_functions_task_chain PASSED [ 83%]
tests/test_path_b_step_functions.py::test_path_b_step_functions_error_catch PASSED [100%]

============================== 6 passed in 3.30s ===============================
```

Phase 3 is fully implemented, verified, and documented. Ready to begin Phase 4.
