import { useState } from 'react'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'

function parseISODate(v: string | null | undefined): Date | undefined {
  if (!v) return undefined
  const [y, m, d] = v.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Substitui o <input type="date"> nativo (calendário do sistema operacional,
// visual inconsistente entre navegadores) pelo componente Calendar do design
// system (react-day-picker) — mesmo popover+trigger usado nos outros selects
// do admin. Componente compartilhado (era local ao ProcessoDetailModal.tsx,
// promovido pra cá pra reuso em qualquer formulário de data do admin).
export function DateField({ value, onChange, placeholder = 'Selecionar data' }: { value: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm hover:bg-surface-alt transition-colors"
        >
          <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
            {value ? new Date(value + 'T00:00:00').toLocaleDateString('pt-BR') : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parseISODate(value)}
          onSelect={(d) => { onChange(d ? toISODate(d) : null); setOpen(false) }}
          initialFocus
        />
        {value && (
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
