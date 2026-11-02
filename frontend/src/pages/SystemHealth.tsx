import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link, useOutletContext } from 'react-router-dom';
import { api } from '../services/api';
import { SystemHealth as SystemHealthType, ServiceHealthItem, Device, ApiJob } from '../types';
import { Topbar } from '../components/Layout/Topbar';
import { Card } from '../components/Common/Card';
import { Button } from '../components/Common/Button';
import { Badge } from '../components/Common/Badge';
import { useToast } from '../context/ToastContext';
import { formatRelativeTime, formatDateTime } from '../utils/formatters';
import { formatApiError } from '../utils/errors';
import {
  HeartPulse,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Cpu,
  Activity,
  ChevronRight,
  ShieldCheck,
  Server,
} from 'lucide-react';

export const SystemHealth: React.FC = () => {
  const { onToggleMobileNav } = useOutletContext<{ onToggleMobileNav?: () => void }>() || {};
  const navigate = useNavigate();
  const { success, error } = useToast();

  const [healthData, setHealthData] = useState<SystemHealthType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRechecking, setIsRechecking] = useState(false);

  const fetchHealth = useCallback(async (isManual: boolean = false) => {
    if (isManual) setIsRechecking(true);
    try {
      const data = await api.getHealth();
      setHealthData(data);
      if (isManual) success('Cloud infrastructure health re-checked');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve system health';
      error(msg);
    } finally {
      setIsLoading(false);
      setIsRechecking(false);
    }
  }, [success, error]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  if (isLoading || !healthData) {
    return (
      <div className="flex-1 flex flex-col">
        <Topbar title="System Health" subtitle="Checking cloud infrastructure services..." onToggleMobileNav={onToggleMobileNav} />
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

  const getServiceStatusIcon = (status: ServiceHealthItem['status']) => {
    if (status === 'healthy') return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
    if (status === 'degraded') return <AlertTriangle className="w-5 h-5 text-amber-600" />;
    return <XCircle className="w-5 h-5 text-rose-600" />;
  };

  return (
    <div className="flex-1 flex flex-col pb-16">
      <Topbar
        title="System Health"
        subtitle="AI provider health, database connections, and hardware diagnostics"
        onRefresh={() => fetchHealth(true)}
        isRefreshing={isRechecking}
        onToggleMobileNav={onToggleMobileNav}
      />

      <div className="p-6 md:p-8 space-y-6 w-full">
        {/* Core Cloud Services Health Header & Re-check Button */}
        <Card variant="light" className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-[#ded7cc] gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-[#e9b140]" />
                <h2 className="text-lg font-bold text-[#2b1d16]">
                  Upstream Cloud Subsystems
                </h2>
              </div>
              <p className="text-xs text-[#736154]">
                Live health verification of Groq, xAI, Edge TTS, Upstash Redis, and Neon Postgres
              </p>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => fetchHealth(true)}
              isLoading={isRechecking}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${isRechecking ? 'animate-spin' : ''}`} />}
            >
              Re-check Health
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {healthData.services.map((svc) => (
              <div
                key={svc.name}
                className="p-4 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] flex flex-col justify-between shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold uppercase text-[#2b1d16] tracking-wide leading-snug">
                    {svc.name}
                  </span>
                  {getServiceStatusIcon(svc.status)}
                </div>

                <div className="mt-4 pt-2 border-t border-[#ded7cc]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#736154]">Status:</span>
                    <Badge variant={svc.status === 'healthy' ? 'success' : 'danger'} size="sm">
                      {svc.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#8a776a] mt-1">
                    <span>Latency:</span>
                    <span>{svc.latency_ms} ms</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Two Columns: Offline Devices Watch & Last 20 Failed Jobs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Offline Devices Watch */}
          <Card variant="light" className="space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-[#ded7cc]">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-[#e9b140]" />
                  <h3 className="text-base font-bold text-[#2b1d16]">
                    Offline Devices Watch ({healthData.offline_devices.length})
                  </h3>
                </div>
                <span className="text-xs font-mono text-[#736154]">
                  Fleet Monitor
                </span>
              </div>

              {healthData.offline_devices.length === 0 ? (
                <div className="py-8 text-center bg-[#f7f5f0] rounded-xl border border-[#ded7cc] p-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-1" />
                  <p className="text-xs font-semibold text-[#2b1d16]">All Translator Devices are Online</p>
                  <p className="text-[11px] text-[#8a776a]">Zero heartbeat dropouts detected.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {healthData.offline_devices.map((dev) => (
                    <div
                      key={dev.device_id}
                      onClick={() => navigate(`/devices/${dev.device_id}`)}
                      className="p-3.5 rounded-xl border border-[#ded7cc] bg-white flex items-center justify-between shadow-sm hover:border-[#e9b140] cursor-pointer transition-colors group"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[#2b1d16]">
                            {dev.name}
                          </span>
                          <span className="font-mono text-[10px] text-[#8a776a]">
                            {dev.device_id}
                          </span>
                        </div>
                        <p className="text-[11px] text-rose-800 mt-0.5">
                          Unreachable since {formatDateTime(dev.last_seen)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 text-xs text-[#736154] group-hover:text-[#2b1d16] transition-colors">
                        <span>Details</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#ded7cc] text-xs text-[#736154]">
              Hardware heartbeat timeout threshold is 3x device interval.
            </div>
          </Card>

          {/* Last 20 Failed Jobs with Errors */}
          <Card variant="light" className="space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-[#ded7cc]">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-rose-600" />
                  <h3 className="text-base font-bold text-[#2b1d16]">
                    Last Failed Jobs ({healthData.recent_failures.length})
                  </h3>
                </div>
                <span className="text-xs font-mono text-[#736154]">
                  Error Diagnostics
                </span>
              </div>

              {healthData.recent_failures.length === 0 ? (
                <div className="py-8 text-center bg-emerald-50 rounded-xl border border-emerald-200 p-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-1" />
                  <p className="text-xs font-semibold text-emerald-950">Zero Recent Failures</p>
                  <p className="text-[11px] text-emerald-800">All recent speech translation jobs succeeded.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {healthData.recent_failures.map((job) => (
                    <div
                      key={job.job_id}
                      className="p-3.5 rounded-xl border border-rose-200 bg-white flex flex-col gap-1 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-medium text-xs text-[#2b1d16]">
                          {job.job_id}
                        </span>
                        <span className="text-[10px] font-mono text-[#8a776a]">
                          {formatRelativeTime(job.created_at)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium uppercase px-2 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-800">
                          {job.error?.code || 'error'}
                        </span>
                        <span className="text-[11px] text-[#5c4a3e] truncate">
                          {formatApiError(job.error?.code, job.error?.message)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-[#736154] pt-1 border-t border-[#ded7cc]">
                        <span>{job.source_language} ➔ {job.target_language}</span>
                        <span className="font-sans text-xs group-hover:text-[#2b1d16] transition-colors flex items-center">
                          Investigate <ChevronRight className="w-3 h-3 ml-0.5" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#ded7cc] text-xs text-[#736154]">
              Click any failure to view the audio diagnostic timeline and stage log.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
