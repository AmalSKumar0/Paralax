import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../services/api';
import { Device, Language } from '../types';
import { Topbar } from '../components/Layout/Topbar';
import { Card } from '../components/Common/Card';
import { Button } from '../components/Common/Button';
import { Badge } from '../components/Common/Badge';
import { AudioPlayer } from '../components/Common/AudioPlayer';
import { encodeWAV } from '../utils/wavEncoder';
import { formatLatency } from '../utils/formatters';
import { useToast } from '../context/ToastContext';
import {
  Mic,
  Square,
  Upload,
  Send,
  Radio,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  FileAudio,
  Volume2,
} from 'lucide-react';

interface AttemptResult {
  id: string;
  timestamp: string;
  source: string;
  target: string;
  detectedLang?: string;
  transcript: string;
  translation: string;
  audioUrl?: string;
  timings: {
    stt_ms: number;
    translate_ms: number;
    synthesize_ms: number;
    total_ms: number;
  };
}

export const TestConsole: React.FC = () => {
  const { onToggleMobileNav } = useOutletContext<{ onToggleMobileNav?: () => void }>() || {};
  const { success, error, warning } = useToast();

  const [devices, setDevices] = useState<Device[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('manual');

  // Manual language controls
  const [sourceLang, setSourceLang] = useState<string>('auto'); // auto or specific code
  const [targetLang, setTargetLang] = useState<string>('es-ES');

  // Microphone recording states
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // 0 - 100
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedWavBlob, setRecordedWavBlob] = useState<Blob | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);

  // File Upload Job states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [fileJobStatus, setFileJobStatus] = useState<string | null>(null);

  // Results & History
  const [currentResult, setCurrentResult] = useState<AttemptResult | null>(null);
  const [history, setHistory] = useState<AttemptResult[]>([]);

  // Web Audio Recording Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const recordedSamplesRef = useRef<Float32Array[]>([]);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Initial fetch of devices and languages
    Promise.all([api.getDevices(), api.getLanguages()]).then(([devs, langs]) => {
      setDevices(devs);
      setLanguages(langs.languages);
    });

    // Check secure context / mic support
    if (typeof window !== 'undefined') {
      if (!window.isSecureContext && window.location.hostname !== 'localhost') {
        setMicPermissionError(
          'Microphone recording requires a secure origin (HTTPS or localhost). Please ensure the dashboard is served over HTTPS.'
        );
      }
    }

    return () => {
      stopRecordingCleanup();
    };
  }, []);

  // When device config is selected, sync language settings
  const handleDeviceChange = (devId: string) => {
    setSelectedDeviceId(devId);
    if (devId !== 'manual') {
      const dev = devices.find((d) => d.device_id === devId);
      if (dev) {
        setSourceLang(dev.config.mode === 'auto_detect' ? 'auto' : dev.config.language_a);
        setTargetLang(dev.config.language_b);
      }
    }
  };

  // --- Microphone Recording Handlers ---
  const startRecording = async () => {
    setMicPermissionError(null);
    setRecordedWavBlob(null);
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
      setRecordedAudioUrl(null);
    }
    recordedSamplesRef.current = [];

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support getUserMedia microphone recording.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      mediaStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      const sourceNode = ctx.createMediaStreamSource(stream);
      // Analyser for real-time audio meter
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      sourceNode.connect(analyser);

      // ScriptProcessor for raw PCM capture
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        recordedSamplesRef.current.push(new Float32Array(inputData));

        // Update level meter
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
      };

      sourceNode.connect(processor);
      processor.connect(ctx.destination);

      setIsRecording(true);
      setRecordingDuration(0);

      durationTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 0.1);
      }, 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Microphone permission denied or unavailable.';
      setMicPermissionError(msg);
      error(msg);
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);
    setAudioLevel(0);

    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    const ctx = audioContextRef.current;
    const sampleRate = ctx ? ctx.sampleRate : 44100;

    stopRecordingCleanup();

    // Flatten recorded chunks into single Float32Array
    const chunks = recordedSamplesRef.current;
    const totalLength = chunks.reduce((acc, curr) => acc + curr.length, 0);
    const flattened = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      flattened.set(chunk, offset);
      offset += chunk.length;
    }

    // Convert to 16 kHz Mono 16-bit PCM WAV
    const wavBlob = encodeWAV(flattened, sampleRate);
    setRecordedWavBlob(wavBlob);
    const previewUrl = URL.createObjectURL(wavBlob);
    setRecordedAudioUrl(previewUrl);
    success(`Captured ${recordingDuration.toFixed(1)}s audio (16 kHz mono WAV)`);
  };

  const stopRecordingCleanup = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  // Submit recorded audio to the /utterances endpoint
  const handleSendUtterance = async (blobToSend?: Blob) => {
    const audioBlob = blobToSend || recordedWavBlob;
    if (!audioBlob) {
      error('No audio recorded yet.');
      return;
    }

    setIsProcessing(true);
    try {
      const effectiveSource = sourceLang === 'auto' ? 'en-US' : sourceLang;
      const res = await api.sendUtterance({
        source: effectiveSource,
        target: targetLang,
        audioBlob,
        deviceId: selectedDeviceId !== 'manual' ? selectedDeviceId : undefined,
      });

      const audioUrl = res.audio.url || (res.audio.base64 ? `data:audio/wav;base64,${res.audio.base64}` : undefined);
      const newAttempt: AttemptResult = {
        id: res.job_id || res.id,
        timestamp: new Date().toLocaleTimeString(),
        source: res.source_language,
        target: res.target_language,
        detectedLang: res.detected_language,
        transcript: res.transcript,
        translation: res.translation,
        audioUrl,
        timings: res.timings,
      };

      setCurrentResult(newAttempt);
      setHistory((prev) => [newAttempt, ...prev]);
      success('Utterance translated successfully!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Utterance translation failed';
      error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Generate simulated synthetic audio without physical mic
  const handleSendSimulatedSample = () => {
    // 1 second silence dummy WAV to test server pipeline
    const dummySamples = new Float32Array(16000);
    for (let i = 0; i < dummySamples.length; i++) {
      dummySamples[i] = Math.sin(i / 10) * 0.1;
    }
    const blob = encodeWAV(dummySamples, 16000);
    handleSendUtterance(blob);
  };

  // --- File Job Upload Handlers ---
  const handleFileJobUpload = async () => {
    if (!selectedFile) {
      error('Please select an audio file first.');
      return;
    }

    // Client-side 4 MB cap validation
    if (selectedFile.size > 4 * 1024 * 1024) {
      error(`Audio file size (${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB) exceeds 4 MB maximum limit.`);
      return;
    }

    setIsProcessing(true);
    setUploadProgress(10);
    setFileJobStatus('Uploading audio file and translating...');

    try {
      const res = await api.uploadFileUtterance({
        file: selectedFile,
        source: sourceLang,
        target: targetLang,
        onProgress: (pct) => {
          setUploadProgress(pct);
          if (pct === 100) {
            setFileJobStatus('Audio uploaded. Processing speech recognition and translation...');
          }
        },
      });

      const audioUrl = res.audio.url || (res.audio.base64 ? `data:audio/wav;base64,${res.audio.base64}` : undefined);
      const attemptResult: AttemptResult = {
        id: res.job_id || res.id,
        timestamp: new Date().toLocaleTimeString(),
        source: res.source_language,
        target: res.target_language,
        detectedLang: res.detected_language,
        transcript: res.transcript,
        translation: res.translation,
        audioUrl,
        timings: res.timings,
      };

      setCurrentResult(attemptResult);
      setHistory((prev) => [attemptResult, ...prev]);
      success('File translated successfully!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'File upload failed';
      error(msg);
    } finally {
      setIsProcessing(false);
      setUploadProgress(null);
      setFileJobStatus(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col pb-16">
      <Topbar
        title="Test Console"
        subtitle="Simulate translator hardware, capture microphone audio, and test cloud utterance endpoints"
        onToggleMobileNav={onToggleMobileNav}
      />

      <div className="p-6 md:p-8 space-y-6 w-full">
        {/* Warning on Insecure Origin or Mic Error */}
        {micPermissionError && (
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold uppercase text-rose-900 tracking-wider">
                Microphone Access Warning
              </p>
              <p className="text-xs text-rose-800 mt-0.5">
                {micPermissionError} (You can still use the <strong>"Simulate Speech Utterance"</strong> button below to test the complete cloud translation pipeline).
              </p>
            </div>
          </div>
        )}

        {/* Configuration Bar */}
        <Card variant="light" className="space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-[#ded7cc] gap-3">
            <div>
              <h2 className="text-base font-bold text-[#2b1d16] tracking-tight">
                Translator Simulation Setup
              </h2>
              <p className="text-xs text-[#8a776a] mt-0.5">
                Choose a registered device configuration or manually specify source and target language parameters
              </p>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full border border-[#ded7cc] bg-[#f7f5f0] text-[#5c4a3e] shrink-0">
              Format: 16 kHz Mono 16-bit WAV
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Pick device config */}
            <div>
              <label htmlFor="test-device-select" className="block text-xs font-semibold text-[#5c4a3e] mb-1.5">
                Hardware Preset
              </label>
              <select
                id="test-device-select"
                aria-label="Select device preset"
                value={selectedDeviceId}
                onChange={(e) => handleDeviceChange(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] font-medium text-xs text-[#2b1d16] focus:bg-white focus:border-[#e9b140] focus:ring-2 focus:ring-[#e9b140]/20 focus:outline-none transition-all"
              >
                <option value="manual">Manual / Standalone Simulation</option>
                {devices.map((d) => (
                  <option key={d.device_id} value={d.device_id}>
                    {d.name} ({d.config.language_a} ↔ {d.config.language_b})
                  </option>
                ))}
              </select>
            </div>

            {/* Source language (including auto-detect) */}
            <div>
              <label htmlFor="test-source-lang-select" className="block text-xs font-semibold text-[#5c4a3e] mb-1.5">
                Source Language
              </label>
              <select
                id="test-source-lang-select"
                aria-label="Select source language"
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] font-medium text-xs text-[#2b1d16] focus:bg-white focus:border-[#e9b140] focus:ring-2 focus:ring-[#e9b140]/20 focus:outline-none transition-all"
              >
                <option value="auto">Auto-Detect Language (Default)</option>
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Target language */}
            <div>
              <label htmlFor="test-target-lang-select" className="block text-xs font-semibold text-[#5c4a3e] mb-1.5">
                Target Language
              </label>
              <select
                id="test-target-lang-select"
                aria-label="Select target language"
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] font-medium text-xs text-[#2b1d16] focus:bg-white focus:border-[#e9b140] focus:ring-2 focus:ring-[#e9b140]/20 focus:outline-none transition-all"
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* Live Audio Ingestion Section: Hold-to-record & File Upload Tabs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Microphone Hold-to-Record Panel */}
          <Card variant="light" className="space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-[#ded7cc]">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-[#855b14]" />
                  <h3 className="text-base font-bold text-[#2b1d16] tracking-tight">
                    Microphone Utterance
                  </h3>
                </div>
                <span className="text-xs font-mono text-[#8a776a]">
                  {isRecording ? `${recordingDuration.toFixed(1)}s` : 'Ready'}
                </span>
              </div>

              <p className="text-xs text-[#5c4a3e]">
                Press and hold to record speech from your browser microphone. Audio is encoded locally to 16 kHz mono 16-bit PCM WAV.
              </p>

              {/* Big Interactive Recording Button */}
              <div className="py-6 flex flex-col items-center justify-center gap-4">
                <button
                  type="button"
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  className={`w-28 h-28 rounded-full border flex flex-col items-center justify-center gap-1.5 transition-all duration-200 select-none cursor-pointer ${
                    isRecording
                      ? 'bg-rose-500 text-white border-rose-600 scale-105 shadow-[0_0_24px_rgba(244,63,94,0.45)] ring-4 ring-rose-200 animate-pulse'
                      : 'bg-[#e9b140] hover:bg-[#dfa32b] text-[#2b1d16] border-[#d89e2c] shadow-[0_4px_14px_rgba(233,177,64,0.35)] hover:shadow-[0_6px_20px_rgba(233,177,64,0.45)] active:scale-95'
                  }`}
                  aria-label="Hold to record microphone audio"
                >
                  <Mic className={`w-8 h-8 ${isRecording ? 'animate-bounce' : ''}`} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    {isRecording ? 'Release to Stop' : 'Hold to Speak'}
                  </span>
                </button>

                {/* Live Audio Level Meter */}
                <div className="w-full max-w-xs space-y-1.5 text-center">
                  <div className="flex justify-between text-[10px] font-semibold text-[#8a776a] uppercase">
                    <span>Input Level</span>
                    <span>{isRecording ? `${audioLevel}%` : '0%'}</span>
                  </div>
                  <div className="h-2 w-full bg-[#edeae4] rounded-full border border-[#ded7cc] overflow-hidden relative">
                    <div
                      className={`h-full transition-all duration-75 ${
                        audioLevel > 75 ? 'bg-rose-500' : audioLevel > 40 ? 'bg-[#e9b140]' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${isRecording ? Math.max(5, audioLevel) : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Preview Player & Send Button if recording exists */}
              {recordedWavBlob && recordedAudioUrl && (
                <div className="p-3.5 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] space-y-2.5">
                  <span className="text-xs font-semibold text-[#2b1d16] block">
                    Captured Audio Preview ({recordingDuration.toFixed(1)}s WAV)
                  </span>
                  <audio controls src={recordedAudioUrl} className="w-full h-8 rounded-lg" />
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setRecordedWavBlob(null);
                        setRecordedAudioUrl(null);
                      }}
                    >
                      Discard
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSendUtterance()}
                      isLoading={isProcessing}
                      icon={<Send className="w-3.5 h-3.5" />}
                    >
                      Send to Translator
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Alternative: Instant Demo Speech Simulator */}
            <div className="pt-4 border-t border-[#ded7cc] flex items-center justify-between">
              <span className="text-xs text-[#8a776a]">
                No physical microphone available?
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSendSimulatedSample}
                isLoading={isProcessing}
                icon={<Sparkles className="w-3.5 h-3.5 text-[#855b14]" />}
              >
                Simulate Speech Utterance
              </Button>
            </div>
          </Card>

          {/* Batch Audio File Job Upload Panel */}
          <Card variant="sand" className="space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-[#ded7cc]">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[#855b14]" />
                  <h3 className="text-base font-bold text-[#2b1d16] tracking-tight">
                    Upload Audio File Job
                  </h3>
                </div>
                <span className="text-xs font-mono text-[#8a776a]">
                  Presigned S3 Pipeline
                </span>
              </div>

              <p className="text-xs text-[#5c4a3e]">
                Upload longer audio recordings (.wav, .mp3) to a presigned cloud storage URL. The service processes batch speech recognition, translation, and neural voice synthesis.
              </p>

              {/* File Drop / Select Area */}
              <div className="border border-dashed border-[#ded7cc] rounded-2xl p-6 bg-white hover:border-[#e9b140] hover:bg-[#fcf8ee] transition-all flex flex-col items-center justify-center gap-2.5 text-center min-h-[160px]">
                <FileAudio className="w-8 h-8 text-[#8a776a]" />
                <div>
                  <label className="cursor-pointer">
                    <span className="px-3.5 py-1.5 rounded-xl border border-[#d89e2c] bg-[#e9b140] hover:bg-[#dfa32b] text-xs font-semibold text-[#2b1d16] inline-block shadow-xs transition-all">
                      Browse Audio File
                    </span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                  {selectedFile ? (
                    <p className="mt-2 text-xs font-semibold text-[#2b1d16] font-mono">
                      {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-[#8a776a]">
                      Supports 16 kHz WAV, FLAC, MP3 up to 25 MB
                    </p>
                  )}
                </div>
              </div>

              {/* Upload Progress Bar if active */}
              {uploadProgress !== null && (
                <div className="space-y-1.5 p-3 rounded-xl border border-[#ded7cc] bg-white">
                  <div className="flex justify-between text-xs font-semibold text-[#2b1d16]">
                    <span>{fileJobStatus || 'Processing...'}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 w-full bg-[#edeae4] rounded-full overflow-hidden border border-[#ded7cc]">
                    <div
                      className="h-full bg-[#e9b140] transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#ded7cc] flex items-center justify-end">
              <Button
                variant="dark"
                size="sm"
                onClick={handleFileJobUpload}
                isLoading={isProcessing}
                disabled={!selectedFile || isProcessing}
                icon={<Upload className="w-3.5 h-3.5" />}
              >
                Upload & Process File Job
              </Button>
            </div>
          </Card>
        </div>

        {/* Latest Translation Result Output */}
        {currentResult && (
          <Card variant="light" className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-[#ded7cc] gap-2">
              <div>
                <span className="text-xs font-mono text-[#8a776a]">
                  Job ID: {currentResult.id} · Completed at {currentResult.timestamp}
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <h3 className="text-base font-bold text-[#2b1d16] tracking-tight">
                    Translation Result
                  </h3>
                  <Badge variant="accent" size="sm">
                    {currentResult.source} ➔ {currentResult.target}
                  </Badge>
                  {currentResult.detectedLang && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-[#ded7cc] bg-[#f7f5f0] text-[#5c4a3e]">
                      Detected: {currentResult.detectedLang}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full border border-[#e9b140]/40 bg-[#fcf8ee] text-[#855b14]">
                Total Latency: {formatLatency(currentResult.timings.total_ms)}
              </div>
            </div>

            {/* Side-by-side Transcript & Translation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#736154]">
                  Speech Transcript ({currentResult.source})
                </span>
                <p className="text-sm font-medium text-[#2b1d16] bg-white p-3 rounded-lg border border-[#ded7cc]">
                  "{currentResult.transcript}"
                </p>
              </div>

              <div className="p-4 rounded-xl border border-[#ded7cc] bg-[#fffdfa] space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#2b1d16]">
                  Translated Speech ({currentResult.target})
                </span>
                <p className="text-sm font-medium text-[#2b1d16] bg-white p-3 rounded-lg border border-[#ded7cc]">
                  "{currentResult.translation}"
                </p>
                <AudioPlayer
                  label="Play Translated Voice"
                  audioUrl={currentResult.audioUrl}
                  text={currentResult.translation}
                  lang={currentResult.target.slice(0, 2)}
                />
              </div>
            </div>

            {/* Timings Breakdown */}
            <div className="pt-3 flex flex-wrap items-center gap-3 text-xs font-mono text-[#736154] border-t border-[#ded7cc]">
              <span className="font-sans font-medium">Latency Breakdown:</span>
              <span>STT: <strong className="text-[#2b1d16]">{(currentResult.timings as any).stt_ms}ms</strong></span>
              <span>·</span>
              <span>Translate: <strong className="text-[#2b1d16]">{currentResult.timings.translate_ms}ms</strong></span>
              <span>·</span>
              <span>TTS Synthesize: <strong className="text-[#2b1d16]">{currentResult.timings.synthesize_ms}ms</strong></span>
              <span>·</span>
              <span className="px-2 py-0.5 rounded-full border border-[#e9b140]/40 bg-[#fcf8ee] text-[#855b14] font-semibold">
                End-to-End: {currentResult.timings.total_ms}ms
              </span>
            </div>
          </Card>
        )}

        {/* Session Attempt History */}
        {history.length > 0 && (
          <Card variant="sand" className="space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-[#ded7cc]">
              <h3 className="text-base font-bold text-[#2b1d16] tracking-tight">
                Session Attempts Log ({history.length})
              </h3>
              <button
                onClick={() => setHistory([])}
                className="text-xs text-[#8a776a] hover:text-[#2b1d16] cursor-pointer underline transition-all"
              >
                Clear History
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {history.map((item, idx) => (
                <div
                  key={item.id + idx}
                  className="p-3 rounded-xl border border-[#ded7cc] bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#2b1d16]">
                        {item.source} ➔ {item.target}
                      </span>
                      <span className="text-[11px] font-mono text-[#8a776a]">
                        ({item.timestamp})
                      </span>
                    </div>
                    <p className="text-xs text-[#5c4a3e]">
                      "{item.transcript}" ➔ "{item.translation}"
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full border border-[#ded7cc] bg-[#f7f5f0] text-[#5c4a3e]">
                      {item.timings.total_ms}ms
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setCurrentResult(item)}
                    >
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
