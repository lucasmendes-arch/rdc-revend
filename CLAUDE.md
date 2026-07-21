# CLAUDE.md — Instruções operacionais para IA neste projeto

## Identidade do projeto

Rei dos Cachos B2B — e-commerce/CRM para revenda de cosméticos.
Stack: React + TypeScript + Vite + Tailwind + Supabase (auth, DB, edge functions).
Deploy: Vercel (push to main = deploy automático).

## Papel do Claude neste projeto

Claude é responsável pelo projeto inteiro, ponta a ponta:
- **Backend**: SQL, migrations, RLS, edge functions, RPCs
- **Modelagem**: schema, constraints, relações entre tabelas
- **Contratos de dados**: definição de payloads, tipos compartilhados, assinaturas de RPCs
- **Integrações**: MercadoPago, WhatsApp (UAZAPI), webhooks
- **Regras de negócio críticas**: cálculo de frete, total, estoque, validações server-side
- **Segurança**: RLS policies, rate limiting, validação de input
- **Frontend**: componentes React, formulários, UX/UI, integração com RPCs e edge functions

Não há mais um segundo agente (Ant/Antigravity) neste projeto — Claude cuida de toda a stack. Ainda assim, regras críticas de negócio (preço, estoque, mínimo de pedido) devem ficar validadas no backend, nunca só no frontend (ver "Regras de segurança" abaixo).

## Antes de executar qualquer tarefa

Consultar obrigatoriamente:
1. `docs/SCHEMA.md` — single source of truth do banco (tabelas, colunas, RPCs, armadilhas de nomenclatura)
2. `private-docs/memory.md` — memória operacional, convenções, aprendizados

## Convenções técnicas

- **Migrations**: `YYYYMMDDXXXXXX_descricao.sql` em `supabase/migrations/`
- **Commits**: inglês, prefixo semântico (`feat/fix/refactor/chore`), `Co-Authored-By: Claude` quando assistido
- **Nomes técnicos**: inglês (tabelas, colunas, funções)
- **Nomes de negócio/UI**: português (status do funil, labels)
- **Respostas**: português, objetivas, sem excesso de feedback positivo
- **Breakpoints**: mobile-first — `sm:` 640px / `md:` 768px / `lg:` 1024px / `xl:` 1280px

## Áreas em Feature Freeze

As áreas abaixo estão em **feature freeze permanente**. Nenhuma alteração sem aprovação explícita do humano e cumprimento integral do checklist documentado.

| Arquivo | Motivo | Checklist |
|---|---|---|
| `supabase/functions/create-order/index.ts` | Checkout crítico — impacto direto em receita e estoque | `docs/create-order-contract.md` |

**Regra operacional:** Ao receber qualquer tarefa que envolva um arquivo em feature freeze:
1. Alertar imediatamente que a área está em freeze
2. Exigir confirmação explícita do humano antes de prosseguir
3. Cumprir o checklist completo antes de qualquer deploy
4. Nunca alterar como efeito colateral de outra tarefa

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
- Testar que o TypeScript compila (`npx tsc --noEmit -p tsconfig.app.json`) antes de entregar — o comando sem `-p` não checa nada neste repo (tsconfig.json raiz é só `references`, sem `files`), sempre retorna sucesso mesmo com erro real

## Referências rápidas

| Recurso | Localização |
|---|---|
| Schema completo | `docs/SCHEMA.md` |
| Arquitetura | `docs/architecture.md` |
| Roadmap | `docs/roadmap.md` |
| Decisões | `docs/decisions.md` |
| Memória operacional | `private-docs/memory.md` |
| Edge functions | `supabase/functions/` |
| Migrations | `supabase/migrations/` |
| Contrato create-order | `docs/create-order-contract.md` |
