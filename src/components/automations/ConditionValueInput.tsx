// Valor de uma condição de automação — estruturado por campo, nunca texto
// livre pra etapa.
//
// O motor compara `candidates.stage` com o valor gravado, literalmente
// (`v_actual = v_expected` em evaluate_automation_conditions). Digitar
// "Descartado", que é o rótulo da tela, gera uma regra que nunca dispara e
// nunca dá erro — foi o que aconteceu com a automação de arquivamento, que
// ficou parada em silêncio até alguém desconfiar. Etapa aqui só sai de um
// seletor, com os mesmos valores e cores do kanban.
//
// O operador "está em" também tinha uma armadilha: o motor faz
// `jsonb_array_elements_text(value)`, ou seja, espera um array JSON. Uma
// string com vírgulas ("a,b") derruba a avaliação com "cannot extract
// elements from a scalar" — e como isso roda dentro do trigger de mudança de
// etapa, o erro derruba o próprio movimento do card. Por isso "está em"
// sempre grava array, venha de chips ou de texto separado por vírgula.

import ColorSelect from '@/components/rh/ColorSelect'
import type { AutomationEntityConfig, Condition } from './types'

interface ConditionValueInputProps {
  condition: Condition
  config: AutomationEntityConfig
  inputClass: string
  onChange: (value: string | string[]) => void
}

function asList(value: string | string[]): string[] {
  if (Array.isArray(value)) return value
  return value.split(',').map((v) => v.trim()).filter(Boolean)
}

export default function ConditionValueInput({ condition, config, inputClass, onChange }: ConditionValueInputProps) {
  const isStageField = condition.field.endsWith('.stage')
  const isAgeField = condition.field === 'candidate.age'
  const single = Array.isArray(condition.value) ? (condition.value[0] ?? '') : condition.value

  if (isStageField && condition.op === 'in') {
    const selected = asList(condition.value)
    const toggle = (stage: string) => {
      onChange(selected.includes(stage) ? selected.filter((s) => s !== stage) : [...selected, stage])
    }
    return (
      // basis-full joga os chips pra própria linha — a linha da condição é
      // flex-wrap, então eles não espremem os dois selects acima.
      <div className="basis-full flex flex-wrap gap-1">
        {config.stageOptions.map((opt) => {
          const on = selected.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              // Tingido com a cor da própria etapa (mesma convenção do kanban
              // no dark mode) em vez de uma segunda paleta só pra chip.
              style={on ? { backgroundColor: `${opt.color}1A`, color: opt.color, borderColor: opt.color } : undefined}
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                on ? '' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    )
  }

  if (isStageField) {
    const known = config.stageOptions.some((o) => o.value === single)
    return (
      <div className="flex-1 min-w-0">
        <ColorSelect
          value={single}
          onChange={onChange}
          options={config.stageOptions}
          variant="dot"
          placeholder="Escolher etapa"
        />
        {single && !known && (
          // Regra antiga gravada com valor inválido: sem este aviso o seletor
          // aparece vazio e a condição continua sem casar com nada.
          <p className="text-[11px] text-danger mt-1">
            Valor gravado (“{single}”) não é uma etapa válida — esta condição nunca dispara. Escolha uma etapa acima.
          </p>
        )}
      </div>
    )
  }

  if (condition.op === 'in') {
    return (
      <input
        type="text"
        value={asList(condition.value).join(', ')}
        onChange={(e) => onChange(asList(e.target.value))}
        className={`${inputClass} flex-1`}
        placeholder="valor1, valor2"
      />
    )
  }

  return (
    <input
      type={isAgeField ? 'number' : 'text'}
      inputMode={isAgeField ? 'numeric' : undefined}
      min={isAgeField ? 0 : undefined}
      value={single}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputClass} flex-1`}
      placeholder="valor"
    />
  )
}
