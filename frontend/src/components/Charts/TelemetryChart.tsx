import React, { useState } from 'react';
import { TelemetrySample } from '../../types';
import { formatBytes, formatDuration } from '../../utils/formatters';

export interface TelemetryChartProps {
  samples: TelemetrySample[];
  timeRange: '1h' | '6h' | '24h' | '7d';
  onRangeChange: (range: '1h' | '6h' | '24h' | '7d') => void;
  metric: 'rssi' | 'free_heap' | 'battery_pct' | 'uptime_sec';
  onMetricChange: (metric: 'rssi' | 'free_heap' | 'battery_pct' | 'uptime_sec') => void;
}

export const TelemetryChart: React.FC<TelemetryChartProps> = ({
  samples,
  timeRange,
  onRangeChange,
  metric,
  onMetricChange,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!samples || samples.length === 0) {
    return (
      <div className="h-60 flex items-center justify-center border-[2px] border-dashed border-black rounded-2xl bg-[#f9f6f0]">
        <p className="text-sm font-bold text-gray-500">No telemetry data recorded for this period</p>
      </div>
    );
  }

  const metricMeta = {
    rssi: { label: 'Signal Strength (RSSI)', unit: 'dBm', stroke: '#ffc86b', fill: '#ffc86b' },
    free_heap: { label: 'Free Heap Memory', unit: 'Bytes', stroke: '#3b82f6', fill: '#3b82f6' },
    battery_pct: { label: 'Battery Level', unit: '%', stroke: '#4ade80', fill: '#4ade80' },
    uptime_sec: { label: 'Device Uptime', unit: 'Sec', stroke: '#f59e0b', fill: '#f59e0b' },
  }[metric];

  const values = samples.map((s) => s[metric]);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const rangeDiff = maxVal - minVal || 1;

  const chartW = 700;
  const chartH = 160;

  // Generate SVG points
  const points = samples.map((s, idx) => {
    const x = (idx / (samples.length - 1)) * chartW;
    const norm = (s[metric] - minVal) / rangeDiff;
    const y = chartH - 20 - norm * (chartH - 40);
    return { x, y, sample: s };
  });

  const polylineStr = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPath = `M 0,${chartH} L ${polylineStr} L ${chartW},${chartH} Z`;

  const formatDisplayVal = (sample: TelemetrySample) => {
    if (metric === 'free_heap') return formatBytes(sample.free_heap);
    if (metric === 'rssi') return `${sample.rssi} dBm`;
    if (metric === 'battery_pct') return `${sample.battery_pct}%`;
    return formatDuration(sample.uptime_sec);
  };

  return (
    <div className="space-y-4">
      {/* Controls header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Metric picker tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#f0ece1] rounded-full border-[2px] border-black">
          {(
            [
              { key: 'rssi', label: 'Signal (RSSI)' },
              { key: 'battery_pct', label: 'Battery' },
              { key: 'free_heap', label: 'Free Heap' },
              { key: 'uptime_sec', label: 'Uptime' },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              onClick={() => onMetricChange(m.key)}
              className={`px-3 py-1 text-xs font-black rounded-full border-2 transition-all cursor-pointer ${
                metric === m.key
                  ? 'bg-black text-white border-black shadow-[2px_2px_0px_#ffc86b]'
                  : 'bg-transparent text-gray-700 border-transparent hover:text-black'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Time range selector */}
        <div className="flex items-center gap-1.5">
          {(['1h', '6h', '24h', '7d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
              className={`px-3 py-1 text-xs font-black rounded-full border-2 transition-all cursor-pointer ${
                timeRange === r
                  ? 'bg-[#ffc86b] text-black border-black shadow-[2px_2px_0px_#000]'
                  : 'bg-white text-gray-600 border-black hover:bg-gray-100'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Hover Readout */}
      <div className="h-6 flex items-center justify-between text-xs font-bold">
        <span>
          {hoveredIdx !== null ? (
            <span className="flex items-center gap-2">
              <span className="text-gray-600">{new Date(samples[hoveredIdx].ts).toLocaleTimeString()}</span>
              <span className="font-black px-2 py-0.5 rounded border border-black bg-[#ffc86b] text-black">
                {formatDisplayVal(samples[hoveredIdx])}
              </span>
            </span>
          ) : (
            <span className="text-gray-500 font-semibold italic">Latest: {formatDisplayVal(samples[samples.length - 1])}</span>
          )}
        </span>
        <span className="text-gray-500 font-mono text-[11px]">
          Min: {metric === 'free_heap' ? formatBytes(minVal) : minVal} · Max: {metric === 'free_heap' ? formatBytes(maxVal) : maxVal}
        </span>
      </div>

      {/* SVG Line / Area Graph */}
      <div className="border-[3px] border-black rounded-2xl p-4 bg-[#fffdf8] shadow-[4px_4px_0px_0px_#000] relative">
        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          className="w-full h-44 overflow-visible"
          preserveAspectRatio="none"
        >
          {/* Horizontal grid lines */}
          {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
            <line
              key={ratio}
              x1="0"
              y1={chartH * ratio}
              x2={chartW}
              y2={chartH * ratio}
              stroke="#000000"
              strokeDasharray="4 4"
              strokeWidth="1"
              opacity="0.12"
            />
          ))}

          {/* Fill under line */}
          <path d={areaPath} fill={metricMeta.fill} fillOpacity="0.18" />

          {/* Stroke path */}
          <polyline
            points={polylineStr}
            fill="none"
            stroke="#000000"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive node hover spots */}
          {points.map((p, idx) => (
            <circle
              key={idx}
              cx={p.x}
              cy={p.y}
              r={hoveredIdx === idx ? 6 : 3}
              fill={hoveredIdx === idx ? '#ffc86b' : '#000000'}
              stroke="#000000"
              strokeWidth="2"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer transition-all"
            />
          ))}
        </svg>

        <div className="flex justify-between mt-2 pt-2 border-t-[2px] border-black/15 text-[10px] font-black text-gray-600 uppercase">
          <span>{new Date(samples[0].ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <span>{timeRange} window</span>
          <span>{new Date(samples[samples.length - 1].ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
    </div>
  );
};
