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
          <div className="h-64 bg-white border border-[#ded7cc] rounded-2xl animate-pulse" />
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
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#ded7cc]">
          <div className="flex items-center gap-3">
            <Link
              to="/conversations"
              className="p-2 rounded-xl border border-[#ded7cc] bg-white hover:bg-[#f7f5f0] text-[#736154] hover:text-[#2b1d16] transition-all cursor-pointer shadow-sm"
              aria-label="Back to conversations"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-[#2b1d16]">
                  Dialogue Turn History
                </h1>
                <Badge variant="accent" size="sm">
                  {conversation.turns.length} Turns
                </Badge>
              </div>
              <p className="text-xs text-[#736154]">
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
                className="bg-white border border-[#ded7cc] rounded-2xl p-6 shadow-sm space-y-4"
              >
                {/* Turn Header */}
                <div className="flex flex-wrap items-center justify-between pb-3 border-b border-[#ded7cc] gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full border border-[#e9b140] bg-[#e9b140]/15 font-semibold text-xs text-[#2b1d16] flex items-center justify-center">
                      {turn.turn_index || index + 1}
                    </span>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border border-[#ded7cc] bg-[#f7f5f0] text-xs font-medium text-[#2b1d16]">
                      <span>{turn.source_language}</span>
                      <span className="text-[#8a776a]">➔</span>
                      <span>{turn.target_language}</span>
                    </div>
                    {turn.detected_language && (
                      <span className="text-[11px] font-medium text-[#736154] bg-[#f7f5f0] px-2 py-0.5 rounded border border-[#ded7cc]">
                        Detected: {turn.detected_language}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono">
                    {turn.timings && (
                      <span className="px-2 py-0.5 rounded border border-[#ded7cc] bg-[#f7f5f0] text-[#736154]">
                        Latency: {formatLatency(turn.timings.total_ms)}
                      </span>
                    )}
                    <span className="text-[#8a776a]">
                      {new Date(turn.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                {/* Error Banner if turn failed */}
                {hasError && (
                  <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs font-medium text-rose-900 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-700" />
                    <span>
                      Turn Failed: {turn.error?.code || 'processing_error'} — {turn.error?.message || 'Speech recognition pipeline error'}
                    </span>
                  </div>
                )}

                {/* Side-by-side Transcripts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Original Speech Turn */}
                  <div className="p-4 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#5c4a3e]">
                        Speaker Utterance ({turn.source_language})
                      </span>
                      <span className="text-[11px] font-mono text-[#8a776a]">
                        {turn.duration_sec ? `${turn.duration_sec.toFixed(1)}s` : 'Audio'}
                      </span>
                    </div>

                    <p className="text-sm text-[#2b1d16] leading-relaxed bg-white p-3 rounded-lg border border-[#ded7cc] min-h-[50px]">
                      {turn.transcript || <span className="italic text-[#8a776a]">No transcript captured</span>}
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
                  <div className="p-4 rounded-xl border border-[#ded7cc] bg-[#fffdf8] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#5c4a3e] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Translated Synthesis ({turn.target_language})
                      </span>
                      <span className="text-[11px] font-mono font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Neural TTS
                      </span>
                    </div>

                    <p className="text-sm text-[#2b1d16] leading-relaxed bg-white p-3 rounded-lg border border-[#ded7cc] min-h-[50px]">
                      {turn.translation || <span className="italic text-[#8a776a]">Processing synthesis...</span>}
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
                  <div className="pt-2 flex flex-wrap items-center gap-2.5 text-[11px] font-mono text-[#736154] border-t border-[#ded7cc]">
                    <span className="text-[#8a776a]">Stage Timings:</span>
                    <span>STT: <strong className="text-[#2b1d16]">{(turn.timings as any).stt_ms}ms</strong></span>
                    <span>·</span>
                    <span>Translate: <strong className="text-[#2b1d16]">{turn.timings.translate_ms}ms</strong></span>
                    <span>·</span>
                    <span>Synthesize: <strong className="text-[#2b1d16]">{turn.timings.synthesize_ms}ms</strong></span>
                    <span>·</span>
                    <span className="bg-[#e9b140]/15 px-2 py-0.5 rounded border border-[#e9b140]/30 text-[#2b1d16] font-medium">
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
