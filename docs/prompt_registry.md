# Registro de Prompts — Rei dos Cachos B2B

_Histórico dos prompts estruturados usados para implementação assistida por IA._
_Ferramenta principal: Claude Code (CLD). Ferramentas auxiliares: Antigravity/Gemini (ANT)._

---

## Convenção de IDs

```
RDC_{MÓDULO}_{ETAPA}_P{PARTE}_{FERRAMENTA}_V{VERSÃO}
```

Ferramentas: `CLD` = Claude Code · `ANT` = Antigravity/Gemini

Status possíveis: `DONE` · `DONE_COM_REVIEW` · `SKIPPED_BY_MERGE` · `READY_FOR_QA` · `PENDING` · `BLOCKED`

---

## CRM — Etapa 1

### RDC_CRM_E1_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Fundação do CRM — tabelas, RLS, seeds, debug screen.
**Resultado:** 6 tabelas criadas (`crm_events`, `crm_tags`, `crm_customer_tags`, `crm_automations`, `crm_automation_runs`, `processed_webhooks`), debug screen `/admin/crm`, seeds de tags e automações. Migration `20250313000001`.

---

## CRM — Etapa 2

### RDC_CRM_E2_P1_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Tracking real de eventos — backend (migrations, detect_abandoned_carts, webhook) e ajuste inicial de frontend.
**Resultado:** Policy INSERT em `crm_events` para usuários autenticados; `detect_abandoned_carts()` reescrita para emitir `cart_abandoned`; `webhook-mercadopago` com idempotência via `processed_webhooks` e inserção de `purchase_completed`. `useTrackInitiateCheckout` corrigido de `CHECKOUT_ABANDONED` → `'iniciou_checkout'`. Migrations `20250313000002`, `20250313000003`.

---

### RDC_CRM_E2_P2_ANT_V1
**Status:** DONE
**Ferramenta:** Antigravity/Gemini
**Data:** 2026-03-08
**Descrição:** Implementação frontend/core dos eventos CRM — integração de `crmService.trackEvent` nos hooks e páginas.
**Resultado:** Eventos de tracking integrados em `useSessionTracking.ts`, `Cadastro.tsx` e `crm.ts`. Criação de `src/types/crm.ts` e `src/services/crm.ts` com estrutura inicial de tipos e service.

---

### RDC_CRM_E2_P3_ANT_V2
**Status:** SKIPPED_BY_MERGE
**Ferramenta:** Antigravity/Gemini
**Data:** 2026-03-08
**Descrição:** Iteração planejada sobre frontend CRM — absorvida e substituída por RDC_CRM_E2_P4_CLD_V1.
**Resultado:** Conteúdo relevante incorporado na consolidação do P4. Prompt não executado de forma independente.

---

### RDC_CRM_E2_P4_CLD_V1
**Status:** DONE_COM_REVIEW
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Consolidação e ajuste fino da Etapa 2 — revisão técnica completa, correção de riscos residuais.
**Resultado:**
- `Cadastro.tsx`: `user.id` movido para dentro de `if(user)` — eliminado TypeError silencioso
- `crm.ts`: joins com FK inexistente removidos de `getAutomations()` e `getAutomationRuns()`; `triggered_at` → `created_at`
- `types/crm.ts`: `CrmRunStatus` corrigido (`'processing'` → `'running'`); `CrmEventRecord` adicionado; `CrmAutomationRun` reescrito com colunas reais; `CrmEvent` marcado `@deprecated`
- `useSessionTracking.ts`: import morto `CrmEventCode` removido; `useTrackPurchase` marcado `@deprecated`
- Build limpo confirmado

---

## Docs

### RDC_CRM_DOCS_P1_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Auditoria e criação da documentação operacional.
**Resultado:** Pasta `docs/` criada com `architecture.md`, `roadmap.md`, `decisions.md`, `prompt_registry.md`, `qa_checklists.md`, `backlog_future.md`. `README.md` reescrito.

---

### RDC_CRM_E2_P5_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Fechamento documental da Etapa 2 — atualização de status nos docs oficiais.
**Resultado:** `prompt_registry.md` com status e entradas faltantes; `roadmap.md` marcado READY_FOR_QA; `qa_checklists.md` expandido com queries SQL e estrutura executável.

---

### RDC_CRM_E2_P6_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Validação técnica do cenário de abandono e compra MercadoPago (Etapa 2 QA steps 5 e 6).
**Resultado:**
- detect_abandoned_carts(): validada tecnicamente — lógica, idempotência natural via status, SECURITY DEFINER, constraint cart_abandoned, cron job ativo (*/10 * * * *) confirmados por code review
- Compra MP — SQL simulation: processed_webhooks INSERT, crm_events purchase_completed INSERT, UPDATE result e idempotência ON CONFLICT todos validados via SQL Editor
- Bloqueios: sandbox MP vazio, sem acesso à internet no ambiente, sem service_role key — 2 itens do checklist dependem de pagamento real
- qa_checklists.md atualizado: 3/5 itens do step 5 marcados como validados

---

### RDC_CRM_E2_P7_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Fix do painel `/admin/crm` após QA — correção de schema mismatches entre código e banco real.
**Resultado:**
- `services/crm.ts`: `getCustomerTags()` — select corrigido de `added_by, created_at` → `source, assigned_by, assigned_at`
- `utils/crm.ts`: `getRunStatusInfo` — case `'processing'` (inexistente no DB) → `'running'`
- `pages/admin/CrmDebug.tsx`: 10+ fixes:
  - `supabase.rpc('get_all_profiles')` substituído por queries diretas em `profiles` e `client_sessions`
  - Inline runs query: join `(name, code)` → `(name)`; `.order('triggered_at')` → `.order('created_at')`
  - `auto.code` → `auto.trigger_type`; `auto.status === 'active'` → `auto.is_active`; `getAutomationStatusLabel` removido inline
  - `tag.code` → `tag.slug`; `getTagCategoryLabel(tag.category)` → `tag.type`
  - `ct.tag?.code` → `ct.tag?.slug`
  - `parseRunMetadata(run.metadata)` → `parseRunMetadata(run.action_payload)`
  - `run.triggered_at` → `run.created_at`; `run.error_log` → `run.error_message`
  - Imports desnecessários `getTagCategoryLabel`, `getAutomationStatusLabel` removidos
- Build limpo confirmado

---

### RDC_CRM_E2_P8_ANT_V1
**Status:** DONE
**Ferramenta:** Antigravity/Gemini
**Data:** 2026-03-08
**Descrição:** Correções de QA da Etapa 2 (Frontend/UX) — sobreposição do botão WhatsApp e deduplicação de carrinho.
**Resultado:** Botão oculto da rota `/checkout`. Deduplicação inteligente de array de produtos incrementada.

---

### RDC_CRM_E2_P9_ANT_V1
**Status:** DONE
**Ferramenta:** Antigravity/Gemini
**Data:** 2026-03-08
**Descrição:** Atualização Documental da Etapa 2 — registro de aprovação com ressalvas, prompts e itens novos de backlog futuro.
**Resultado:** Documentação sincronizada (`roadmap.md`, `prompt_registry.md`, `qa_checklists.md`, `backlog_future.md`).

---

## CRM — Etapa 3

### RDC_CRM_E3_P1_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Motor de tags híbridas — Etapa 3 P1. Trigger SQL AFTER INSERT em crm_events atribui/remove tags automaticamente em crm_customer_tags.
**Resultado:**
- Migration `20250313000004_crm_tag_engine.sql` criada
- `assign_crm_tag(user_id, slug, source)`: helper idempotente via ON CONFLICT DO NOTHING
- `remove_crm_tag(user_id, slug)`: remoção de tag ao avançar no funil
- `apply_crm_tags_from_event()`: trigger function SECURITY DEFINER, EXCEPTION capturado (nunca trava o INSERT)
- Trigger `crm_events_apply_tags` AFTER INSERT ON crm_events
- `backfill_crm_tags()`: retroativo para usuários existentes, executar via SQL Editor
- Seed `adicionou-carrinho` adicionado
- docs/roadmap.md e docs/qa_checklists.md atualizados

### RDC_CRM_E3_P3_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Dispatcher WhatsApp via UAZAPI — edge function crm-dispatcher com idempotência, rastreamento em crm_automation_runs e suporte a dois modos de invocação.
**Resultado:**
- `supabase/functions/crm-dispatcher/index.ts` criado e validado em produção
- Modo A: Supabase Database Webhook em crm_customer_tags INSERT (trigger por tag)
- Modo B: HTTP POST direto com user_id e automation_id opcional
- UAZAPI endpoint correto: `POST /send/text` com `token` no header e campo `text` (não `message`)
- Template rendering: substituição simples de `{variavel}`
- Phone sanitization: normaliza para DDI 55 + dígitos
- Idempotência: uma execução success por (automation_id × user_id)
- crm_automation_runs: criado como 'running', atualizado para 'success' ou 'failed'
- `supabase/migrations/20250313000005_crm_dispatcher_setup.sql` criado:
  - Fix de phone_field ('customer_whatsapp' → 'phone') em todas as automações
  - Automação de exemplo com trigger_type='tag_added' para abandonou-carrinho (is_active=false)
- Bug corrigido: seeds usavam phone_field='customer_whatsapp' que não existe em profiles
- **Validação em produção:** `dispatched: 1` confirmado — mensagem recebida no WhatsApp

---

### RDC_CRM_E3_P3_VAL_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Validação e correção do endpoint UAZAPI no crm-dispatcher.
**Resultado:**
- Endpoint `/send-message?token=TOKEN` retornava 405 — não existe na API UAZAPI
- Endpoint correto descoberto via testes: `POST /send/text` com `token` no header e body `{number, text}`
- `crm-dispatcher/index.ts` corrigido: endpoint, header token, campo `text`
- `action_payload` no run atualizado para `{number, text}` (consistência)
- Redeploy via `npx supabase functions deploy crm-dispatcher --project-ref kjfsmwtwbreapipifjtu`
- Teste final: `dispatched: 1, skipped: 0` — WhatsApp recebido com sucesso

---

### RDC_CRM_E4_P4_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-09
**Descrição:** Fila de disparo com delay — crm_dispatch_queue, crm-queue-processor, suporte a delay_minutes no dispatcher.
**Resultado:**
- `supabase/migrations/20250313000007_crm_dispatch_queue.sql` criado
- Tabela `crm_dispatch_queue` com status, scheduled_at, idempotency_key UNIQUE, attempt_count (máx 3)
- `claim_crm_queue_items()`: claim atômico FOR UPDATE SKIP LOCKED — safe para cron concorrente
- `reset_stuck_crm_queue_items()`: recupera itens presos em 'processing' >5min
- `supabase/functions/crm-queue-processor/index.ts` criado e deployado (`--no-verify-jwt`)
- `crm-dispatcher` atualizado: delay_minutes > 0 → enfileira; delay_minutes = 0 → envia imediato
- `force=true` bypassa fila e envia imediato (comportamento de disparo manual admin)
- Resposta do dispatcher estendida: `{ dispatched, skipped, queued }`
- Deploy: ambas as functions deployadas com `--no-verify-jwt`
- pg_cron: SQL fornecido para agendar a cada minuto via `net.http_post`

---

## Backend — Etapa 5

### RDC_BACK_E5_P1_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-10
**Descrição:** Infraestrutura de acesso público ao catálogo + price_category no perfil.
**Resultado:**
- `GRANT SELECT ON catalog_products TO anon` — acesso anon explícito
- `categories`: policy `authenticated_read_categories` → `anyone_read_categories` + GRANT anon
- VIEW `catalog_products_public` (security_invoker=true): projeção segura sem colunas internas
- `profiles.price_category TEXT DEFAULT 'retail' CHECK IN ('retail','wholesale','vip')` — base para tabela de preços
- Migration: `20250313000008_public_catalog_access.sql`

---

## Admin — Etapa 5

### RDC_BACK_E5_P8_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-11
**Descrição:** Fix 404 da RPC create_manual_order — parâmetro renomeado para alinhar com o frontend.
**Causa raiz:** PostgREST resolve RPCs por nome de parâmetro. Frontend enviava `p_user_id`; função tinha `p_customer_id`.
**Resultado:**
- DROP de todas as overloads anteriores (7-param com `p_customer_id` era a única real)
- Função recriada com assinatura `(p_user_id, p_items, p_total, p_status, p_origin, p_payment_method, p_notes)`
- Lógica de segurança, CRM e sessão preservadas integralmente
- Migration: `20250313000011_fix_manual_order_signature.sql` — aplicada

---

### RDC_BACK_E5_P6_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-10
**Descrição:** Adicionar forma de pagamento ao pedido manual.
**Resultado:**
- `orders.payment_method TEXT` — nullable, sem CHECK (campo livre)
- RPC `create_manual_order` atualizada: novo parâmetro `p_payment_method TEXT DEFAULT NULL`, incluído no INSERT e no metadata do crm_event
- Versão anterior da função (sem o parâmetro) removida via `DROP FUNCTION IF EXISTS`
- Migration: `20250313000010_orders_payment_method.sql` — aplicada

---

### RDC_ADMIN_E5_P4_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-10
**Descrição:** Interface admin para lançar pedidos manuais (vendas via WhatsApp/loja física).
**Resultado:**
- Migration `20250313000009`: `orders.status` enum → text + CHECK (9 valores), coluna `orders.origin` ('site','whatsapp','loja_fisica','outro'), RPC `create_manual_order` SECURITY DEFINER
- `src/pages/admin/NewOrder.tsx`: seleção de cliente (get_all_profiles), busca de produtos, carrinho com preço editável por item, campos de status/origem/notas, total dinâmico, RPC call + toast + redirect
- `src/App.tsx`: rota `/admin/pedidos/novo` registrada
- `src/pages/admin/Pedidos.tsx`: botão "Novo Pedido Manual" no header
- Build TypeScript: limpo (0 erros)
- Migration deployada: `npx supabase db push --linked`

---

## Backend — Etapa 6 (Promoções, Cupons, Valor Mínimo Dinâmico)

### RDC_BACK_E6_P1_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-11
**Descrição:** Infraestrutura de promoções B2B — `store_settings` e `coupons` + RPC `validate_coupon`.
**Resultado:**
- `store_settings`: tabela singleton (id=1), `min_cart_value NUMERIC DEFAULT 500.00`; RLS leitura pública, UPDATE admin
- `coupons`: `code` UPPERCASE UNIQUE, `discount_type` (`percent`/`fixed`/`free_shipping`), `min_order_value`, `usage_limit`, `expires_at`, `is_active`; RLS somente admin (sem leitura pública — previne garimpagem)
- `validate_coupon(p_code, p_cart_total)`: SECURITY DEFINER, normaliza `UPPER(TRIM())`, retorna `{valid, id, type, value}` ou `{valid:false, error}`; GRANT para anon+authenticated
- Migration: `20250313000015_store_settings_and_coupons.sql`

---

### RDC_BACK_E6_P2_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-11
**Descrição:** Associar cupom ao pedido e incrementar `used_count`.
**Resultado:**
- `orders.coupon_id UUID REFERENCES coupons(id)` — nullable FK
- `create_manual_order`: novo param `p_coupon_id UUID DEFAULT NULL`; grava `coupon_id` no INSERT; `UPDATE coupons SET used_count+1` dentro da mesma transação; `coupon_id` no metadata CRM
- Migration: `20250313000016_orders_coupon_and_rpc_update.sql`

---

### RDC_BACK_E6_P3_CLD_V1
**Status:** DONE (depois absorvido/revertido por P4)
**Ferramenta:** Claude Code
**Data:** 2026-03-11
**Descrição:** Adicionou coluna booleana `free_shipping` em coupons (abordagem descartada na iteração seguinte).
**Resultado:** Migration `20250313000017` — revertida conceitualmente pelo P4.

---

### RDC_BACK_E6_P4_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-11
**Descrição:** Refatoração: `free_shipping` como tipo de desconto (não flag booleana).
**Resultado:**
- `DROP COLUMN free_shipping` (boolean removida)
- CHECK `discount_type` expandido: `('percent', 'fixed', 'free_shipping')`
- `validate_coupon` simplificada: retorno `{valid, id, type, value}` — frontend interpreta `type='free_shipping'` para zerar frete
- Migration: `20250313000018_coupons_freeshipping_as_type.sql`

---

### RDC_BACK_E6_P6_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-11
**Descrição:** Single Source of Truth — auditoria e documentação completa do schema do banco.
**Resultado:**
- Arquivo criado: `docs/SCHEMA.md` (não existia)
- 18 tabelas documentadas com colunas exatas, tipos, nullable, defaults, FKs
- 2 views, 10+ RPCs com assinaturas completas
- Tabela de CHECKs e seção "Armadilhas Comuns" (❌ errado → ✅ correto) para prevenir erros 400/404 de integração frontend

---

### RDC_BACK_E6_P7_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-11
**Descrição:** Suporte a data retroativa em pedidos manuais (lojista B2B que registra vendas do dia anterior).
**Resultado:**
- `create_manual_order`: 10º parâmetro `p_created_at TIMESTAMPTZ DEFAULT NULL`
- `INSERT orders.created_at = COALESCE(p_created_at, now())`
- `order_date` incluído no metadata CRM
- `docs/SCHEMA.md` atualizado com nova assinatura
- Migration: `20250313000019_manual_order_custom_date.sql`

---

### RDC_BACK_E6_P8_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-11
**Descrição:** Fix crítico — erro 23505 (duplicate key) ao criar pedido manual para cliente com sessão existente.
**Causa raiz:** Migration `_014` adicionou `UNIQUE (user_id)` em `client_sessions`, mas a RPC usava `ON CONFLICT (session_id)` — não cobria a nova constraint.
**Resultado:**
- `ON CONFLICT (session_id)` → `ON CONFLICT (user_id)`
- DO UPDATE também normaliza `session_id` para padrão canônico `user_{uuid}`
- Migration: `20250313000020_fix_manual_order_session_upsert.sql`

---

## Template para novos prompts

```
### RDC_{MÓDULO}_{ETAPA}_P{N}_{FERRAMENTA}_V{N}
**Status:** PENDING
**Ferramenta:**
**Data:**
**Descrição:**
**Resultado:**
```
