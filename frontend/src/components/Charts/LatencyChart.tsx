import React from 'react';
import { LatencyMetric } from '../../types';

interface LatencyData {
  total: LatencyMetric;
  transcribe: LatencyMetric;
  translate: LatencyMetric;
  synthesize: LatencyMetric;
}

export const LatencyChart: React.FC<{ data: LatencyData }> = ({ data }) => {
  const stages = [
    { key: 'total', label: 'End-to-End Total', p50: data.total.p50, p95: data.total.p95 },
    { key: 'transcribe', label: '1. Transcribe (STT)', p50: data.transcribe.p50, p95: data.transcribe.p95 },
    { key: 'translate', label: '2. Translate', p50: data.translate.p50, p95: data.translate.p95 },
    { key: 'synthesize', label: '3. Synthesize (TTS)', p50: data.synthesize.p50, p95: data.synthesize.p95 },
  ];

  const maxVal = Math.max(...stages.map((s) => s.p95), 400);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-4 text-xs font-bold">
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 border-2 border-black bg-[#ffc86b] rounded-sm inline-block shadow-[1px_1px_0px_#000]" />
          p50 (Median)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 border-2 border-black bg-[#1a1a1a] rounded-sm inline-block shadow-[1px_1px_0px_#ffc86b]" />
          p95 (Tail)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stages.map((st) => {
          const p50H = Math.max(12, (st.p50 / maxVal) * 110);
          const p95H = Math.max(16, (st.p95 / maxVal) * 110);

          return (
            <div
              key={st.key}
              className="p-4 rounded-2xl border-[3px] border-black bg-[#f9f6f0] flex flex-col justify-between shadow-[4px_4px_0px_0px_#000]"
            >
              <div>
                <span className="text-xs font-extrabold uppercase tracking-wide text-gray-800">
                  {st.label}
                </span>
                <div className="flex flex-col gap-0.5 mt-2 pt-2 border-t-[2px] border-black/15 text-xs font-mono font-bold">
                  <div className="flex justify-between">
                    <span className="text-gray-600">p50:</span>
                    <strong className="text-black font-black">{st.p50} ms</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">p95:</span>
                    <strong className="text-black font-black">{st.p95} ms</strong>
                  </div>
                </div>
              </div>

              {/* Bar visualization */}
              <div className="mt-4 pt-2 flex items-end justify-center gap-4 h-32 border-b-[2px] border-black pb-1">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-mono font-black">{st.p50}ms</span>
                  <div
                    className="w-9 bg-[#ffc86b] border-[2px] border-black rounded-t-md shadow-[2px_0px_0px_0px_#000]"
                    style={{ height: `${p50H}px` }}
                  />
                  <span className="text-[10px] font-bold text-gray-600">p50</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-mono font-black">{st.p95}ms</span>
                  <div
                    className="w-9 bg-[#1a1a1a] border-[2px] border-black rounded-t-md shadow-[2px_0px_0px_0px_#ffc86b]"
                    style={{ height: `${p95H}px` }}
                  />
                  <span className="text-[10px] font-bold text-gray-600">p95</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
