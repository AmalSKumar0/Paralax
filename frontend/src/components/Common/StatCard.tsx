import React from 'react';

export interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: React.ReactNode;
  badge?: string;
  variant?: 'default' | 'accent' | 'warning' | 'danger';
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subValue,
  icon,
  badge,
  variant = 'default',
}) => {
  const variantStyles = {
    accent: 'bg-[#ffc86b] border-2 border-[#121212]',
    warning: 'bg-[#fde68a] border-2 border-[#121212]',
    danger: 'bg-[#fecdd3] border-2 border-[#121212]',
    default: 'bg-white border-2 border-[#121212]',
  };

  return (
    <div className={`p-5 rounded-2xl flex flex-col justify-between ${variantStyles[variant]} shadow-[3.5px_3.5px_0px_#121212] transition-all duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_#121212]`}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-bold text-[#121212] uppercase tracking-wider">
          {label}
        </span>
        {icon && (
          <div className="w-8 h-8 rounded-lg border-2 border-[#121212] bg-[#ffc86b] text-[#121212] shadow-[1.5px_1.5px_0px_#121212] flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold text-[#121212] tracking-tight">
            {value}
          </span>
          {badge && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md border-2 border-[#121212] bg-white text-[#121212] shadow-[1.5px_1.5px_0px_#121212]">
              {badge}
            </span>
          )}
        </div>
        {subValue && (
          <p className="mt-1 text-xs text-[#8a776a]">
            {subValue}
          </p>
        )}
      </div>
    </div>
  );
};
