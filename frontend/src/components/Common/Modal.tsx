import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Content */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 w-full bg-white border-[4px] border-black rounded-[2rem] shadow-[12px_12px_0px_0px_#000000] p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-150 ${maxWidthClasses[maxWidth]}`}
      >
        <div className="flex items-center justify-between pb-4 mb-4 border-b-[3px] border-black">
          <h2 className="font-display text-3xl font-black text-[#1a1a1a] tracking-wide">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl border-[2px] border-black bg-[#f0ece1] hover:bg-[#e5e0d3] active:translate-y-[2px] transition-all cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5 text-black" />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
};
