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

      <div className="p-6 md:p-8 space-y-6 w-full max-w-3xl mx-auto">
        <Card variant="light" className="text-center p-12 space-y-5">
          <div className="w-16 h-16 rounded-xl border-2 border-[#121212] bg-[#ffc86b] shadow-[3px_3px_0px_#121212] flex items-center justify-center mx-auto">
            <Radio className="w-7 h-7 text-[#121212]" />
          </div>

          <div className="inline-block">
            <Badge variant="warning" size="md">
              Beta / Under Development
            </Badge>
          </div>

          <h2 className="text-2xl font-black tracking-tight text-[#121212]">
            Streaming is not available yet
          </h2>

          <p className="text-sm font-medium text-[#333333] max-w-md mx-auto leading-relaxed">
            Real-time sub-second WebSocket audio streaming sessions with continuous chunked bidirectional translation are currently in closed beta testing for next-generation hardware.
          </p>

          <div className="pt-2 flex items-center justify-center">
            <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#121212] px-3.5 py-1.5 rounded-lg border-2 border-[#121212] bg-white shadow-[2px_2px_0px_#121212]">
              <Clock className="w-4 h-4 text-[#121212]" />
              <span>Target release: v2.6.0 Firmware & Cloud Gateway</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
