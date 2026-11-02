import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../services/api';
import { Settings as SettingsType, Language } from '../types';
import { Topbar } from '../components/Layout/Topbar';
import { Card } from '../components/Common/Card';
import { Button } from '../components/Common/Button';
import { useToast } from '../context/ToastContext';
import { useServiceStatus } from '../context/ServiceStatusContext';
import {
  Settings as SettingsIcon,
  Save,
  RotateCcw,
  Shield,
  Clock,
  HardDrive,
  Volume2,
  Check,
} from 'lucide-react';

export const Settings: React.FC = () => {
  const { onToggleMobileNav } = useOutletContext<{ onToggleMobileNav?: () => void }>() || {};
  const { success, error } = useToast();
  const { toggleService } = useServiceStatus();

  const [initialSettings, setInitialSettings] = useState<SettingsType | null>(null);
  const [formSettings, setFormSettings] = useState<SettingsType | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.getSettings(), api.getLanguages()]).then(([settingsData, langData]) => {
      setInitialSettings(settingsData);
      setFormSettings({ ...settingsData });
      setLanguages(langData.languages);
      setIsLoading(false);
    });
  }, []);

  const hasUnsavedChanges =
    initialSettings && formSettings
      ? JSON.stringify(initialSettings) !== JSON.stringify(formSettings)
      : false;

  const handleChange = <K extends keyof SettingsType>(field: K, value: SettingsType[K]) => {
    if (!formSettings) return;
    setFormSettings({ ...formSettings, [field]: value });
  };

  const handleToggleAllowedLanguage = (code: string) => {
    if (!formSettings) return;
    const current = new Set(formSettings.allowed_languages);
    if (current.has(code)) {
      if (current.size === 1) {
        error('At least one language must remain allowed.');
        return;
      }
      current.delete(code);
    } else {
      current.add(code);
    }
    setFormSettings({ ...formSettings, allowed_languages: Array.from(current) });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSettings) return;

    setIsSaving(true);
    try {
      const updated = await api.updateSettings(formSettings);
      setInitialSettings(updated);
      setFormSettings({ ...updated });
      // Keep global service toggle in sync
      await toggleService(updated.service_enabled);
      success('System settings updated and deployed across cloud endpoints');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save settings';
      error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (initialSettings) {
      setFormSettings({ ...initialSettings });
      success('Settings reset to active values');
    }
  };

  if (isLoading || !formSettings) {
    return (
      <div className="flex-1 flex flex-col">
        <Topbar title="Settings" subtitle="Loading parameters..." onToggleMobileNav={onToggleMobileNav} />
        <div className="p-8">
          <div className="h-64 bg-white border border-[#ded7cc] rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col pb-16">
      <Topbar
        title="System Settings"
        subtitle="Global service limits, speech thresholds, audio retention & device fleet defaults"
        onToggleMobileNav={onToggleMobileNav}
      />

      <form onSubmit={handleSave} className="p-6 md:p-8 space-y-6 max-w-[1200px]">
        {/* Floating / Sticky Bar for Unsaved Changes */}
        {hasUnsavedChanges && (
          <div className="p-4 rounded-xl border border-[#d89e2c] bg-[#fcf7ec] shadow-sm flex items-center justify-between animate-in slide-in-from-top-2">
            <span className="text-xs font-semibold text-[#855b14]">
              You have unsaved setting changes
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={handleReset}>
                Reset
              </Button>
              <Button type="submit" size="sm" variant="primary" isLoading={isSaving}>
                Save Changes
              </Button>
            </div>
          </div>
        )}

        {/* Service Core Policies */}
        <Card variant="light" className="space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-[#ded7cc]">
            <Shield className="w-4 h-4 text-[#855b14]" />
            <h2 className="text-base font-bold text-[#2b1d16] tracking-tight">
              Service Gate & Audio Retention
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Service Enabled Toggle */}
            <div className="p-4 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-[#2b1d16] block">
                  Translator Service Enabled
                </span>
                <span className="text-xs text-[#8a776a]">
                  When toggled OFF, endpoints return HTTP 503 service_disabled
                </span>
              </div>
              <input
                type="checkbox"
                checked={formSettings.service_enabled}
                onChange={(e) => handleChange('service_enabled', e.target.checked)}
                className="w-5 h-5 rounded border border-[#ded7cc] accent-[#e9b140] cursor-pointer"
              />
            </div>

            {/* Store Audio Toggle */}
            <div className="p-4 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-[#2b1d16] block">
                  Store Raw Audio Waves in S3
                </span>
                <span className="text-xs text-[#8a776a]">
                  Preserve original & synthesized WAV files for debugging
                </span>
              </div>
              <input
                type="checkbox"
                checked={formSettings.store_audio}
                onChange={(e) => handleChange('store_audio', e.target.checked)}
                className="w-5 h-5 rounded border border-[#ded7cc] accent-[#e9b140] cursor-pointer"
              />
            </div>
          </div>

          {/* Retention Days & Confidence Threshold */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label htmlFor="settings-retention-days" className="block text-xs font-semibold text-[#5c4a3e] mb-1">
                Audio Retention Period (Days)
              </label>
              <input
                id="settings-retention-days"
                type="number"
                min="1"
                max="365"
                value={formSettings.retention_days}
                onChange={(e) => handleChange('retention_days', parseInt(e.target.value) || 30)}
                className="w-full px-3 py-2 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] font-medium text-xs text-[#2b1d16] focus:bg-white focus:border-[#e9b140] focus:ring-2 focus:ring-[#e9b140]/20 focus:outline-none transition-all"
              />
              <span className="text-[10px] text-[#8a776a]">Auto-purge logs after retention window</span>
            </div>

            <div>
              <label htmlFor="settings-min-confidence" className="block text-xs font-semibold text-[#5c4a3e] mb-1">
                Language-ID Minimum Confidence ({Math.round(formSettings.language_id_min_confidence * 100)}%)
              </label>
              <input
                id="settings-min-confidence"
                type="range"
                min="0.5"
                max="0.99"
                step="0.01"
                value={formSettings.language_id_min_confidence}
                onChange={(e) => handleChange('language_id_min_confidence', parseFloat(e.target.value))}
                className="w-full accent-[#e9b140] cursor-pointer"
              />
              <span className="text-[10px] text-[#8a776a]">
                Rejects audio with error low_confidence_language if below cutoff
              </span>
            </div>
          </div>
        </Card>

        {/* Utterance & Ingestion Constraints */}
        <Card variant="light" className="space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-[#ded7cc]">
            <Clock className="w-4 h-4 text-[#855b14]" />
            <h2 className="text-base font-bold text-[#2b1d16] tracking-tight">
              Utterance & Quota Constraints
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="settings-max-utterance" className="block text-xs font-semibold text-[#5c4a3e] mb-1">
                Max Utterance Seconds
              </label>
              <input
                id="settings-max-utterance"
                type="number"
                min="5"
                max="60"
                value={formSettings.max_utterance_sec}
                onChange={(e) => handleChange('max_utterance_sec', parseInt(e.target.value) || 15)}
                className="w-full px-3 py-2 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] font-medium text-xs text-[#2b1d16] focus:bg-white focus:border-[#e9b140] focus:ring-2 focus:ring-[#e9b140]/20 focus:outline-none transition-all"
              />
              <span className="text-[10px] text-[#8a776a]">Rejects with error audio_too_long</span>
            </div>

            <div>
              <label htmlFor="settings-max-file-size" className="block text-xs font-semibold text-[#5c4a3e] mb-1">
                Max Batch File Size (MB)
              </label>
              <input
                id="settings-max-file-size"
                type="number"
                min="5"
                max="100"
                value={formSettings.max_file_size_mb}
                onChange={(e) => handleChange('max_file_size_mb', parseInt(e.target.value) || 25)}
                className="w-full px-3 py-2 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] font-medium text-xs text-[#2b1d16] focus:bg-white focus:border-[#e9b140] focus:ring-2 focus:ring-[#e9b140]/20 focus:outline-none transition-all"
              />
            </div>

            <div>
              <label htmlFor="settings-max-duration" className="block text-xs font-semibold text-[#5c4a3e] mb-1">
                Max Batch Duration (Sec)
              </label>
              <input
                id="settings-max-duration"
                type="number"
                min="30"
                max="1800"
                value={formSettings.max_duration_sec}
                onChange={(e) => handleChange('max_duration_sec', parseInt(e.target.value) || 300)}
                className="w-full px-3 py-2 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] font-medium text-xs text-[#2b1d16] focus:bg-white focus:border-[#e9b140] focus:ring-2 focus:ring-[#e9b140]/20 focus:outline-none transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div>
              <label htmlFor="settings-rate-limit" className="block text-xs font-semibold text-[#5c4a3e] mb-1">
                Device Rate Limit (Req / Min)
              </label>
              <input
                id="settings-rate-limit"
                type="number"
                min="5"
                max="120"
                value={formSettings.device_rate_limit_per_min}
                onChange={(e) => handleChange('device_rate_limit_per_min', parseInt(e.target.value) || 30)}
                className="w-full px-3 py-2 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] font-medium text-xs text-[#2b1d16] focus:bg-white focus:border-[#e9b140] focus:ring-2 focus:ring-[#e9b140]/20 focus:outline-none transition-all"
              />
              <span className="text-[10px] text-[#8a776a]">Triggers rate_limited</span>
            </div>

            <div>
              <label htmlFor="settings-daily-quota" className="block text-xs font-semibold text-[#5c4a3e] mb-1">
                Device Daily Quota
              </label>
              <input
                id="settings-daily-quota"
                type="number"
                min="50"
                max="5000"
                value={formSettings.device_daily_quota}
                onChange={(e) => handleChange('device_daily_quota', parseInt(e.target.value) || 500)}
                className="w-full px-3 py-2 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] font-medium text-xs text-[#2b1d16] focus:bg-white focus:border-[#e9b140] focus:ring-2 focus:ring-[#e9b140]/20 focus:outline-none transition-all"
              />
              <span className="text-[10px] text-[#8a776a]">Triggers quota_exceeded</span>
            </div>

            <div>
              <label htmlFor="settings-heartbeat" className="block text-xs font-semibold text-[#5c4a3e] mb-1">
                Default Heartbeat Interval (Sec)
              </label>
              <input
                id="settings-heartbeat"
                type="number"
                min="10"
                max="300"
                value={formSettings.default_heartbeat_interval_sec}
                onChange={(e) => handleChange('default_heartbeat_interval_sec', parseInt(e.target.value) || 60)}
                className="w-full px-3 py-2 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] font-medium text-xs text-[#2b1d16] focus:bg-white focus:border-[#e9b140] focus:ring-2 focus:ring-[#e9b140]/20 focus:outline-none transition-all"
              />
            </div>
          </div>
        </Card>

        {/* Allowed Languages Multi-Select */}
        <Card variant="sand" className="space-y-4">
          <div className="pb-3 border-b border-[#ded7cc]">
            <h2 className="text-base font-bold text-[#2b1d16] tracking-tight">
              Allowed Languages Multi-Select
            </h2>
            <p className="text-xs text-[#8a776a]">
              Select languages permitted for translation and device registration
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {languages.map((lang) => {
              const isChecked = formSettings.allowed_languages.includes(lang.code);
              return (
                <button
                  type="button"
                  key={lang.code}
                  onClick={() => handleToggleAllowedLanguage(lang.code)}
                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all ${
                    isChecked
                      ? 'bg-[#e9b140] text-[#2b1d16] font-semibold border-[#d89e2c] shadow-xs'
                      : 'bg-white font-medium text-[#5c4a3e] border-[#ded7cc] hover:bg-[#edeae4]'
                  }`}
                >
                  <div>
                    <span className="text-xs block">{lang.name}</span>
                    <span className="text-[10px] font-mono opacity-70">{lang.code}</span>
                  </div>
                  {isChecked && <Check className="w-3.5 h-3.5 text-[#2b1d16] shrink-0" />}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Read-Only AI Providers & Fallback Status */}
        <Card variant="light" className="space-y-4">
          <div className="pb-3 border-b border-[#ded7cc] flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#2b1d16] tracking-tight">
                Active AI Providers & Fallback Chains (Read-Only)
              </h2>
              <p className="text-xs text-[#8a776a]">
                Ordered fallback chains and environment-governed models
              </p>
            </div>
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border border-[#ded7cc] bg-[#f7f5f0] text-[#736154]">
              ENV Governed
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl border border-[#ded7cc] bg-[#f7f5f0]">
              <span className="text-[11px] font-semibold uppercase text-[#736154] block mb-1">
                STT Provider Chain
              </span>
              <span className="font-mono text-xs font-semibold text-[#2b1d16]">
                {formSettings.providers?.stt_chains?.join(' ➔ ') || 'groq ➔ xai'}
              </span>
              <span className="text-[10px] text-[#8a776a] block mt-1">
                Model: {formSettings.providers?.models?.groq_stt_model || 'whisper-large-v3-turbo'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-[#ded7cc] bg-[#f7f5f0]">
              <span className="text-[11px] font-semibold uppercase text-[#736154] block mb-1">
                Translator Chain
              </span>
              <span className="font-mono text-xs font-semibold text-[#2b1d16]">
                {formSettings.providers?.translate_chains?.join(' ➔ ') || 'groq ➔ xai'}
              </span>
              <span className="text-[10px] text-[#8a776a] block mt-1">
                Groq: {formSettings.providers?.models?.groq_chat_model || 'llama-3.1-8b-instant'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-[#ded7cc] bg-[#f7f5f0]">
              <span className="text-[11px] font-semibold uppercase text-[#736154] block mb-1">
                TTS Provider Chain
              </span>
              <span className="font-mono text-xs font-semibold text-[#2b1d16]">
                {formSettings.providers?.tts_chains?.join(' ➔ ') || 'edge ➔ xai'}
              </span>
              <span className="text-[10px] text-[#8a776a] block mt-1">
                Primary: Microsoft Edge ReadAloud (Free)
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-[#ded7cc] bg-[#fcf8ee] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-semibold text-[#2b1d16] block">
                Paid Fallback Policy (ALLOW_PAID_FALLBACK)
              </span>
              <p className="text-[11px] text-[#736154]">
                When false, paid providers are skipped entirely, guaranteeing $0.00 cloud expenses.
              </p>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full border text-[11px] font-semibold shrink-0 ${
                formSettings.providers?.allow_paid_fallback
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-emerald-100 text-emerald-900 border-emerald-300'
              }`}
            >
              {formSettings.providers?.allow_paid_fallback ? 'Enabled (Paid Allowed)' : 'Disabled ($0.00 Free Only)'}
            </span>
          </div>
        </Card>

        {/* Bottom Save / Reset Action Bar */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleReset}
            disabled={!hasUnsavedChanges || isSaving}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Reset All
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSaving}
            disabled={!hasUnsavedChanges}
            icon={<Save className="w-3.5 h-3.5" />}
          >
            Save Settings
          </Button>
        </div>
      </form>
    </div>
  );
};
