import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Volume2 } from 'lucide-react';
import { playSimulatedAudio } from '../../utils/audioSynth';

export interface AudioPlayerProps {
  label: string;
  audioUrl?: string;
  text?: string;
  lang?: string;
  durationSec?: number;
  onRefreshUrl?: () => void;
  isExpired?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  label,
  audioUrl,
  text,
  lang = 'en',
  durationSec = 3.0,
  onRefreshUrl,
  isExpired = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelSynthRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (cancelSynthRef.current) cancelSynthRef.current();
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  const handleTogglePlay = () => {
    if (isPlaying) {
      if (cancelSynthRef.current) {
        cancelSynthRef.current();
        cancelSynthRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    setProgress(0);

    // If real browser audio can load and play
    if (audioUrl && !audioUrl.includes('mock.paralax.io')) {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.ontimeupdate = () => {
        if (audio.duration) {
          setProgress((audio.currentTime / audio.duration) * 100);
        }
      };

      audio.onended = () => {
        setIsPlaying(false);
        setProgress(100);
      };

      audio.onerror = () => {
        fallbackToSynth();
      };

      audio.play().catch(() => {
        fallbackToSynth();
      });
      return;
    }

    fallbackToSynth();
  };

  const fallbackToSynth = () => {
    const totalDuration = (durationSec || 3) * 1000;
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / totalDuration) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(interval);
      }
    }, 50);

    cancelSynthRef.current = playSimulatedAudio(text, lang, () => {
      clearInterval(interval);
      setIsPlaying(false);
      setProgress(100);
    });
  };

  const handleDownload = () => {
    if (text) {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${label.toLowerCase().replace(/\s+/g, '_')}_transcript.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="p-3.5 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#2b1d16] flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-[#855b14]" />
          {label}
        </span>
        {isExpired ? (
          <button
            onClick={onRefreshUrl}
            className="text-[11px] font-semibold text-amber-800 underline hover:text-[#2b1d16] cursor-pointer"
          >
            URL Expired (Re-fetch)
          </button>
        ) : (
          <span className="text-[11px] font-mono text-[#8a776a]">
            {durationSec ? `${durationSec.toFixed(1)}s` : 'WAV'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleTogglePlay}
          className="w-8 h-8 rounded-full border border-[#d89e2c] bg-[#e9b140] hover:bg-[#dfa32b] active:scale-95 text-[#2b1d16] flex items-center justify-center shrink-0 cursor-pointer shadow-xs transition-all"
          aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
        </button>

        {/* Progress track */}
        <div className="flex-1 bg-[#ded7cc]/60 h-1.5 rounded-full overflow-hidden relative">
          <div
            className="bg-[#e9b140] h-full transition-all duration-75"
            style={{ width: `${progress}%` }}
          />
        </div>

        <button
          onClick={handleDownload}
          className="p-1.5 rounded-lg border border-[#ded7cc] bg-white hover:bg-[#edeae4] text-[#5c4a3e] active:scale-95 transition-all cursor-pointer"
          title="Download audio / transcript"
          aria-label="Download audio"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
