# BaseOp — Roadmap

## Curto Prazo (esta semana)

| # | Item | Prioridade | Dependência |
|---|------|-----------|-------------|
| 1 | Aplicar schema no Supabase | Alta | — |
| 2 | Criar bot Telegram via @BotFather | Alta | — |
| 3 | Deploy frontend + edge function na Vercel | Alta | #1 |
| 4 | Montar workflow n8n (branch `note` primeiro) | Alta | #1 |
| 5 | Registrar webhook Telegram | Alta | #2, #3 |
| 6 | Teste end-to-end: `/insight teste` → Dashboard | Alta | #4, #5 |

## Médio Prazo (próximas 2-3 semanas)

| # | Item | Prioridade | Notas |
|---|------|-----------|-------|
| 7 | Refinar prompts OpenAI com dados reais | Média | Ajustar após primeiros 50 usos |
| 8 | Busca full-text no Supabase | Média | `to_tsvector` em entries.conteudo |
| 9 | Criar/editar projetos e tarefas pelo webapp | Média | Forms + mutations TanStack |
| 10 | Notificações de projeto stale no Telegram | Média | Cron job no n8n |
| 11 | Mobile responsive (sidebar colapsável) | Média | Sidebar fixa não funciona em mobile |
| 12 | Filtro por data nas entradas | Baixa | Date range picker |

## Longo Prazo (fase 2+)

| # | Item | Notas |
|---|------|-------|
| 13 | Sync ClickUp | Schema preparado (sync_status, clickup_task_id) |
| 14 | WhatsApp via Uazapi | Segundo canal de entrada |
| 15 | Busca semântica (embeddings) | pgvector no Supabase |
| 16 | Dashboard analytics | Gráficos de frequência, tipos, produtividade |
| 17 | Multi-usuário | Auth Supabase, RLS por user_id |
| 18 | Upload de arquivos | Supabase Storage |
| 19 | App mobile (PWA) | Service worker + manifest |

## Concluído

| # | Item | Data |
|---|------|------|
| E1 | Schema SQL (6 tabelas, RLS, Realtime) | 2026-03-15 |
| E2 | Tipos TypeScript + supabase client | 2026-03-15 |
| E3 | Edge Function webhook Telegram | 2026-03-15 |
| E4 | Workflow n8n documentado | 2026-03-15 |
| E5 | Entries (hook + página + componentes) | 2026-03-15 |
| E6 | Projects (hook + página + detail) | 2026-03-15 |
| E7 | Tasks (hook + página) | 2026-03-15 |
| E8 | Memory (página + timeline) | 2026-03-15 |
| E9 | Dashboard (métricas + Realtime) | 2026-03-15 |
| E10 | Revisão final (README, docs, build) | 2026-03-15 |
