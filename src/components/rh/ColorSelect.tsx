import { useState, type SyntheticEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

export interface ColorSelectOption {
  value: string
  label: string
  color: string
  group?: string
}

interface ColorSelectProps {
  value: string
  onChange: (value: string) => void
  options: ColorSelectOption[]
  variant: 'dot' | 'pill'
  placeholder?: string
  emptyLabel?: string
  className?: string
  // Trigger compacto pro card do kanban (o padrão é o tamanho usado no
  // modal de detalhe). stopPropagation embutido no trigger nos dois
  // tamanhos — necessário quando usado dentro de um card arrastável
  // (dnd-kit) pra não iniciar drag nem abrir o modal por baixo.
  compact?: boolean
}

// Dropdown estilo ClickUp (Popover + Command, cmdk) — busca, grupos e opções
// coloridas. `dot` = pill de status com bolinha + texto colorido (Etapa).
// `pill` = badge sólido colorido por opção (Vaga, herdando job_roles.color).
export default function ColorSelect({ value, onChange, options, variant, placeholder = 'Selecionar...', emptyLabel, className, compact }: ColorSelectProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  const groups: { name: string; opts: ColorSelectOption[] }[] = []
  options.forEach((o) => {
    const name = o.group || ''
    let g = groups.find((x) => x.name === name)
    if (!g) { g = { name, opts: [] }; groups.push(g) }
    g.opts.push(o)
  })

  const stopPropagation = (e: SyntheticEvent) => e.stopPropagation()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {compact ? (
          <button
            type="button"
            onPointerDown={stopPropagation}
            onClick={stopPropagation}
            className="inline-flex items-center gap-0.5 max-w-full"
          >
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-md truncate max-w-full"
              style={variant === 'pill' && selected
                ? { backgroundColor: selected.color, color: '#fff' }
                : selected
                  ? { backgroundColor: `${selected.color}22`, color: selected.color }
                  : { backgroundColor: 'var(--surface-alt)', color: 'var(--muted-foreground)' }}
            >
              {selected?.label || placeholder}
            </span>
            <ChevronDown className="w-2.5 h-2.5 shrink-0 opacity-50" />
          </button>
        ) : (
          <button
            type="button"
            onPointerDown={stopPropagation}
            onClick={stopPropagation}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm font-semibold transition-colors max-w-full ${className || ''}`}
            style={selected
              ? { backgroundColor: `${selected.color}1a`, color: selected.color, borderColor: `${selected.color}55` }
              : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
          >
            {variant === 'pill' && selected ? (
              <span className="px-2 py-0.5 rounded-md text-white text-xs font-semibold truncate" style={{ backgroundColor: selected.color }}>
                {selected.label}
              </span>
            ) : (
              <span className="truncate">{selected?.label || placeholder}</span>
            )}
            <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" onClick={stopPropagation} onPointerDown={stopPropagation}>
        <Command>
          <CommandInput placeholder="Buscar..." />
          <CommandList className="max-h-72">
            <CommandEmpty>Nada encontrado.</CommandEmpty>
            {emptyLabel && (
              <CommandGroup>
                <CommandItem value={`__empty__ ${emptyLabel}`} onSelect={() => { onChange(''); setOpen(false) }}>
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 mr-2 shrink-0" />
                  <span className="text-muted-foreground">{emptyLabel}</span>
                  {value === '' && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
                </CommandItem>
              </CommandGroup>
            )}
            {groups.map((g) => (
              <CommandGroup key={g.name || '_'} heading={g.name || undefined}>
                {g.opts.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.value}`}
                    onSelect={() => { onChange(o.value); setOpen(false) }}
                  >
                    {variant === 'dot' ? (
                      <>
                        <span className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: o.color }} />
                        <span style={{ color: o.color }} className="font-medium truncate">{o.label}</span>
                      </>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md text-white text-xs font-semibold truncate" style={{ backgroundColor: o.color }}>
                        {o.label}
                      </span>
                    )}
                    {value === o.value && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
