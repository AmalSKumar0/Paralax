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
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-[#edeae4] text-[#736154] flex items-center justify-center font-semibold text-[10px]">
                {idx + 1}
              </span>
              <span className="font-semibold text-[#2b1d16]">{item.pair}</span>
            </span>
            <span className="flex items-center gap-2 font-mono">
              <span className="text-[#8a776a] text-[11px]">{item.count.toLocaleString()} jobs</span>
              <span className="font-semibold text-[11px] px-1.5 py-0.5 rounded-full border border-[#e9b140]/40 bg-[#fcf8ee] text-[#855b14]">
                {item.percentage}%
              </span>
            </span>
          </div>

          <div className="h-2 w-full bg-[#edeae4] rounded-full border border-[#ded7cc] overflow-hidden relative">
            <div
              className="h-full bg-[#e9b140] transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(100, Math.max(5, item.percentage))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
