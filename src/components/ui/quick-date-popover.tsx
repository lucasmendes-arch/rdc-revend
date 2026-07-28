import { useState, type SyntheticEvent } from 'react'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { parseISODate, toISODate } from '@/components/ui/date-field'

function relativeDateStr(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

const QUICK_DATE_OPTIONS: { label: string; days: number }[] = [
  { label: 'Hoje', days: 0 },
  { label: 'Amanhã', days: 1 },
  { label: 'Próxima semana', days: 7 },
  { label: '2 semanas', days: 14 },
  { label: '4 semanas', days: 28 },
  { label: '45 dias', days: 45 },
]

// Editor inline da Data fim, clicável direto no card do kanban. O
// stopPropagation existe porque o card é arrastável via dnd-kit — sem ele o
// clique no popover inicia um drag.
//
// Vivia duplicado em Candidatos.tsx (RH) e Contratacao.tsx (DP), com o
// comentário de um apontando que era cópia do outro; unificado aqui pra que o
// atalho de prazo se comporte igual nos dois kanbans.
export function QuickDatePopover({
  value,
  onChange,
  overdue,
}: {
  value: string | null
  onChange: (v: string | null) => void
  overdue: boolean
}) {
  const [open, setOpen] = useState(false)
  const stop = (e: SyntheticEvent) => e.stopPropagation()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onPointerDown={stop}
          onClick={stop}
          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${overdue ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}
        >
          <CalendarIcon className="w-2.5 h-2.5 shrink-0" />
          {value ? new Date(value + 'T00:00:00').toLocaleDateString('pt-BR') : 'Data fim'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start" onClick={stop} onPointerDown={stop}>
        <div className="space-y-0.5 mb-2">
          {QUICK_DATE_OPTIONS.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => { onChange(relativeDateStr(o.days)); setOpen(false) }}
              className="w-full text-left px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-surface-alt transition-colors"
            >
              {o.label}
            </button>
          ))}
        </div>
        <Calendar
          mode="single"
          selected={parseISODate(value)}
          defaultMonth={parseISODate(value)}
          onSelect={(d) => { onChange(d ? toISODate(d) : null); setOpen(false) }}
          className="p-0"
        />
        {value && (
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false) }}
            className="w-full mt-1.5 text-left px-2 py-1.5 rounded-md text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            Remover data
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}
