/**
 * Helper to play simulated speech / audio tones in browser for mock audio URLs.
 */

export function playSimulatedAudio(text?: string, langCode: string = 'en', onEnded?: () => void): () => void {
  // If browser supports Web Speech API, speak the text!
  if (typeof window !== 'undefined' && 'speechSynthesis' in window && text) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = langCode || 'en';
      utterance.rate = 1.0;
      utterance.onend = () => {
        onEnded?.();
      };
      utterance.onerror = () => {
        // Fall back to synthetic tone if speech synthesis fails
        playBeepTone(onEnded);
      };
      window.speechSynthesis.speak(utterance);
      return () => {
        window.speechSynthesis.cancel();
      };
    } catch {
      // Fallback
      return playBeepTone(onEnded);
    }
  }

  return playBeepTone(onEnded);
}

function playBeepTone(onEnded?: () => void): () => void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      setTimeout(() => onEnded?.(), 1000);
      return () => {};
    }

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.8);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.85);

    osc.onended = () => {
      ctx.close();
      onEnded?.();
    };

    return () => {
      try {
        osc.stop();
        ctx.close();
      } catch {
        // Ignored
      }
    };
  } catch {
    setTimeout(() => onEnded?.(), 800);
    return () => {};
  }
}
