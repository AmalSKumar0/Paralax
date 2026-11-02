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
      <div className="bg-rose-50 border-b border-rose-200 px-5 py-3 flex items-center justify-between shadow-sm sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-rose-900">
              SERVICE PAUSED · 503 service_disabled
            </p>
            <p className="text-[11px] text-rose-700">
              Voice transcription, translation, and device utterance ingestion are currently paused by administrator policy.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800 cursor-pointer transition-all"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Enable Service</span>
          </button>
          <button
            onClick={dismissBanner}
            className="p-1 rounded-lg text-rose-700 hover:bg-rose-100 cursor-pointer transition-all"
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
