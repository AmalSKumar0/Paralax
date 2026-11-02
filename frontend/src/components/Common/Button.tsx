import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'dark' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs font-semibold rounded-lg gap-1.5',
    md: 'px-4 py-2 text-xs font-semibold rounded-xl gap-2',
    lg: 'px-6 py-2.5 text-sm font-semibold rounded-xl gap-2.5',
  };

  const variantClasses = {
    primary:
      'bg-[#e9b140] text-[#2b1d16] hover:bg-[#dfa32b] border border-[#d89e2c] shadow-[0_1px_2px_rgba(43,29,22,0.06)] active:scale-[0.98]',
    dark:
      'bg-[#2b1d16] text-[#edeae4] hover:bg-[#3d2a20] border border-[#2b1d16] shadow-[0_1px_2px_rgba(43,29,22,0.12)] active:scale-[0.98]',
    secondary:
      'bg-[#f7f5f0] hover:bg-[#eae5dd] text-[#2b1d16] border border-[#ded7cc] shadow-[0_1px_2px_rgba(43,29,22,0.04)] active:scale-[0.98]',
    danger:
      'bg-[#fde8e8] hover:bg-[#fbd3d3] text-[#9c2828] border border-[#f5b8b8] shadow-[0_1px_2px_rgba(156,40,40,0.06)] active:scale-[0.98]',
    ghost:
      'bg-transparent hover:bg-black/5 text-[#2b1d16] border border-transparent active:scale-[0.98]',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      <span>{children}</span>
    </button>
  );
};
