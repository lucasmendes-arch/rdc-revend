# BaseOp — Arquitetura

## Fluxo Principal

```
Usuário (Telegram)
  │
  ▼
Vercel Edge Function (/api/telegram/webhook)
  │ Valida token, dedup, rate limit
  │ Parseia comando + payload
  ▼
n8n (workflow baseop-intake)
  │ Switch por comando
  │ OpenAI: classificação + resumo + tags
  │ Resolve project_id por project_hint
  ▼
Supabase (Postgres)
  │ INSERT em entries/projects/tasks/messages
  │ Realtime broadcast
  ▼
React Webapp
  │ TanStack Query + Supabase Realtime
  │ Dashboard, Entries, Projects, Tasks, Memory
  ▼
Usuário (Browser)
```

## Tabelas

| Tabela | Registros | Relações |
|--------|-----------|----------|
| `projects` | Frentes de trabalho | → project_memory, entries, tasks, conversations |
| `project_memory` | Memória versionada | → projects (CASCADE) |
| `entries` | Capturas (7 tipos) | → projects (SET NULL) |
| `conversations` | Agrupamento Telegram | → projects (SET NULL), messages |
| `messages` | Mensagens individuais | → conversations (CASCADE) |
| `tasks` | Tarefas | → projects (SET NULL) |

## RPCs

| Função | Tipo | Uso |
|--------|------|-----|
| `get_or_create_conversation(p_chat_id, p_titulo)` | SECURITY DEFINER | n8n: buscar/criar conversa por chat_id |
| `next_memory_version(p_project_id)` | STABLE | n8n: próxima versão para project_memory |
| `update_updated_at()` | TRIGGER | Auto-update em projects, conversations, tasks |

## RLS

- **service_role:** acesso total (INSERT, UPDATE, DELETE, SELECT)
- **anon:** somente SELECT (webapp lê dados sem auth)
- **authenticated:** sem policies específicas (single-user MVP)

## Realtime

Habilitado em `entries` e `tasks` via `supabase_realtime` publication. O hook `useRealtime` no frontend invalida queries do TanStack Query ao receber eventos.

## Edge Function

```
POST /api/telegram/webhook
  ├── Header: X-Telegram-Bot-Api-Secret-Token
  ├── Dedup: Set<string> em memória (max 500)
  ├── Rate limit: Map<chatId, {count, resetAt}> — 30/min
  ├── Parse: /comando payload → { command, payload }
  └── Forward: POST n8n com X-N8N-Secret
```

## Frontend

| Página | Dados | Realtime |
|--------|-------|----------|
| Dashboard | stats (4 counts), entries (10), projects (ativos) | entries, tasks |
| Entries | entries (50, filtros tipo/search/project) | — |
| Projects | projects (filtros estágio/status/search) | — |
| ProjectDetail | project, entries (20), project_memory | — |
| Tasks | tasks (filtro status) | — |
| Memory | projects (ativos), project_memory | — |

## Design System

- **Base:** Tailwind CSS, tema dark (zinc-950/900/800)
- **Font:** System default (sem custom fonts no MVP)
- **Cores por tipo:** amber (insight), blue (radar), purple (me), green (search), pink (content), zinc (note), cyan (task)
- **Cores por estágio:** blue (descoberta), violet (planejamento), emerald (execução), amber (aguardando), zinc (pausado), green (concluído)
- **Padrões:** cards com border zinc-800, hover zinc-700, rounded-lg, skeleton pulse loading
