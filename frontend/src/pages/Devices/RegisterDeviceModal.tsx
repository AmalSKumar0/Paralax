import React, { useState } from 'react';
import { Modal } from '../../components/Common/Modal';
import { Button } from '../../components/Common/Button';
import { CopySnippet } from '../../components/Common/CopySnippet';
import { Language, Device } from '../../types';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export interface RegisterDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  languages: Language[];
  onDeviceRegistered: (device: Device) => void;
}

export const RegisterDeviceModal: React.FC<RegisterDeviceModalProps> = ({
  isOpen,
  onClose,
  languages,
  onDeviceRegistered,
}) => {
  const [name, setName] = useState('');
  const [langA, setLangA] = useState('en-US');
  const [langB, setLangB] = useState('es-ES');
  const [mode, setMode] = useState<'buttons' | 'auto_detect'>('auto_detect');
  const [voiceA, setVoiceA] = useState('');
  const [voiceB, setVoiceB] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success credentials dialog state
  const [registeredData, setRegisteredData] = useState<{
    device: Device;
    device_key: string;
  } | null>(null);

  const { success, error } = useToast();

  const selectedLangAObj = languages.find((l) => l.code === langA);
  const selectedLangBObj = languages.find((l) => l.code === langB);

  // Check language pair validity
  const isValidPair = selectedLangAObj?.valid_targets.includes(langB) ?? false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      error('Device name is required');
      return;
    }
    if (!isValidPair) {
      error(`Language pair ${langA} → ${langB} is not supported`);
      return;
    }

    const defaultVoiceA = voiceA || selectedLangAObj?.voices[0]?.id || '';
    const defaultVoiceB = voiceB || selectedLangBObj?.voices[0]?.id || '';

    setIsSubmitting(true);
    try {
      const res = await api.registerDevice({
        name,
        language_a: langA,
        language_b: langB,
        mode,
        voice_map: {
          [langA]: defaultVoiceA,
          [langB]: defaultVoiceB,
        },
      });

      setRegisteredData(res);
      onDeviceRegistered(res.device);
      success(`Device "${res.device.name}" registered successfully`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setRegisteredData(null);
    setName('');
    onClose();
  };

  const apiBaseUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/v1`
    : (import.meta.env.VITE_API_BASE_URL || '/api/v1');

  // If successfully registered, show the Device ID and Device Key ONCE in copy dialog
  if (registeredData) {
    const credsJson = JSON.stringify(
      {
        api_base_url: apiBaseUrl,
        device_id: registeredData.device.device_id,
        device_key: registeredData.device_key,
        firmware_provision_date: new Date().toISOString(),
      },
      null,
      2
    );

    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Device Provisioned" maxWidth="lg">
        <div className="space-y-6">
          <div className="flex items-center gap-3 p-3.5 rounded-xl border-[2px] border-black bg-[#eafff1]">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
            <p className="text-xs font-bold text-[#1a1a1a]">
              The device credentials have been generated. Copy or download this snippet now. The device key will never be shown again!
            </p>
          </div>

          <div className="space-y-4">
            <CopySnippet label="Device ID" value={registeredData.device.device_id} />
            <CopySnippet
              label="Device Secret Key"
              value={registeredData.device_key}
              isSecret
              downloadFilename={`${registeredData.device.device_id}_credentials.json`}
              downloadContent={credsJson}
            />
          </div>

          <div className="pt-2 flex justify-end">
            <Button variant="primary" onClick={handleClose}>
              Done & Return to Fleet
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Register New Translator" maxWidth="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-black uppercase tracking-wider text-[#1a1a1a] mb-1.5">
            Device Friendly Name *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. VIP Lounge Translator 03"
            className="w-full px-4 py-2.5 rounded-xl border-[3px] border-black bg-[#f9f6f0] font-semibold text-sm focus:bg-white focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-[#1a1a1a] mb-1.5">
              Primary Language (A)
            </label>
            <select
              value={langA}
              onChange={(e) => {
                setLangA(e.target.value);
                setVoiceA('');
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border-[3px] border-black bg-[#f9f6f0] font-bold text-sm focus:bg-white focus:outline-none"
            >
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-[#1a1a1a] mb-1.5">
              Secondary Language (B)
            </label>
            <select
              value={langB}
              onChange={(e) => {
                setLangB(e.target.value);
                setVoiceB('');
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border-[3px] border-black bg-[#f9f6f0] font-bold text-sm focus:bg-white focus:outline-none"
            >
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Pair Validation Feedback */}
        {!isValidPair && (
          <div className="flex items-center gap-2 p-3 rounded-xl border-[2px] border-black bg-[#ffecec] text-xs font-bold text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              The language pair {langA} ↔ {langB} is currently unsupported by translation pipelines. Please pick a supported target.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-[#1a1a1a] mb-1.5">
              Voice for Language A
            </label>
            <select
              value={voiceA || selectedLangAObj?.voices[0]?.id || ''}
              onChange={(e) => setVoiceA(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border-[2px] border-black bg-[#f9f6f0] font-semibold text-xs focus:bg-white focus:outline-none"
            >
              {selectedLangAObj?.voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.neural ? '★ Neural' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-[#1a1a1a] mb-1.5">
              Voice for Language B
            </label>
            <select
              value={voiceB || selectedLangBObj?.voices[0]?.id || ''}
              onChange={(e) => setVoiceB(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border-[2px] border-black bg-[#f9f6f0] font-semibold text-xs focus:bg-white focus:outline-none"
            >
              {selectedLangBObj?.voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.neural ? '★ Neural' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-black uppercase tracking-wider text-[#1a1a1a] mb-1.5">
            Operating Mode
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode('auto_detect')}
              className={`p-3 rounded-xl border-[2px] border-black text-left cursor-pointer transition-all ${
                mode === 'auto_detect'
                  ? 'bg-[#ffc86b] font-black shadow-[3px_3px_0px_#000]'
                  : 'bg-[#f9f6f0] font-bold text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="text-xs">Auto-Detect</div>
              <div className="text-[10px] font-normal text-gray-600 mt-0.5">Continuous speech identification</div>
            </button>

            <button
              type="button"
              onClick={() => setMode('buttons')}
              className={`p-3 rounded-xl border-[2px] border-black text-left cursor-pointer transition-all ${
                mode === 'buttons'
                  ? 'bg-[#ffc86b] font-black shadow-[3px_3px_0px_#000]'
                  : 'bg-[#f9f6f0] font-bold text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="text-xs">Physical Buttons</div>
              <div className="text-[10px] font-normal text-gray-600 mt-0.5">Button A & Button B manual push</div>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t-[2px] border-black/15">
          <Button variant="secondary" onClick={handleClose} type="button">
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={isSubmitting} disabled={!isValidPair}>
            Provision Device
          </Button>
        </div>
      </form>
    </Modal>
  );
};
