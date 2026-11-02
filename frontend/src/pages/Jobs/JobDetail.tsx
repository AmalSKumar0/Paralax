import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../services/api';
import { ApiJob } from '../../types';
import { Topbar } from '../../components/Layout/Topbar';
import { Card } from '../../components/Common/Card';
import { Button } from '../../components/Common/Button';
import { Badge } from '../../components/Common/Badge';
import { AudioPlayer } from '../../components/Common/AudioPlayer';
import { ConfirmModal } from '../../components/Common/ConfirmModal';
import { useToast } from '../../context/ToastContext';
import { formatDateTime, formatDuration, formatLatency } from '../../utils/formatters';
import { formatApiError } from '../../utils/errors';
import {
  ArrowLeft,
  RotateCcw,
  Ban,
  Trash2,
  Copy,
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Activity,
  Layers,
} from 'lucide-react';

export const JobDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error, warning } = useToast();

  const [job, setJob] = useState<ApiJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUrlExpired, setIsUrlExpired] = useState(false);

  // Confirm Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'retry' | 'delete';
    title: string;
    message: string;
  }>({ isOpen: false, type: 'retry', title: '', message: '' });

  const loadJob = useCallback(
    async (isManual: boolean = false) => {
      if (!id) return;
      if (isManual) setIsRefreshing(true);
      try {
        const data = await api.getJob(id);
        setJob(data);
        setIsUrlExpired(false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load job details';
        error(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [id, error]
  );

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  // Poll until final if non-final status
  useEffect(() => {
    if (!job) return;
    const isNonFinal =
      job.status === 'queued' ||
      job.status === 'transcribing' ||
      job.status === 'translating' ||
      job.status === 'synthesizing';

    if (isNonFinal) {
      const pollTimer = setInterval(() => {
        loadJob();
      }, 2000);
      return () => clearInterval(pollTimer);
    }
  }, [job, loadJob]);

  const handleExecuteAction = async () => {
    if (!id || !job) return;
    const { type } = confirmModal;
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));

    try {
      if (type === 'retry') {
        const retried = await api.retryJob(id);
        setJob(retried);
        success('Job retried successfully');
      } else if (type === 'delete') {
        await api.deleteJob(id);
        success('Job deleted permanently');
        navigate('/jobs');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed';
      error(msg);
    }
  };

  const handleCopyText = (text?: string, label: string = 'Text') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    success(`${label} copied to clipboard`);
  };

  const handleDownloadTxt = () => {
    if (!job) return;
    const content = `PARALAX JOB LOG: ${job.job_id}\n` +
      `Status: ${job.status}\n` +
      `Languages: ${job.source_language} -> ${job.target_language}\n` +
      `Created: ${job.created_at}\n\n` +
      `TRANSCRIPT (${job.detected_language || job.source_language}):\n` +
      `${job.transcript || 'None'}\n\n` +
      `TRANSLATION (${job.target_language}):\n` +
      `${job.translation || 'None'}\n`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job_${job.job_id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    success('Job transcript downloaded');
  };

  if (isLoading || !job) {
    return (
      <div className="flex-1 flex flex-col">
        <Topbar title="Job Detail" subtitle="Loading pipeline details..." />
        <div className="p-8">
          <div className="h-64 bg-[#f9f6f0] border-[3px] border-black rounded-[2rem] animate-pulse" />
        </div>
      </div>
    );
  }

  const isInProgress =
    job.status === 'queued' ||
    job.status === 'transcribing' ||
    job.status === 'translating' ||
    job.status === 'synthesizing';

  const stages = [
    { key: 'queued', label: 'Queued' },
    { key: 'transcribing', label: 'Transcribing (STT)' },
    { key: 'translating', label: 'Translating' },
    { key: 'synthesizing', label: 'Synthesizing (TTS)' },
    { key: 'completed', label: 'Completed' },
  ];

  const currentStageIndex =
    job.status === 'completed'
      ? 4
      : job.status === 'synthesizing'
      ? 3
      : job.status === 'translating'
      ? 2
      : job.status === 'transcribing'
      ? 1
      : 0;

  return (
    <div className="flex-1 flex flex-col pb-16">
      <Topbar
        title={`Job: ${job.job_id}`}
        subtitle={`Kind: ${job.kind} · Created: ${formatDateTime(job.created_at)}`}
        onRefresh={() => loadJob(true)}
        isRefreshing={isRefreshing}
      />

      <div className="p-6 md:p-8 space-y-8 max-w-[1200px]">
        {/* Navigation Breadcrumb & Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b-[3px] border-black">
          <div className="flex items-center gap-3">
            <Link
              to="/jobs"
              className="p-2 rounded-xl border-[2px] border-black bg-white hover:bg-[#f0ece1] active:translate-y-[1px] transition-all cursor-pointer shadow-[2px_2px_0px_#000]"
              aria-label="Back to jobs"
            >
              <ArrowLeft className="w-5 h-5 text-black" />
            </Link>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-display text-3xl font-black text-[#1a1a1a]">
                  Job Pipeline Detail
                </h1>
                <Badge
                  variant={
                    job.status === 'completed'
                      ? 'success'
                      : job.status === 'failed'
                      ? 'danger'
                      : job.status === 'cancelled'
                      ? 'neutral'
                      : 'warning'
                  }
                  size="sm"
                  dot
                >
                  {job.status}
                </Badge>
              </div>
              <p className="text-xs font-semibold text-gray-600">
                {job.device_id ? `Device: ${job.device_id}` : `File: ${job.filename || 'Direct upload'}`} · {job.source_language} ➔ {job.target_language}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(job.can_retry || job.canRetry) && (
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  setConfirmModal({
                    isOpen: true,
                    type: 'retry',
                    title: `Retry Job ${job.job_id || job.jobId}?`,
                    message: 'Re-trigger this audio job through the translation and synthesis pipeline.',
                  })
                }
                icon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                Retry Job
              </Button>
            )}

            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                setConfirmModal({
                  isOpen: true,
                  type: 'delete',
                  title: `Permanently Delete Job ${job.job_id}?`,
                  message: 'This will remove the job record and its speech audio metadata.',
                })
              }
              icon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Delete
            </Button>
          </div>
        </div>

        {/* Status Pipeline Timeline */}
        <Card variant="light" className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b-[2px] border-black/15">
            <h3 className="font-display text-xl font-black text-[#1a1a1a]">
              Pipeline Execution Progress
            </h3>
            <span className="text-xs font-mono font-bold text-gray-600">
              {job.status === 'failed' ? 'Terminated on error' : `Stage ${currentStageIndex + 1} of 5`}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
            {stages.map((st, idx) => {
              const isPast = currentStageIndex > idx;
              const isCurrent = currentStageIndex === idx && job.status !== 'failed' && job.status !== 'cancelled';
              const isFailedAtThisStage = job.status === 'failed' && currentStageIndex === idx;

              return (
                <div
                  key={st.key}
                  className={`p-3 rounded-xl border-[2px] border-black text-center transition-all ${
                    isFailedAtThisStage
                      ? 'bg-[#ffecec] border-red-600 text-rose-900 shadow-[2px_2px_0px_#ef4444]'
                      : isPast || job.status === 'completed'
                      ? 'bg-[#eafff1] border-black text-emerald-900 shadow-[2px_2px_0px_#22c55e]'
                      : isCurrent
                      ? 'bg-[#ffc86b] border-black text-black font-black shadow-[3px_3px_0px_#000] animate-pulse'
                      : 'bg-[#f0ece1] border-black/30 text-gray-400'
                  }`}
                >
                  <div className="w-6 h-6 rounded-full border border-black mx-auto mb-1 flex items-center justify-center font-black text-xs bg-white text-black">
                    {idx + 1}
                  </div>
                  <span className="text-xs font-bold block">{st.label}</span>
                </div>
              );
            })}
          </div>

          {/* Failure Alert Box with Mapped Plain-Language Message */}
          {job.status === 'failed' && job.error && (
            <div className="mt-4 p-4 rounded-2xl border-[3px] border-black bg-[#ffecec] shadow-[4px_4px_0px_#ef4444] space-y-1">
              <div className="flex items-center gap-2 text-rose-800 font-black text-xs uppercase tracking-wider">
                <AlertCircle className="w-4 h-4" />
                Pipeline Error: {job.error.code}
              </div>
              <p className="text-sm font-semibold text-rose-950">
                {formatApiError(job.error.code, job.error.message)}
              </p>
              {job.error.retry_after_sec && (
                <p className="text-xs font-mono font-bold text-gray-700">
                  Rate limit cool-off: Retry after {job.error.retry_after_sec}s
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Side-by-side Transcripts & Audio Players */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Original Audio Card */}
          <Card variant="light" className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b-[2px] border-black/15">
              <span className="text-xs font-black uppercase tracking-wider text-black">
                Source Audio ({job.source_language})
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyText(job.transcript, 'Transcript')}
                  className="p-1 rounded border border-black bg-white hover:bg-black/5"
                  title="Copy transcript"
                  aria-label="Copy transcript"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <p className="text-sm font-semibold text-[#1a1a1a] leading-relaxed bg-[#f9f6f0] p-4 rounded-2xl border-[2px] border-black min-h-[90px]">
              {job.transcript || <span className="italic text-gray-400">Audio transcript not available</span>}
            </p>

            <AudioPlayer
              label="Original Audio Recording"
              audioUrl={job.original_audio_url}
              text={job.transcript}
              lang={job.source_language.slice(0, 2)}
              durationSec={job.duration_sec}
              isExpired={isUrlExpired}
              onRefreshUrl={loadJob}
            />
          </Card>

          {/* Translated Audio Card */}
          <Card variant="light" className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b-[2px] border-black/15">
              <span className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                Translated Audio ({job.target_language})
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyText(job.translation, 'Translation')}
                  className="p-1 rounded border border-black bg-white hover:bg-black/5"
                  title="Copy translation"
                  aria-label="Copy translation"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleDownloadTxt}
                  className="p-1 rounded border border-black bg-white hover:bg-black/5"
                  title="Download .txt"
                  aria-label="Download transcript"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <p className="text-sm font-semibold text-[#1a1a1a] leading-relaxed bg-[#fffdf8] p-4 rounded-2xl border-[2px] border-black min-h-[90px]">
              {job.translation || <span className="italic text-gray-400">Translation output pending synthesis...</span>}
            </p>

            <AudioPlayer
              label="Translated Neural Speech"
              audioUrl={job.translated_audio_url}
              text={job.translation}
              lang={job.target_language.slice(0, 2)}
              durationSec={job.duration_sec}
              isExpired={isUrlExpired}
              onRefreshUrl={loadJob}
            />
          </Card>
        </div>

        {/* Stage Latency Breakdown Card */}
        {job.timings && (
          <Card variant="sand" className="space-y-3">
            <h3 className="font-display text-xl font-black text-[#1a1a1a]">
              Stage Timings & Latency Breakdown
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
              <div className="p-3.5 rounded-xl border-[2px] border-black bg-white text-center shadow-[2px_2px_0px_#000]">
                <span className="text-[10px] font-black uppercase text-gray-600 block">1. Transcribe (STT)</span>
                <span className="text-xl font-mono font-black text-black">{job.timings.transcribe_ms} ms</span>
              </div>
              <div className="p-3.5 rounded-xl border-[2px] border-black bg-white text-center shadow-[2px_2px_0px_#000]">
                <span className="text-[10px] font-black uppercase text-gray-600 block">2. Translate</span>
                <span className="text-xl font-mono font-black text-black">{job.timings.translate_ms} ms</span>
              </div>
              <div className="p-3.5 rounded-xl border-[2px] border-black bg-white text-center shadow-[2px_2px_0px_#000]">
                <span className="text-[10px] font-black uppercase text-gray-600 block">3. Synthesize (TTS)</span>
                <span className="text-xl font-mono font-black text-black">{job.timings.synthesize_ms} ms</span>
              </div>
              <div className="p-3.5 rounded-xl border-[2px] border-black bg-[#ffc86b] text-center shadow-[3px_3px_0px_#000]">
                <span className="text-[10px] font-black uppercase text-black block">Total Roundtrip</span>
                <span className="text-xl font-mono font-black text-black">{job.timings.total_ms} ms</span>
              </div>
            </div>
          </Card>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleExecuteAction}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="Confirm"
        variant={confirmModal.type === 'delete' ? 'danger' : 'primary'}
      />
    </div>
  );
};
