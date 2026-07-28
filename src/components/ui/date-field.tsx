import { useMemo, useState } from 'react'
import { Calendar as CalendarIcon } from 'lucide-react'
import type { Matcher } from 'react-day-picker'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'

export function parseISODate(v: string | null | undefined): Date | undefined {
  if (!v) return undefined
  const [y, m, d] = v.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface DateFieldProps {
  value: string | null
  onChange: (v: string | null) => void
  placeholder?: string
  /** Limite inferior (ISO yyyy-mm-dd) — dias anteriores ficam desabilitados. */
  min?: string | null
  /** Limite superior (ISO yyyy-mm-dd) — dias posteriores ficam desabilitados. */
  max?: string | null
  /**
   * Faixa do seletor de ano do cabeçalho. O default do Calendar é
   * ±10 anos, que não alcança data de nascimento — nesses casos passar
   * `fromYear`/`toYear` explicitamente.
   */
  fromYear?: number
  toYear?: number
  /** Sobrescreve as classes do gatilho (uso compacto, ex: filtro de período). */
  className?: string
  /** Esconde o ícone do gatilho — pra chips que já têm rótulo próprio. */
  hideIcon?: boolean
  /** Oferece "Remover data". Desligar quando o campo não aceita vazio. */
  clearable?: boolean
}

// Substitui o <input type="date"> nativo (calendário do sistema operacional,
// visual inconsistente entre navegadores) pelo componente Calendar do design
// system (react-day-picker) — mesmo popover+trigger usado nos outros selects
// do admin. Componente compartilhado (era local ao ProcessoDetailModal.tsx,
// promovido pra cá pra reuso em qualquer formulário de data do admin).
export function DateField({
  value,
  onChange,
  placeholder = 'Selecionar data',
  min,
  max,
  fromYear,
  toYear,
  className,
  hideIcon = false,
  clearable = true,
}: DateFieldProps) {
  const [open, setOpen] = useState(false)

  // Cada limite vira um matcher próprio: `{ before, after }` num objeto só é
  // lido pelo react-day-picker como intervalo (desabilitaria o miolo em vez
  // das pontas), então os dois precisam ir como itens separados do array.
  const disabled = useMemo<Matcher[] | undefined>(() => {
    const matchers: Matcher[] = []
    const before = parseISODate(min)
    const after = parseISODate(max)
    if (before) matchers.push({ before })
    if (after) matchers.push({ after })
    return matchers.length > 0 ? matchers : undefined
  }, [min, max])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={
            className ??
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm hover:bg-surface-alt transition-colors'
          }
        >
          {!hideIcon && <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
          <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
            {value ? new Date(value + 'T00:00:00').toLocaleDateString('pt-BR') : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parseISODate(value)}
          defaultMonth={parseISODate(value)}
          disabled={disabled}
          {...(fromYear != null ? { fromYear } : {})}
          {...(toYear != null ? { toYear } : {})}
          onSelect={(d) => { onChange(d ? toISODate(d) : null); setOpen(false) }}
          initialFocus
        />
        {clearable && value && (
          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false) }}
              className="w-full text-center px-2 py-1.5 rounded-md text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              Remover data
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
