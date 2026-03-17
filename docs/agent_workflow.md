# Workflow entre Agentes — Rei dos Cachos B2B

_Última atualização: 2026-03-17_

## Agentes

| Agente | Escopo | Exemplos |
|---|---|---|
| **Claude** | Backend, dados, integrações | Migrations, RPCs, edge functions, RLS, contratos de dados |
| **Ant** | Frontend, UX/UI | Componentes React, formulários, dashboard, consumo de APIs |
| **Humano** | Direção, priorização, validação | Testes manuais, aprovação de etapa, decisão de negócio |

## Fluxo de execução

```
Tarefa nova
  │
  ├─ Impacto estrutural (schema, RPC, edge function)?
  │    ├─ SIM → Claude primeiro → entrega handoff → Ant consome
  │    └─ NÃO → Ant direto (ajuste visual/UI puro)
  │
  ├─ Impacto em ambas as camadas?
  │    → Claude define o contrato → Ant implementa o consumo
  │
  └─ Dúvida sobre responsabilidade?
       → Perguntar ao humano antes de executar
```

## Regras práticas

### Quando Claude vem primeiro
- Nova tabela, coluna ou constraint
- Nova RPC ou alteração de assinatura existente
- Nova edge function ou alteração de payload
- Regra de negócio que envolve cálculo ou validação server-side
- Qualquer coisa que mude o contrato de dados

### Quando Ant pode ir direto
- Ajuste de estilo, layout ou responsividade
- Novo componente visual que consome dados já existentes
- Melhoria de UX sem mudança de dados
- Correção de bug puramente visual

### Quando ambos trabalham em paralelo
- Claude cria backend + Ant implementa frontend de features independentes
- Claude documenta contrato + Ant consome contrato já documentado
- Tarefas que não compartilham arquivos

## Regras de handoff

1. **Toda entrega relevante** segue o formato de `docs/handoff_template.md`
2. O handoff deve incluir **contrato de dados claro** para o próximo agente consumir
3. Nunca marcar como concluído sem listar pendências e riscos
4. Nunca expor secrets no handoff

## Regras de validação antes de repassar

Antes de entregar para o próximo agente, verificar:

| Verificação | Responsável |
|---|---|
| TypeScript compila (`npx tsc --noEmit`) | Claude e Ant |
| Migration é idempotente e retrocompatível | Claude |
| Contrato de dados está documentado | Claude |
| Componente usa dados conforme contrato | Ant |
| RLS está habilitado em tabelas novas | Claude |
| Nenhum secret exposto no handoff | Ambos |

## Regra de retomada de sessão

Ao iniciar nova sessão relevante:
1. Ler `CLAUDE.md` (instruções permanentes)
2. Ler `docs/SCHEMA.md` (schema atual)
3. Ler `private-docs/memory.md` (contexto operacional)
4. Consultar `docs/roadmap.md` se a tarefa envolver nova etapa

## Convenção de IDs de prompt

```
RDC_{AREA}_E{etapa}_P{n}_{AGENTE}_V{versão}
```

- `AREA`: `CRM`, `BACK`, `ADMIN`, `FRONT`
- `AGENTE`: `CLD` (Claude), `ANT` (Antigravity)
- Exemplo: `RDC_BACK_E7_P1_CLD_V1`
