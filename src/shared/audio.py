"""Audio processing and validation module.

Handles:
- Validation of raw PCM (16 kHz, 16-bit, mono, little-endian) and WAV containers
- Duration and sample calculation from raw bytes/headers (ignoring client claims)
- Silence/RMS detection for 422 no_speech_detected
- Conversion between raw PCM and WAV headers
"""

import io
import math
import struct
import wave
from typing import Optional, Tuple


class AudioValidationError(Exception):
    """Raised when audio payload fails format or duration constraints."""
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def parse_and_validate_audio(
    audio_bytes: bytes,
    content_type: Optional[str] = None,
    max_duration_sec: float = 15.0,
    min_duration_sec: float = 0.2,
    silence_rms_threshold: float = 150.0,
) -> Tuple[bytes, float, int]:
    """Inspect and validate input audio payload.
    
    Args:
        audio_bytes: Raw bytes from HTTP request body
        content_type: Header content-type (audio/wav, audio/L16;rate=16000, or raw)
        max_duration_sec: Max allowed utterance duration
        min_duration_sec: Min duration required
        silence_rms_threshold: RMS amplitude threshold under which audio is deemed silent
        
    Returns:
        (raw_pcm_bytes, duration_sec, sample_rate)
        
    Raises:
        AudioValidationError with error code
    """
    if not audio_bytes or len(audio_bytes) < 4:
        raise AudioValidationError("invalid_audio_format", "Audio payload is empty or too short.")

    sample_rate = 16000
    channels = 1
    bits_per_sample = 16

    # Detect WAV header (RIFF ... WAVE)
    if audio_bytes[:4] == b"RIFF" and len(audio_bytes) >= 12 and audio_bytes[8:12] == b"WAVE":
        try:
            with io.BytesIO(audio_bytes) as bio:
                with wave.open(bio, "rb") as wf:
                    w_channels = wf.getnchannels()
                    w_sample_width = wf.getsampwidth()
                    w_sample_rate = wf.getframerate()
                    w_frames = wf.getnframes()
                    raw_pcm = wf.readframes(w_frames)

                    if w_channels != 1:
                        raise AudioValidationError(
                            "invalid_audio_format",
                            f"Only mono audio is supported (received {w_channels} channels)."
                        )
                    if w_sample_width != 2:
                        raise AudioValidationError(
                            "invalid_audio_format",
                            f"Only 16-bit audio is supported (received {w_sample_width * 8} bits)."
                        )
                    if w_sample_rate != 16000:
                        raise AudioValidationError(
                            "invalid_audio_format",
                            f"Sample rate must be 16000 Hz (received {w_sample_rate} Hz)."
                        )

                    sample_rate = w_sample_rate
        except wave.Error as e:
            raise AudioValidationError("invalid_audio_format", f"Malformed WAV header: {str(e)}")
    else:
        # Raw PCM L16
        # Must be 16-bit samples (multiple of 2 bytes)
        if len(audio_bytes) % 2 != 0:
            raise AudioValidationError(
                "invalid_audio_format",
                "PCM byte length must be a multiple of 2 (16-bit samples)."
            )
        raw_pcm = audio_bytes

    num_samples = len(raw_pcm) // 2
    duration_sec = num_samples / sample_rate

    # Duration limits validation
    if duration_sec > max_duration_sec:
        raise AudioValidationError(
            "audio_too_long",
            f"Audio duration {duration_sec:.2f}s exceeds maximum allowed duration {max_duration_sec:.1f}s."
        )

    if duration_sec < min_duration_sec:
        raise AudioValidationError(
            "invalid_audio_format",
            f"Audio duration {duration_sec:.2f}s is shorter than minimum required {min_duration_sec:.1f}s."
        )

    # Silence / energy detection
    rms = calculate_pcm_rms(raw_pcm)
    if rms < silence_rms_threshold:
        raise AudioValidationError(
            "no_speech_detected",
            f"Near-silent audio detected (RMS amplitude {rms:.1f} below threshold {silence_rms_threshold:.1f})."
        )

    return raw_pcm, duration_sec, sample_rate


def calculate_pcm_rms(pcm_bytes: bytes) -> float:
    """Calculate Root Mean Square (RMS) amplitude of 16-bit signed PCM mono audio."""
    num_samples = len(pcm_bytes) // 2
    if num_samples == 0:
        return 0.0

    # Unpack 16-bit signed little-endian integers in chunks
    total_squares = 0.0
    # Process in slices to avoid massive memory allocation for long audio
    chunk_size = 2048
    for i in range(0, len(pcm_bytes), chunk_size * 2):
        chunk = pcm_bytes[i : i + chunk_size * 2]
        count = len(chunk) // 2
        samples = struct.unpack(f"<{count}h", chunk)
        total_squares += sum(s * s for s in samples)

    return math.sqrt(total_squares / num_samples)


def pcm_to_wav(pcm_bytes: bytes, sample_rate: int = 16000, channels: int = 1, bits_per_sample: int = 16) -> bytes:
    """Wrap raw PCM bytes with a standard WAV (RIFF) header."""
    bio = io.BytesIO()
    with wave.open(bio, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(bits_per_sample // 8)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return bio.getvalue()


def create_sine_pcm(
    frequency_hz: float = 440.0,
    duration_sec: float = 1.0,
    sample_rate: int = 16000,
    amplitude: float = 10000.0,
) -> bytes:
    """Generate synthetic sine wave PCM audio for testing and simulation."""
    num_samples = int(duration_sec * sample_rate)
    samples = []
    for i in range(num_samples):
        t = i / sample_rate
        val = int(amplitude * math.sin(2 * math.pi * frequency_hz * t))
        # Clamp to 16-bit signed integer
        val = max(-32768, min(32767, val))
        samples.append(val)
    return struct.pack(f"<{len(samples)}h", *samples)
