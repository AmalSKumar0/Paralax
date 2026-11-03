import React, { useState } from 'react';
import { TelemetrySample, TelemetryMetricType } from '../../types';
import { formatBytes, formatDuration } from '../../utils/formatters';

interface TelemetryChartProps {
  samples: TelemetrySample[];
  metric: TelemetryMetricType;
  onMetricChange: (metric: TelemetryMetricType) => void;
  timeRange: '1h' | '6h' | '24h' | '7d';
  onRangeChange: (range: '1h' | '6h' | '24h' | '7d') => void;
}

export const TelemetryChart: React.FC<TelemetryChartProps> = ({
  samples,
  metric,
  onMetricChange,
  timeRange,
  onRangeChange,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!samples || samples.length === 0) {
    return (
      <div className="h-60 flex items-center justify-center border border-dashed border-[#ded7cc] rounded-xl bg-[#f7f5f0]">
        <p className="text-xs text-[#8a776a]">No telemetry data recorded for this window</p>
      </div>
    );
  }

  const values = samples.map((s) => (s[metric] !== undefined ? (s[metric] as number) : 0));
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal === 0 ? 1 : maxVal - minVal;

  const chartW = 600;
  const chartH = 150;
  const pad = 10;

  const points = samples.map((s, idx) => {
    const val = s[metric] !== undefined ? (s[metric] as number) : 0;
    const x = pad + (idx / Math.max(1, samples.length - 1)) * (chartW - pad * 2);
    const normalized = (val - minVal) / range;
    const y = chartH - pad - normalized * (chartH - pad * 2);
    return { x, y, sample: s };
  });

  const polylineStr = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPath = `M ${points[0].x},${chartH} L ${polylineStr.replace(/ /g, ' L ')} L ${points[points.length - 1].x},${chartH} Z`;

  const formatDisplayVal = (sample: TelemetrySample) => {
    if (!sample) return '';
    if (metric === 'rssi') return `${sample.rssi} dBm`;
    if (metric === 'audio_level') return `${sample.audio_level ?? 0}% Signal`;
    if (metric === 'battery_pct') return `${sample.battery_pct}%`;
    if (metric === 'free_heap') return formatBytes(sample.free_heap);
    return formatDuration(sample.uptime_sec);
  };

  return (
    <div className="space-y-4">
      {/* Controls header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Metric picker tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#edeae4] rounded-xl border border-[#ded7cc]">
          {(
            [
              { key: 'rssi', label: 'Signal (RSSI)' },
              { key: 'audio_level', label: 'Mic Signal' },
              { key: 'battery_pct', label: 'Battery' },
              { key: 'free_heap', label: 'Free Heap' },
              { key: 'uptime_sec', label: 'Uptime' },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              onClick={() => onMetricChange(m.key)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                metric === m.key
                  ? 'bg-[#2b1d16] text-[#edeae4] shadow-xs'
                  : 'text-[#736154] hover:text-[#2b1d16]'
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
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                timeRange === r
                  ? 'bg-[#e9b140] text-[#2b1d16] border-[#d89e2c]'
                  : 'bg-white text-[#736154] border-[#ded7cc] hover:bg-[#edeae4]'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Hover Readout */}
      <div className="h-6 flex items-center justify-between text-xs">
        <span>
          {hoveredIdx !== null ? (
            <span className="flex items-center gap-2">
              <span className="text-[#8a776a]">{new Date(samples[hoveredIdx].ts).toLocaleTimeString()}</span>
              <span className="font-semibold px-2 py-0.5 rounded-full border border-[#e9b140]/40 bg-[#fcf8ee] text-[#855b14]">
                {formatDisplayVal(samples[hoveredIdx])}
              </span>
            </span>
          ) : (
            <span className="text-[#8a776a]">Latest: {formatDisplayVal(samples[samples.length - 1])}</span>
          )}
        </span>
        <span className="text-[#8a776a] font-mono text-[11px]">
          Min: {metric === 'free_heap' ? formatBytes(minVal) : minVal} · Max: {metric === 'free_heap' ? formatBytes(maxVal) : maxVal}
        </span>
      </div>

      {/* SVG Line / Area Graph */}
      <div className="border border-[#ded7cc] rounded-xl p-4 bg-white shadow-xs relative">
        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          className="w-full h-40 overflow-visible"
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
              stroke="#ded7cc"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          ))}

          {/* Fill under line */}
          <path d={areaPath} fill="#e9b140" fillOpacity="0.12" />

          {/* Stroke path */}
          <polyline
            points={polylineStr}
            fill="none"
            stroke="#2b1d16"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive node hover spots */}
          {points.map((p, idx) => (
            <circle
              key={idx}
              cx={p.x}
              cy={p.y}
              r={hoveredIdx === idx ? 5 : 2.5}
              fill={hoveredIdx === idx ? '#e9b140' : '#2b1d16'}
              stroke="#ffffff"
              strokeWidth="1.5"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer transition-all"
            />
          ))}
        </svg>

        <div className="flex justify-between mt-2 pt-2 border-t border-[#ded7cc] text-[10px] text-[#8a776a] font-mono uppercase">
          <span>{new Date(samples[0].ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <span>{timeRange} window</span>
          <span>{new Date(samples[samples.length - 1].ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
    </div>
  );
};
