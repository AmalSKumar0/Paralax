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
      <div className="bg-[#ffecec] border-b-[3px] border-black px-4 py-3 flex items-center justify-between shadow-[0px_4px_0px_0px_#ef4444] sticky top-0 z-40 animate-in slide-in-from-top-2 duration-150">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full border-[2px] border-black bg-[#ef4444] text-white flex items-center justify-center shrink-0 shadow-[2px_2px_0px_#000]">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-black text-[#1a1a1a]">
              SERVICE DISABLED · 503 service_disabled
            </p>
            <p className="text-[11px] font-semibold text-gray-700">
              Voice transcription, translation, and device utterance ingestion are currently paused by administrator policy.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-[2px] border-black bg-[#4ade80] hover:bg-emerald-400 text-xs font-black text-black shadow-[2px_2px_0px_#000] active:translate-y-[1px] cursor-pointer"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Enable Service</span>
          </button>
          <button
            onClick={dismissBanner}
            className="p-1 rounded-lg border border-black hover:bg-black/10 cursor-pointer"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4 text-black" />
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
