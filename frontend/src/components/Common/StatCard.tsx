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
  const borderShadow =
    variant === 'accent'
      ? 'border-black shadow-[6px_6px_0px_0px_#ffc86b] bg-white'
      : variant === 'warning'
      ? 'border-black shadow-[6px_6px_0px_0px_#f59e0b] bg-[#fffdf8]'
      : variant === 'danger'
      ? 'border-black shadow-[6px_6px_0px_0px_#ef4444] bg-[#ffecec]'
      : 'border-black shadow-[6px_6px_0px_0px_#000000] bg-white';

  return (
    <div className={`p-5 rounded-[1.75rem] border-[3px] flex flex-col justify-between ${borderShadow} transition-all hover:-translate-y-0.5`}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-black uppercase tracking-wider text-gray-700">
          {label}
        </span>
        {icon && (
          <div className="w-10 h-10 rounded-xl border-[2px] border-black bg-[#ffc86b] flex items-center justify-center shrink-0 shadow-[2px_2px_0px_0px_#000]">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl sm:text-4xl font-black text-[#1a1a1a] tracking-tight">
            {value}
          </span>
          {badge && (
            <span className="text-xs font-black px-2 py-0.5 rounded-full border border-black bg-[#ffc86b]">
              {badge}
            </span>
          )}
        </div>
        {subValue && (
          <p className="mt-1 text-xs font-semibold text-gray-600">
            {subValue}
          </p>
        )}
      </div>
    </div>
  );
};
