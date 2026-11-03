import React, { useState } from 'react';
import { AlertTriangle, Power, X } from 'lucide-react';
import { useServiceStatus } from '../../context/ServiceStatusContext';
import { ConfirmModal } from '../Common/ConfirmModal';
import { useToast } from '../../context/ToastContext';

export const ServiceBanner: React.FC = () => {
  const { isServiceEnabled, toggleService, showBanner, dismissBanner } = useServiceStatus();
  const [showConfirm, setShowConfirm] = useState(false);
  const { success } = useToast();

  if (isServiceEnabled && !showBanner) return null;

  const handleEnable = async () => {
    await toggleService(true);
    setShowConfirm(false);
    success('Voice translator service re-enabled successfully');
  };

  return (
    <>
      <div className="bg-[#fde68a] border-b-2 border-[#121212] px-5 py-3 flex items-center justify-between shadow-[0_2px_0px_#121212] sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-[#ffc86b] text-[#121212] border-2 border-[#121212] shadow-[1px_1px_0px_#121212] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-extrabold text-[#121212] uppercase tracking-wider">
              SERVICE PAUSED · 503 service_disabled
            </p>
            <p className="text-[11px] text-[#333333] font-medium">
              Voice transcription, translation, and device utterance ingestion are currently paused by administrator policy.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-[#121212] bg-[#bbf7d0] hover:bg-[#86efac] text-xs font-bold text-[#14532d] shadow-[2px_2px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer transition-all"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Enable Service</span>
          </button>
          <button
            onClick={dismissBanner}
            className="p-1.5 rounded-lg border-2 border-[#121212] bg-white text-[#121212] hover:bg-[#fbf9f4] shadow-[1px_1px_0px_#121212] cursor-pointer transition-all"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleEnable}
        title="Re-enable Translator Service"
        message="This will immediately resume IoT voice translation processing, file batch jobs, and device utterance routing across all active units."
        confirmText="Enable Service"
        variant="primary"
      />
    </>
  );
};
