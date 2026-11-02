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
    <header className="h-[72px] bg-white border-b border-[#ded7cc] px-6 md:px-8 flex items-center justify-between sticky top-0 z-30 shrink-0 w-full">
      <div className="flex items-center gap-3 min-w-0">
        {onToggleMobileNav && (
          <button
            onClick={onToggleMobileNav}
            className="md:hidden p-2 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] text-[#2b1d16] cursor-pointer shrink-0"
            aria-label="Toggle menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[#2b1d16] tracking-tight leading-none truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-[#8a776a] mt-1 leading-none truncate max-w-xl">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Auto refresh counter badge & Manual refresh */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-[#8a776a] hidden lg:inline">
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
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* Service on/off toggle button */}
        <div className="flex items-center gap-2 pl-3 border-l border-[#ded7cc]">
          <button
            onClick={() => setShowConfirmModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
              isServiceEnabled
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                : 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
            }`}
            title={
              isServiceEnabled
                ? 'Click to pause translator service (returns 503 service_disabled)'
                : 'Click to enable translator service'
            }
          >
            <Power className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isServiceEnabled ? 'Online' : 'Paused'}</span>
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
