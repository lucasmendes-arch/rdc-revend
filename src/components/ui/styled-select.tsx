import { useState, type ReactNode, type SyntheticEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

export interface StyledSelectOption {
  value: string
  label: string
}

interface StyledSelectProps {
  value: string
  onChange: (value: string) => void
  options: StyledSelectOption[]
  placeholder?: string
  // Opção vazia SELECIONÁVEL na lista (equivalente a <option value="">).
  // Pra placeholder NÃO selecionável (equivalente a <option disabled>),
  // não passar emptyLabel — o placeholder aparece só no trigger.
  emptyLabel?: string
  disabled?: boolean
  className?: string
  // default = campo de formulário full-width. inline = filtro compacto de
  // cabeçalho (ícone + borda própria, sem precisar de wrapper externo).
  // xs = select minúsculo embutido em linha de tabela/lista.
  variant?: 'default' | 'inline' | 'xs'
  icon?: ReactNode
  searchable?: boolean
}

const TRIGGER_CLASS: Record<NonNullable<StyledSelectProps['variant']>, string> = {
  default: 'w-full flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed',
  inline: 'flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background text-foreground disabled:opacity-60 disabled:cursor-not-allowed',
  xs: 'inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border bg-background text-foreground text-xs shrink-0 disabled:opacity-60 disabled:cursor-not-allowed',
}

// Dropdown neutro (sem cor por opção), mesmo padrão visual do ColorSelect
// (Popover + Command/cmdk, estilo ClickUp: busca, teclado, check na opção
// selecionada) — pra todo select sem cor associada (loja, status, tipo).
// Regra de design: qualquer dropdown novo do sistema segue esse padrão em
// vez de <select> nativo. Ver feedback_kanban_dark_mode_colors (memória).
export default function StyledSelect({
  value, onChange, options, placeholder = 'Selecionar...', emptyLabel, disabled, className, variant = 'default', icon, searchable,
}: StyledSelectProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)
  const showSearch = searchable ?? options.length > 6
  const stop = (e: SyntheticEvent) => e.stopPropagation()

  return (
    <Popover open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onPointerDown={stop}
          onClick={stop}
          className={`${TRIGGER_CLASS[variant]} ${className || ''}`}
        >
          {icon}
          <span className={`truncate text-left flex-1 min-w-0 ${variant !== 'xs' ? 'text-sm' : ''} ${selected ? '' : 'text-muted-foreground'}`}>
            {selected?.label || placeholder}
          </span>
          <ChevronDown className={`shrink-0 opacity-50 ${variant === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start" onClick={stop} onPointerDown={stop}>
        <Command>
          {showSearch && <CommandInput placeholder="Buscar..." />}
          <CommandList className="max-h-72">
            <CommandEmpty>Nada encontrado.</CommandEmpty>
            {emptyLabel && (
              <CommandGroup>
                <CommandItem value={`__empty__ ${emptyLabel}`} onSelect={() => { onChange(''); setOpen(false) }}>
                  <span className="text-muted-foreground truncate">{emptyLabel}</span>
                  {value === '' && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.value}`}
                  onSelect={() => { onChange(o.value); setOpen(false) }}
                >
                  <span className="truncate">{o.label}</span>
                  {value === o.value && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
