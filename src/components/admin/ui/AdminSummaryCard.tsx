import React from 'react';

interface AdminSummaryCardProps {
  label: string;
  value: string | React.ReactNode;
  icon?: React.ElementType;
  subtitle?: string | React.ReactNode;
  iconColor?: string;
  indicatorColor?: string; // para bolinhas do Kanban
  className?: string;
}

export function AdminSummaryCard({ 
  icon: Icon, 
  label, 
  value, 
  subtitle, 
  iconColor = 'text-muted-foreground',
  indicatorColor,
  className = ''
}: AdminSummaryCardProps) {
  return (
    <div className={`bg-white rounded-xl border border-border p-3 lg:px-4 lg:py-3 shadow-sm flex flex-col justify-between ${className}`}>
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          {Icon && <Icon className={`w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0 ${iconColor}`} />}
          {indicatorColor && <span className={`w-1.5 h-1.5 rounded-full shrink-0 shadow-inner ${indicatorColor}`} />}
          <span className="text-[10px] lg:text-[11px] font-semibold uppercase tracking-wide text-muted-foreground line-clamp-1">{label}</span>
        </div>
        <div className="text-sm lg:text-base font-bold text-foreground leading-none">{value}</div>
      </div>
      {subtitle && (
        <div className="text-[10px] lg:text-[11px] text-muted-foreground mt-1.5">{subtitle}</div>
      )}
    </div>
  );
}
