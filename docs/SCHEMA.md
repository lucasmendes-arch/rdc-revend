# SCHEMA.md — Single Source of Truth · RDC Revend
> Atualizado em: 2026-04-08
> Gerado a partir das migrations `20250221000001` → `20260408000001`
> **LEIA ESTE ARQUIVO antes de escrever qualquer query, RPC call ou type definition no frontend.**

---

## Índice
1. [Tabelas](#tabelas)
2. [Views](#views)
3. [Funções & RPCs](#funções--rpcs)
4. [Constraints & CHECK values](#constraints--check-values)
5. [Nomenclatura — Armadilhas Comuns](#nomenclatura--armadilhas-comuns)

---

## Tabelas

### `profiles`
Perfil do usuário. Criado automaticamente por trigger ao registrar em `auth.users`.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | — | auth.users.id |
| role | text | NO | `'user'` | — |
| created_at | timestamptz | NO | `now()` | — |
| full_name | text | YES | NULL | — |
| phone | text | YES | NULL | — |
| document_type | text | YES | NULL | — |
| document | text | YES | NULL | — |
| business_type | text | YES | NULL | — |
| employees | text | YES | NULL | — |
| revenue | text | YES | NULL | — |
| address_cep | text | YES | NULL | — |
| address_street | text | YES | NULL | — |
| address_number | text | YES | NULL | — |
| address_complement | text | YES | NULL | — |
| address_neighborhood | text | YES | NULL | — |
| address_city | text | YES | NULL | — |
| address_state | text | YES | NULL | — |
| price_category | text | NO | `'retail'` | — |
| is_partner | boolean | NO | `false` | — |
| clickup_task_id | text | YES | NULL | — |
| lead_source | text | YES | NULL | — |
| lead_status | text | YES | NULL | — |
| assigned_seller | text | YES | NULL | — |
| integration_notes | text | YES | NULL | — |
| last_synced_at | timestamptz | YES | NULL | — |
| updated_by | text | YES | NULL | — |
| customer_segment | text | YES | NULL | — |

> `customer_segment` válidos: `'network_partner'`, `'wholesale_buyer'`. NULL = não classificado (legado pendente de revisão). Source of truth da segmentação comercial do cliente.
> Colunas de integração (Etapa 9): `clickup_task_id`, `lead_source`, `lead_status`, `assigned_seller`, `integration_notes`, `last_synced_at`, `updated_by` — todas nullable, usadas pelo fluxo n8n/ClickUp.

---

### `catalog_products`
Produtos do catálogo B2B.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| nuvemshop_product_id | bigint | YES | NULL | — |
| name | text | NO | — | — |
| description_html | text | YES | NULL | — |
| price | numeric(10,2) | NO | `0` | — |
| partner_price | numeric(10,2) | YES | NULL | — |
| compare_at_price | numeric(10,2) | YES | NULL | — |
| images | text[] | YES | NULL | — |
| main_image | text | YES | NULL | — |
| is_active | boolean | NO | `true` | — |
| source | text | NO | `'nuvemshop'` | — |
| updated_from_source_at | timestamptz | YES | NULL | — |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |
| category_type | text | YES | NULL | — |
| is_professional | boolean | NO | `false` | — |
| is_highlight | boolean | NO | `false` | — |
| category_id | uuid | YES | NULL | categories.id |

---

### `categories`
Categorias de produtos.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| name | text | NO | — | — |
| slug | text | NO | — | — |
| sort_order | int | NO | `0` | — |
| created_at | timestamptz | NO | `now()` | — |

> **ATENÇÃO:** tabela chama-se `categories`, NÃO `product_categories`.

---

### `orders`
Pedidos de venda.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| user_id | uuid | NO | — | auth.users.id |
| status | text | NO | `'recebido'` | — |
| subtotal | numeric(10,2) | NO | — | — |
| shipping | numeric(10,2) | NO | `0` | — |
| total | numeric(10,2) | NO | — | — |
| customer_name | text | NO | — | — |
| customer_whatsapp | text | NO | — | — |
| customer_email | text | NO | — | — |
| notes | text | YES | NULL | — |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |
| payment_id | text | YES | NULL | — |
| origin | text | YES | NULL | — |
| payment_method | text | YES | NULL | — |
| coupon_id | uuid | YES | NULL | coupons.id |
| delivery_method | text | NO | `'shipping'` | — |
| pickup_unit_slug | text | YES | NULL | — |
| pickup_unit_address | text | YES | NULL | — |
| discount_amount | numeric(10,2) | NO | `0` | — |
| seller_id | uuid | YES | NULL | sellers.id |
| customer_segment_snapshot | text | YES | NULL | — |

> `customer_segment_snapshot` válidos: `'network_partner'`, `'wholesale_buyer'`. Snapshot da classificação do cliente no momento da criação do pedido. NULL = pedido legado ou cliente sem classificação.
> **ATENÇÃO:** campo de data é `created_at`, NÃO `order_date` ou `date`.
> `discount_amount` é o valor efetivo do desconto aplicado (cupom percent/fixed). 0 se sem desconto.
> Status válidos: `recebido`, `aguardando_pagamento`, `pago`, `separacao`, `enviado`, `entregue`, `concluido`, `cancelado`, `expirado`.
> `origin` válidos: `'site'`, `'whatsapp'`, `'loja_fisica'`, `'outro'`, `'salao'`.
> `delivery_method` válidos: `'shipping'` (envio), `'pickup'` (retirada na loja).
> Constraints: se `pickup`, `pickup_unit_slug` e `pickup_unit_address` são obrigatórios e `shipping` deve ser 0.

---

### `pickup_units`
Unidades físicas disponíveis para retirada de pedidos.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| slug | text | NO | — | — |
| name | text | NO | — | — |
| address | text | NO | — | — |
| is_active | boolean | NO | `true` | — |
| sort_order | int | NO | `0` | — |
| created_at | timestamptz | NO | `now()` | — |

> RLS: leitura pública, escrita admin-only.
> Slugs atuais: `'linhares'`, `'serra'`, `'teixeira'`, `'colatina'`, `'sao-gabriel'`.

---

### `order_items`
Itens de um pedido.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| order_id | uuid | NO | — | orders.id |
| product_id | uuid | YES | NULL | catalog_products.id |
| product_name_snapshot | text | NO | — | — |
| unit_price_snapshot | numeric(10,2) | NO | — | — |
| qty | int | NO | — | — |
| line_total | numeric(10,2) | NO | — | — |
| created_at | timestamptz | NO | `now()` | — |

> **ATENÇÃO:** quantidade é `qty`, NÃO `quantity`. Preço unitário é `unit_price_snapshot`, NÃO `unit_price`.

---

### `inventory`
Estoque por produto.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| product_id | uuid | YES | NULL | catalog_products.id |
| sku | text | YES | NULL | — |
| quantity | int | NO | `0` | — |
| min_quantity | int | NO | `5` | — |
| last_synced_at | timestamptz | NO | `now()` | — |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |

---

### `client_sessions`
Sessões de navegação/funil do cliente (uma por usuário — UNIQUE user_id).

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| session_id | text | NO | — | — |
| user_id | uuid | YES | NULL | auth.users.id |
| email | text | YES | NULL | — |
| status | text | NO | `'visitou'` | — |
| last_page | text | YES | NULL | — |
| cart_items_count | int | NO | `0` | — |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |

> Status válidos: `visitou`, `visualizou_produto`, `adicionou_carrinho`, `iniciou_checkout`, `comprou`, `abandonou`.

---

### `store_settings`
Configurações globais da loja — registro único (id = 1).

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | int | NO | — | — |
| min_cart_value | numeric(10,2) | NO | `500.00` | — |
| updated_at | timestamptz | NO | `now()` | — |

> Sempre 1 linha. Leitura: `SELECT min_cart_value FROM store_settings WHERE id = 1`.

---

### `coupons`
Cupons de desconto.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| code | text | NO | — | — |
| discount_type | text | NO | — | — |
| discount_value | numeric(10,2) | NO | — | — |
| min_order_value | numeric(10,2) | YES | NULL | — |
| usage_limit | int | YES | NULL | — |
| used_count | int | NO | `0` | — |
| expires_at | timestamptz | YES | NULL | — |
| is_active | boolean | NO | `true` | — |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |

> `code` deve ser sempre UPPERCASE (enforced por CHECK).
> `discount_type` válidos: `percent`, `fixed`, `free_shipping`, `shipping_percent`.
> Quando `discount_type = 'free_shipping'`, `discount_value` pode ser `0`.
> Quando `discount_type = 'shipping_percent'`, `discount_value` é a % de desconto sobre o frete (ex: 50 = 50% off no frete).
> **ATENÇÃO:** campo de expiração é `expires_at`, NÃO `expiration_date`.
> RLS: anon/authenticated NÃO podem listar cupons diretamente — use a RPC `validate_coupon`.

---

### `upsell_offers`
Ofertas de upsell associadas a produtos.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| product_id | uuid | NO | — | catalog_products.id |
| title | text | NO | — | — |
| description | text | YES | NULL | — |
| discounted_price | numeric(10,2) | NO | — | — |
| is_active | boolean | NO | `false` | — |
| created_at | timestamptz | NO | `now()` | — |

---

### `kit_components`
Composição de kits (produto-kit → produto-componente).

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| kit_product_id | uuid | NO | — | catalog_products.id |
| component_product_id | uuid | NO | — | catalog_products.id |
| quantity | int | NO | `1` | — |
| created_at | timestamptz | NO | `now()` | — |

---

### `crm_events`
Log de eventos do funil CRM.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| user_id | uuid | YES | NULL | auth.users.id |
| session_id | text | YES | NULL | — |
| event_type | text | NO | — | — |
| metadata | jsonb | NO | `'{}'` | — |
| created_at | timestamptz | NO | `now()` | — |

> `event_type` válidos: `visitou`, `visualizou_produto`, `adicionou_carrinho`, `iniciou_checkout`, `comprou`, `abandonou`, `user_registered`, `purchase_completed`, `cart_abandoned`, `checkout_abandoned`, `order_created`, `tag_added`, `inactivity_detected`, `profile_completed`, `profile_synced`.

---

### `crm_tags`
Tags do CRM.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| name | text | NO | — | — |
| slug | text | NO | — | — |
| color | text | NO | `'#6B7280'` | — |
| type | text | NO | `'custom'` | — |
| description | text | YES | NULL | — |
| created_at | timestamptz | NO | `now()` | — |

---

### `crm_customer_tags`
Associação cliente ↔ tag.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| user_id | uuid | NO | — | auth.users.id |
| tag_id | uuid | NO | — | crm_tags.id |
| source | text | NO | `'manual'` | — |
| assigned_by | uuid | YES | NULL | auth.users.id |
| assigned_at | timestamptz | NO | `now()` | — |

---

### `crm_automations`
Regras de automação CRM.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| name | text | NO | — | — |
| trigger_type | text | NO | — | — |
| trigger_conditions | jsonb | NO | `'{}'` | — |
| action_type | text | NO | `'send_whatsapp'` | — |
| action_config | jsonb | NO | `'{}'` | — |
| channel | text | NO | `'whatsapp'` | — |
| is_active | boolean | NO | `true` | — |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |

---

### `crm_dispatch_queue`
Fila de envio de mensagens CRM.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| automation_id | uuid | NO | — | crm_automations.id |
| user_id | uuid | NO | — | auth.users.id |
| trigger_event | jsonb | NO | `'{}'` | — |
| idempotency_key | text | NO | — | — |
| scheduled_at | timestamptz | NO | — | — |
| status | text | NO | `'pending'` | — |
| attempt_count | int | NO | `0` | — |
| last_error | text | YES | NULL | — |
| processed_at | timestamptz | YES | NULL | — |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |

---

### `integration_outbox`
Fila de integração outbound (outbox pattern) para n8n/ClickUp.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| event_type | text | NO | — | — |
| user_id | uuid | YES | NULL | auth.users.id |
| payload | jsonb | NO | `'{}'` | — |
| status | text | NO | `'pending'` | — |
| attempt_count | int | NO | `0` | — |
| max_attempts | int | NO | `5` | — |
| last_error | text | YES | NULL | — |
| idempotency_key | text | YES | NULL | — |
| created_at | timestamptz | NO | `now()` | — |
| processed_at | timestamptz | YES | NULL | — |
| delivered_at | timestamptz | YES | NULL | — |

> Status válidos: `pending`, `processing`, `delivered`, `failed`.
> `idempotency_key` é UNIQUE — previne duplicatas (ex: `'lead_created:{user_id}'`).
> RLS: admin-only. service_role bypassa automaticamente.
> Triggers automáticos populam esta tabela a partir de `crm_events` (user_registered) e `profiles` (profile completed).

---

### `processed_webhooks`
Idempotência de webhooks externos.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| source | text | NO | — | — |
| external_id | text | NO | — | — |
| payload | jsonb | NO | `'{}'` | — |
| result | jsonb | YES | NULL | — |
| processed_at | timestamptz | NO | `now()` | — |

> PK composta: `(source, external_id)`.

---

### `rate_limits`
Controle de rate limit por chave.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| key | text | NO | — | — |
| window_start | timestamptz | NO | `now()` | — |
| request_count | int | NO | `1` | — |

---

### `catalog_sync_runs`
Log de sincronizações com a Nuvemshop e Google Sheets.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| status | text | NO | — | — |
| source | text | NO | `'nuvemshop'` | — |
| triggered_by | uuid | YES | NULL | auth.users.id |
| imported | int | NO | `0` | — |
| updated | int | NO | `0` | — |
| skipped | int | NO | `0` | — |
| errors | int | NO | `0` | — |
| error_message | text | YES | NULL | — |
| started_at | timestamptz | NO | `now()` | — |
| finished_at | timestamptz | YES | NULL | — |

> `source` válidos: `'nuvemshop'`, `'google_sheets'`.
> `triggered_by` registra o UUID do admin que disparou a sincronização.

---

### `sellers`
Vendedores vinculáveis a pedidos.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| name | text | NO | — | — |
| code | text | YES | NULL | — |
| active | boolean | NO | `true` | — |
| is_default | boolean | NO | `false` | — |
| created_at | timestamptz | NO | `now()` | — |

> RLS: admin-only para escrita. Leitura via RPC `get_active_sellers_for_dropdown` (admin + salao).

---

### `admin_audit_logs`
Log de auditoria para operações destrutivas do admin.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| admin_id | uuid | YES | NULL | auth.users.id |
| entity_type | text | NO | — | — |
| entity_id | uuid | NO | — | — |
| action | text | NO | — | — |
| created_at | timestamptz | NO | `now()` | — |

> `entity_type` válidos: `'order'`, `'client'`.
> RLS: admin-only (leitura e escrita).

---

## Views

### `catalog_products_public`
Projeção segura de `catalog_products` para leitura anônima.
`security_invoker = true`.
Colunas: `id`, `name`, `description_html`, `price`, `compare_at_price`, `images`, `main_image`, `is_highlight`, `category_id`, `category_type`, `created_at`, `updated_at`.
**Não expõe:** `is_active`, `source`, `is_professional`, `nuvemshop_product_id`, `partner_price`.

> **Segurança `partner_price`:** Anon tem column-level SELECT em `catalog_products` excluindo `partner_price`. O frontend não solicita `partner_price` para não-parceiros. Apenas `authenticated` com `is_partner = true` acessa o preço de parceiro.

### `last_sync_run`
Último registro de `catalog_sync_runs` ordenado por `started_at DESC LIMIT 1`.

---

## Funções & RPCs

### `validate_coupon`
```
validate_coupon(p_code TEXT, p_cart_total NUMERIC) → JSONB
```
Valida cupom. Normaliza entrada com `UPPER(TRIM(p_code))`.
Acessível por: `anon`, `authenticated`.

**Retorno sucesso:**
```json
{ "valid": true, "id": "uuid", "type": "percent|fixed|free_shipping", "value": 10.00 }
```
**Retorno erro:**
```json
{ "valid": false, "error": "mensagem legível" }
```
Erros possíveis: `"Cupom não encontrado"`, `"Cupom inativo"`, `"Cupom expirado"`, `"Cupom esgotado"`, `"Pedido abaixo do valor mínimo para este cupom (R$ X)"`.

---

### `create_manual_order`
```
create_manual_order(
  p_user_id          uuid,
  p_items            jsonb,          -- [{product_id, product_name, quantity, price}]
  p_total            numeric,
  p_status           text        DEFAULT 'recebido',
  p_origin           text        DEFAULT 'whatsapp',
  p_payment_method   text        DEFAULT NULL,
  p_notes            text        DEFAULT NULL,
  p_discount         numeric     DEFAULT 0,
  p_coupon_id        uuid        DEFAULT NULL,
  p_created_at       timestamptz DEFAULT NULL,  -- data retroativa; NULL = now()
  p_delivery_method  text        DEFAULT 'shipping',  -- 'shipping' | 'pickup'
  p_pickup_unit_slug text        DEFAULT NULL   -- slug da unidade (obrigatório se pickup)
) → uuid
```
Cria pedido manual (admin). Calcula `subtotal` internamente, `total = subtotal - discount`. Grava `created_at = COALESCE(p_created_at, now())` — permite lançamento retroativo. Incrementa `coupons.used_count` se `p_coupon_id` fornecido. Atualiza `client_sessions` e insere evento CRM.
Quando `p_delivery_method = 'pickup'`, busca o endereço da unidade via `pickup_units.slug` e força `shipping = 0`.
Acessível por: `authenticated` (admin verificado internamente).
Retorno: `order_id` (uuid).

---

### `increment_coupon_usage`
```
increment_coupon_usage(p_coupon_id UUID) → void
```
Incrementa atomicamente `coupons.used_count + 1`. Usada pela edge function `create-order`.
Acessível por: `authenticated`.

---

### `get_customer_timeline`
```
get_customer_timeline(p_user_id UUID, p_limit INT DEFAULT 50) → JSONB
```
Retorna timeline consolidada do cliente para o admin/CRM.
Acessível por: `authenticated` (admin verificado internamente).

**Retorno:**
```json
{
  "profile": { "id", "full_name", "phone", "email", "document_type", "document", "business_type", "created_at" },
  "session": { "status", "cart_items_count", "last_page", "updated_at" },
  "tags": [{ "slug", "name", "color", "type" }],
  "events": [{ "id", "type", "metadata", "created_at" }],
  "orders": [{
    "id", "status", "subtotal", "shipping", "discount_amount", "total",
    "delivery_method", "pickup_unit_slug", "pickup_unit_address",
    "origin", "payment_method", "notes", "created_at",
    "items_count", "items_summary": [{ "name", "qty", "total" }]
  }],
  "stats": { "total_orders", "total_spent", "first_order_at", "last_order_at", "total_events" }
}
```

---

### `check_rate_limit`
```
check_rate_limit(p_key text, p_max_requests int, p_window_seconds int) → boolean
```
Retorna `true` se a requisição é permitida, `false` se bloqueada por rate limit.
Acessível por: `authenticated`.

---

### `is_salao`
```
is_salao() → boolean
```
Retorna true se o usuário autenticado tem `role = 'salao'`. SECURITY DEFINER para evitar recursão RLS.

---

### `search_customers_for_salao`
```
search_customers_for_salao(p_search text, p_limit int DEFAULT 10)
  → TABLE (id uuid, full_name text, phone text, email text, is_partner boolean)
```
Busca clientes (`role = 'user'`) por nome ou telefone normalizado (regexp_replace para dígitos).
Máximo 20 resultados. Acessível por: `authenticated` (admin ou salao verificado internamente).

---

### `create_salao_order`
```
create_salao_order(
  p_user_id          uuid,
  p_items            jsonb,
  p_notes            text        DEFAULT NULL,
  p_payment_method   text        DEFAULT NULL,
  p_order_date       timestamptz DEFAULT NULL,
  p_seller_id        uuid        DEFAULT NULL,
  p_pickup_unit_slug text        DEFAULT NULL
) → uuid
```
Cria pedido pelo operador do salão. Calcula subtotal server-side a partir dos preços reais do `catalog_products` (ignora preço do frontend). Aplica `partner_price` se cliente é parceiro. Status fixo `recebido`, origin fixo `salao`, delivery_method fixo `pickup`. Resolve seller padrão se não informado. Unidade de pickup obrigatória.
Acessível por: `authenticated` (salao verificado internamente).

---

### `get_active_sellers_for_dropdown`
```
get_active_sellers_for_dropdown() → TABLE (id uuid, name text, code text)
```
Retorna vendedores ativos para dropdowns. Acessível por: `authenticated` (admin ou salao).

---

### `admin_delete_order`
```
admin_delete_order(p_order_id uuid) → boolean
```
Hard-delete de pedido com auditoria. Remove order_items, crm_events vinculados e o pedido.
Acessível por: `authenticated` (admin verificado internamente).

---

### `admin_delete_test_client`
```
admin_delete_test_client(p_client_id uuid) → boolean
```
Hard-delete de cliente de teste (sem pedidos vinculados). Remove tags, sessões, eventos e profile.
Não remove de `auth.users` (limitação Supabase SQL).
Acessível por: `authenticated` (admin verificado internamente).

---

### `get_all_profiles`
```
get_all_profiles()
  → TABLE (id uuid, full_name text, phone text, business_type text, email text, is_partner boolean, customer_segment text)
```
Lista todos os perfis com `role = 'user'` para o admin.
Acessível por: `authenticated` (admin verificado internamente).

---

### `admin_update_customer_segment`
```
admin_update_customer_segment(p_user_id UUID, p_segment TEXT) → void
```
Atualiza a classificação comercial de um cliente. `p_segment` aceita `'network_partner'`, `'wholesale_buyer'` ou `NULL` (para desclassificar).
Acessível por: `authenticated` (admin verificado internamente).

---

### `get_crm_customer_debug`
```
get_crm_customer_debug(p_user_id uuid) → jsonb
```
Dados consolidados do cliente para debug (perfil, sessão, eventos recentes, tags, automações, pedidos).
Acessível por: `authenticated` (admin).

---

### `assign_crm_tag` / `remove_crm_tag`
```
assign_crm_tag(p_user_id uuid, p_slug text, p_source text DEFAULT 'system') → void
remove_crm_tag(p_user_id uuid, p_slug text) → void
```
Atribuição/remoção idempotente de tags CRM por slug.

---

### `claim_crm_queue_items`
```
claim_crm_queue_items(batch_size int DEFAULT 10) → SETOF crm_dispatch_queue
```
Reserva atomicamente itens da fila para processamento. Skips itens com `attempt_count >= 3`.
Acessível por: `service_role`.

---

### `claim_outbox_items`
```
claim_outbox_items(p_batch_size INT DEFAULT 10) → SETOF integration_outbox
```
Reserva atomicamente itens da outbox para processamento (FOR UPDATE SKIP LOCKED). Filtra `status = 'pending'` e `attempt_count < max_attempts`. Marca como `processing`.
Acessível por: `service_role`.

---

### `reset_stuck_outbox_items`
```
reset_stuck_outbox_items() → INT
```
Reseta itens em `processing` há mais de 10 minutos de volta para `pending`. Retorna contagem de itens resetados.
Acessível por: `service_role` / admin.

---

### `release_expired_orders`
```
release_expired_orders() → integer
```
Libera pedidos `aguardando_pagamento` > 1h, restaura estoque, marca como `expirado`. Executada via pg_cron a cada 5 min.
Retorno: contagem de pedidos liberados.

---

## Constraints & CHECK values

| Tabela | Coluna | Valores válidos |
|--------|--------|----------------|
| profiles | role | `'user'`, `'admin'`, `'salao'` |
| profiles | price_category | `'retail'`, `'wholesale'`, `'vip'` |
| profiles | customer_segment | `'network_partner'`, `'wholesale_buyer'`, NULL |
| orders | customer_segment_snapshot | `'network_partner'`, `'wholesale_buyer'`, NULL |
| catalog_products | category_type | `'alto_giro'`, `'maior_margem'`, `'recompra_alta'`, NULL |
| orders | status | `'recebido'`, `'aguardando_pagamento'`, `'pago'`, `'separacao'`, `'enviado'`, `'entregue'`, `'concluido'`, `'cancelado'`, `'expirado'` |
| orders | origin | `'site'`, `'whatsapp'`, `'loja_fisica'`, `'outro'`, `'salao'`, NULL |
| orders | delivery_method | `'shipping'`, `'pickup'` |
| order_items | qty | `> 0` |
| client_sessions | status | `'visitou'`, `'visualizou_produto'`, `'adicionou_carrinho'`, `'iniciou_checkout'`, `'comprou'`, `'abandonou'` |
| coupons | code | UPPERCASE (enforced por CHECK) |
| coupons | discount_type | `'percent'`, `'fixed'`, `'free_shipping'`, `'shipping_percent'` |
| coupons | discount_value | `> 0` |
| crm_events | event_type | `'visitou'`, `'visualizou_produto'`, `'adicionou_carrinho'`, `'iniciou_checkout'`, `'comprou'`, `'abandonou'`, `'user_registered'`, `'purchase_completed'`, `'cart_abandoned'`, `'checkout_abandoned'`, `'order_created'`, `'tag_added'`, `'inactivity_detected'`, `'profile_completed'`, `'profile_synced'` |
| integration_outbox | status | `'pending'`, `'processing'`, `'delivered'`, `'failed'` |
| crm_tags | type | `'system'`, `'custom'` |
| crm_automations | trigger_type | `'funnel_status_changed'`, `'tag_added'`, `'order_created'`, `'abandon_cart'` |
| crm_automations | action_type | `'send_whatsapp'` |
| crm_dispatch_queue | status | `'pending'`, `'processing'`, `'sent'`, `'failed'`, `'cancelled'` |
| crm_automation_runs | status | `'pending'`, `'running'`, `'success'`, `'failed'`, `'skipped'` |

---

## Nomenclatura — Armadilhas Comuns

| ❌ Errado (causa 400/404) | ✅ Correto |
|--------------------------|------------|
| `product_categories` | `categories` |
| `expiration_date` | `expires_at` |
| `quantity` (order_items) | `qty` |
| `unit_price` (order_items) | `unit_price_snapshot` |
| `order_date` | `created_at` |
| `p_customer_id` (RPC) | `p_user_id` (RPC) |
| `discount_amount` (RPC) | `p_discount` (RPC) |
| `coupon_code` (RPC) | `p_code` (RPC `validate_coupon`) |
| SELECT direto em `coupons` (anon) | `validate_coupon()` via RPC |
| `free_shipping` (coluna boolean) | `discount_type = 'free_shipping'` |
| `pickup_store` / `store_pickup` | `delivery_method = 'pickup'` |
| `pickup_unit_name` (orders) | Não existe — use `pickup_unit_slug` + `pickup_units.name` |
| `pickup_unit_id` (orders) | Não existe — FK lógica por `pickup_unit_slug` |
