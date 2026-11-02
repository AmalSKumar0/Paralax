import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../services/api';
import { Device, Language } from '../../types';
import { Topbar } from '../../components/Layout/Topbar';
import { Button } from '../../components/Common/Button';
import { Badge } from '../../components/Common/Badge';
import { RegisterDeviceModal } from './RegisterDeviceModal';
import { formatRelativeTime, getRssiQuality } from '../../utils/formatters';
import { Plus, Search, Wifi, WifiOff, RefreshCw, Cpu, ChevronRight, CheckCircle2, Clock } from 'lucide-react';

export const DevicesList: React.FC = () => {
  const { onToggleMobileNav } = useOutletContext<{ onToggleMobileNav?: () => void }>() || {};
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Register modal
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  const fetchData = useCallback(async (isManual: boolean = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const [devList, langData] = await Promise.all([
        api.getDevices(),
        api.getLanguages(),
      ]);
      setDevices(devList);
      setLanguages(langData.languages);
    } catch (err) {
      console.error('Failed to load devices', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtered devices
  const filteredDevices = devices.filter((d) => {
    if (statusFilter === 'online' && !d.online) return false;
    if (statusFilter === 'offline' && d.online) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        d.device_id.toLowerCase().includes(q) ||
        d.config.language_a.toLowerCase().includes(q) ||
        d.config.language_b.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col pb-12">
      <Topbar
        title="Translator Devices"
        subtitle="Manage hardware translator fleet, remote configs, firmware & command queues"
        onRefresh={() => fetchData(true)}
        isRefreshing={isRefreshing}
        onToggleMobileNav={onToggleMobileNav}
      />

      <div className="p-6 md:p-8 space-y-6 max-w-[1400px]">
        {/* Controls Bar: Search, Status Filter & Register Device button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative min-w-[240px] sm:min-w-[280px]">
              <Search className="w-4 h-4 text-[#8a776a] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, ID or language..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-[#ded7cc] bg-white text-xs text-[#2b1d16] focus:bg-white focus:outline-none focus:border-[#e9b140] focus:ring-1 focus:ring-[#e9b140] shadow-sm transition-all placeholder:text-[#8a776a]"
              />
            </div>

            {/* Status Filter Chips */}
            <div className="flex items-center gap-1 p-1 bg-[#f7f5f0] rounded-xl border border-[#ded7cc]">
              {(['all', 'online', 'offline'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-3 py-1 text-xs font-medium uppercase rounded-lg transition-all cursor-pointer ${
                    statusFilter === filter
                      ? 'bg-[#2b1d16] text-white shadow-sm'
                      : 'bg-transparent text-[#736154] hover:text-[#2b1d16]'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="primary"
            onClick={() => setIsRegisterOpen(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            Register Device
          </Button>
        </div>

        {/* Devices Table Card */}
        <div className="bg-white border border-[#ded7cc] rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#ded7cc] bg-[#f7f5f0] text-[11px] font-semibold uppercase tracking-wider text-[#736154]">
                  <th className="py-3.5 px-5">Device</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Last Seen</th>
                  <th className="py-3.5 px-4">Signal (RSSI)</th>
                  <th className="py-3.5 px-4">Firmware</th>
                  <th className="py-3.5 px-4">Language Pair</th>
                  <th className="py-3.5 px-4">Mode</th>
                  <th className="py-3.5 px-4">Config Sync</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ded7cc] text-xs">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-[#736154]">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-[#736154]" />
                        <span>Loading devices...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredDevices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-[#736154]">
                      No matching devices found in registry.
                    </td>
                  </tr>
                ) : (
                  filteredDevices.map((device) => {
                    const rssiMeta = getRssiQuality(device.rssi);
                    const isConfigSyncPending = device.config_version > device.applied_config_version;

                    return (
                      <tr
                        key={device.device_id}
                        onClick={() => navigate(`/devices/${device.device_id}`)}
                        className="hover:bg-[#f7f5f0] transition-colors cursor-pointer group"
                      >
                        {/* Name & Device ID */}
                        <td className="py-3.5 px-5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg border border-[#ded7cc] bg-[#f7f5f0] group-hover:border-[#e9b140] flex items-center justify-center shrink-0 transition-colors">
                              <Cpu className="w-4 h-4 text-[#736154]" />
                            </div>
                            <div>
                              <span className="font-semibold text-[#2b1d16] block text-sm">
                                {device.name}
                              </span>
                              <span className="font-mono text-[11px] text-[#8a776a]">
                                {device.device_id}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          {device.online ? (
                            <Badge variant="success" size="sm" dot>
                              Online
                            </Badge>
                          ) : (
                            <Badge variant="neutral" size="sm" dot>
                              Offline
                            </Badge>
                          )}
                        </td>

                        {/* Last seen */}
                        <td className="py-3.5 px-4 text-[#736154]">
                          {formatRelativeTime(device.last_seen)}
                        </td>

                        {/* RSSI */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-mono ${rssiMeta.color}`}
                          >
                            {device.online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                            {device.rssi} dBm
                          </span>
                        </td>

                        {/* Firmware */}
                        <td className="py-3.5 px-4 font-mono text-[#5c4a3e]">
                          {device.firmware_version}
                        </td>

                        {/* Language Pair */}
                        <td className="py-3.5 px-4">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border border-[#ded7cc] bg-[#f7f5f0] text-[#2b1d16] font-medium text-[11px]">
                            <span>{device.config.language_a}</span>
                            <span className="text-[#8a776a]">↔</span>
                            <span>{device.config.language_b}</span>
                          </div>
                        </td>

                        {/* Mode */}
                        <td className="py-3.5 px-4 capitalize text-[#5c4a3e]">
                          {device.config.mode === 'auto_detect' ? 'Auto-Detect' : 'Buttons'}
                        </td>

                        {/* Config sync */}
                        <td className="py-3.5 px-4">
                          {isConfigSyncPending ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800 font-medium text-[11px] animate-pulse">
                              <Clock className="w-3 h-3" />
                              Sync Pending (v{device.applied_config_version} → v{device.config_version})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 font-medium text-[11px]">
                              <CheckCircle2 className="w-3 h-3" />
                              Up to Date (v{device.config_version})
                            </span>
                          )}
                        </td>

                        {/* Action link */}
                        <td className="py-3.5 px-4 text-right">
                          <span className="inline-flex items-center gap-1 text-xs text-[#736154] group-hover:text-[#2b1d16] transition-colors">
                            Details <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <RegisterDeviceModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        languages={languages}
        onDeviceRegistered={(newDev) => {
          setDevices((prev) => [newDev, ...prev]);
        }}
      />
    </div>
  );
};
