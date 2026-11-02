export const API_ERROR_MESSAGES: Record<string, string> = {
  unsupported_language_pair: 'The selected language pair is not supported for speech translation.',
  no_speech_detected: 'No speech was detected in the submitted audio recording.',
  low_confidence_language: 'Language identification confidence was below the required threshold.',
  audio_too_long: 'The recorded audio exceeds the maximum allowed duration.',
  invalid_audio_format: 'Invalid audio format. Please provide 16 kHz 16-bit mono PCM WAV audio.',
  rate_limited: 'Device rate limit exceeded. Please wait a moment before sending more audio.',
  quota_exceeded: 'Daily device translation quota has been exceeded for this unit.',
  in_progress: 'A translation job is already in progress for this request or device.',
  already_completed: 'This job has already been completed and cannot be reprocessed.',
  service_disabled: 'The voice translator service is currently disabled by administrator.',
  unauthorized: 'Authentication failed. Please verify your credentials or session.',
  device_offline: 'The target device is currently offline and unable to receive commands.',
  device_not_found: 'The specified device ID was not found in the registry.',
  job_not_found: 'The requested job was not found.',
  invalid_config: 'Device configuration contains invalid parameters.',
  internal_error: 'An unexpected internal service error occurred. Please try again.',
};

/**
 * Resolves an API error code or fallback message to a friendly plain-language string.
 */
export function formatApiError(codeOrMessage?: string, defaultFallback: string = 'An unexpected error occurred'): string {
  if (!codeOrMessage) return defaultFallback;
  const normalized = codeOrMessage.toLowerCase().trim();
  if (API_ERROR_MESSAGES[normalized]) {
    return API_ERROR_MESSAGES[normalized];
  }
  return codeOrMessage;
}
