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
    light: 'bg-white border-2 border-[#121212] text-[#121212] shadow-[3.5px_3.5px_0px_#121212]',
    sand: 'bg-[#fbf9f4] border-2 border-[#121212] text-[#121212] shadow-[3.5px_3.5px_0px_#121212]',
    dark: 'bg-[#121212] border-2 border-[#121212] text-white shadow-[3.5px_3.5px_0px_#ffc86b]',
    yellow: 'bg-[#ffc86b] border-2 border-[#121212] text-[#121212] shadow-[3.5px_3.5px_0px_#121212]',
  };

  const hoverStyles = hoverable
    ? 'hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5.5px_5.5px_0px_#121212] transition-all duration-150 cursor-pointer'
    : '';

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl p-6 transition-all duration-150 ${variantStyles[variant]} ${hoverStyles} ${className}`}
    >
      {children}
    </div>
  );
};
