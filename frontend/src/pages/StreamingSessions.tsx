import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Topbar } from '../components/Layout/Topbar';
import { Card } from '../components/Common/Card';
import { Badge } from '../components/Common/Badge';
import { Radio, Sparkles, Clock, ShieldAlert } from 'lucide-react';

export const StreamingSessions: React.FC = () => {
  const { onToggleMobileNav } = useOutletContext<{ onToggleMobileNav?: () => void }>() || {};

  return (
    <div className="flex-1 flex flex-col pb-16">
      <Topbar
        title="Streaming Sessions"
        subtitle="Low-latency bidirectional WebSocket streaming translator pipeline"
        onToggleMobileNav={onToggleMobileNav}
      />

      <div className="p-6 md:p-8 space-y-6 max-w-[1000px]">
        <Card variant="light" className="text-center p-12 space-y-4">
          <div className="w-16 h-16 rounded-3xl border-[3px] border-black bg-[#ffc86b] flex items-center justify-center mx-auto shadow-[4px_4px_0px_#000]">
            <Radio className="w-8 h-8 text-black animate-pulse" />
          </div>

          <div className="inline-block">
            <Badge variant="warning" size="md">
              Beta / Under Development
            </Badge>
          </div>

          <h2 className="font-display text-4xl font-black text-[#1a1a1a]">
            Streaming is not available yet
          </h2>

          <p className="text-sm font-semibold text-gray-700 max-w-md mx-auto leading-relaxed">
            Real-time sub-second WebSocket audio streaming sessions with continuous chunked bidirectional translation are currently in closed beta testing for next-generation hardware.
          </p>

          <div className="pt-4 flex items-center justify-center gap-2 text-xs font-mono font-bold text-gray-500">
            <Clock className="w-4 h-4 text-black" />
            <span>Target release: v2.6.0 Firmware & Cloud Gateway</span>
          </div>
        </Card>
      </div>
    </div>
  );
};
