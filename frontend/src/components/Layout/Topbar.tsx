import React, { useState, useEffect } from 'react';
import { RefreshCw, Power, Menu } from 'lucide-react';
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
    <header className="bg-white border-b border-[#ded7cc] px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {onToggleMobileNav && (
          <button
            onClick={onToggleMobileNav}
            className="md:hidden p-2 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] text-[#2b1d16] cursor-pointer"
            aria-label="Toggle menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        <div>
          <h1 className="text-xl font-bold text-[#2b1d16] tracking-tight leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-[#8a776a] mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
        {/* Auto refresh counter badge & Manual refresh */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-[#8a776a] hidden md:inline">
            Auto-refresh: {secondsUntilRefresh}s
          </span>
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] hover:bg-[#edeae4] text-xs font-medium text-[#2b1d16] transition-all cursor-pointer disabled:opacity-50"
            title="Refresh current page data"
            aria-label="Refresh data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Service on/off toggle button */}
        <div className="flex items-center gap-2 pl-2 border-l border-[#ded7cc]">
          <button
            onClick={() => setShowConfirmModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              isServiceEnabled
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200'
            }`}
            aria-label="Toggle service state"
          >
            <Power className="w-3.5 h-3.5" />
            <span>{isServiceEnabled ? 'Service Active' : 'Service Paused'}</span>
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
