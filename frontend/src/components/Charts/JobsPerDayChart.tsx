import React, { useState } from 'react';

export interface DailyJobPoint {
  date: string;
  count: number;
  failed: number;
}

export const JobsPerDayChart: React.FC<{ data: DailyJobPoint[] }> = ({ data }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="h-60 flex items-center justify-center border border-dashed border-[#ded7cc] rounded-xl bg-[#f7f5f0]">
        <p className="text-xs text-[#8a776a]">No job history available</p>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.count), 50);
  const chartHeight = 160;

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Tooltip Header */}
      <div className="h-7 flex items-center justify-between text-xs">
        {hoveredIdx !== null ? (
          <div className="flex items-center gap-3">
            <span className="font-bold px-2 py-0.5 rounded-md border-2 border-[#121212] bg-[#fef08a] text-[#121212] shadow-[1px_1px_0px_#121212]">
              {data[hoveredIdx].date}
            </span>
            <span className="text-[#121212] font-semibold">
              Total: <strong className="text-[#121212] font-black">{data[hoveredIdx].count}</strong>
            </span>
            <span className="text-rose-700 font-semibold">
              Failed: <strong className="font-black">{data[hoveredIdx].failed}</strong>
            </span>
          </div>
        ) : (
          <span className="text-[#666666] font-medium text-xs">Hover over bars for daily breakdown</span>
        )}
        <div className="flex items-center gap-3 text-xs font-semibold text-[#121212]">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-[#ffc86b] border border-[#121212] rounded-xs inline-block shadow-[1px_1px_0px_#121212]" />
            Completed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-[#f87171] border border-[#121212] rounded-xs inline-block shadow-[1px_1px_0px_#121212]" />
            Failed
          </span>
        </div>
      </div>

      {/* SVG Bar Chart */}
      <div className="relative border-2 border-[#121212] rounded-xl p-4 bg-white shadow-[3px_3px_0px_#121212]">
        <svg
          viewBox={`0 0 ${data.length * 24} ${chartHeight}`}
          className="w-full h-44 overflow-visible"
          preserveAspectRatio="none"
        >
          {/* Horizontal Grid lines */}
          {[0.25, 0.5, 0.75, 1.0].map((ratio) => (
            <line
              key={ratio}
              x1="0"
              y1={chartHeight * (1 - ratio)}
              x2={data.length * 24}
              y2={chartHeight * (1 - ratio)}
              stroke="#e5e5e5"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          ))}

          {/* Bars */}
          {data.map((item, idx) => {
            const barH = (item.count / maxVal) * (chartHeight - 20);
            const failH = (item.failed / maxVal) * (chartHeight - 20);
            const x = idx * 24 + 4;
            const y = chartHeight - barH;
            const isHovered = hoveredIdx === idx;

            return (
              <g
                key={item.date}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer transition-opacity"
              >
                {/* Total bar */}
                <rect
                  x={x}
                  y={y}
                  width="16"
                  height={Math.max(4, barH)}
                  rx="3"
                  fill={isHovered ? '#ffb944' : '#ffc86b'}
                  stroke="#121212"
                  strokeWidth="1.5"
                  className="transition-colors duration-150"
                />
                {/* Failed overlay bar */}
                {failH > 0 && (
                  <rect
                    x={x}
                    y={chartHeight - failH}
                    width="16"
                    height={Math.max(2, failH)}
                    rx="2"
                    fill="#f87171"
                    stroke="#121212"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* X-axis labels */}
        <div className="flex justify-between mt-2 pt-2 border-t-2 border-[#121212] text-[10px] text-[#555555] font-mono font-bold">
          <span>{data[0]?.date}</span>
          <span>{data[Math.floor(data.length / 2)]?.date}</span>
          <span>{data[data.length - 1]?.date}</span>
        </div>
      </div>
    </div>
  );
};
