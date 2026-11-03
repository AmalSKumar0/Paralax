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
    sm: 'px-3 py-1.5 text-xs font-bold rounded-lg gap-1.5',
    md: 'px-4 py-2 text-xs font-bold rounded-xl gap-2',
    lg: 'px-6 py-2.5 text-sm font-bold rounded-xl gap-2.5',
  };

  const variantClasses = {
    primary:
      'bg-[#ffc86b] text-[#121212] hover:bg-[#f5b738] border-2 border-[#121212] shadow-[2.5px_2.5px_0px_#121212] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3.5px_3.5px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
    dark:
      'bg-[#121212] text-white hover:bg-[#262626] border-2 border-[#121212] shadow-[2.5px_2.5px_0px_#ffc86b] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3.5px_3.5px_0px_#ffc86b] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
    secondary:
      'bg-white hover:bg-[#fbf9f4] text-[#121212] border-2 border-[#121212] shadow-[2.5px_2.5px_0px_#121212] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3.5px_3.5px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
    danger:
      'bg-[#fecdd3] hover:bg-[#fca5a5] text-[#991b1b] border-2 border-[#121212] shadow-[2.5px_2.5px_0px_#121212] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3.5px_3.5px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
    ghost:
      'bg-transparent hover:bg-black/5 text-[#121212] border-2 border-transparent hover:border-[#121212] active:translate-x-[1px] active:translate-y-[1px]',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center transition-all duration-120 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
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
