# BaseOp — Status Operacional

> Atualizado em: 2026-03-15

## Concluído

- [x] Schema SQL completo (6 tabelas, índices, triggers, RLS, Realtime, 2 RPCs)
- [x] Tipos TypeScript espelhando o schema
- [x] Supabase client singleton com validação de env
- [x] Edge Function Telegram (validação, dedup, rate limit, forward n8n)
- [x] Workflow n8n documentado (8 nós, 7 prompts OpenAI, diagrama)
- [x] Dashboard (4 métricas, stale alert, feed Realtime)
- [x] Entries (feed, filtro por tipo, busca)
- [x] Projects (lista, filtro estágio/status, busca, stale indicator)
- [x] ProjectDetail (info, memory timeline, entries vinculadas)
- [x] Tasks (lista, filtro por status, sync indicator)
- [x] Memory (seletor de projeto, timeline versionada)
- [x] Layout (Sidebar, PageWrapper)
- [x] Build OK (TypeScript 0 erros, Vite 465KB / 134KB gzip)

## Funcionando

- Frontend compila e roda localmente (`npm run dev`)
- Todas as rotas navegáveis com sidebar
- Build de produção gera corretamente

## Não Implementado Ainda

- [ ] Schema não aplicado no Supabase
- [ ] Bot Telegram não criado
- [ ] Webhook não registrado
- [ ] Workflow n8n não montado
- [ ] Deploy Vercel não realizado
- [ ] Nenhum dado real no banco

## Bloqueios

Nenhum bloqueio técnico. Tudo depende de configuração manual:
1. Criar projeto Supabase e executar schema
2. Criar bot no Telegram
3. Montar workflow no n8n
4. Deploy na Vercel com env vars

## Setup Detalhado

### Supabase
1. Criar projeto em supabase.com
2. SQL Editor → colar `supabase/schema.sql` → executar
3. Copiar URL, anon key e service_role key

### Telegram
1. Falar com @BotFather → `/newbot` → copiar token
2. Gerar secret: `openssl rand -hex 32`

### n8n
1. VPS com Node.js instalado
2. `npm install -g n8n && pm2 start n8n -- start`
3. Acessar n8n UI, criar workflow seguindo `docs/n8n-workflow.md`
4. Settings → Variables: configurar `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`

### Vercel
1. `npx vercel --prod` ou conectar repo no dashboard
2. Env vars: `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`

### Registrar Webhook
```bash
TELEGRAM_BOT_TOKEN=xxx TELEGRAM_WEBHOOK_SECRET=yyy VERCEL_URL=app.vercel.app bash scripts/setup-telegram-webhook.sh
```
