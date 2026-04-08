# Roadmap CRM — Rei dos Cachos B2B

_Última atualização: 2026-03-09 (fechamento operacional Etapa 4 v1)_

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

## ✅ Etapa 3 — Motor de Tags + Disparos (QA_APPROVED)

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

## ✅ Etapa 4 — Automações WhatsApp (OPERATIONAL_V1)

_Fechamento: 2026-03-09_

### Status

Backend principal funcionando. Disparo manual validado. Fila com delay ativa. Automação de recuperação de carrinho operacional.

### Prompts executados

- `RDC_CRM_E4_P1_CLD_V1` — seeds das automações operacionais (migration `20250313000006`)
- `RDC_CRM_E4_P4_CLD_V1` — fila de delay (migration `20250313000007`) — ver detalhes acima na seção P4

### Migrations aplicadas manualmente no Supabase

- `20250313000006_crm_e4_automations.sql` — templates B2B de recuperação, boas-vindas e fidelização
- `20250313000007_crm_dispatch_queue.sql` — fila, claim atômico, reset de stuck items

### Infraestrutura ativada

- Extensões `pg_net` e `pg_cron` confirmadas ativas
- Job `crm-queue-processor` criado via `cron.schedule` — frequência: `* * * * *`

### Automações cadastradas

| Nome | Trigger | is_active |
|---|---|---|
| CRM: Recuperacao Carrinho (tag) | tag_added: abandonou-carrinho | true |
| CRM: Boas-vindas Novo Cliente | tag_added: novo-cliente | false |
| CRM: Fidelizacao Cliente Recorrente | tag_added: recorrente | false |

> **Atenção:** duplicidades das automações "Boas-vindas" e "Fidelizacao" foram identificadas no banco. Verificar e limpar antes de ativar.

### Recomendação de operação

Manter apenas a automação de carrinho ativa. Não ativar as demais até resolver duplicidades no banco e validar templates com a equipe.

### Pendências de Etapa 4

- [ ] Editor de mensagens das automações no admin
- [ ] UX do campo "Tags Vinculadas" (melhoria)
- [ ] Visualização da fila `crm_dispatch_queue` no admin
- [ ] Blindagem contra duplicidade em seeds/migrations de automações

---

## 🗓️ Backlog futuro (P2/P3)

Ver `docs/backlog_future.md`.

---

## ✅ Etapa 5 — Pedido Manual Admin (concluída 2026-03-11)

**Prompts:** `RDC_BACK_E5_P1_CLD_V1` · `RDC_ADMIN_E5_P4_CLD_V1` · `RDC_BACK_E5_P6_CLD_V1` · `RDC_BACK_E5_P8_CLD_V1`

### Backend
- Acesso anônimo a `catalog_products` e `categories` + VIEW `catalog_products_public`
- `profiles.price_category` (`retail`/`wholesale`/`vip`)
- `orders.status` convertido de enum para text + CHECK (9 valores)
- `orders.origin` (`site`/`whatsapp`/`loja_fisica`/`outro`)
- `orders.payment_method` TEXT nullable
- `orders.coupon_id` UUID FK → coupons
- RPC `create_manual_order` SECURITY DEFINER (admin-only)
- Policies admin restauradas em `orders` e `order_items` (SELECT + UPDATE/ALL)
- Migrations: `000008` → `000013`

### Frontend
- `src/pages/admin/NewOrder.tsx` — seleção de cliente, busca de produtos, carrinho com preço editável, desconto (R$/%), cupom, status/origem/pagamento, data retroativa
- Rota `/admin/pedidos/novo` registrada em `App.tsx`
- Botão "Novo Pedido Manual" em `Pedidos.tsx`
- `PedidoSucesso.tsx` expandido para 9 status + fallback

### Fixes de dados
- Sessões anônimas removidas; UNIQUE (user_id) em client_sessions
- Jussara revertida para 'visitou'; Taita Bispo deduplicada; Rebeca deletada
- Migration: `000014`

---

## ✅ Etapa 6 — Promoções e Cupons B2B (concluída 2026-03-11)

**Prompts:** `RDC_BACK_E6_P1` → `RDC_BACK_E6_P8`

### Backend
- `store_settings`: min_cart_value dinâmico (singleton id=1)
- `coupons`: CRUD completo com code UPPERCASE, discount_type (`percent`/`fixed`/`free_shipping`), usage_limit, expires_at, min_order_value
- RPC `validate_coupon(p_code, p_cart_total)`: SECURITY DEFINER, acessível por anon+authenticated
- `create_manual_order` evoluída para 10 parâmetros: + `p_coupon_id`, + `p_created_at` (data retroativa)
- Fix 23505: ON CONFLICT (user_id) na sessão do cliente dentro da RPC
- Migrations: `000015` → `000020`

### Frontend
- `src/pages/admin/Marketing.tsx` — CRUD de cupons + edição do min_cart_value
- `src/types/marketing.ts` — tipagem de Coupon e StoreSettings
- `Checkout.tsx` — campo de cupom + leitura dinâmica do min_cart_value via store_settings
- `NewOrder.tsx` — campo de cupom + data retroativa (datetime-local)
- Bugs corrigidos: mapeamento da resposta de `validate_coupon` (`value/id/type` não `discount_amount/coupon_id/discount_type`); tabela `categories` (não `product_categories`)

### Documentação
- `docs/SCHEMA.md` criado — single source of truth de todas as tabelas, views, RPCs e CHECKs

---

## ✅ Segmentação Comercial de Clientes (concluída 2026-04-08)

### Backend
- `profiles.customer_segment` — source of truth (`network_partner` / `wholesale_buyer`, nullable)
- `orders.customer_segment_snapshot` — snapshot congelado no momento do pedido
- Backfill automático: `is_partner=true` → `network_partner`, `false` → `wholesale_buyer`
- RPC `admin_update_customer_segment(p_user_id, p_segment)` — SECURITY DEFINER, admin-only
- `get_all_profiles()` recriada (DROP + CREATE) para incluir `customer_segment`
- `create_manual_order` e `create_salao_order` atualizadas para herdar segmento
- Edge function `create-order` faz snapshot do segmento do profile
- Migration: `20260408000001_customer_segment.sql`

### Frontend
- Dropdown de segmento no painel de detalhe do cliente (`Clientes.tsx`)
- Optimistic update via React Query (`client-sessions` cache)
- Badges coloridos: laranja/dourado (Parceiro da Rede), teal (Comprador Atacado)

### Financeiro (refinamento visual)
- Filtro por período com presets (Hoje, 7d, 15d, Mês atual, Mês passado, Custom)
- Hero card com gradiente dourado
- Chart comparativo mês atual vs mês anterior dentro do grid de cards
