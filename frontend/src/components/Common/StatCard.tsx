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
    accent: 'bg-white border-[#e9b140]/40',
    warning: 'bg-[#fffdf8] border-amber-200',
    danger: 'bg-[#fffaf9] border-rose-200',
    default: 'bg-white border-[#ded7cc]',
  };

  return (
    <div className={`p-5 rounded-2xl border flex flex-col justify-between ${variantStyles[variant]} shadow-[0_1px_3px_rgba(43,29,22,0.04),0_4px_12px_rgba(43,29,22,0.02)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(43,29,22,0.06)]`}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold text-[#736154] tracking-wide">
          {label}
        </span>
        {icon && (
          <div className="w-8 h-8 rounded-lg border border-[#e9b140]/30 bg-[#fdf9ef] text-[#855b14] flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-[#2b1d16] tracking-tight">
            {value}
          </span>
          {badge && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-[#e9b140]/50 bg-[#fcf8ee] text-[#855b14]">
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
