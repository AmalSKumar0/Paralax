import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../services/api';
import { Device, Language, TelemetrySample, DeviceCommand, DeviceConfig, CommandType } from '../../types';
import { Topbar } from '../../components/Layout/Topbar';
import { Card } from '../../components/Common/Card';
import { Button } from '../../components/Common/Button';
import { Badge } from '../../components/Common/Badge';
import { Modal } from '../../components/Common/Modal';
import { ConfirmModal } from '../../components/Common/ConfirmModal';
import { CopySnippet } from '../../components/Common/CopySnippet';
import { TelemetryChart } from '../../components/Charts/TelemetryChart';
import { useToast } from '../../context/ToastContext';
import { formatRelativeTime, formatDuration, getRssiQuality } from '../../utils/formatters';
import {
  ArrowLeft,
  Cpu,
  RefreshCw,
  Sliders,
  Terminal,
  RotateCw,
  Trash2,
  ShieldAlert,
  Zap,
  CheckCircle2,
  Clock,
  AlertCircle,
  Radio,
  Battery,
  HardDrive,
  MessagesSquare,
} from 'lucide-react';

export const DeviceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error, warning } = useToast();

  const [device, setDevice] = useState<Device | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetrySample[]>([]);
  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Telemetry chart state
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [metric, setMetric] = useState<'rssi' | 'free_heap' | 'battery_pct' | 'uptime_sec'>('rssi');

  // Config editor state
  const [formConfig, setFormConfig] = useState<DeviceConfig | null>(null);
  const [isConfigSaving, setIsConfigSaving] = useState(false);

  // Destructive / Action Confirmation Modals
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'reboot' | 'revoke' | 'delete';
    title: string;
    message: string;
  }>({ isOpen: false, type: 'reboot', title: '', message: '' });

  // Key rotation dialog
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);

  const loadDeviceData = useCallback(
    async (isManual: boolean = false) => {
      if (!id) return;
      if (isManual) setIsRefreshing(true);
      try {
        const [dev, langData, telemData, cmdData] = await Promise.all([
          api.getDevice(id),
          api.getLanguages(),
          api.getDeviceTelemetry(id, timeRange),
          api.getDeviceCommands(id),
        ]);
        setDevice(dev);
        setLanguages(langData.languages);
        setTelemetry(telemData.samples);
        setCommands(cmdData);

        // Initialize form config if not yet set or not dirty
        setFormConfig((prev) => prev || { ...dev.config });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load device';
        error(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [id, timeRange, error]
  );

  useEffect(() => {
    loadDeviceData();
  }, [loadDeviceData]);

  // Check if config has unsaved changes
  const hasUnsavedChanges =
    device && formConfig
      ? JSON.stringify(device.config) !== JSON.stringify(formConfig)
      : false;

  // Language pair validation
  const selectedLangAObj = languages.find((l) => l.code === formConfig?.language_a);
  const selectedLangBObj = languages.find((l) => l.code === formConfig?.language_b);
  const isValidPair =
    selectedLangAObj && formConfig?.language_b
      ? selectedLangAObj.valid_targets.includes(formConfig.language_b)
      : true;

  const handleConfigChange = <K extends keyof DeviceConfig>(field: K, value: DeviceConfig[K]) => {
    if (!formConfig) return;
    setFormConfig({ ...formConfig, [field]: value });
  };

  const handleSaveConfig = async () => {
    if (!id || !formConfig || !device) return;
    if (!isValidPair) {
      error(`Language pair ${formConfig.language_a} ↔ ${formConfig.language_b} is unsupported.`);
      return;
    }

    setIsConfigSaving(true);
    try {
      const updated = await api.updateDeviceConfig(id, formConfig);
      setDevice((prev) => (prev ? { ...prev, config: updated, config_version: prev.config_version + 1 } : prev));
      success('Device configuration saved. Pending sync to hardware.');
      // Refresh command history
      const cmds = await api.getDeviceCommands(id);
      setCommands(cmds);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update config';
      error(msg);
    } finally {
      setIsConfigSaving(false);
    }
  };

  const handleResetConfig = () => {
    if (device) {
      setFormConfig({ ...device.config });
      success('Configuration reset to current deployed settings');
    }
  };

  const handleSendCommand = async (type: CommandType) => {
    if (!id) return;
    try {
      const cmd = await api.sendDeviceCommand(id, type);
      setCommands((prev) => [cmd, ...prev]);
      success(`Command '${type}' queued for transmission`);
      // Reload commands after delay to show delivery status
      setTimeout(async () => {
        const cmds = await api.getDeviceCommands(id);
        setCommands(cmds);
      }, 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Command dispatch failed';
      error(msg);
    }
  };

  const handleRotateKey = async () => {
    if (!id) return;
    try {
      const res = await api.rotateDeviceKey(id);
      setRotatedKey(res.device_key);
      success('Device security key rotated successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Key rotation failed';
      error(msg);
    }
  };

  const handleExecuteDestructiveAction = async () => {
    if (!id) return;
    const { type } = confirmModal;
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));

    try {
      if (type === 'reboot') {
        await handleSendCommand('reboot');
      } else if (type === 'revoke') {
        await api.revokeDevice(id);
        setDevice((prev) => (prev ? { ...prev, online: false } : null));
        warning('Device credentials revoked. Unit is now offline.');
      } else if (type === 'delete') {
        await api.deleteDevice(id);
        success('Device deleted from registry');
        navigate('/devices');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Operation failed';
      error(msg);
    }
  };

  if (isLoading || !device || !formConfig) {
    return (
      <div className="flex-1 flex flex-col">
        <Topbar title="Device Detail" subtitle="Loading device telemetry..." />
        <div className="p-8">
          <div className="h-64 bg-white border border-[#ded7cc] rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  const isConfigSyncPending = device.config_version > device.applied_config_version;
  const rssiQuality = getRssiQuality(device.rssi);

  return (
    <div className="flex-1 flex flex-col pb-16">
      <Topbar
        title={device.name}
        subtitle={`Device ID: ${device.device_id} · Firmware: ${device.firmware_version}`}
        onRefresh={() => loadDeviceData(true)}
        isRefreshing={isRefreshing}
      />

      <div className="p-6 md:p-8 space-y-8 max-w-[1400px]">
        {/* Navigation Breadcrumb & Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/devices"
              className="p-2 rounded-xl border border-[#ded7cc] bg-white hover:bg-[#f7f5f0] text-[#736154] hover:text-[#2b1d16] transition-all cursor-pointer shadow-sm"
              aria-label="Back to device list"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-[#2b1d16]">
                  {device.name}
                </h1>
                {device.online ? (
                  <Badge variant="success" size="sm" dot>
                    Online
                  </Badge>
                ) : (
                  <Badge variant="neutral" size="sm" dot>
                    Offline
                  </Badge>
                )}
                {isConfigSyncPending ? (
                  <Badge variant="warning" size="sm">
                    Sync Pending (v{device.applied_config_version} → v{device.config_version})
                  </Badge>
                ) : (
                  <Badge variant="success" size="sm">
                    Config v{device.config_version} Synced
                  </Badge>
                )}
              </div>
              <p className="text-xs font-semibold text-gray-600 mt-0.5">
                Last seen {formatRelativeTime(device.last_seen)} · Provisioned on {new Date(device.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Quick Command Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleSendCommand('identify')}
              icon={<Zap className="w-3.5 h-3.5" />}
            >
              Identify LED
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleSendCommand('sync_config')}
              icon={<RotateCw className="w-3.5 h-3.5" />}
            >
              Force Sync Config
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                setConfirmModal({
                  isOpen: true,
                  type: 'reboot',
                  title: `Reboot ${device.name}?`,
                  message:
                    'Rebooting the device will temporarily interrupt ongoing voice translations and disconnect the hardware for approximately 4 seconds.',
                })
              }
              icon={<RotateCw className="w-3.5 h-3.5" />}
            >
              Reboot Unit
            </Button>
          </div>
        </div>

        {/* Live Telemetry Card */}
        <Card variant="light" className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-[#ded7cc] gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-[#e9b140]" />
                <h2 className="text-lg font-bold text-[#2b1d16]">
                  Live Device Telemetry
                </h2>
              </div>
              <p className="text-xs text-[#736154]">
                Continuous hardware metrics transmitted over secure MQTT / HTTPS heartbeats
              </p>
            </div>

            {/* Quick telemetry indicators */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <span className={`px-2.5 py-1 rounded-full border ${rssiQuality.color}`}>
                RSSI: {device.rssi} dBm ({rssiQuality.label})
              </span>
              <span className="px-2.5 py-1 rounded-full border border-[#ded7cc] bg-[#f7f5f0] text-[#736154]">
                Heap: ~196 KB free
              </span>
              <span className="px-2.5 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800">
                Battery: 92%
              </span>
            </div>
          </div>

          <TelemetryChart
            samples={telemetry}
            timeRange={timeRange}
            onRangeChange={setTimeRange}
            metric={metric}
            onMetricChange={setMetric}
          />
        </Card>

        {/* Config Editor & Command History (Two Columns) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Config Editor Column */}
          <div className="lg:col-span-2">
            <Card variant="light" className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-[#ded7cc]">
                <div>
                  <div className="flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-[#e9b140]" />
                    <h2 className="text-lg font-bold text-[#2b1d16]">
                      Hardware Configuration
                    </h2>
                  </div>
                  <p className="text-xs text-[#736154]">
                    Deployed config version: <strong>v{device.config_version}</strong>
                    {isConfigSyncPending && (
                      <span className="text-amber-700 ml-1 font-semibold">
                        (pending on device v{device.applied_config_version})
                      </span>
                    )}
                  </p>
                </div>

                {hasUnsavedChanges && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full border border-[#e9b140] bg-[#e9b140]/15 text-[#2b1d16] animate-pulse">
                    Unsaved Changes
                  </span>
                )}
              </div>

              {/* Language A & Language B Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#5c4a3e] mb-1.5">
                    Primary Language (A)
                  </label>
                  <select
                    value={formConfig.language_a}
                    onChange={(e) => handleConfigChange('language_a', e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] text-sm text-[#2b1d16] focus:bg-white focus:outline-none focus:border-[#e9b140] transition-all cursor-pointer"
                  >
                    {languages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name} ({l.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#5c4a3e] mb-1.5">
                    Secondary Language (B)
                  </label>
                  <select
                    value={formConfig.language_b}
                    onChange={(e) => handleConfigChange('language_b', e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] text-sm text-[#2b1d16] focus:bg-white focus:outline-none focus:border-[#e9b140] transition-all cursor-pointer"
                  >
                    {languages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name} ({l.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pair validation notice */}
              {!isValidPair && (
                <div className="flex items-center gap-2 p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs font-medium text-rose-800">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    Pair {formConfig.language_a} ↔ {formConfig.language_b} is unsupported. Machine translation route is unavailable between these codes.
                  </span>
                </div>
              )}

              {/* Operating Mode */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#5c4a3e] mb-1.5">
                  Operating Mode
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleConfigChange('mode', 'auto_detect')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      formConfig.mode === 'auto_detect'
                        ? 'bg-[#e9b140]/15 border-[#e9b140] font-semibold text-[#2b1d16] shadow-sm'
                        : 'bg-[#f7f5f0] border-[#ded7cc] font-medium text-[#736154] hover:bg-white'
                    }`}
                  >
                    <div className="text-xs">Auto-Detect</div>
                    <div className="text-[10px] text-[#8a776a]">Dual-channel continuous speech ID</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleConfigChange('mode', 'buttons')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      formConfig.mode === 'buttons'
                        ? 'bg-[#e9b140]/15 border-[#e9b140] font-semibold text-[#2b1d16] shadow-sm'
                        : 'bg-[#f7f5f0] border-[#ded7cc] font-medium text-[#736154] hover:bg-white'
                    }`}
                  >
                    <div className="text-xs">Physical Buttons</div>
                    <div className="text-[10px] text-[#8a776a]">Hold Button A or B to speak</div>
                  </button>
                </div>
              </div>

              {/* Sliders: Speech Rate, Volume, Max Recording, Heartbeat */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                <div>
                  <div className="flex justify-between text-xs font-black mb-1">
                    <span>Speech Rate</span>
                    <span className="font-mono">{formConfig.speech_rate_pct}%</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="150"
                    step="5"
                    value={formConfig.speech_rate_pct}
                    onChange={(e) => handleConfigChange('speech_rate_pct', parseInt(e.target.value))}
                    className="w-full accent-black cursor-pointer"
                  />
                  <span className="text-[10px] text-gray-500 font-bold">Standard: 100% (Natural cadence)</span>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-black mb-1">
                    <span>Speaker Volume</span>
                    <span className="font-mono">{formConfig.volume_pct}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    step="5"
                    value={formConfig.volume_pct}
                    onChange={(e) => handleConfigChange('volume_pct', parseInt(e.target.value))}
                    className="w-full accent-black cursor-pointer"
                  />
                  <span className="text-[10px] text-gray-500 font-bold">Hardware amplifier output level</span>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-black mb-1">
                    <span>Max Utterance Duration</span>
                    <span className="font-mono">{formConfig.max_recording_sec}s</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="30"
                    step="1"
                    value={formConfig.max_recording_sec}
                    onChange={(e) => handleConfigChange('max_recording_sec', parseInt(e.target.value))}
                    className="w-full accent-black cursor-pointer"
                  />
                  <span className="text-[10px] text-gray-500 font-bold">Buffer timeout cutoff per push</span>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-black mb-1">
                    <span>Heartbeat Interval</span>
                    <span className="font-mono">{formConfig.heartbeat_interval_sec}s</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="180"
                    step="15"
                    value={formConfig.heartbeat_interval_sec}
                    onChange={(e) => handleConfigChange('heartbeat_interval_sec', parseInt(e.target.value))}
                    className="w-full accent-black cursor-pointer"
                  />
                  <span className="text-[10px] text-gray-500 font-bold">Telemetry reporting cadence</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-6 border-t border-[#ded7cc]">
                <Button
                  variant="secondary"
                  onClick={handleResetConfig}
                  disabled={!hasUnsavedChanges || isConfigSaving}
                >
                  Reset Changes
                </Button>

                <Button
                  variant="primary"
                  onClick={handleSaveConfig}
                  isLoading={isConfigSaving}
                  disabled={!hasUnsavedChanges || !isValidPair}
                >
                  Save Config (Sync v{device.config_version + 1})
                </Button>
              </div>
            </Card>
          </div>

          {/* Commands & Device Security Column */}
          <div className="space-y-6">
            {/* Command History Panel */}
            <Card variant="light" className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#ded7cc]">
                <div className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-[#e9b140]" />
                  <h3 className="text-base font-bold text-[#2b1d16]">
                    Command Queue
                  </h3>
                </div>
                <span className="text-xs font-mono text-[#736154]">
                  {commands.length} total
                </span>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {commands.length === 0 ? (
                  <p className="text-xs text-[#8a776a] italic text-center py-4">
                    No commands dispatched yet.
                  </p>
                ) : (
                  commands.map((cmd) => (
                    <div
                      key={cmd.id}
                      className="p-3 rounded-xl border border-[#ded7cc] bg-white space-y-1 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase text-[#2b1d16]">
                          {cmd.type.replace('_', ' ')}
                        </span>
                        <span
                          className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded-full border ${
                            cmd.status === 'done'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : cmd.status === 'pending'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-gray-100 text-[#736154] border-[#ded7cc]'
                          }`}
                        >
                          {cmd.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#5c4a3e] font-normal">
                        {cmd.detail || 'Executed standard command payload'}
                      </p>
                      <div className="text-[10px] font-mono text-[#8a776a] flex justify-between pt-1 border-t border-[#ded7cc]">
                        <span>{new Date(cmd.created_at).toLocaleTimeString()}</span>
                        {cmd.acked_at && <span>Acked {formatRelativeTime(cmd.acked_at)}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Device Security & Danger Zone */}
            <Card variant="light" className="space-y-4">
              <div className="pb-3 border-b border-[#ded7cc] flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-700" />
                <h3 className="text-base font-bold text-[#2b1d16]">
                  Security & Identity
                </h3>
              </div>

              <div className="space-y-3">
                <Button
                  variant="secondary"
                  className="w-full justify-between"
                  onClick={handleRotateKey}
                  icon={<RotateCw className="w-4 h-4 text-[#736154]" />}
                >
                  Rotate Device Secret Key
                </Button>

                <Button
                  variant="danger"
                  className="w-full justify-between"
                  onClick={() =>
                    setConfirmModal({
                      isOpen: true,
                      type: 'revoke',
                      title: `Revoke Credentials for ${device.name}?`,
                      message:
                        'Revoking device credentials invalidates all current access tokens immediately. The physical device will be barred from transmitting utterances until re-provisioned.',
                    })
                  }
                  icon={<ShieldAlert className="w-4 h-4" />}
                >
                  Revoke Device Access
                </Button>

                <Button
                  variant="danger"
                  className="w-full justify-between bg-rose-600 text-white hover:bg-rose-700"
                  onClick={() =>
                    setConfirmModal({
                      isOpen: true,
                      type: 'delete',
                      title: `Permanently Delete ${device.name}?`,
                      message:
                        'Are you sure you want to permanently delete this device? This will erase device configuration, telemetry history, and revoke all cryptographic hardware keys.',
                    })
                  }
                  icon={<Trash2 className="w-4 h-4" />}
                >
                  Delete Device Permanently
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Destructive Actions */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleExecuteDestructiveAction}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="Confirm Action"
        variant="danger"
      />

      {/* Rotated Key Modal (Shown ONCE) */}
      {rotatedKey && (
        <Modal
          isOpen={true}
          onClose={() => setRotatedKey(null)}
          title="New Device Secret Generated"
          maxWidth="md"
        >
          <div className="space-y-6">
            <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-medium text-emerald-900">
              A new hardware secret has been rotated for {device.name}. Flash or update this secret on the device firmware immediately.
            </div>

            <CopySnippet
              label="New Device Key"
              value={rotatedKey}
              isSecret
              downloadFilename={`${device.device_id}_rotated_key.env`}
              downloadContent={`DEVICE_ID=${device.device_id}\nDEVICE_KEY=${rotatedKey}\nROTATED_AT=${new Date().toISOString()}`}
            />

            <div className="pt-2 flex justify-end">
              <Button variant="primary" onClick={() => setRotatedKey(null)}>
                Acknowledged & Saved
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
