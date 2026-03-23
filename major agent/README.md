# BaseOp

Sistema pessoal de produtividade. Captura rápida via Telegram, processamento com IA, persistência no Supabase, visualização em webapp React.

```
[Telegram] → [Vercel Edge Function] → [n8n] → [OpenAI] → [Supabase] → [React Webapp + Realtime]
```

## Objetivo

Centralizar captura de insights, projetos, tarefas e pesquisas em um fluxo único: enviar pelo Telegram, processar com IA, persistir no Supabase, visualizar no webapp. Resolver o problema de perda de contexto entre sessões e ferramentas.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite + TailwindCSS + TanStack Query |
| Backend/DB | Supabase (Postgres + Realtime) |
| Webhook | Vercel Edge Function (TypeScript) |
| Orquestração | n8n self-hosted com PM2 |
| IA | OpenAI gpt-4o-mini |
| Deploy | Vercel (frontend + edge function) |

## Como rodar

```bash
cp .env.example .env   # preencher variáveis
npm install
npm run dev
```

Setup completo (Supabase, Telegram, n8n, Vercel) → ver `docs/current_status.md`

## Comandos Telegram

| Comando | Função |
|---------|--------|
| `/insight [texto]` | Ideia, observação, hipótese |
| `/project [texto]` | Criar ou referenciar projeto |
| `/radar [texto]` | Oportunidade ou sinal de mercado |
| `/search [assunto]` | Pesquisa contextualizada |
| `/me [texto]` | Registro pessoal, reflexão |
| `/task [texto]` | Criar tarefa |
| `/content [texto]` | Variações de conteúdo |
| *(sem comando)* | Nota livre |

## Estrutura

```
src/
  components/       → UI (entries, layout, memory, projects, tasks)
  hooks/            → TanStack Query hooks (6 hooks)
  lib/              → supabase.ts, utils.ts
  pages/            → Dashboard, Entries, Projects, ProjectDetail, Tasks, Memory
  types/            → tipos TypeScript de todas as tabelas
api/telegram/       → Vercel Edge Function (webhook receiver)
supabase/           → schema.sql
docs/               → documentação operacional
scripts/            → utilitários de setup
```

## Documentação

| Arquivo | Função |
|---------|--------|
| `memory.md` | Contexto contínuo, decisões, convenções |
| `PROJECT_STATE_SUMMARY.md` | Resumo executivo do estado atual |
| `docs/current_status.md` | Status operacional + setup detalhado |
| `docs/roadmap.md` | Próximos passos por prioridade |
| `docs/architecture.md` | Tabelas, fluxos, design system |
| `docs/n8n-workflow.md` | Workflow n8n detalhado com prompts |
| `docs/qa_checklists.md` | Checklists de validação e deploy |
| `docs/prompt_registry.md` | Histórico de prompts com IA |
| `docs/session_compact.md` | Resumo da última sessão |
| `docs/backlog_future.md` | Ideias futuras fora do MVP |
| `docs/decisions.md` | Decisões arquiteturais com contexto |
