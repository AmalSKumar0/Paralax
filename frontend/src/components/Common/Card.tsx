import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  variant?: 'light' | 'sand' | 'dark' | 'yellow';
  className?: string;
  hoverable?: boolean;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'light',
  className = '',
  hoverable = false,
  onClick,
}) => {
  const variantStyles = {
    light: 'bg-white border-[#ded7cc] text-[#2b1d16] shadow-[0_1px_3px_rgba(43,29,22,0.04),0_4px_12px_rgba(43,29,22,0.02)]',
    sand: 'bg-[#f7f5f0] border-[#ded7cc] text-[#2b1d16] shadow-[0_1px_3px_rgba(43,29,22,0.04)]',
    dark: 'bg-[#2b1d16] border-[#3d2a20] text-[#edeae4] shadow-[0_4px_16px_rgba(43,29,22,0.12)]',
    yellow: 'bg-[#fcf8ee] border-[#e9b140]/50 text-[#2b1d16] shadow-[0_1px_3px_rgba(43,29,22,0.04)]',
  };

  const hoverStyles = hoverable
    ? 'hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(43,29,22,0.08)] hover:border-[#cfc6b5] transition-all duration-200 cursor-pointer'
    : '';

  return (
    <div
      onClick={onClick}
      className={`border rounded-2xl p-6 transition-all duration-200 ${variantStyles[variant]} ${hoverStyles} ${className}`}
    >
      {children}
    </div>
  );
};
