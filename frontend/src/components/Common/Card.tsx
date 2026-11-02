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
    light: 'bg-white border-black text-[#1a1a1a] shadow-[6px_6px_0px_0px_#000000]',
    sand: 'bg-[#f9f6f0] border-black text-[#1a1a1a] shadow-[6px_6px_0px_0px_#000000]',
    dark: 'bg-[#1a1a1a] border-black text-white shadow-[8px_8px_0px_0px_#ffc86b]',
    yellow: 'bg-[#ffc86b] border-black text-[#1a1a1a] shadow-[6px_6px_0px_0px_#000000]',
  };

  const hoverStyles = hoverable
    ? 'hover:-translate-y-1 hover:shadow-[8px_8px_0px_0px_#ffc86b] transition-all cursor-pointer'
    : '';

  return (
    <div
      onClick={onClick}
      className={`border-[3px] rounded-[2rem] p-6 ${variantStyles[variant]} ${hoverStyles} ${className}`}
    >
      {children}
    </div>
  );
};
