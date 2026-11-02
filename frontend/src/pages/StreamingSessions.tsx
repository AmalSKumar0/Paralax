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
        <Card variant="light" className="text-center p-12 space-y-4">
          <div className="w-14 h-14 rounded-2xl border border-[#ded7cc] bg-[#f7f5f0] flex items-center justify-center mx-auto shadow-sm">
            <Radio className="w-6 h-6 text-[#e9b140]" />
          </div>

          <div className="inline-block">
            <Badge variant="warning" size="md">
              Beta / Under Development
            </Badge>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-[#2b1d16]">
            Streaming is not available yet
          </h2>

          <p className="text-sm font-normal text-[#5c4a3e] max-w-md mx-auto leading-relaxed">
            Real-time sub-second WebSocket audio streaming sessions with continuous chunked bidirectional translation are currently in closed beta testing for next-generation hardware.
          </p>

          <div className="pt-2 flex items-center justify-center gap-2 text-xs font-mono text-[#8a776a]">
            <Clock className="w-4 h-4 text-[#736154]" />
            <span>Target release: v2.6.0 Firmware & Cloud Gateway</span>
          </div>
        </Card>
      </div>
    </div>
  );
};
