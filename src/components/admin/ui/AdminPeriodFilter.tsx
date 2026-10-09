import React from 'react';

import { PeriodPresetKey, PeriodPresetOption, ADMIN_DEFAULT_PERIOD_PRESETS } from './presets';
import { DateField } from '@/components/ui/date-field';

interface AdminPeriodFilterProps {
  presets?: PeriodPresetOption[];
  activePreset: PeriodPresetKey;
  onPresetChange: (preset: PeriodPresetKey) => void;
  // Custom Dates (só aparecem se o preset ativo for o configurável como customizado)
  customDateFrom?: string;
  customDateTo?: string;
  onCustomDateFromChange?: (date: string) => void;
  onCustomDateToChange?: (date: string) => void;
  // Qual key dispara o surgimento do bloco custom:
  customPresetKey?: PeriodPresetKey;
  className?: string;
}

export function AdminPeriodFilter({
  presets = ADMIN_DEFAULT_PERIOD_PRESETS,
  activePreset,
  onPresetChange,
  customDateFrom = '',
  customDateTo = '',
  onCustomDateFromChange,
  onCustomDateToChange,
  customPresetKey = 'custom',
  className = '',
}: AdminPeriodFilterProps) {
  return (
    <div
      className={`flex items-center gap-1.5 flex-nowrap overflow-x-auto sm:flex-wrap ${className}`}
      style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
    >
      {presets.map(p => (
        <button
          key={p.key}
          onClick={() => onPresetChange(p.key)}
          aria-pressed={activePreset === p.key}
          className={`h-8 px-3 text-[13px] font-medium rounded-md border transition-colors shrink-0 ${
            activePreset === p.key
              ? 'bg-brand-subtle text-brand-strong border-brand-border'
              : 'bg-card text-ink-600 border-border hover:border-ink-300 hover:text-foreground'
          }`}
        >
          {p.label}
        </button>
      ))}

      {activePreset === customPresetKey && (
        <div className="flex flex-wrap items-center gap-2 mt-1 sm:mt-0 sm:ml-2 shrink-0">
          <div className="flex items-center gap-1.5 h-8 bg-card rounded-md border border-border">
            <div className="flex items-center gap-1.5 pl-2">
              <span className="text-[12px] text-muted-foreground font-medium">De</span>
              <DateField
                value={customDateFrom || null}
                onChange={v => onCustomDateFromChange?.(v ?? '')}
                max={customDateTo || null}
                placeholder="—"
                hideIcon
                clearable={false}
                className="px-1.5 py-0.5 text-[13px] rounded-sm bg-transparent text-foreground font-medium hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 h-8 bg-card rounded-md border border-border">
            <div className="flex items-center gap-1.5 pl-2 pr-2">
              <span className="text-[12px] text-muted-foreground font-medium">Até</span>
              <DateField
                value={customDateTo || null}
                onChange={v => onCustomDateToChange?.(v ?? '')}
                min={customDateFrom || null}
                placeholder="—"
                hideIcon
                clearable={false}
                className="px-1.5 py-0.5 text-[13px] rounded-sm bg-transparent text-foreground font-medium hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
