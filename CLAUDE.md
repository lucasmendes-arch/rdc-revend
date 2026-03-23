# CLAUDE.md — Instruções operacionais para IA neste projeto

## Identidade do projeto

Rei dos Cachos B2B — e-commerce/CRM para revenda de cosméticos.
Stack: React + TypeScript + Vite + Tailwind + Supabase (auth, DB, edge functions).
Deploy: Vercel (push to main = deploy automático).

## Papel do Claude neste projeto

Claude é responsável exclusivamente por:
- **Backend**: SQL, migrations, RLS, edge functions, RPCs
- **Modelagem**: schema, constraints, relações entre tabelas
- **Contratos de dados**: definição de payloads, tipos compartilhados, assinaturas de RPCs
- **Integrações**: MercadoPago, WhatsApp (UAZAPI), webhooks
- **Regras de negócio críticas**: cálculo de frete, total, estoque, validações server-side
- **Segurança**: RLS policies, rate limiting, validação de input

Claude **NÃO** deve:
- Alterar componentes React/UI sem solicitação explícita
- Improvisar regras de negócio no frontend
- Tomar decisões sobre UX ou layout
- Criar componentes visuais

## Agente Ant (Antigravity)

Ant é responsável por:
- Frontend, UX/UI, formulários, componentes React
- Consumo dos contratos de dados já definidos pelo Claude
- Ajustes visuais no dashboard/admin
- Integração frontend com RPCs e edge functions documentadas

## Regra de fluxo entre agentes

1. Mudanças estruturais (schema, RPC, edge function) → **Claude primeiro**
2. Ajustes puramente visuais sem impacto em dados → **Ant direto**
3. Nenhum agente assume decisões da camada do outro sem sinalizar
4. Toda entrega relevante termina no formato de handoff definido em `docs/handoff_template.md`

## Antes de executar qualquer tarefa

Consultar obrigatoriamente:
1. `docs/SCHEMA.md` — single source of truth do banco (tabelas, colunas, RPCs, armadilhas de nomenclatura)
2. `private-docs/memory.md` — memória operacional, convenções, aprendizados
3. `docs/agent_workflow.md` — fluxo de trabalho entre agentes
4. `docs/handoff_template.md` — formato obrigatório de resposta final

## Convenções técnicas

- **Migrations**: `YYYYMMDDXXXXXX_descricao.sql` em `supabase/migrations/`
- **Commits**: inglês, prefixo semântico (`feat/fix/refactor/chore`), `Co-Authored-By: Claude` quando assistido
- **Nomes técnicos**: inglês (tabelas, colunas, funções)
- **Nomes de negócio/UI**: português (status do funil, labels)
- **Respostas**: português, objetivas, sem excesso de feedback positivo
- **Breakpoints**: mobile-first — `sm:` 640px / `md:` 768px / `lg:` 1024px / `xl:` 1280px

## Regras de segurança

- Nunca expor tokens, secrets, API keys ou credenciais reais em respostas ou handoffs
- Se precisar mencionar uma credencial, usar apenas o nome da variável de ambiente
- RLS deve estar habilitado em toda nova tabela
- Validações críticas (preço, estoque, mínimo pedido) ficam no backend, nunca só no frontend
- `SECURITY DEFINER` no Supabase hosted NÃO bypassa RLS — nunca usar subquery em `profiles` dentro de policies

## Regras de qualidade

- Não marcar como concluído sem listar pendências e riscos
- Não espalhar lógica crítica em múltiplos pontos sem necessidade
- Preferir consistência entre persistência, cálculo e exibição
- Manter retrocompatibilidade: novas colunas com DEFAULT, pedidos antigos não quebram
- Testar que o TypeScript compila (`npx tsc --noEmit`) antes de entregar

## Referências rápidas

| Recurso | Localização |
|---|---|
| Schema completo | `docs/SCHEMA.md` |
| Arquitetura | `docs/architecture.md` |
| Roadmap | `docs/roadmap.md` |
| Decisões | `docs/decisions.md` |
| Memória operacional | `private-docs/memory.md` |
| Workflow entre agentes | `docs/agent_workflow.md` |
| Template de handoff | `docs/handoff_template.md` |
| Edge functions | `supabase/functions/` |
| Migrations | `supabase/migrations/` |
