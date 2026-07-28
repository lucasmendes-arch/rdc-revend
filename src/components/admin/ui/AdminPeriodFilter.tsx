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
      className={`px-4 sm:px-6 lg:px-8 pb-3 pt-0.5 flex items-center gap-1.5 flex-nowrap overflow-x-auto sm:flex-wrap ${className}`}
      style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
    >
      {presets.map(p => (
        <button
          key={p.key}
          onClick={() => onPresetChange(p.key)}
          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors shrink-0 ${
            activePreset === p.key
              ? 'bg-gold text-white border-gold shadow-sm'
              : 'bg-card text-muted-foreground border-border hover:border-gold-border hover:text-foreground'
          }`}
        >
          {p.label}
        </button>
      ))}

      {activePreset === customPresetKey && (
        <div className="flex flex-wrap items-center gap-2 mt-1 sm:mt-0 sm:ml-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-card rounded-lg p-0.5 border border-border shadow-sm">
            <div className="flex items-center gap-1.5 pl-2">
              <span className="text-[10px] text-muted-foreground font-bold uppercase">De:</span>
              <DateField
                value={customDateFrom || null}
                onChange={v => onCustomDateFromChange?.(v ?? '')}
                max={customDateTo || null}
                placeholder="—"
                hideIcon
                clearable={false}
                className="px-1.5 py-1 text-xs rounded-md bg-transparent text-foreground font-semibold hover:bg-surface-alt transition-colors outline-none focus:ring-2 focus:ring-gold"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-card rounded-lg p-0.5 border border-border shadow-sm">
            <div className="flex items-center gap-1.5 pl-2 pr-2">
              <span className="text-[10px] text-muted-foreground font-bold uppercase">Até:</span>
              <DateField
                value={customDateTo || null}
                onChange={v => onCustomDateToChange?.(v ?? '')}
                min={customDateFrom || null}
                placeholder="—"
                hideIcon
                clearable={false}
                className="px-1.5 py-1 text-xs rounded-md bg-transparent text-foreground font-semibold hover:bg-surface-alt transition-colors outline-none focus:ring-2 focus:ring-gold"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
