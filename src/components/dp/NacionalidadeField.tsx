import { useState } from 'react'
import StyledSelect from '@/components/ui/styled-select'
import { NATIONALITY_DEFAULT } from '@/lib/dpConstants'

const CUSTOM = '__custom__'

// Valores que a opção "Brasileiro(a)" representa. `brasileira`/`brasileiro`
// são o DEFAULT antigo da coluna e o resultado de quem digitou flexionado —
// selecionar a opção não regrava por cima deles, porque "brasileira" sai
// melhor no meio da frase do contrato do que "brasileiro(a)".
const BRASILEIRO_VALUES = [NATIONALITY_DEFAULT, 'brasileira', 'brasileiro']

const isBrasileiro = (v: string) => BRASILEIRO_VALUES.includes(v.trim().toLowerCase())

const OPTIONS = [
  { value: NATIONALITY_DEFAULT, label: 'Brasileiro(a)' },
  { value: CUSTOM, label: 'Digite a nacionalidade' },
]

interface NacionalidadeFieldProps {
  value: string
  onChange: (value: string) => void
  // Chamado com o valor já resolvido quando ele está "fechado" (opção
  // escolhida no dropdown ou
  // saída do campo de texto) — os dois consumidores salvam em momentos
  // diferentes: o card grava na hora, o modal de contratos só no "Salvar".
  onCommit?: (value: string) => void
}

// Nacionalidade em duas etapas: dropdown com o caso comum + a saída "Digite
// a nacionalidade", que revela um campo de texto. O valor guardado é sempre
// o texto que vai pro contrato, nunca o sentinela CUSTOM.
export default function NacionalidadeField({ value, onChange, onCommit }: NacionalidadeFieldProps) {
  // Valor salvo fora da família "brasileiro" só pode ter vindo de digitação
  // — abre já no modo texto pra pessoa ver o que está gravado.
  const [isCustom, setIsCustom] = useState(!!value && !isBrasileiro(value))

  return (
    <div className="space-y-2">
      <StyledSelect
        value={isCustom ? CUSTOM : (value ? NATIONALITY_DEFAULT : '')}
        onChange={(v) => {
          if (v === CUSTOM) {
            setIsCustom(true)
            // Não limpa o que já estava lá: trocar pra "digitar" partindo de
            // um valor digitado antes não deve apagá-lo.
            if (isBrasileiro(value)) onChange('')
            return
          }
          setIsCustom(false)
          // Já é da família: mantém o que está gravado em vez de trocar
          // "brasileira" por "brasileiro(a)".
          const resolved = isBrasileiro(value) ? value : v
          onChange(resolved)
          onCommit?.(resolved)
        }}
        options={OPTIONS}
        placeholder="Selecionar"
        searchable={false}
      />
      {isCustom && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit?.(value)}
          autoFocus
          placeholder="Ex: venezuelana"
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      )}
    </div>
  )
}
