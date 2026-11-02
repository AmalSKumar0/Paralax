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
        // Fall back to synth
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
      // In mock mode or browser, generate mock audio wav or text
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
    <div className="p-3.5 rounded-2xl border-[2px] border-black bg-[#f9f6f0] flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-wider text-[#1a1a1a] flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-black" />
          {label}
        </span>
        {isExpired ? (
          <button
            onClick={onRefreshUrl}
            className="text-[11px] font-black text-amber-800 underline hover:text-black cursor-pointer"
          >
            URL Expired (Re-fetch)
          </button>
        ) : (
          <span className="text-[11px] font-mono font-bold text-gray-700">
            {durationSec ? `${durationSec.toFixed(1)}s` : 'WAV'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleTogglePlay}
          className="w-9 h-9 rounded-full border-[2px] border-black bg-[#ffc86b] hover:bg-[#f4b942] active:translate-y-[1px] flex items-center justify-center shrink-0 cursor-pointer shadow-[2px_2px_0px_0px_#000]"
          aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
        >
          {isPlaying ? <Pause className="w-4 h-4 text-black" /> : <Play className="w-4 h-4 text-black ml-0.5" />}
        </button>

        {/* Progress track */}
        <div className="flex-1 bg-black/10 h-3 rounded-full border-[2px] border-black overflow-hidden relative">
          <div
            className="bg-[#ffc86b] h-full transition-all duration-75"
            style={{ width: `${progress}%` }}
          />
        </div>

        <button
          onClick={handleDownload}
          className="p-1.5 rounded-lg border-[2px] border-black bg-white hover:bg-black/5 active:translate-y-[1px] cursor-pointer"
          title="Download audio / transcript"
          aria-label="Download audio"
        >
          <Download className="w-4 h-4 text-black" />
        </button>
      </div>
    </div>
  );
};
