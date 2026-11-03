import React from 'react';
import { LatencyMetric } from '../../types';

interface LatencyData {
  total: LatencyMetric;
  stt: LatencyMetric;
  translate: LatencyMetric;
  synthesize: LatencyMetric;
}

export const LatencyChart: React.FC<{ data: LatencyData }> = ({ data }) => {
  const stages = [
    { key: 'total', label: 'End-to-End Total', p50: data.total.p50, p95: data.total.p95 },
    { key: 'stt', label: '1. STT Speech-to-Text', p50: data.stt.p50, p95: data.stt.p95 },
    { key: 'translate', label: '2. Translate', p50: data.translate.p50, p95: data.translate.p95 },
    { key: 'synthesize', label: '3. Synthesize (TTS)', p50: data.synthesize.p50, p95: data.synthesize.p95 },
  ];

  const maxVal = Math.max(...stages.map((s) => s.p95), 400);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-4 text-xs font-bold text-[#121212]">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-[#ffc86b] border border-[#121212] rounded-xs inline-block shadow-[1px_1px_0px_#121212]" />
          p50 (Median)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-[#121212] border border-[#121212] rounded-xs inline-block shadow-[1px_1px_0px_#121212]" />
          p95 (Tail)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stages.map((st) => {
          const p50H = Math.max(12, (st.p50 / maxVal) * 100);
          const p95H = Math.max(16, (st.p95 / maxVal) * 100);

          return (
            <div
              key={st.key}
              className="p-4 rounded-xl border-2 border-[#121212] bg-[#fffdfa] shadow-[3px_3px_0px_#121212] flex flex-col justify-between"
            >
              <div>
                <span className="text-xs font-bold text-[#121212]">
                  {st.label}
                </span>
                <div className="flex flex-col gap-1 mt-2 pt-2 border-t-2 border-[#121212] text-xs font-mono font-bold">
                  <div className="flex justify-between">
                    <span className="text-[#555555]">p50:</span>
                    <strong className="text-[#121212] font-black">{st.p50} ms</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#555555]">p95:</span>
                    <strong className="text-[#121212] font-black">{st.p95} ms</strong>
                  </div>
                </div>
              </div>

              {/* Bar visualization */}
              <div className="mt-4 pt-2 flex items-end justify-center gap-4 h-28 border-b-2 border-[#121212] pb-1">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-mono font-bold text-[#121212]">{st.p50}ms</span>
                  <div
                    className="w-7 bg-[#ffc86b] border-2 border-b-0 border-[#121212] rounded-t-sm transition-all duration-300"
                    style={{ height: `${p50H}px` }}
                  />
                  <span className="text-[10px] font-bold text-[#555555]">p50</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-mono font-bold text-[#121212]">{st.p95}ms</span>
                  <div
                    className="w-7 bg-[#121212] border-2 border-b-0 border-[#121212] rounded-t-sm transition-all duration-300"
                    style={{ height: `${p95H}px` }}
                  />
                  <span className="text-[10px] font-bold text-[#555555]">p95</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
