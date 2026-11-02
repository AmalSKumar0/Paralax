import test from 'node:test';
import assert from 'node:assert/strict';
import { formatApiError, API_ERROR_MESSAGES } from './errors';
import { downsampleBuffer } from './wavEncoder';
import { formatDuration, formatLatency, formatBytes, getRssiQuality } from './formatters';

test('formatApiError maps specified error codes to plain-language messages', () => {
  assert.equal(
    formatApiError('unsupported_language_pair'),
    API_ERROR_MESSAGES.unsupported_language_pair
  );
  assert.equal(
    formatApiError('no_speech_detected'),
    API_ERROR_MESSAGES.no_speech_detected
  );
  assert.equal(
    formatApiError('low_confidence_language'),
    API_ERROR_MESSAGES.low_confidence_language
  );
  assert.equal(
    formatApiError('audio_too_long'),
    API_ERROR_MESSAGES.audio_too_long
  );
  assert.equal(
    formatApiError('invalid_audio_format'),
    API_ERROR_MESSAGES.invalid_audio_format
  );
  assert.equal(
    formatApiError('rate_limited'),
    API_ERROR_MESSAGES.rate_limited
  );
  assert.equal(
    formatApiError('quota_exceeded'),
    API_ERROR_MESSAGES.quota_exceeded
  );
  assert.equal(
    formatApiError('in_progress'),
    API_ERROR_MESSAGES.in_progress
  );
  assert.equal(
    formatApiError('already_completed'),
    API_ERROR_MESSAGES.already_completed
  );
  assert.equal(
    formatApiError('service_disabled'),
    API_ERROR_MESSAGES.service_disabled
  );
  // Unknown code fallback
  assert.equal(formatApiError('custom_code_123'), 'custom_code_123');
  assert.equal(formatApiError(undefined, 'Fallback error'), 'Fallback error');
});

test('downsampleBuffer correctly handles matching and downsampled sample rates', () => {
  const input = new Float32Array([0.1, 0.2, 0.3, 0.4]);
  // Same rate should return input unchanged
  const same = downsampleBuffer(input, 16000, 16000);
  assert.equal(same.length, 4);
  assert.ok(Math.abs(same[0] - 0.1) < 0.001);

  // Downsample 32000 -> 16000 (ratio 2)
  const doubleInput = new Float32Array([0.1, 0.3, 0.2, 0.4]);
  const downsampled = downsampleBuffer(doubleInput, 32000, 16000);
  assert.equal(downsampled.length, 2);
  // Average of (0.1+0.3)/2 = 0.2, (0.2+0.4)/2 = 0.3
  assert.ok(Math.abs(downsampled[0] - 0.2) < 0.001);
  assert.ok(Math.abs(downsampled[1] - 0.3) < 0.001);
});

test('formatDuration formats seconds and minutes accurately', () => {
  assert.equal(formatDuration(0), '0.0s');
  assert.equal(formatDuration(12.4), '12.4s');
  assert.equal(formatDuration(65), '1m 5.0s');
  assert.equal(formatDuration(125.2), '2m 5.2s');
});

test('formatLatency formats milliseconds and seconds', () => {
  assert.equal(formatLatency(undefined), '-');
  assert.equal(formatLatency(150), '150 ms');
  assert.equal(formatLatency(1240), '1.24 s');
});

test('formatBytes formats bytes up to MB', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(1024 * 1024 * 2.5), '2.5 MB');
});

test('getRssiQuality categorizes signal strength correctly', () => {
  assert.equal(getRssiQuality(-50).label, 'Excellent');
  assert.equal(getRssiQuality(-70).label, 'Good');
  assert.equal(getRssiQuality(-80).label, 'Fair');
  assert.equal(getRssiQuality(-95).label, 'Poor');
});
