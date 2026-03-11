# SCHEMA.md — Single Source of Truth · RDC Revend
> Atualizado em: 2026-03-11
> Gerado a partir das migrations `20250221000001` → `20250313000018`
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

> **ATENÇÃO:** campo de data é `created_at`, NÃO `order_date` ou `date`.
> Status válidos: `recebido`, `aguardando_pagamento`, `pago`, `separacao`, `enviado`, `entregue`, `concluido`, `cancelado`, `expirado`.

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
> `discount_type` válidos: `percent`, `fixed`, `free_shipping`.
> Quando `discount_type = 'free_shipping'`, `discount_value` pode ser `0`.
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

> `event_type` válidos: `visitou`, `visualizou_produto`, `adicionou_carrinho`, `iniciou_checkout`, `comprou`, `abandonou`, `user_registered`, `purchase_completed`, `cart_abandoned`, `checkout_abandoned`, `order_created`, `tag_added`, `inactivity_detected`.

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
Log de sincronizações com a Nuvemshop.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| status | text | NO | — | — |
| imported | int | NO | `0` | — |
| updated | int | NO | `0` | — |
| skipped | int | NO | `0` | — |
| errors | int | NO | `0` | — |
| error_message | text | YES | NULL | — |
| started_at | timestamptz | NO | `now()` | — |
| finished_at | timestamptz | YES | NULL | — |

---

## Views

### `catalog_products_public`
Projeção segura de `catalog_products` para leitura anônima.
`security_invoker = true`.
Colunas: `id`, `name`, `description_html`, `price`, `compare_at_price`, `images`, `main_image`, `is_highlight`, `category_id`, `category_type`, `created_at`, `updated_at`.
**Não expõe:** `is_active`, `source`, `is_professional`, `nuvemshop_product_id`.

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
  p_user_id        uuid,
  p_items          jsonb,          -- [{product_id, product_name, quantity, price}]
  p_total          numeric,
  p_status         text    DEFAULT 'recebido',
  p_origin         text    DEFAULT 'whatsapp',
  p_payment_method text    DEFAULT NULL,
  p_notes          text    DEFAULT NULL,
  p_discount       numeric DEFAULT 0,
  p_coupon_id      uuid    DEFAULT NULL
) → uuid
```
Cria pedido manual (admin). Calcula `subtotal` internamente, `total = subtotal - discount`. Incrementa `coupons.used_count` se `p_coupon_id` fornecido. Atualiza `client_sessions` e insere evento CRM.
Acessível por: `authenticated` (admin verificado internamente).
Retorno: `order_id` (uuid).

---

### `check_rate_limit`
```
check_rate_limit(p_key text, p_max_requests int, p_window_seconds int) → boolean
```
Retorna `true` se a requisição é permitida, `false` se bloqueada por rate limit.
Acessível por: `authenticated`.

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
| profiles | role | — (free text, tipicamente `'user'` / `'admin'`) |
| profiles | price_category | `'retail'`, `'wholesale'`, `'vip'` |
| catalog_products | category_type | `'alto_giro'`, `'maior_margem'`, `'recompra_alta'`, NULL |
| orders | status | `'recebido'`, `'aguardando_pagamento'`, `'pago'`, `'separacao'`, `'enviado'`, `'entregue'`, `'concluido'`, `'cancelado'`, `'expirado'` |
| orders | origin | `'site'`, `'whatsapp'`, `'loja_fisica'`, `'outro'`, NULL |
| order_items | qty | `> 0` |
| client_sessions | status | `'visitou'`, `'visualizou_produto'`, `'adicionou_carrinho'`, `'iniciou_checkout'`, `'comprou'`, `'abandonou'` |
| coupons | code | UPPERCASE (enforced por CHECK) |
| coupons | discount_type | `'percent'`, `'fixed'`, `'free_shipping'` |
| coupons | discount_value | `> 0` |
| crm_events | event_type | `'visitou'`, `'visualizou_produto'`, `'adicionou_carrinho'`, `'iniciou_checkout'`, `'comprou'`, `'abandonou'`, `'user_registered'`, `'purchase_completed'`, `'cart_abandoned'`, `'checkout_abandoned'`, `'order_created'`, `'tag_added'`, `'inactivity_detected'` |
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
