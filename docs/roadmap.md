# Roadmap CRM — Rei dos Cachos B2B

_Última atualização: 2026-03-08 (fechamento Etapa 2)_

## Visão geral

O CRM é construído em etapas incrementais sobre a infraestrutura já existente (Supabase, client_sessions, orders).
Canal exclusivo nesta fase: **WhatsApp**.

---

## ✅ Etapa 1 — Fundação do CRM (concluída 2026-03-08)

**Prompt:** `RDC_CRM_E1_CLD_V1`

- Tabelas: `crm_events`, `crm_tags`, `crm_customer_tags`, `crm_automations`, `crm_automation_runs`, `processed_webhooks`
- RLS habilitado em todas as novas tabelas
- RPC `get_crm_customer_debug(user_id)` — SECURITY DEFINER
- Debug screen admin: `/admin/crm`
- Seeds: 6 tags de sistema + 3 automações base (todas inativas)
- Migration: `20250313000001_crm_foundation.sql`

---

## 🔍 Etapa 2 — Tracking real de eventos (QA_APPROVED_COM_RESSALVAS)

> **Status:** validação técnica de QA concluída com sucesso na maior parte do funil. Aguardando apenas validação final em ambiente real com Mercado Pago. Etapa 3 desbloqueada conceitualmente, mas Etapa 2 encerrada de forma técnica.
> Ver ressalvas no arquivo `docs/qa_checklists.md`.

**Prompts:** `RDC_CRM_E2_P1_CLD_V1` · `RDC_CRM_E2_P2_ANT_V1` · `RDC_CRM_E2_P3_ANT_V2` (skipped) · `RDC_CRM_E2_P4_CLD_V1`

### Backend
- Policy INSERT em `crm_events` para usuários autenticados
- `detect_abandoned_carts()` emite `cart_abandoned` em crm_events
- `webhook-mercadopago` com idempotência via `processed_webhooks` + emite `purchase_completed`
- Migrations: `20250313000002`, `20250313000003`

### Frontend
- `useTrackPageView` → `visitou`
- `useTrackProductView` → `visualizou_produto`
- `useTrackAddToCart` → `adicionou_carrinho`
- `useTrackInitiateCheckout` → `iniciou_checkout`
- `Cadastro.tsx` → `user_registered` (corrigido: dentro do `if(user)`)

### Correções de consolidação
- `CrmRunStatus`: `'processing'` → `'running'` (alinhado com DB)
- `CrmAutomationRun`: interface reescrita com colunas reais
- `CrmEventRecord` adicionado em `types/crm.ts`
- `getAutomations()` / `getAutomationRuns()`: joins quebrados corrigidos
- `useTrackPurchase`: marcado `@deprecated` (nunca foi chamado)

### Checklist de validação (manual)
Ver `docs/qa_checklists.md` — Etapa 2.

---

## 🔧 Etapa 3 — Motor de Tags + Disparos (em andamento)

**Objetivo:** conectar eventos CRM a tags automáticas e, em seguida, disparar automações WhatsApp.

### P1 — Motor de Tags Híbridas (RDC_CRM_E3_P1_CLD_V1) · IMPLEMENTADO

**Mecanismo:** trigger AFTER INSERT em `crm_events` → atribui/remove tags em `crm_customer_tags`

**Migration:** `20250313000004_crm_tag_engine.sql`

**Funções criadas:**
- `assign_crm_tag(user_id, slug, source)` — helper idempotente (ON CONFLICT DO NOTHING)
- `remove_crm_tag(user_id, slug)` — remove tag quando usuário avança no funil
- `apply_crm_tags_from_event()` — trigger function SECURITY DEFINER
- `backfill_crm_tags()` — aplica tags retroativas em usuários existentes

**Mapeamento evento → tag:**
| Evento | Tag atribuída | Tags removidas |
|---|---|---|
| `purchase_completed` (1a compra) | `novo-cliente` | `adicionou-carrinho`, `iniciou-checkout`, `abandonou-carrinho` |
| `purchase_completed` (2a+ compra) | `recorrente` | `novo-cliente` + acima |
| `cart_abandoned` | `abandonou-carrinho` | — |
| `iniciou_checkout` | `iniciou-checkout` | — |
| `adicionou_carrinho` | `adicionou-carrinho` | — |

**Seed adicionado:** `adicionou-carrinho` (tag nova)

**Após aplicar a migration:** executar `SELECT backfill_crm_tags();` no SQL Editor

### P3 — Dispatcher WhatsApp (RDC_CRM_E3_P3_CLD_V1) · VALIDADO ✅

**Edge function:** `supabase/functions/crm-dispatcher/index.ts`
**Migration:** `20250313000005_crm_dispatcher_setup.sql`

**Modos de invocação:**
- **Modo A**: Supabase Database Webhook em `crm_customer_tags` INSERT → filtra por `trigger_type='tag_added'`
- **Modo B**: HTTP POST direto `{ user_id, automation_id? }` → roda automações ativas

**UAZAPI — endpoint correto:**
- `POST {UAZAPI_URL}/send/text`
- Header: `token: {UAZAPI_TOKEN}`
- Body: `{ "number": "5527...", "text": "mensagem" }`

**Secrets configurados (Supabase Edge Function Secrets):**
- `UAZAPI_URL` = `https://reidoscachos.uazapi.com` ✅
- `UAZAPI_TOKEN` = `c1ecb583-977f-4568-a186-5464c226d53b` ✅

**Idempotência:** uma execução bem-sucedida por `(automation_id × user_id)` registrada em `crm_automation_runs`

**Status de produção:**
- Deploy realizado via `npx supabase functions deploy crm-dispatcher --project-ref kjfsmwtwbreapipifjtu`
- Teste Mode B: `dispatched: 1` — mensagem WhatsApp recebida com sucesso
- Automação "CRM: Recuperacao Carrinho (tag)": `is_active = false` (desativada após teste)

**Para ativar o fluxo automático (Modo A — Database Webhook):**
1. Configurar Database Webhook no Supabase Dashboard em `crm_customer_tags` INSERT apontando para a edge function
2. Ativar automação: `UPDATE crm_automations SET is_active=true WHERE name='CRM: Recuperacao Carrinho (tag)'`

### P4 — Fila de Disparo com Delay (RDC_CRM_E4_P4_CLD_V1) · IMPLEMENTADO

**Migration:** `20250313000007_crm_dispatch_queue.sql`
**Edge function:** `supabase/functions/crm-queue-processor/index.ts`

**Tabela:** `crm_dispatch_queue` — status: `pending → processing → sent / failed / cancelled`

**Funções SQL:**
- `claim_crm_queue_items(batch_size)` — claim atômico com `FOR UPDATE SKIP LOCKED`
- `reset_stuck_crm_queue_items()` — recupera itens presos em 'processing' há >5min

**Comportamento do dispatcher com delay:**
- `delay_minutes = 0` (ou `force=true`): envia imediatamente (comportamento anterior)
- `delay_minutes > 0`: insere em `crm_dispatch_queue` com `scheduled_at = now() + delay`
- Resposta estendida: `{ dispatched, skipped, queued }`

**Ativação do pg_cron (executar no SQL Editor após migration):**
```sql
SELECT cron.schedule(
  'crm-queue-processor',
  '* * * * *',
  $$SELECT net.http_post(
    url     := 'https://kjfsmwtwbreapipifjtu.supabase.co/functions/v1/crm-queue-processor',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := 'null'::jsonb
  )$$
);
```

### P2 — Planejado (próximos prompts)
- Painel admin: atribuição/remoção manual de tags em `/admin/crm`
- Database Webhook automático configurado para trigger tag → dispatcher

### Pré-requisito para disparos WhatsApp
- Definir e testar credenciais da API WhatsApp (Fiqon ou Z-API)
- Ajustar `action_config` nos seeds com campos reais da API

---

## 🗓️ Backlog futuro (P2/P3)

Ver `docs/backlog_future.md`.
