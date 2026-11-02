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
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    danger: 'bg-rose-50 text-rose-800 border-rose-200',
    warning: 'bg-amber-50 text-amber-900 border-amber-200',
    info: 'bg-sky-50 text-sky-800 border-sky-200',
    neutral: 'bg-[#f7f5f0] text-[#5c4a3e] border-[#ded7cc]',
    accent: 'bg-[#fcf7ec] text-[#855b14] border-[#e9b140]/60',
  };

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-[10px] font-semibold',
    md: 'px-2.5 py-0.5 text-[11px] font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 tracking-normal border rounded-full select-none ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
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
