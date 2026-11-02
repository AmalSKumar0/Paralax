import React, { useState } from 'react';
import { Copy, Check, Download } from 'lucide-react';
import { Button } from './Button';
import { useToast } from '../../context/ToastContext';

export interface CopySnippetProps {
  label: string;
  value: string;
  isSecret?: boolean;
  downloadFilename?: string;
  downloadContent?: string;
}

export const CopySnippet: React.FC<CopySnippetProps> = ({
  label,
  value,
  isSecret = false,
  downloadFilename,
  downloadContent,
}) => {
  const [copied, setCopied] = useState(false);
  const { success } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      success(`${label} copied to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownload = () => {
    if (!downloadFilename || !downloadContent) return;
    const blob = new Blob([downloadContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadFilename;
    a.click();
    URL.revokeObjectURL(url);
    success(`Downloaded ${downloadFilename}`);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-black uppercase tracking-wider text-[#1a1a1a]">
          {label}
        </label>
        {isSecret && (
          <span className="text-[11px] font-black text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full border border-black">
            Save now · Will not be shown again
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 p-2.5 rounded-xl border-[2px] border-black bg-[#f9f6f0] font-mono text-sm break-all">
        <div className="flex-1 overflow-x-auto select-all font-semibold">
          {value}
        </div>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-lg border-[2px] border-black bg-white hover:bg-[#ffc86b] active:translate-y-[1px] transition-all cursor-pointer shrink-0"
          title="Copy to clipboard"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4 text-black" />}
        </button>
      </div>

      {downloadFilename && downloadContent && (
        <div className="pt-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleDownload}
            icon={<Download className="w-3.5 h-3.5" />}
          >
            Download {downloadFilename}
          </Button>
        </div>
      )}
    </div>
  );
};
