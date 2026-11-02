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
    success: 'bg-[#4ade80] text-black border-black shadow-[2px_2px_0px_0px_#000]',
    danger: 'bg-[#ef4444] text-white border-black shadow-[2px_2px_0px_0px_#000]',
    warning: 'bg-[#f59e0b] text-black border-black shadow-[2px_2px_0px_0px_#000]',
    info: 'bg-[#3b82f6] text-white border-black shadow-[2px_2px_0px_0px_#000]',
    neutral: 'bg-white text-black border-black shadow-[2px_2px_0px_0px_#000]',
    accent: 'bg-[#ffc86b] text-black border-black shadow-[2px_2px_0px_0px_#000]',
  };

  const sizeStyles = {
    sm: 'px-2.5 py-0.5 text-[11px] font-black',
    md: 'px-3.5 py-1 text-xs font-black',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 uppercase tracking-wider border-[2px] rounded-full select-none ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {dot && (
        <span
          className={`w-2 h-2 rounded-full border border-black ${
            variant === 'success'
              ? 'bg-emerald-300'
              : variant === 'danger'
              ? 'bg-red-300'
              : variant === 'warning'
              ? 'bg-yellow-300'
              : 'bg-current'
          }`}
        />
      )}
      {children}
    </span>
  );
};
