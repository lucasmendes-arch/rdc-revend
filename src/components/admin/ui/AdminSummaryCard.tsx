import React from 'react';
import { cn } from '@/lib/utils';

/**
 * @deprecated Use `StatCard` de `AdminPage.tsx`. Mantido com o mesmo visual
 * (rótulo em sentence case, valor em Bricolage) para não destoar.
 */
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
  iconColor = 'text-ink-400',
  indicatorColor,
  className = ''
}: AdminSummaryCardProps) {
  return (
    <div className={cn('bg-card rounded-lg border border-border px-4 py-3.5 shadow-xs flex flex-col justify-between min-w-0', className)}>
      <div>
        <div className="flex items-center gap-1.5">
          {Icon && <Icon className={cn('w-3.5 h-3.5 shrink-0', iconColor)} />}
          {indicatorColor && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', indicatorColor)} />}
          <span className="text-[12.5px] font-medium text-muted-foreground truncate">{label}</span>
        </div>
        <div className="font-title mt-1.5 text-[20px] sm:text-[22px] font-semibold text-foreground leading-none tabular-nums">{value}</div>
      </div>
      {subtitle && (
        <div className="text-[12px] text-muted-foreground mt-1.5">{subtitle}</div>
      )}
    </div>
  );
}
