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
      <div className="h-64 flex items-center justify-center border-[2px] border-dashed border-black rounded-2xl bg-[#f9f6f0]">
        <p className="text-sm font-bold text-gray-500">No job history available</p>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.count), 50);
  const chartHeight = 180;

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Tooltip Header */}
      <div className="h-7 flex items-center justify-between text-xs">
        {hoveredIdx !== null ? (
          <div className="flex items-center gap-3">
            <span className="font-black px-2 py-0.5 rounded border border-black bg-white">
              {data[hoveredIdx].date}
            </span>
            <span className="font-bold text-gray-800">
              Total: <strong className="text-black font-black">{data[hoveredIdx].count}</strong>
            </span>
            <span className="font-bold text-rose-700">
              Failed: <strong className="font-black">{data[hoveredIdx].failed}</strong>
            </span>
          </div>
        ) : (
          <span className="text-gray-500 font-semibold italic">Hover over bars for daily breakdown</span>
        )}
        <div className="flex items-center gap-3 font-bold">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 border border-black bg-[#ffc86b] rounded-sm inline-block" />
            Completed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 border border-black bg-[#ef4444] rounded-sm inline-block" />
            Failed
          </span>
        </div>
      </div>

      {/* SVG Bar Chart with Neo-brutalist ink grid */}
      <div className="relative border-[3px] border-black rounded-2xl p-4 bg-[#f9f6f0]">
        <svg
          viewBox={`0 0 ${data.length * 24} ${chartHeight}`}
          className="w-full h-48 overflow-visible"
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
              stroke="#000000"
              strokeDasharray="4 4"
              strokeWidth="1"
              opacity="0.15"
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
                  fill={isHovered ? '#f4b942' : '#ffc86b'}
                  stroke="#000000"
                  strokeWidth="2"
                />
                {/* Failed overlay bar */}
                {failH > 0 && (
                  <rect
                    x={x}
                    y={chartHeight - failH}
                    width="16"
                    height={Math.max(2, failH)}
                    rx="2"
                    fill="#ef4444"
                    stroke="#000000"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* X-axis labels */}
        <div className="flex justify-between mt-2 pt-2 border-t-[2px] border-black/20 text-[10px] font-black text-gray-700 uppercase">
          <span>{data[0]?.date}</span>
          <span>{data[Math.floor(data.length / 2)]?.date}</span>
          <span>{data[data.length - 1]?.date}</span>
        </div>
      </div>
    </div>
  );
};
