import React, { useState, useEffect } from 'react';
import { RefreshCw, Power, Menu, Radio } from 'lucide-react';
import { useServiceStatus } from '../../context/ServiceStatusContext';
import { ConfirmModal } from '../Common/ConfirmModal';
import { useToast } from '../../context/ToastContext';

interface TopbarProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onToggleMobileNav?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  title,
  subtitle,
  onRefresh,
  isRefreshing = false,
  onToggleMobileNav,
}) => {
  const { isServiceEnabled, toggleService } = useServiceStatus();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(15);
  const { success, warning } = useToast();

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsUntilRefresh((prev) => {
        if (prev <= 1) {
          onRefresh?.();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onRefresh]);

  const handleManualRefresh = () => {
    setSecondsUntilRefresh(15);
    onRefresh?.();
  };

  const handleToggleService = async () => {
    const targetState = !isServiceEnabled;
    await toggleService(targetState);
    setShowConfirmModal(false);
    if (targetState) {
      success('Translator service enabled successfully');
    } else {
      warning('Translator service paused (503 service_disabled active)');
    }
  };

  return (
    <header className="bg-white border-b-[3px] border-black px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {onToggleMobileNav && (
          <button
            onClick={onToggleMobileNav}
            className="md:hidden p-2 rounded-xl border-[2px] border-black bg-[#f0ece1] cursor-pointer"
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div>
          <h1 className="font-display text-3xl font-black text-[#1a1a1a] tracking-wide leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs font-semibold text-gray-600">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
        {/* Auto refresh counter badge & Manual refresh */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold text-gray-600 hidden md:inline">
            Auto-refresh: {secondsUntilRefresh}s
          </span>
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-[2px] border-black bg-[#f0ece1] hover:bg-[#e5e0d3] active:translate-y-[1px] text-xs font-black text-black shadow-[2px_2px_0px_#000] cursor-pointer disabled:opacity-50"
            title="Refresh current page data"
            aria-label="Refresh data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Service on/off toggle button */}
        <div className="flex items-center gap-2 pl-2 border-l-[2px] border-black/20">
          <button
            onClick={() => setShowConfirmModal(true)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border-[2px] border-black text-xs font-black transition-all cursor-pointer shadow-[2px_2px_0px_#000] active:translate-y-[1px] ${
              isServiceEnabled
                ? 'bg-[#4ade80] hover:bg-emerald-400 text-black'
                : 'bg-[#ef4444] hover:bg-rose-600 text-white'
            }`}
            aria-label="Toggle service state"
          >
            <Power className="w-3.5 h-3.5" />
            <span>{isServiceEnabled ? 'Service ON' : 'Service OFF'}</span>
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleToggleService}
        title={isServiceEnabled ? 'Disable Voice Translator Service?' : 'Enable Voice Translator Service?'}
        message={
          isServiceEnabled
            ? 'Disabling the service will return HTTP 503 service_disabled to all connected IoT translator hardware, utterance endpoints, and file upload jobs.'
            : 'Enabling the service will allow all registered hardware devices to resume transmitting audio and receiving translated speech.'
        }
        confirmText={isServiceEnabled ? 'Disable Service' : 'Enable Service'}
        variant={isServiceEnabled ? 'danger' : 'primary'}
      />
    </header>
  );
};
