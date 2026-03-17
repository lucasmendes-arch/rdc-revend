# BaseOp — Backlog Futuro

Ideias e melhorias fora do escopo do MVP. Revisitar após validação com uso real.

## Funcionalidades

| Ideia | Contexto | Prioridade |
|-------|----------|-----------|
| ClickUp sync bidirecional | Schema preparado (sync_status, clickup_task_id). Implementar na fase 2 | Média |
| WhatsApp via Uazapi | Segundo canal de entrada além do Telegram | Média |
| Criar/editar pelo webapp | Forms de criação de projetos, tarefas, entries direto no painel | Média |
| Notificações proativas | n8n cron: alertar no Telegram sobre projetos stale, tarefas paradas | Média |
| Busca semântica | pgvector no Supabase + embeddings OpenAI | Baixa |
| Dashboard analytics | Gráficos: frequência de entradas, distribuição por tipo, produtividade | Baixa |
| Export de dados | CSV/JSON de entries, projetos, tarefas | Baixa |

## Infra

| Ideia | Contexto | Prioridade |
|-------|----------|-----------|
| Multi-usuário | Auth Supabase, RLS por user_id. Não entra no MVP | Baixa |
| Upload de arquivos | Supabase Storage para imagens, PDFs | Baixa |
| PWA | Service worker + manifest para acesso mobile | Baixa |
| Testes automatizados | Vitest para hooks, Playwright para E2E | Média |
| CI/CD | GitHub Actions: lint, type-check, build, deploy | Média |

## UX

| Ideia | Contexto | Prioridade |
|-------|----------|-----------|
| Sidebar colapsável | Sidebar fixa 224px não funciona em mobile | Média |
| Dark/light theme | Atualmente só dark (zinc-950) | Baixa |
| Keyboard shortcuts | Atalhos para navegação rápida entre páginas | Baixa |
| Drag-and-drop tarefas | Kanban board para tasks | Baixa |
| Markdown nas entries | Renderizar markdown no conteúdo/resumo | Baixa |

## Aguardando Contexto

| Ideia | O que falta para decidir |
|-------|------------------------|
| LangGraph / multi-agente | Avaliar se classificação simples do gpt-4o-mini é suficiente com volume real |
| Supabase Edge Functions vs n8n | Se n8n se mostrar instável, migrar lógica para edge functions |
| Modelo de IA local | Avaliar Ollama/llama para reduzir custo se volume crescer |
