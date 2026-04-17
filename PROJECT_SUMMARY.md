# Project Summary — Rei dos Cachos B2B

> Gerado em: 2026-04-17  
> Baseado em: análise completa do repositório (código, migrations, docs, configs)  
> Propósito: base técnica para próximas etapas de CRM + automação WhatsApp

---

## 1. Visão Geral

**O que é:** E-commerce B2B para revenda de cosméticos. Clientes são revendedoras, salões e distribuidoras que compram no atacado.

**Principais áreas do produto:**
- Catálogo B2B com preços segmentados e tabelas de preço por cliente
- Checkout (PIX, crédito, pagamento na entrega, retirada física)
- CRM com funil de vendas, tags automáticas, fila comercial e automações WhatsApp
- Admin completo (pedidos, clientes, vendedores, financeiro, marketing, estoque)
- PDV de Salão (operador cria pedidos com pagamento dividido)
- Integração com Nuvemshop (catálogo), MercadoPago (pagamento), UAZAPI (WhatsApp), n8n (workflows)

**Objetivo de negócio percebido:** aumentar volume de revendas via gestão comercial ativa (CRM + automações) e reduzir fricção no processo de compra B2B.

**Principais fluxos existentes:**
1. Lead se cadastra → funil é rastreado via `client_sessions` + `crm_events`
2. Usuário compra → webhook MercadoPago confirma → tags CRM atribuídas → automação WhatsApp disparada
3. Admin gerencia fila comercial com priorização por `next_action_at` e segmento
4. Vendedor é notificado manualmente (não existe automação de alerta ainda)
5. Pedido manual criado pelo admin ou PDV de salão (sem passar pelo checkout)

---

## 2. Stack Atual

### Frontend
- React 18.3 + Vite 5.4 + TypeScript 5.8
- Tailwind CSS 3.4 + Shadcn/UI (Radix UI, 25+ componentes)
- React Router DOM 6.30
- TanStack React Query 5.83 (cache/sync de dados)
- React Hook Form 7.61 + Zod 3.25 (formulários e validação)
- Recharts 2.15 (gráficos)
- date-fns 3.6, DOMPurify 3.3, Sonner 1.7 (toasts)

### Backend
- Supabase (PostgreSQL 15, Auth, Edge Functions Deno, Storage, Realtime)
- 110 migrations aplicadas
- 47 RPCs (SECURITY DEFINER)
- 20+ triggers
- pg_cron para jobs periódicos

### Banco de Dados
- PostgreSQL via Supabase hosted (`kjfsmwtwbreapipifjtu.supabase.co`)
- RLS habilitado em todas as tabelas exceto `rate_limits` e `processed_webhooks`
- Função `is_admin()` SECURITY DEFINER centraliza verificação de role

### Autenticação
- Supabase Auth (email + senha)
- Parceiros: login por telefone resolvido via RPC `resolve_partner_login_email` → `signInWithPassword`
- Roles: `user` (cliente B2B), `admin`, `salao`
- `roleLoadedRef` evita re-render em refresh de token (D-15)

### Infraestrutura
- Deploy: Vercel (push to main = deploy automático)
- Edge Functions: Supabase (Deno runtime)
- pg_cron: ativo para `release_expired_orders`, `detect_abandoned_carts`, `crm-queue-processor`
- Storage: bucket `product-images`

### Serviços Externos
| Serviço | Propósito |
|---|---|
| MercadoPago | Pagamento (PIX, crédito) — webhook de confirmação |
| UAZAPI | Envio de WhatsApp via `crm-dispatcher` |
| Nuvemshop | Sincronização de catálogo de produtos |
| n8n | Workflows (integração ClickUp, Slack) |
| Google Sheets | Exportação manual de relatórios |
| Meta Pixel | Tracking de funil (ViewContent, AddToCart, InitiateCheckout) |

### Build/Deploy
- Vite para build (`dist/`)
- Vercel para hosting do frontend
- `npx supabase functions deploy` para edge functions
- `npx tsc --noEmit` para type-check antes de entregar

---

## 3. Estrutura do Repositório

```
rdc-revend/
├── src/
│   ├── pages/
│   │   ├── admin/          # Telas do painel administrativo
│   │   ├── salao/          # Interface do PDV de salão
│   │   └── *.tsx           # Telas públicas (Catalogo, Login, Checkout, etc)
│   ├── components/
│   │   ├── admin/          # Componentes do admin (Timeline, Notes, NextAction, etc)
│   │   ├── catalog/        # Componentes do catálogo
│   │   ├── landing/        # Componentes de landing (WhatsAppButton)
│   │   └── ui/             # Shadcn/UI (50+ componentes primitivos)
│   ├── hooks/              # React Hooks customizados (useAdminProducts, useCatalogProducts, useSessionTracking, etc)
│   ├── services/           # crm.ts (único serviço dedicado)
│   ├── lib/                # supabase.ts, utils.ts, environment.ts, crmFilters.ts
│   ├── types/              # crm.ts, marketing.ts
│   ├── utils/              # crm.ts (helpers de display), profile.ts, validateDocument.ts
│   ├── contexts/           # AuthContext.tsx, CartContext.tsx
│   ├── config/             # Configurações de ambiente
│   └── test/               # Testes (Vitest)
├── supabase/
│   ├── functions/          # Edge Functions (Deno)
│   │   ├── crm-dispatcher/
│   │   ├── crm-queue-processor/
│   │   ├── create-order/   # ⚠️ FEATURE FREEZE
│   │   ├── create-user/
│   │   ├── webhook-mercadopago/
│   │   ├── sync-nuvemshop/
│   │   ├── admin-partner-credentials/
│   │   ├── n8n-sync-back/
│   │   ├── sync-google-sheets/
│   │   ├── debug-sync/
│   │   └── test-sync/
│   └── migrations/         # 110 arquivos SQL (2025-02-21 → 2026-04-15)
├── docs/                   # SCHEMA.md, architecture.md, roadmap.md, decisions.md, etc
├── n8n/                    # Workflows n8n (exportados)
├── scripts/                # Scripts auxiliares
├── public/                 # Assets estáticos
└── PROJECT_SUMMARY.md      # Este arquivo
```

---

## 4. Ambientes e Configuração

### Diferenciação Dev/Prod
- **Dev:** `http://localhost:5173` (Vite dev server)
- **Prod:** `https://rdc-revend.vercel.app` (Vercel)
- CORS configurado nas edge functions para ambas as origens
- MercadoPago: credenciais de teste (DEV) vs produção (PROD) separadas no `.env`
- UAZAPI: **mesma instância** para dev e prod (risco de envio acidental em testes)

### Variáveis de Ambiente Identificadas (`.env.local.example`)

**Frontend (prefixo `VITE_`):**
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_NUVEMSHOP_STORE_ID
VITE_NUVEMSHOP_USER_AGENT
```

**Edge Functions (Supabase Secrets):**
```
MERCADOPAGO_WEBHOOK_SECRET
UAZAPI_URL
UAZAPI_TOKEN
META_PIXEL_ID          # Não confirmado em uso server-side
META_CONVERSIONS_TOKEN # Não confirmado em uso server-side
```

**Outros (em `.env.local` mas não prefixo VITE):**
```
PUBLIC_KEY_MERCADOPAGO_DEV / _PROD
ACCESS_TOKEN_MERCADOPAGO_DEV / _PROD
USER_ID_MERCADOPAGO_DEV / _PROD
SERVER_URL (UAZAPI)
INSTANCE_TOKEN (UAZAPI)
ADMIN_TOKEN (UAZAPI)
NUMERO_CONECTADO (UAZAPI)
SERVICE_ROLE (Supabase)
API_KEY (Google)
```

### Lacunas e Riscos de Configuração
- **Não existe ambiente de staging** — dev e prod compartilham a mesma instância UAZAPI
- **Secrets de MercadoPago** presentes no `.env.local.example` com valores reais — risco de exposição
- `META_PIXEL_ID` e `META_CONVERSIONS_TOKEN` não confirmados como configurados em Supabase Secrets (servidor-side não implementado)
- Sem `.env.production` explícito — diferenciação depende de lógica no código

---

## 5. Banco de Dados

### Tabelas Principais

| Tabela | Propósito | RLS |
|---|---|---|
| `profiles` | Perfil B2B do usuário (role, segmento, seller, next_action, price_list) | Sim |
| `orders` | Pedidos (status, payment, shipping, splits, snapshot de segmento) | Sim |
| `order_items` | Itens do pedido (snapshots de nome e preço) | Sim |
| `catalog_products` | Produtos do catálogo (sort_order, price, partner_price, is_active) | Sim (anon lê is_active) |
| `categories` | Categorias de produtos | Sim (anon lê) |
| `inventory` | Estoque por produto | Sim |
| `sellers` | Vendedores (code, phone, commission_pct, user_id, is_default) | Sim (admin) |
| `client_sessions` | Status de funil por usuário (UNIQUE user_id) | Sim |
| `coupons` | Cupons de desconto | Sim |
| `store_settings` | Configurações globais singleton (id=1) | Não |
| `price_lists` | Tabelas de preço para parceiros | Sim |
| `price_list_items` | Preços por produto em cada tabela | Sim |
| `pickup_units` | Unidades físicas de retirada | Sim |
| `upsell_offers` | Ofertas de upsell no checkout | Sim |
| `kit_components` | Composição de kits | Sim |
| `customer_notes` | Notas do CRM por cliente | Sim (admin) |
| `crm_events` | Log de eventos do funil | Sim (admin) |
| `crm_tags` | Catálogo de tags (system/custom) | Sim |
| `crm_customer_tags` | Relação usuário ↔ tag | Sim |
| `crm_automations` | Definições de automações WhatsApp | Sim (admin) |
| `crm_automation_runs` | Log de execuções com idempotência | Sim (admin) |
| `crm_dispatch_queue` | Fila de envios com delay | Sim |
| `processed_webhooks` | Idempotência de webhooks externos | Não |
| `rate_limits` | Rate limiting para edge functions | Não |
| `catalog_sync_runs` | Histórico de sincronizações Nuvemshop | Sim |

### Relações Importantes

```
profiles.assigned_seller_id   → sellers.id (ON DELETE SET NULL)
profiles.price_list_id        → price_lists.id
orders.user_id                → auth.users.id
orders.seller_id              → sellers.id (ON DELETE SET NULL)
orders.coupon_id              → coupons.id
order_items.order_id          → orders.id (ON DELETE CASCADE)
order_items.product_id        → catalog_products.id (ON DELETE SET NULL)
catalog_products.category_id  → categories.id (ON DELETE SET NULL)
inventory.product_id          → catalog_products.id (UNIQUE)
price_list_items.price_list_id→ price_lists.id (ON DELETE CASCADE)
price_list_items.product_id   → catalog_products.id (ON DELETE CASCADE)
crm_customer_tags.user_id     → auth.users.id (ON DELETE CASCADE)
crm_customer_tags.tag_id      → crm_tags.id (ON DELETE CASCADE)
sellers.user_id               → auth.users.id (ON DELETE SET NULL)
customer_notes.user_id        → auth.users.id (ON DELETE CASCADE)
```

### Campos Relevantes para CRM

**`profiles`:** `customer_segment`, `assigned_seller_id`, `next_action`, `next_action_at`, `price_list_id`, `phone`, `auth_phone`, `access_status`, `lead_status`, `clickup_task_id`, `assigned_seller` (legado)

**`sellers`:** `id`, `name`, `code`, `phone`, `user_id`, `is_default`, `active`, `commission_pct`, `monthly_goal`

**`orders`:** `status`, `customer_segment_snapshot`, `payment_method`, `payment_splits`, `origin`, `seller_id`

**`client_sessions`:** `status` (funil), `cart_items_count`, `last_page`

### Migrations CRM/WhatsApp

| Migration | Data | O que faz |
|---|---|---|
| `20250313000001_crm_foundation` | 2025-03-13 | 6 tabelas CRM + seeds de tags e automações |
| `20250313000002_crm_events_rls_and_types` | 2025-03-13 | RLS crm_events + CHECK event_type expandido |
| `20250313000003_update_detect_abandoned_carts` | 2025-03-13 | Cron de detecção de abandono atualizado |
| `20250313000004_crm_tag_engine` | 2025-03-13 | Motor de tags: assign_crm_tag, remove_crm_tag, apply_crm_tags_from_event |
| `20250313000005_crm_dispatcher_setup` | 2025-03-13 | Setup do dispatcher (RPC claim_crm_queue_items) |
| `20250313000006_crm_e4_automations` | 2025-03-13 | Seeds das automações operacionais |
| `20250313000007_crm_dispatch_queue` | 2025-03-13 | Tabela crm_dispatch_queue + reset_stuck_crm_queue_items |
| `20260412000001_crm_owner_next_action` | 2026-04-12 | next_action, next_action_at, assigned_seller_id em profiles + RPCs |
| `20260412000002_customer_notes` | 2026-04-12 | Tabela customer_notes + RPCs CRUD |
| `20260412000006_sellers_user_id` | 2026-04-12 | sellers.user_id + RPC admin_set_seller_user_id |

### RPCs Existentes (47 total — resumo por categoria)

**Leitura:**
- `get_crm_customer_debug(p_user_id)` → jsonb consolidado
- `get_customer_timeline(p_user_id, p_limit)` → timeline de eventos/pedidos/notas
- `get_all_profiles(...)` → todos os profiles com stats enriquecidos
- `get_my_price_list_items()` → preços customizados do parceiro
- `get_network_partners()` → parceiros da rede
- `get_all_client_stats(...)` → estatísticas por período
- `resolve_partner_login_email(p_phone)` → telefone → email (anon)
- `search_customers_for_salao(p_search)` → busca para PDV

**Escrita/Mutation:**
- `create_manual_order(12 params)` → pedido manual admin
- `create_salao_order(...)` → pedido PDV
- `validate_coupon(p_code, p_cart_total)` → validação de cupom
- `admin_set_profile_seller`, `admin_set_profile_next_action`, `admin_update_customer_segment`
- `admin_update_profile(p_user_id, 13 params)` → edição de perfil completo
- `admin_update_product_sort_orders(p_updates jsonb)` → drag-and-drop
- `assign_crm_tag`, `remove_crm_tag` → motor de tags
- `claim_crm_queue_items(p_batch_size)` → claim atômico da fila
- `admin_create/update/delete_customer_note` → CRUD de notas
- `decrement_stock`, `restore_order_stock` → estoque
- `release_expired_orders()` → pg_cron job
- `detect_abandoned_carts()` → pg_cron job

---

## 6. CRM Atual

### O que já existe

| Feature | Status | Onde |
|---|---|---|
| Tracking de funil (5 eventos) | ✅ Operacional | `useSessionTracking.ts` |
| Motor de tags automáticas | ✅ Operacional | Trigger `crm_events_apply_tags` |
| Dispatcher WhatsApp (1 msg por automação) | ✅ Operacional | `crm-dispatcher` |
| Fila com delay | ✅ Operacional | `crm_dispatch_queue` + `crm-queue-processor` |
| Fila comercial com priorização | ✅ Operacional | `Clientes.tsx` + `crmFilters.ts` |
| Notas do cliente | ✅ Operacional | `customer_notes` + `CustomerNotes.tsx` |
| Próxima ação agendada | ✅ Operacional | `profiles.next_action_at` + `NextActionEditor.tsx` |
| Timeline do cliente | ✅ Operacional | `get_customer_timeline` + `CustomerTimeline.tsx` |
| Atribuição de vendedor (owner) | ✅ Operacional | `profiles.assigned_seller_id` |
| Debug CRM (admin) | ✅ Operacional | `CrmDebug.tsx` |
| Segmentação (network_partner / wholesale_buyer) | ✅ Operacional | `profiles.customer_segment` |
| Detecção de abandono de carrinho | ✅ Operacional | `detect_abandoned_carts()` cron |
| Automações multi-step (sequências) | ❌ Não existe | — |
| Detecção de inatividade (7/30/60d) | ❌ Não existe | — |
| Recebimento de respostas WhatsApp (inbound) | ❌ Não existe | — |
| Pré-qualificação automática | ❌ Não existe | — |
| Alertas automáticos para vendedora | ❌ Não existe | — |
| Editor de templates no admin | ❌ Não existe | — |

### Segmentação de Clientes

- `customer_segment`: `'network_partner'` (parceiro da rede) ou `'wholesale_buyer'` (comprador atacado) ou `NULL` (legado/não classificado)
- `is_partner` (boolean): campo legado, mantido por retrocompatibilidade
- `AuthContext.isPartner = is_partner || customer_segment === 'network_partner'`
- Parceiros têm acesso a `price_list_id` (preços personalizados) e `pay_on_delivery`

### Assigned Seller (Owner Comercial)

- `profiles.assigned_seller_id` FK → `sellers.id` — source of truth
- `profiles.assigned_seller` (text) — campo legado sincronizado pela RPC
- Atribuição via `admin_set_profile_seller(p_user_id, p_seller_id)` (admin only)
- UI: dropdown em `Clientes.tsx` (pendência: migrar para RPC em vez de PATCH direto — ver CRM P3)
- Vendedor vinculado a usuário via `sellers.user_id` — permite "Minhas contas" na fila

### Como Notas, Tags, Timeline e Fila Funcionam

**Notas:** CRUD admin via RPCs `admin_create/update/delete_customer_note`. Exibidas em `CustomerNotes.tsx` dentro do detalhe do cliente em `Clientes.tsx`.

**Tags:** Atribuídas automaticamente por trigger (`apply_crm_tags_from_event`) ou manualmente no `CrmDebug.tsx`. UI de add/remove disponível.

**Timeline:** RPC `get_customer_timeline` consolida eventos CRM, pedidos e notas em ordem cronológica. Exibida em `CustomerTimeline.tsx`.

**Fila Comercial:** `Clientes.tsx` filtra e ordena por predicados em-memory (`crmFilters.ts`). Views: todos, minhas contas, follow-up vencido/hoje, sem próxima ação, novos sem pedido, parceiros inativos. Prioridade: `vencido > hoje > sem_acao > futuro`.

---

## 7. Automações Atuais

### Arquitetura

O sistema atual é **1 automação = 1 mensagem, 1 vez por usuário.** A idempotência via `crm_automation_runs.idempotency_key` (`auto_{id}_user_{id}`) impede re-disparo. Não existe conceito de sequência multi-step.

### Modos de Disparo

1. **Automático via tag:** Trigger em `crm_customer_tags.INSERT` → Supabase Database Webhook → `crm-dispatcher`
2. **Automático via fila:** pg_cron → `crm-queue-processor` → `crm-dispatcher` (para automações com `delay_minutes > 0`)
3. **Manual:** Admin no `CrmDebug.tsx` → `crmService.dispatchManual()` (ignora `is_active`, usa `force=true`)

### Motor de Tags (Trigger Automático)

**Trigger:** `crm_events_apply_tags` AFTER INSERT em `crm_events`  
**Função:** `apply_crm_tags_from_event()` SECURITY DEFINER

| Evento | Tag Atribuída | Tags Removidas |
|---|---|---|
| `purchase_completed` (1ª compra) | `novo-cliente` | `adicionou-carrinho`, `iniciou-checkout`, `abandonou-carrinho` |
| `purchase_completed` (2ª+ compra) | `recorrente` | `novo-cliente` + acima |
| `cart_abandoned` | `abandonou-carrinho` | — |
| `iniciou_checkout` | `iniciou-checkout` | — |
| `adicionou_carrinho` | `adicionou-carrinho` | — |
| Qualquer outro | — | — |

### Seeds de Automações (todas `is_active = false`)

| Nome | Trigger | Condição | Delay | Template |
|---|---|---|---|---|
| CRM: Recuperacao Carrinho (tag) | `tag_added` | `tag_slug: abandonou-carrinho` | 60 min | "Olá {nome}, deixou produtos no carrinho..." |
| CRM: Boas-vindas Novo Cliente | `tag_added` | `tag_slug: novo-cliente` | 0 | "Bem-vindo à família Rei dos Cachos..." |
| CRM: Fidelizacao Cliente Recorrente | `tag_added` | `tag_slug: recorrente` | 0 | "Que bom ter você de volta..." |

> ⚠️ **Duplicidades identificadas:** roadmap menciona duplicidades nas automações "Boas-vindas" e "Fidelização" no banco. Verificar e limpar antes de ativar.

### Jobs / Crons Ativos

| Job | Frequência | Função SQL |
|---|---|---|
| `release_expired_orders` | a cada 5 min | `release_expired_orders()` |
| `detect_abandoned_carts` | a cada 10 min | `detect_abandoned_carts()` |
| `crm-queue-processor` | a cada 1 min | via `net.http_post` para edge function |

### Limitações da Arquitetura Atual

1. **Sem sequências:** Cada automação dispara 1 mensagem, 1 vez. Não há step 2, 3 etc.
2. **Sem detecção temporal:** Nenhum cron detecta "7 dias sem compra" ou "30 dias sem recompra"
3. **Sem inbound:** O sistema só envia mensagens. Não recebe respostas. O cliente pode responder e o sistema é cego.
4. **Sem supressão por comportamento:** Uma automação não sabe se o cliente respondeu, comprou ou ficou ativo.
5. **Sem controle de frequência:** Não há proteção contra múltiplas automações disparando no mesmo dia para o mesmo usuário.
6. **Idempotência por vida inteira:** `crm_automation_runs.idempotency_key` impede re-envio permanentemente. Se quiser re-engajar após 90 dias, não consegue sem deletar o run.
7. **Templates hardcoded:** Templates estão em `action_config JSONB` no banco. Só editáveis via SQL ou seed; não há admin UI.

---

## 8. WhatsApp e Mensageria

### Como o Sistema Envia Mensagens

1. `crm-dispatcher` (edge function Deno) recebe trigger (webhook de tag ou chamada direta)
2. Busca profile do usuário (`full_name`, `phone`)
3. Sanitiza telefone: `sanitizePhone()` → E.164 (`55XXXXXXXXXXX`)
4. Renderiza template com variáveis `{nome}` (apenas `nome` implementado hoje)
5. POST para `{UAZAPI_URL}/send/text` com `{number, text}` e header `token: {UAZAPI_TOKEN}`
6. Registra resultado em `crm_automation_runs` (success/failed + resposta raw)

### UAZAPI

- **URL base:** `https://reidoscachos.uazapi.com` (via secret `UAZAPI_URL`)
- **Endpoint de envio:** `POST /send/text`
- **Body:** `{ number: "5527...", text: "mensagem" }`
- **Auth:** header `token: {UAZAPI_TOKEN}`
- **Número conectado:** `5527996865366`
- **Inbound (webhook de recebimento):** **Não configurado.** UAZAPI suporta callback de mensagens recebidas, mas a edge function receptora não existe.

### Fila com Delay

- `crm_dispatch_queue`: itens com `scheduled_at` no futuro
- Status: `pending → processing → sent / failed`
- Máx 3 tentativas (`attempt_count`)
- pg_cron chama `crm-queue-processor` a cada minuto
- `claim_crm_queue_items(batch_size=10)` usa `FOR UPDATE SKIP LOCKED` (concurrency-safe)
- `reset_stuck_crm_queue_items()`: recupera itens presos em `processing` por 5+ min

### Logs e Idempotência

- `crm_automation_runs`: log completo por execução (payload, resposta, error, attempt_count)
- `idempotency_key`: `auto_{automation_id}_user_{user_id}` — garante 1 envio por automação por usuário (permanente)
- `processed_webhooks`: idempotência de webhooks externos (MercadoPago, etc)

### Suporte Inbound

**Não existe.** O sistema é exclusivamente outbound hoje.

---

## 9. Pedidos, Carrinho e Checkout

### Onde o Sistema Registra Pedidos

- `orders`: cabeçalho do pedido (status, totais, pagamento, origin, seller_id, segmento_snapshot)
- `order_items`: itens com snapshots de nome e preço no momento da compra

### Status de Orders

```
recebido → aguardando_pagamento → pago → separacao → enviado → entregue → concluido
           ↘ cancelado (qualquer ponto)
           ↘ expirado (pg_cron release_expired_orders a cada 5min)
```

### Como Detectar Compra

- **Server-side:** `webhook-mercadopago` confirma pagamento, atualiza `orders.status = 'pago'`, emite `crm_event 'purchase_completed'`, dispara motor de tags
- **Primeiro pedido vs. recorrente:** `apply_crm_tags_from_event()` faz COUNT de pedidos pagos anteriores do usuário para decidir tag `novo-cliente` vs `recorrente`

### Como Detectar Abandono

- **Abandono de carrinho:** `detect_abandoned_carts()` cron a cada 10min — sessões com status `'adicionou_carrinho'` ou `'iniciou_checkout'` sem atualização há 30min → marca como `'abandonou'`, emite `crm_event 'cart_abandoned'`
- **Carrinho server-side:** **Não existe.** O carrinho real fica no `localStorage` do navegador. `client_sessions.cart_items_count` é apenas um contador. Mensagens de recuperação não podem listar os produtos.

### Sinais no Banco

| Sinal | Onde fica | Como usar |
|---|---|---|
| Última compra | `orders.created_at` (MAX onde status NOT IN cancelado/expirado) | Detectar sem-recompra |
| Primeira compra | Mesmo, MIN | Detectar novo-cliente |
| Status de funil | `client_sessions.status` | Carrinho abandonado, checkout iniciado |
| Tags | `crm_customer_tags` | Segmentação CRM |
| Valor total gasto | RPC `get_all_profiles` já agrega | Fidelidade, high-ticket |
| Pedidos totais | Idem | Recorrência |

### Limitações

- Carrinho não é persistido server-side — impossível referenciar produtos específicos em mensagens de recuperação
- `orders.status = 'recebido'` não significa pagamento confirmado — apenas que o pedido foi criado
- Pedidos de salão (`origin = 'salao'`) não passam pelo MercadoPago — não disparam `webhook-mercadopago`

---

## 10. Sellers e Operação Comercial

### Modelagem

```sql
sellers: id, name, code (UNIQUE), email, phone, commission_pct, is_default, active, monthly_goal, user_id
```

`sellers.phone` **existe** (coluna confirmada na tabela). Mas não há validação de formato E.164.

### Relações

- `profiles.assigned_seller_id` → `sellers.id` — owner comercial do cliente
- `orders.seller_id` → `sellers.id` — quem fez/gerou o pedido
- `sellers.user_id` → `auth.users.id` — login da vendedora no sistema

### is_default

- Exatamente 1 seller pode ter `is_default = true` (trigger `trg_sellers_enforce_single_default`)
- `create_salao_order` usa o seller default quando `p_seller_id = NULL`
- Permite "autoatribuição" de pedidos do salão ao seller padrão

### Alertas / Ownership Atual

- **Não existe alerta automático para vendedoras.** A notificação é 100% manual.
- A fila comercial (`Clientes.tsx`) mostra "Minhas contas" filtrado por `assigned_seller_id` do usuário logado
- Vendedoras precisam acessar o admin manualmente para ver seus leads

### Pendência CRM P3

A UI de vinculação seller↔usuário em `Vendedores.tsx` faz PATCH direto em vez de chamar `admin_set_seller_user_id(p_seller_id, p_user_id)`. Deve ser migrado.

### Lacunas Operacionais

- Sem notificação push/WhatsApp quando lead é atribuído à vendedora
- Sem regra de round-robin ou atribuição automática por segmento
- `sellers.phone` existe mas o dispatcher não tem lógica de envio para vendedora (apenas para cliente)
- Sem relatório de performance por seller (além do resumo financeiro)

---

## 11. Admin e Operação

### Telas Administrativas

| Rota | Arquivo | O que faz |
|---|---|---|
| `/admin/catalogo` | `Catalogo.tsx` | CRUD de produtos, sync Nuvemshop, drag-and-drop de ordem |
| `/admin/categorias` | `Categorias.tsx` | CRUD de categorias |
| `/admin/estoque` | `Estoque.tsx` | Inventário com contagem e alertas de mínimo |
| `/admin/pedidos` | `Pedidos.tsx` | Kanban de pedidos por status, filtros por período/seller |
| `/admin/novo-pedido` | `NewOrder.tsx` | Criar pedido manual (cliente, produtos, desconto, cupom, data retroativa) |
| `/admin/clientes` | `Clientes.tsx` | Fila comercial com filtros operacionais, notas, next_action, timeline |
| `/admin/crm-debug` | `CrmDebug.tsx` | Inspeção técnica CRM: eventos, tags, automações, runs, disparo manual |
| `/admin/usuarios` | `Usuarios.tsx` | Criar, bloquear, gerenciar usuários e credenciais de parceiros |
| `/admin/vendedores` | `Vendedores.tsx` | CRUD de sellers, vínculo com usuário, comissão, metas |
| `/admin/financeiro` | `Financeiro.tsx` | Receita, comissões, comparativo mensal, filtros por período |
| `/admin/marketing` | `Marketing.tsx` | CRUD de cupons, configuração de min_cart_value |
| `/admin/tabelas-preco` | `TabelasPreco.tsx` | Gerenciamento de price lists e preços por produto/parceiro |
| `/admin/upsell` | `Upsell.tsx` | Gerenciamento de ofertas de upsell |
| `/admin/sync-history` | `SyncHistory.tsx` | Histórico de sincronizações Nuvemshop |

### O que Pode Ser Configurado Sem Código

- Produtos (CRUD, preços, imagens, ordem)
- Categorias
- Cupons (criar, ativar/desativar, limite de uso)
- Pedidos (mudar status, criar manual)
- Usuários (criar, bloquear, reset de senha)
- Sellers (criar, vincular a usuário, definir default)
- Price lists (criar, adicionar itens)
- min_cart_value (via Marketing page)
- Tags CRM (add/remove manualmente no CrmDebug)
- Automações CRM (toggle is_active no CrmDebug)
- Next action do cliente (via fila comercial)

### O que Depende de SQL / Alteração Manual

- Criar/editar **templates de mensagem** das automações (ficam em `action_config` JSONB)
- Criar novas **sequências** de automação (não existe UI)
- Configurar **pg_cron** (precisa executar SQL manualmente no Supabase)
- Configurar **Database Webhook** (via Supabase Dashboard, não via código)
- Limpar duplicidades de automações no banco
- Ativar automações individualmente
- Criar novas tags de sistema

### Pontos Frágeis

- Automações criadas como `is_active = false` e ninguém sabe qual está ativa em produção sem ir no CrmDebug
- Templates das automações só editáveis via SQL
- Webhook do Database (que dispara crm-dispatcher na inserção de tag) precisa ser configurado manualmente no Supabase Dashboard — sem documentação de como está configurado hoje

---

## 12. Logging, Observabilidade e Segurança

### Logs Existentes

| Log | Onde | Cobertura |
|---|---|---|
| Execuções de automação | `crm_automation_runs` | Payload, resposta, erro, tentativas |
| Eventos de funil | `crm_events` | Todos os eventos com metadata |
| Webhooks externos | `processed_webhooks` | Idempotência + resultado |
| Sincronizações | `catalog_sync_runs` | Resultado por run de sync |
| Rate limits | `rate_limits` | Contagem de requisições por chave |

### Monitoring / Observabilidade

- **Não existe dashboard de monitoring** dedicado
- Logs de edge functions: apenas via Supabase Dashboard (ephemeral)
- Sem Sentry, Datadog, ou similar configurado
- Sem alertas de erro em produção

### Tratamento de Erros

- `apply_crm_tags_from_event()`: silencia erros via `EXCEPTION WHEN OTHERS THEN NULL` — nunca trava o evento, mas pode perder tags silenciosamente
- `crm-dispatcher`: registra erro em `crm_automation_runs.error_message` e continua
- `crm-queue-processor`: max 3 tentativas por item antes de descartar
- `claim_crm_queue_items`: reset automático de itens presos (5min timeout)
- Edge functions: sem retry automático além da fila

### Segurança

- RLS universal com `is_admin()` SECURITY DEFINER (sem recursão em policies)
- Rate limiting: `check_rate_limit(key, max, window)` em `create-order`
- Webhook MercadoPago: validação HMAC-SHA256 com timestamp check (rejeita > 5min)
- `create-user` edge function: `--no-verify-jwt` (gateway), mas faz auth própria verificando role no DB
- Preços validados server-side em `create-order` (via service_role bypass de RLS)
- `pay_on_delivery` só para `network_partner` (validado server-side)
- `SECURITY DEFINER` no Supabase hosted **NÃO bypassa RLS** — convenção documentada no CLAUDE.md

### Kill Switches / Feature Flags

- `crm_automations.is_active`: toggle por automação (via CrmDebug ou SQL)
- `catalog_products.is_active`: remove produto do catálogo sem deletar
- `sellers.active`: desativa seller sem deletar
- `coupons.is_active`: desativa cupom
- Não existe feature flag genérico

### Área em Feature Freeze

`supabase/functions/create-order/index.ts` — checkout crítico. Qualquer alteração requer checklist em `docs/create-order-contract.md` e aprovação explícita.

---

## 13. Convenções do Projeto

### Nomenclatura

- **Tabelas/colunas/funções SQL:** inglês (snake_case)
- **Labels de negócio/UI:** português
- **Status de funil:** português (`visitou`, `adicionou_carrinho`, etc)
- **Status de pedidos:** português (`recebido`, `pago`, `enviado`, etc)
- **Slugs de tags:** português com hífen (`novo-cliente`, `abandonou-carrinho`)
- **Commits:** inglês + prefixo semântico (`feat/fix/refactor/chore/docs`)
- **Migrations:** `YYYYMMDDXXXXXX_descricao.sql`

### Padrões de Código

- React Query para todas as queries remotas (sem `useEffect` para fetch)
- SECURITY DEFINER em todas as RPCs que precisam de acesso elevado
- Snapshots em `order_items` para garantir imutabilidade histórica
- `DEFAULT` em todas as colunas novas (retrocompatibilidade)
- Validações críticas **sempre no backend**, nunca só no frontend

### Organização de Arquivos

- Uma página = um arquivo em `src/pages/`
- Componentes reutilizáveis em `src/components/{área}/`
- Tipos em `src/types/{domínio}.ts`
- Serviços de API em `src/services/`
- Helpers de display em `src/utils/`
- Lógica de negócio pura (sem React) em `src/lib/`

### Branches e Deploy

- Branch principal: `main`
- Push to main = deploy automático no Vercel
- Sem branch strategy formal documentada (sem develop, sem feature branches obrigatórias)
- Migrations aplicadas manualmente no Supabase após push

---

## 14. Refatorações Recomendadas Antes de Novas Features

### 1. Vendedores.tsx — PATCH direto em vez de RPC
**Problema:** `Vendedores.tsx` faz PATCH direto na tabela `sellers` para vincular `user_id`, em vez de chamar `admin_set_seller_user_id(p_seller_id, p_user_id)`.  
**Por quê refatorar:** Perde validações server-side e quebra o padrão RPC do projeto.  
**Impacto:** Baixo. Apenas a UI de vínculo seller↔usuário.

### 2. CrmEvent vs CrmEventRecord — interfaces duplicadas
**Problema:** `src/types/crm.ts` tem `CrmEvent` (deprecated) e `CrmEventRecord` com estruturas similares mas não idênticas. `CrmEvent` ainda é referenciado em partes do código.  
**Por quê refatorar:** Confusão de tipos antes de construir novas features CRM.  
**Impacto:** Baixo, mas limpar antes de expandir.

### 3. Idempotência permanente em crm_automation_runs
**Problema:** `idempotency_key = auto_{auto_id}_user_{user_id}` impede qualquer re-envio futuro da mesma automação para o mesmo usuário. Com sequências e reativação isso se torna um bloqueador.  
**Por quê refatorar:** O novo motor de sequências precisará de um modelo de idempotência diferente (por step + enrollment, não por automação + usuário).  
**Impacto:** Médio. Não quebra o que existe, mas o novo código não pode usar esse modelo.

### 4. Templates hardcoded em action_config JSONB
**Problema:** Templates de mensagem ficam no banco sem UI de edição. Qualquer mudança exige SQL.  
**Por quê refatorar:** Antes de escalar automações, o time precisa poder editar mensagens sem depender de dev.  
**Impacto:** Médio. Sem isso, escalar automações cria dependência operacional.

### 5. crm_dispatch_queue.status — CHECK desatualizado
**Problema:** A migration `20250313000007` cria o CHECK como `('pending', 'sent', 'failed')` mas o código do `crm-queue-processor` usa `'processing'` como status intermediário. O CHECK atual não inclui `'processing'`.  
**Por quê refatorar:** Pode causar violação de constraint em produção se o status `'processing'` for escrito direto na tabela (em vez de via RPC que pode contornar).  
**Impacto:** Alto risco latente. Verificar migration exata antes de expandir a fila.

### 6. crmFilters.ts — lógica de datas frágil
**Problema:** Os predicados em `crmFilters.ts` como `isSemPedido30d` calculam datas relativas em runtime no frontend. Se o cliente tiver fuso horário diferente ou o dado estiver stale no cache, os filtros ficam inconsistentes.  
**Por quê refatorar:** Para sequências de automação baseadas em tempo, a lógica deve ficar no backend.  
**Impacto:** Médio para automações futuras.

---

## 15. Lacunas de Definição

| Lacuna | Por que importa |
|---|---|
| **Branch strategy** | Não há convenção documentada. Push direto para main é o fluxo atual. |
| **Ambiente de staging** | Não existe. Dev e prod compartilham UAZAPI (risco de envio em testes). |
| **Política de logging** | Sem padrão definido para edge functions. Logs são efêmeros no Supabase. |
| **Regra oficial de ownership de lead** | Sem lead, quem é o assigned_seller? Round-robin? Manual? Seller default? |
| **Horário comercial para envio de WhatsApp** | Nunca definido. Sem restrição hoje. |
| **Limite de mensagens por usuário/dia** | Sem proteção anti-spam implementada. |
| **Política de opt-out WhatsApp** | Cliente pode pedir para parar? Como o sistema respeita isso? |
| **Regras de qualificação de lead** | O que é um lead "hot"? Quais critérios? |
| **Perguntas do fluxo de qualificação** | Não definidas oficialmente. |
| **Política de reativação** | Após quanto tempo sem compra é "inativo"? Difere por segmento? |
| **Configuração do Database Webhook** | Não documentado se o webhook que dispara `crm-dispatcher` está ativo em produção hoje. |
| **Meta Conversion API** | Token não confirmado como configurado. Não implementado server-side. |
| **Estratégia de backup** | Não identificada no repositório. |
| **Padrão de testes** | Vitest existe mas sem cobertura identificada no CRM. |
| **`sellers.phone` como E.164** | Campo existe mas sem validação de formato. Notificações para vendedora dependem desse dado estar correto. |
| **Quais automações estão ativas em produção** | Não é visível sem acessar o banco. Todas as seeds são criadas como `is_active = false`. |

---

## 16. Perguntas Abertas para Arquitetura Futura

### Motor de Sequências CRM
1. O novo motor usa as tabelas `crm_automations` como base ou cria `crm_sequences` separado?
2. Como migrar as 3 automações existentes para o modelo de sequências sem quebrar o que está ativo?
3. A idempotência de sequências é por enrollment+step ou por automation_run? Como convivem os dois modelos?
4. Como parar uma sequência quando o usuário compra? Trigger no `purchase_completed` → UPDATE em `crm_sequence_enrollments`?

### Automação WhatsApp Multi-Step
5. Horário comercial para envio: 8h–20h BRT? Ou mais restrito?
6. Limite de mensagens por usuário por dia: 2? 3?
7. Delay entre steps: calculado a partir do trigger inicial ou do step anterior?
8. Se o usuário está em 2 sequências simultâneas (ex: nutrição + recuperação de carrinho), como resolver conflito de envio?

### Inbound Webhook
9. A UAZAPI já tem o callback de mensagens recebidas configurado? Para qual URL?
10. Como identificar de qual usuário veio a resposta (número de telefone → `profiles.phone`)?
11. O que fazer se o número não existir no banco?
12. Como distinguir resposta a uma sequência vs mensagem nova vs opt-out?

### Alertas para Seller
13. Como a vendedora recebe o alerta: WhatsApp para `sellers.phone`? E se não tiver phone válido?
14. Se `assigned_seller_id = NULL`, o alerta vai para o seller default ou não vai?
15. Quais eventos disparam alerta? (compra, carrinho alto, lead qualificado, next_action vencida, inatividade?)
16. Como evitar flood de alertas (ex: 50 clientes inativos ao mesmo tempo)?

### Qualificação Automática
17. Quantas perguntas? Quais? Como mapear respostas para score?
18. O fluxo de qualificação interrupe as sequências normais ou corre em paralelo?
19. Timeout: se o cliente não responde em 24h, o que acontece?
20. Respostas são texto livre ou opções numeradas (1/2/3)?

### Dashboards e Admin UI
21. O editor de templates fica em `/admin/automacoes` ou no `CrmDebug` existente?
22. A página de qualificação de leads (`/admin/qualificacao`) é separada ou integrada ao `Clientes.tsx`?
23. Qual é o nível de acesso da vendedora? Ela tem login no sistema hoje? O role `salao` pode ser usado ou precisa de novo role?

---

## Executive Snapshot

### O que está sólido hoje

- **Infraestrutura de dados:** Schema maduro com 18 tabelas, 47 RPCs, RLS universal, pg_cron ativo
- **Funil de tracking:** 5 hooks rastreando visitou → comprou, com Meta Pixel nos pontos principais
- **Motor de tags:** Trigger automático funcional, idempotente, silencioso em falhas
- **Fila comercial:** Priorização inteligente, filtros operacionais, notas e next_action funcionando
- **Checkout:** Validações server-side, rate limit, preços seguros, cupons, pagamento dividido
- **Auth:** Roles funcionais (user/admin/salao), login por telefone para parceiros, race condition resolvida

### O que está frágil

- **Automações:** Modelo de 1 mensagem + idempotência permanente é um dead-end para sequências
- **crm_dispatch_queue.status CHECK:** Possivelmente desatualizado (`'processing'` pode violar constraint)
- **Templates hardcoded:** Edição requer SQL — bloqueia operação autônoma do time comercial
- **Sem inbound:** O sistema é cego a respostas — qualidade de qualificação zero
- **UAZAPI compartilhado dev/prod:** Risco de envio acidental em testes
- **Monitoring zero:** Sem alertas de erro em produção para edge functions
- **Database Webhook não documentado:** Não está claro se o disparo automático de tag → crm-dispatcher está ativo em produção

### O que precisa ser decidido antes de continuar

1. **Modelo de sequências:** Novas tabelas (`crm_sequences`, `crm_sequence_steps`, `crm_sequence_enrollments`) vs extensão das existentes
2. **Convivência:** Como as 3 automações existentes coexistem com o novo motor sem duplicidade
3. **Regras de negócio de envio:** Horário, frequência, limite diário, opt-out
4. **Ownership de leads sem seller:** Round-robin, seller default, ou notificação centralizada?
5. **Perguntas de qualificação:** Definidas pelo time antes de implementar o banco de dados

### Ordem Técnica Mais Segura para Evolução

```
Sprint 1 — Infra de sequências + tags de inatividade
  ↓ (sem breaking changes no que já funciona)

Sprint 2 — Recuperação de abandono multi-step
  ↓ (substitui automação existente de carrinho — fazer migration clean)

Sprint 3 — Alertas para vendedora + pós-compra/reativação
  ↓ (depende de sellers.phone estar válido)

Sprint 4 — Webhook inbound UAZAPI + supressão por resposta
  ↓ (pré-requisito para qualificação)

Sprint 5 — Qualificação automática conversacional
  ↓ (depende de inbound + banco de perguntas definido)

Sprint 6 — Meta Conversion API server-side + Admin UI (templates, fila, qualificação)
```

**Antes de Sprint 1:** resolver as 3 pendências do CRM P3, limpar duplicidades de automações e confirmar se Database Webhook está ativo em produção.
