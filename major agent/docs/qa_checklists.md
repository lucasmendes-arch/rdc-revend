# BaseOp — Checklists de Validação

## Checklist de Deploy Inicial

- [ ] Schema SQL executado no Supabase sem erros
- [ ] Realtime habilitado (entries, tasks na publication)
- [ ] `.env` local preenchido e testado (`npm run dev` funciona)
- [ ] Env vars configuradas na Vercel
- [ ] Bot Telegram criado e token salvo
- [ ] `TELEGRAM_WEBHOOK_SECRET` gerado e configurado
- [ ] Webhook registrado via `setup-telegram-webhook.sh`
- [ ] Resposta do `getWebhookInfo` mostra URL correta e sem erros
- [ ] n8n rodando com PM2 (`pm2 status` mostra online)
- [ ] Workflow `baseop-intake` ativo no n8n
- [ ] Variáveis do n8n configuradas (Settings → Variables)
- [ ] Teste: `/insight teste` no Telegram → resposta do bot
- [ ] Teste: entry aparece no Dashboard com Realtime
- [ ] Teste: filtros de tipo funcionam em /entries
- [ ] Teste: projetos listam corretamente em /projects

## Checklist por Funcionalidade

### Webhook (Edge Function)
- [ ] POST sem secret → 401
- [ ] POST com secret válido → 200
- [ ] Mensagem duplicada (mesmo message_id) → ignorada
- [ ] 31+ mensagens em 1 minuto → rate limit ativo
- [ ] Update sem texto (sticker, foto) → ignorado
- [ ] n8n offline → retorna 200 mesmo assim

### Workflow n8n
- [ ] Cada comando gera entry no Supabase
- [ ] `/project` cria registro em `projects`
- [ ] `/task` cria registro em `tasks`
- [ ] Tags e resumo preenchidos pela OpenAI
- [ ] Mensagem sem comando → tipo `note`
- [ ] Erro no OpenAI → mensagem amigável no Telegram
- [ ] Mensagens salvas em `messages` com conversation_id

### Frontend
- [ ] Dashboard carrega métricas
- [ ] Realtime: nova entry aparece sem refresh
- [ ] Entries: filtro por tipo funciona
- [ ] Entries: busca por texto funciona (2+ chars)
- [ ] Projects: filtro por estágio funciona
- [ ] Projects: indicador stale (7d+) aparece
- [ ] ProjectDetail: entries vinculadas carregam
- [ ] ProjectDetail: memory timeline renderiza
- [ ] Tasks: filtro por status funciona
- [ ] Memory: seletor de projeto carrega memórias

## Checklist de Fechamento de Sessão

- [ ] Código commitado
- [ ] TypeScript compila sem erros (`npx tsc --noEmit`)
- [ ] Build passa (`npm run build`)
- [ ] `docs/session_compact.md` atualizado
- [ ] `PROJECT_STATE_SUMMARY.md` atualizado se houve mudança de estado
- [ ] `memory.md` atualizado se houve decisão nova
- [ ] `docs/roadmap.md` atualizado se etapas avançaram

## Checklist Pré-Entrega (release)

- [ ] Todos os testes do checklist de funcionalidade passam
- [ ] `.env.example` reflete todas as variáveis necessárias
- [ ] `.gitignore` cobre `.env`, `node_modules`, `dist`, `.vercel`
- [ ] README tem instruções claras de setup
- [ ] Sem secrets no código-fonte
- [ ] Build de produção gera sem warnings
