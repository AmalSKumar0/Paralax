import React from 'react';

export interface TopPair {
  pair: string;
  count: number;
  percentage: number;
}

export const TopLanguagePairsChart: React.FC<{ pairs: TopPair[] }> = ({ pairs }) => {
  return (
    <div className="space-y-4">
      {pairs.map((item, idx) => (
        <div key={item.pair} className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-md border-2 border-[#121212] bg-[#f8f6f0] text-[#121212] flex items-center justify-center font-black text-[10px] shadow-[1px_1px_0px_#121212]">
                {idx + 1}
              </span>
              <span className="font-bold text-[#121212]">{item.pair}</span>
            </span>
            <span className="flex items-center gap-2 font-mono">
              <span className="text-[#555555] text-[11px] font-bold">{item.count.toLocaleString()} jobs</span>
              <span className="font-bold text-[11px] px-2 py-0.5 rounded-md border-2 border-[#121212] bg-[#fef08a] text-[#121212] shadow-[1px_1px_0px_#121212]">
                {item.percentage}%
              </span>
            </span>
          </div>

          <div className="h-2.5 w-full bg-white rounded-full border-2 border-[#121212] overflow-hidden relative shadow-[1px_1px_0px_#121212]">
            <div
              className="h-full bg-[#ffc86b] transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(5, item.percentage))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
