export type PeriodPresetKey = string;

export interface PeriodPresetOption {
  key: PeriodPresetKey;
  label: string;
}

export const ADMIN_DEFAULT_PERIOD_PRESETS: PeriodPresetOption[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Este mês' },
  { key: 'last_month', label: 'Mês passado' },
  { key: '3months', label: '3 meses' },
  { key: '6months', label: '6 meses' },
  { key: 'custom', label: 'Personalizado' },
];
