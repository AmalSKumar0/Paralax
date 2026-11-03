import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'accent';
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  className = '',
}) => {
  const variantStyles = {
    success: 'bg-[#bbf7d0] text-[#14532d] border-2 border-[#121212]',
    danger: 'bg-[#fecdd3] text-[#881337] border-2 border-[#121212]',
    warning: 'bg-[#fde68a] text-[#78350f] border-2 border-[#121212]',
    info: 'bg-[#bfdbfe] text-[#1e3a8a] border-2 border-[#121212]',
    neutral: 'bg-white text-[#121212] border-2 border-[#121212]',
    accent: 'bg-[#ffc86b] text-[#121212] border-2 border-[#121212]',
  };

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-[10px] font-bold shadow-[1.5px_1.5px_0px_#121212]',
    md: 'px-2.5 py-0.5 text-[11px] font-bold shadow-[2px_2px_0px_#121212]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 tracking-normal rounded-lg select-none ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            variant === 'success'
              ? 'bg-emerald-500'
              : variant === 'danger'
              ? 'bg-rose-500'
              : variant === 'warning'
              ? 'bg-amber-500'
              : variant === 'accent'
              ? 'bg-[#e9b140]'
              : 'bg-[#8a776a]'
          }`}
        />
      )}
      {children}
    </span>
  );
};
