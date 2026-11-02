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
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full border border-black bg-white flex items-center justify-center font-black text-[10px]">
                {idx + 1}
              </span>
              <span className="font-extrabold text-[#1a1a1a]">{item.pair}</span>
            </span>
            <span className="flex items-center gap-2 font-mono">
              <span className="text-gray-600">{item.count.toLocaleString()} jobs</span>
              <span className="font-black px-1.5 py-0.5 rounded border border-black bg-[#ffc86b]">
                {item.percentage}%
              </span>
            </span>
          </div>

          <div className="h-4 w-full bg-[#f0ece1] rounded-full border-[2px] border-black overflow-hidden relative shadow-[2px_2px_0px_0px_#000]">
            <div
              className="h-full bg-[#ffc86b] border-r-[2px] border-black transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(5, item.percentage))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
