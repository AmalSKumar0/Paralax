import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../services/api';
import { Conversation } from '../../types';
import { Topbar } from '../../components/Layout/Topbar';
import { Card } from '../../components/Common/Card';
import { Button } from '../../components/Common/Button';
import { Badge } from '../../components/Common/Badge';
import { AudioPlayer } from '../../components/Common/AudioPlayer';
import { useToast } from '../../context/ToastContext';
import { formatDateTime, formatLatency } from '../../utils/formatters';
import {
  ArrowLeft,
  Download,
  FileText,
  FileCode,
  Volume2,
  Clock,
  AlertCircle,
  CheckCircle2,
  Share2,
} from 'lucide-react';

export const ConversationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { success, error } = useToast();

  const loadConversation = useCallback(
    async (isManual: boolean = false) => {
      if (!id) return;
      if (isManual) setIsRefreshing(true);
      try {
        const data = await api.getConversation(id);
        setConversation(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load conversation';
        error(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [id, error]
  );

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  const handleExportTxt = () => {
    if (!conversation) return;
    let content = `PARALAX VOICE TRANSLATION LOG\n`;
    content += `===========================================\n`;
    content += `Conversation ID: ${conversation.conversation_id}\n`;
    content += `Device: ${conversation.device_id}\n`;
    content += `Recorded: ${conversation.started_at}\n`;
    content += `Total Turns: ${conversation.turns.length}\n`;
    content += `===========================================\n\n`;

    conversation.turns.forEach((turn, idx) => {
      content += `[Turn ${idx + 1}] (${turn.source_language} → ${turn.target_language}) [${turn.timings ? turn.timings.total_ms + 'ms' : '-'}]\n`;
      content += `ORIGINAL (${turn.detected_language || turn.source_language}): ${turn.transcript || '<No transcript>'}\n`;
      content += `TRANSLATION: ${turn.translation || '<No translation>'}\n`;
      if (turn.error) {
        content += `ERROR: ${turn.error.code} - ${turn.error.message}\n`;
      }
      content += `-------------------------------------------\n\n`;
    });

    downloadBlob(content, `${conversation.conversation_id}.txt`, 'text/plain');
    success('Conversation exported as .txt');
  };

  const handleExportJson = () => {
    if (!conversation) return;
    const jsonStr = JSON.stringify(conversation, null, 2);
    downloadBlob(jsonStr, `${conversation.conversation_id}.json`, 'application/json');
    success('Conversation exported as .json');
  };

  const downloadBlob = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading || !conversation) {
    return (
      <div className="flex-1 flex flex-col">
        <Topbar title="Conversation Log" subtitle="Loading session dialogue..." />
        <div className="p-8">
          <div className="h-64 bg-[#f9f6f0] border-[3px] border-black rounded-[2rem] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col pb-16">
      <Topbar
        title={`Session: ${conversation.conversation_id}`}
        subtitle={`Hardware unit: ${conversation.device_id} · ${conversation.turns.length} dialog turns`}
        onRefresh={() => loadConversation(true)}
        isRefreshing={isRefreshing}
      />

      <div className="p-6 md:p-8 space-y-6 max-w-[1200px]">
        {/* Header Breadcrumb & Export Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b-[3px] border-black">
          <div className="flex items-center gap-3">
            <Link
              to="/conversations"
              className="p-2 rounded-xl border-[2px] border-black bg-white hover:bg-[#f0ece1] active:translate-y-[1px] transition-all cursor-pointer shadow-[2px_2px_0px_#000]"
              aria-label="Back to conversations"
            >
              <ArrowLeft className="w-5 h-5 text-black" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-3xl font-black text-[#1a1a1a]">
                  Dialogue Turn History
                </h1>
                <Badge variant="accent" size="sm">
                  {conversation.turns.length} Turns
                </Badge>
              </div>
              <p className="text-xs font-semibold text-gray-600">
                Started {formatDateTime(conversation.started_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportTxt}
              icon={<FileText className="w-3.5 h-3.5" />}
            >
              Export .TXT
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleExportJson}
              icon={<FileCode className="w-3.5 h-3.5" />}
            >
              Export .JSON
            </Button>
          </div>
        </div>

        {/* Ordered Turns Timeline */}
        <div className="space-y-6">
          {conversation.turns.map((turn, index) => {
            const hasError = !!turn.error || turn.status === 'failed';

            return (
              <div
                key={turn.job_id || index}
                className="bg-white border-[3px] border-black rounded-[2rem] p-6 shadow-[6px_6px_0px_0px_#000] space-y-4"
              >
                {/* Turn Header */}
                <div className="flex flex-wrap items-center justify-between pb-3 border-b-[2px] border-black/15 gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full border-[2px] border-black bg-[#ffc86b] font-black text-xs flex items-center justify-center">
                      {turn.turn_index || index + 1}
                    </span>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-black bg-[#f9f6f0] font-black text-xs">
                      <span>{turn.source_language}</span>
                      <span className="text-gray-400">➔</span>
                      <span>{turn.target_language}</span>
                    </div>
                    {turn.detected_language && (
                      <span className="text-[11px] font-bold text-gray-600 bg-[#f0ece1] px-2 py-0.5 rounded border border-black">
                        Detected: {turn.detected_language}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono font-bold">
                    {turn.timings && (
                      <span className="px-2 py-0.5 rounded border border-black bg-[#f0ece1]">
                        Latency: {formatLatency(turn.timings.total_ms)}
                      </span>
                    )}
                    <span className="text-gray-500">
                      {new Date(turn.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                {/* Error Banner if turn failed */}
                {hasError && (
                  <div className="p-3.5 rounded-xl border-[2px] border-black bg-[#ffecec] text-xs font-bold text-rose-900 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-700" />
                    <span>
                      Turn Failed: {turn.error?.code || 'processing_error'} — {turn.error?.message || 'Speech recognition pipeline error'}
                    </span>
                  </div>
                )}

                {/* Side-by-side Transcripts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Original Speech Turn */}
                  <div className="p-4 rounded-2xl border-[2px] border-black bg-[#f9f6f0] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-gray-700">
                        Speaker Utterance ({turn.source_language})
                      </span>
                      <span className="text-[11px] font-mono font-bold text-gray-500">
                        {turn.duration_sec ? `${turn.duration_sec.toFixed(1)}s` : 'Audio'}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-[#1a1a1a] leading-relaxed bg-white p-3 rounded-xl border border-black/20 min-h-[50px]">
                      {turn.transcript || <span className="italic text-gray-400">No transcript captured</span>}
                    </p>

                    <AudioPlayer
                      label="Original Speech"
                      audioUrl={turn.original_audio_url}
                      text={turn.transcript}
                      lang={turn.source_language.slice(0, 2)}
                      durationSec={turn.duration_sec}
                    />
                  </div>

                  {/* Translated Audio Turn */}
                  <div className="p-4 rounded-2xl border-[2px] border-black bg-[#fffdf8] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-[#1a1a1a] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                        Translated Synthesis ({turn.target_language})
                      </span>
                      <span className="text-[11px] font-mono font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-600">
                        Neural TTS
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-[#1a1a1a] leading-relaxed bg-white p-3 rounded-xl border border-black/20 min-h-[50px]">
                      {turn.translation || <span className="italic text-gray-400">Processing synthesis...</span>}
                    </p>

                    <AudioPlayer
                      label="Synthesized Speech"
                      audioUrl={turn.translated_audio_url}
                      text={turn.translation}
                      lang={turn.target_language.slice(0, 2)}
                      durationSec={turn.duration_sec}
                    />
                  </div>
                </div>

                {/* Per-stage latency badge breakdown */}
                {turn.timings && (
                  <div className="pt-2 flex flex-wrap items-center gap-3 text-[11px] font-mono font-bold text-gray-700 border-t border-black/10">
                    <span className="text-gray-500">Stage Timings:</span>
                    <span>STT: <strong className="text-black font-black">{(turn.timings as any).stt_ms}ms</strong></span>
                    <span>·</span>
                    <span>Translate: <strong className="text-black font-black">{turn.timings.translate_ms}ms</strong></span>
                    <span>·</span>
                    <span>Synthesize: <strong className="text-black font-black">{turn.timings.synthesize_ms}ms</strong></span>
                    <span>·</span>
                    <span className="bg-[#ffc86b] px-2 py-0.5 rounded border border-black text-black font-black">
                      Total: {turn.timings.total_ms}ms
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
