import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../services/api';
import { AdminStats } from '../types';
import { Topbar } from '../components/Layout/Topbar';
import { StatCard } from '../components/Common/StatCard';
import { Card } from '../components/Common/Card';
import { JobsPerDayChart } from '../components/Charts/JobsPerDayChart';
import { TopLanguagePairsChart } from '../components/Charts/TopLanguagePairsChart';
import { LatencyChart } from '../components/Charts/LatencyChart';
import { Cpu, Mic, Activity, AlertOctagon, Clock, Gauge } from 'lucide-react';
import { formatLatency } from '../utils/formatters';

export const Overview: React.FC = () => {
  const { onToggleMobileNav } = useOutletContext<{ onToggleMobileNav?: () => void }>() || {};
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStats = useCallback(async (isManual: boolean = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const data = await api.getStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (isLoading || !stats) {
    return (
      <div className="flex-1 flex flex-col">
        <Topbar title="Service Overview" subtitle="System metrics & real-time translator fleet health" onToggleMobileNav={onToggleMobileNav} />
        <div className="p-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-32 bg-white border border-[#ded7cc] rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col pb-12">
      <Topbar
        title="Service Overview"
        subtitle="System metrics, real-time translator fleet health & cloud latency"
        onRefresh={() => fetchStats(true)}
        isRefreshing={isRefreshing}
        onToggleMobileNav={onToggleMobileNav}
      />

      <div className="p-6 md:p-8 space-y-6 w-full">
        {/* KPI Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            label="Devices Online"
            value={`${stats.devices_online} / ${stats.devices_total}`}
            subValue={`${Math.round((stats.devices_online / Math.max(1, stats.devices_total)) * 100)}% fleet operational`}
            icon={<Cpu className="w-5 h-5 text-[#855b14]" />}
            badge={stats.devices_online === stats.devices_total ? '100%' : undefined}
          />
          <StatCard
            label="Utterances Today"
            value={stats.utterances_today.toLocaleString()}
            subValue="Spoken voice turns recorded"
            icon={<Mic className="w-5 h-5 text-[#855b14]" />}
            variant="accent"
          />
          <StatCard
            label="Jobs in Progress"
            value={stats.jobs_in_progress}
            subValue="Active audio pipeline tasks"
            icon={<Activity className="w-5 h-5 text-[#855b14]" />}
            variant={stats.jobs_in_progress > 0 ? 'warning' : 'default'}
          />
          <StatCard
            label="Failure Rate"
            value={`${stats.failure_rate}%`}
            subValue="Target SLA: < 2.0%"
            icon={<AlertOctagon className="w-5 h-5 text-[#855b14]" />}
            variant={stats.failure_rate > 2.5 ? 'danger' : 'default'}
          />
          <StatCard
            label="Total Audio Minutes"
            value={`${stats.total_audio_minutes.toLocaleString()}m`}
            subValue="Processed audio duration"
            icon={<Clock className="w-5 h-5 text-[#855b14]" />}
          />
        </div>

        {/* Latency Card & Chart */}
        <Card variant="light" className="space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b-2 border-[#121212] gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-[#121212]" />
                <h2 className="text-base font-bold text-[#121212] tracking-tight">
                  Cloud Latency Profile (p50 & p95)
                </h2>
              </div>
              <p className="text-xs text-[#555555] mt-0.5">
                End-to-end speech ingestion, Groq Whisper STT, Groq/xAI Translation, and Edge TTS breakdown
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-1 rounded-md border-2 border-[#121212] bg-[#fef08a] text-[#121212] shadow-[1.5px_1.5px_0px_#121212]">
                Total p50: {formatLatency(stats.latency.total.p50)}
              </span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-md border-2 border-[#121212] bg-[#121212] text-white shadow-[1.5px_1.5px_0px_#121212]">
                Total p95: {formatLatency(stats.latency.total.p95)}
              </span>
            </div>
          </div>

          <LatencyChart data={stats.latency} />
        </Card>

        {/* 30-Day Jobs Chart & Top Language Pairs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card variant="light" className="space-y-4">
              <div className="pb-4 border-b-2 border-[#121212]">
                <h2 className="text-base font-bold text-[#121212] tracking-tight">
                  Jobs Volume (Last 30 Days)
                </h2>
                <p className="text-xs text-[#555555] mt-0.5">
                  Daily processed voice utterances and batch audio file translation requests
                </p>
              </div>
              <JobsPerDayChart data={stats.jobs_per_day} />
            </Card>
          </div>

          <div>
            <Card variant="sand" className="space-y-4 h-full flex flex-col justify-between">
              <div>
                <div className="pb-4 border-b-2 border-[#121212]">
                  <h2 className="text-base font-bold text-[#121212] tracking-tight">
                    Top Language Pairs
                  </h2>
                  <p className="text-xs text-[#555555] mt-0.5">
                    Highest volume translation routes across the network
                  </p>
                </div>
                <div className="mt-4">
                  <TopLanguagePairsChart pairs={stats.top_language_pairs} />
                </div>
              </div>

              <div className="mt-6 p-3.5 rounded-xl border-2 border-[#121212] bg-white shadow-[2px_2px_0px_#121212]">
                <span className="text-[11px] font-bold uppercase text-[#121212] block mb-1">
                  Language ID Threshold
                </span>
                <p className="text-xs font-medium text-[#444444]">
                  Auto-detect confidence gate set at 85%. Review configurations in Settings.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
