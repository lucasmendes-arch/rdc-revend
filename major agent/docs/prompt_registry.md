# BaseOp — Registro de Prompts

Histórico de prompts usados com IA durante o desenvolvimento.

## Formato

| Campo | Descrição |
|-------|-----------|
| ID | Identificador único (P-XX) |
| Objetivo | O que o prompt pedia |
| Status | Concluído, Parcial, Descartado |
| Impacto | Arquivos/funcionalidades criados |
| Sessão | Data |

## Registro

### P-01 — Estruturação completa do MVP

- **Objetivo:** Construir MVP completo do BaseOp em 10 etapas sequenciais: schema SQL, tipos TypeScript, Edge Function webhook, workflow n8n, e 5 páginas React (Entries, Projects, Tasks, Memory, Dashboard) com hooks TanStack Query e Supabase Realtime.
- **Status:** Concluído
- **Impacto:** 39 arquivos criados — schema SQL, Edge Function, 5 páginas, 6 hooks, 7 componentes, tipos, layout, config Vite/Tailwind, docs n8n
- **Sessão:** 2026-03-15
- **Notas:** Entrega bloco a bloco com confirmação entre etapas. Zero erros TypeScript ao final.

### P-02 — Documentação operacional

- **Objetivo:** Estruturar documentação base seguindo padrão de projetos assistidos por IA: README, memory, state summary, status, roadmap, checklists, prompt registry, session compact, backlog, architecture, decisions.
- **Status:** Concluído
- **Impacto:** 10 docs criados/atualizados
- **Sessão:** 2026-03-15

---

## Prompts OpenAI no Workflow n8n

Prompts usados em produção pelo workflow `baseop-intake` para processar mensagens do Telegram. Documentação completa em `docs/n8n-workflow.md`, seções 4.1 a 4.8.

| ID | Tipo | Função |
|----|------|--------|
| N-01 | insight | Tese central, tags, project_hint |
| N-02 | project | Nome, objetivo, estágio, próxima ação |
| N-03 | radar | Urgência, área de impacto, ação recomendada |
| N-04 | search | Pesquisa contextualizada (beleza, SaaS, automação) |
| N-05 | me | Padrão emocional/cognitivo, sem julgamento |
| N-06 | task | Título limpo, descrição, prioridade |
| N-07 | content | Tema, ângulo, 3 variações de post |
| N-08 | note | Classificação sugerida, resumo |
