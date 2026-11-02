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
    sm: 'px-3.5 py-1.5 text-xs font-bold rounded-full gap-1.5',
    md: 'px-5 py-2.5 text-sm font-extrabold rounded-full gap-2',
    lg: 'px-7 py-3.5 text-base font-black rounded-full gap-2.5',
  };

  const variantClasses = {
    primary:
      'bg-[#ffc86b] text-[#1a1a1a] hover:bg-[#f4b942] border-[3px] border-black shadow-[4px_4px_0px_0px_#000000] hover:shadow-[5px_5px_0px_0px_#000000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
    dark:
      'bg-[#1a1a1a] text-white hover:bg-black border-[3px] border-black shadow-[4px_4px_0px_0px_#ffc86b] hover:shadow-[6px_6px_0px_0px_#ffc86b] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
    secondary:
      'bg-[#f0ece1] hover:bg-[#e5e0d3] text-[#1a1a1a] border-[3px] border-black shadow-[3px_3px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
    danger:
      'bg-[#ffecec] hover:bg-rose-200 text-rose-900 border-[3px] border-black shadow-[4px_4px_0px_0px_#ef4444] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
    ghost:
      'bg-transparent hover:bg-black/5 text-[#1a1a1a] border-[2px] border-black shadow-none active:translate-y-[1px]',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      <span>{children}</span>
    </button>
  );
};
