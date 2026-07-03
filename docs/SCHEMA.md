# SCHEMA.md — Single Source of Truth · RDC Revend
> Atualizado em: 2026-07-02
> Gerado a partir das migrations `20250221000001` → `20260702000009`
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
| access_status | text | YES | `'not_created'` | — |
| auth_phone | text | YES | NULL | — |
| credentials_created_at | timestamptz | YES | NULL | — |
| last_password_reset_at | timestamptz | YES | NULL | — |
| price_list_id | uuid | YES | NULL | price_lists.id |
| next_action | text | YES | NULL | — |
| next_action_at | timestamptz | YES | NULL | — |
| assigned_seller_id | uuid | YES | NULL | sellers.id |
| store_id | uuid | YES | NULL | stores.id |

> `customer_segment` válidos: `'network_partner'`, `'wholesale_buyer'`. NULL = não classificado (legado pendente de revisão). Source of truth da segmentação comercial do cliente.
> `price_list_id` FK para `price_lists`. NULL = sem tabela especial, usa `catalog_products.price`. Quando preenchida e lista ativa, o sistema usa preços de `price_list_items` no catálogo e no checkout.
> `price_category` (text, DEFAULT 'retail'): campo legado — não tem efeito operacional na resolução de preços. Mantido por retrocompatibilidade.
> `access_status` válidos: `'not_created'`, `'active'`, `'blocked'`. Gerenciado pela edge function `admin-partner-credentials`. `auth_phone` armazena o telefone normalizado E.164 usado como login.
> Colunas de integração (Etapa 9): `clickup_task_id`, `lead_source`, `lead_status`, `assigned_seller`, `integration_notes`, `last_synced_at`, `updated_by` — todas nullable, usadas pelo fluxo n8n/ClickUp.
> `assigned_seller_id` (CRM P1): FK para `sellers.id ON DELETE SET NULL`. Source of truth do owner comercial. A coluna legada `assigned_seller` (text) é mantida em paralelo e sincronizada pela RPC — usada pela integração n8n/ClickUp.
> `next_action` (CRM P1): texto livre da próxima ação planejada pelo comercial. `next_action_at`: data/hora agendada (UTC). Ambos nullable. Editáveis via RPC `admin_set_profile_next_action`.
> **Módulo de Estoque:** `store_id` (FK `stores.id`) vincula um colaborador `role='salao'` à sua loja física — opcional (NULL = só acessa o módulo de venda, não o de contagem de estoque). Unificado com o antigo role `'estoque'` em 2026-07-02 (D-23): não existe mais `role='estoque'`, colaborador de loja física é sempre `salao` + `store_id`. Ver função `is_estoque()` (nome mantido por compatibilidade, mas checa `role='salao'`) e `my_store_id()`.

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
| sort_order | int | NO | `0` | — |
| units_per_box | int | YES | NULL | — |
| package_type | text | YES | NULL | — |
| stock_category | text | YES | NULL | — |
| stock_only | boolean | NO | `false` | — |

> `sort_order`: posição manual do produto dentro de sua categoria. Ordenação padrão do catálogo: `sort_order ASC, updated_at DESC`. Gerenciado via admin drag-and-drop (RPC `admin_update_product_sort_orders`). Índice em `(category_id, sort_order)`.
> RLS: leitura pública, escrita admin-only (via RPC SECURITY DEFINER).
> **Módulo de Estoque:** `units_per_box` (unidades por caixa fechada, usado na conciliação de contagem física), `package_type` (`'CX'`/`'UND'`), `stock_category` (agrupamento de estoque físico, texto livre sem CHECK — ex: Ativador, Shampoo, Máscara). Todas nullable, sem DEFAULT — `NULL` significa "não classificado ainda", não é seguro assumir `1`/`'UND'`. Independentes de `category_id`/`categories`, que servem à navegação do catálogo B2B.
> `stock_only`: `true` = produto existe só para contagem física de estoque (ex: material de limpeza), nunca aparece no catálogo B2B. CHECK `catalog_products_stock_only_not_active` garante `NOT (stock_only AND is_active)`. Criado via `/estoque/config` (não vem do Nuvemshop). Ver view `stock_countable_products` e D-24 em `docs/decisions.md`.

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
| payment_splits | jsonb | YES | NULL | — |
| coupon_id | uuid | YES | NULL | coupons.id |
| delivery_method | text | NO | `'shipping'` | — |
| pickup_unit_slug | text | YES | NULL | — |
| pickup_unit_address | text | YES | NULL | — |
| discount_amount | numeric(10,2) | NO | `0` | — |
| seller_id | uuid | YES | NULL | sellers.id |
| customer_segment_snapshot | text | YES | NULL | — |

> `customer_segment_snapshot` válidos: `'network_partner'`, `'wholesale_buyer'`. Snapshot da classificação do cliente no momento da criação do pedido. NULL = pedido legado ou cliente sem classificação.
> `payment_splits` estrutura: `[{"method": "PIX", "amount": 100.00}, {"method": "Dinheiro", "amount": 50.00}]`. Preenchido quando `payment_method = 'MISTO'`. NULL para pagamento único.
> `partner_webhook_sent_at` (timestamptz, nullable): timestamp do disparo do webhook n8n para pedidos `network_partner`. NULL = ainda não disparado. Gerenciado exclusivamente por `send_pending_partner_order_webhooks()` via pg_cron.
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

> Estoque global único por produto, sincronizado via Google Sheets (`sync-google-sheets`). **Fonte de verdade ativa do checkout**: `create-order` (feature freeze) lê `inventory.quantity` para validar disponibilidade e chama `decrement_stock()` a cada pedido — não é só uma tabela de exibição. **Não pode ser desligado/substituído** sem revisar `create-order` (ver D-21 em `docs/decisions.md`). Sem relação com o módulo de estoque por loja abaixo (`stores`/`stock_counts`/`replenishment_orders`), que é aditivo e desacoplado.

---

### `stores`
Lojas físicas para o módulo de contagem/reposição (não confundir com `pickup_units`).

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| slug | text | NO | — | — |
| name | text | NO | — | — |
| type | text | NO | — | — |
| is_active | boolean | NO | `true` | — |
| created_at | timestamptz | NO | `now()` | — |

> `type` válidos: `'central'`, `'satellite'`. Slugs alinhados com `pickup_units` (mesmos valores: `linhares`, `serra`, `teixeira`, `colatina`, `sao-gabriel`), mas **sem FK física** entre as duas tabelas — `pickup_units` é pública/checkout, `stores` é autenticada/operacional. Ver D-20 em `docs/decisions.md`.
> RLS: admin gerencia tudo; qualquer colaborador com acesso ao módulo de estoque (`is_estoque()`) lê todas as lojas (não só a própria).

---

### `stock_counts`
Uma contagem física de estoque em uma loja.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| store_id | uuid | NO | — | stores.id |
| employee_id | uuid | YES | NULL | auth.users.id |
| status | text | NO | `'draft'` | — |
| created_at | timestamptz | NO | `now()` | — |
| confirmed_at | timestamptz | YES | NULL | — |

> `status` válidos: `'draft'`, `'confirmed'`. Confirmação acontece via RPC `confirm_stock_count`, nunca por UPDATE direto (RLS trava `status='draft'` para o colaborador).
> RLS: admin gerencia tudo; colaborador com acesso ao módulo de estoque só vê/edita contagens da própria loja (`store_id = my_store_id()`), e só pode editar enquanto `status='draft'`.

---

### `stock_count_items`
Item de uma contagem: caixas fechadas + unidades soltas por produto.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| stock_count_id | uuid | NO | — | stock_counts.id |
| product_id | uuid | NO | — | catalog_products.id |
| closed_boxes | int | NO | `0` | — |
| loose_units | int | NO | `0` | — |
| total_units | int | YES | NULL | — |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |

> `total_units` é calculado por trigger (`trg_stock_count_item_total`): `closed_boxes * catalog_products.units_per_box + loose_units`, ou `NULL` se o produto não tiver `units_per_box` cadastrado. Revalidado server-side (não confiado) dentro de `confirm_stock_count`.
> UNIQUE `(stock_count_id, product_id)`.

---

### `store_stock_targets`
Estoque mínimo/ideal (em unidades) de um produto em uma loja.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| product_id | uuid | NO | — | catalog_products.id |
| store_id | uuid | NO | — | stores.id |
| target_quantity | int | NO | `0` | — |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |

> UNIQUE `(product_id, store_id)`. Sem seed — cadastro é manual pelo admin (dado de negócio). RLS: admin gerencia tudo; colaborador com acesso ao módulo de estoque só lê a meta da própria loja.

---

### `replenishment_orders`
Pedido de reposição gerado pela conciliação de uma contagem confirmada.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| product_id | uuid | NO | — | catalog_products.id |
| destination_store_id | uuid | NO | — | stores.id |
| source_stock_count_id | uuid | YES | NULL | stock_counts.id |
| suggested_quantity | int | NO | — | — |
| shipped_quantity | int | YES | NULL | — |
| status | text | NO | `'open'` | — |
| generated_at | timestamptz | NO | `now()` | — |
| picked_by | uuid | YES | NULL | auth.users.id |
| shipped_at | timestamptz | YES | NULL | — |

> `status` válidos: `'open'`, `'picking'`, `'shipped'` (terminal). Índice único parcial `(product_id, destination_store_id) WHERE status='open'` — só um pedido aberto por produto+loja; uma nova contagem confirmada **substitui** (não soma) o `suggested_quantity` de um pedido `open` existente, e não mexe em pedidos já `picking`/`shipped`. Escrita apenas via RPCs `confirm_stock_count` e `update_replenishment_order_status` (sem policy de INSERT/UPDATE para colaborador de estoque).
> RLS de leitura: colaborador de loja satélite só vê pedidos com `destination_store_id = my_store_id()` (a própria loja); colaborador da loja central (`stores.type='central'`, Linhares) vê pedidos com destino a qualquer loja — é quem separa e despacha. Ver D-21 em `docs/decisions.md`.
> **Decisão fechada:** nada aqui atualiza `inventory.quantity` — e não deve. `inventory` é a fonte de disponibilidade ativa do checkout (`create-order`, feature freeze) e não pode ser desligada/substituída sem revisar esse arquivo. Ver D-21 em `docs/decisions.md`.

---

### `stock_categories`
Lista de categorias de estoque físico (lookup), gerenciada pelo admin em `/estoque/config`.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| name | text | NO | — | — |
| created_at | timestamptz | NO | `now()` | — |
| sort_order | int | NO | `0` | — |
| color_index | int | NO | `0` | — |

> UNIQUE `(name)`. RLS: escrita admin-only; SELECT também para colaborador de loja (`is_estoque()`, role=salao) — a tela de contagem lê `sort_order`/`color_index` (`20260703000003`). **Sem FK** com `catalog_products.stock_category` (que continua texto livre) — esta tabela só alimenta o dropdown de seleção/criação na UI. Sem seed — tabela começa vazia, admin cadastra as categorias pela UI (`20260702000012` removeu o seed inicial de `20260702000011` a pedido do usuário).
> `sort_order`: ordem manual de exibição em `/estoque/contagem/:id` e `/estoque/config` (ex: seguir a ordem física dos corredores da loja) — reordenável pelo admin via setas cima/baixo em `/estoque/config`. Categorias novas entram com `0`. "Sem categoria" (produtos sem `stock_category`) sempre aparece por último, independente de `sort_order`.
> `color_index`: índice na paleta pastel fixa `src/lib/stockCategoryColors.ts` (10 cores) — atribuído automaticamente (cíclico) na criação, editável via swatches em `/estoque/config`. Usado para colorir o badge da categoria em `/estoque/contagem/:id` e o `<select>` de categoria em `/estoque/config`. "Sem categoria" não usa a paleta — sempre neutro/cinza.

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
| next_retry_at | timestamptz | YES | NULL | — |
| last_http_status | int | YES | NULL | — |
| acked_at | timestamptz | YES | NULL | — |

> Status válidos: `pending`, `processing`, `delivered`, `failed`.
> `idempotency_key` é UNIQUE — previne duplicatas (ex: `'lead_created:{user_id}'`).
> `next_retry_at`: quando NULL ou <= now(), o item é elegível para processamento. Usado pelo backoff exponencial.
> `last_http_status`: HTTP status code da última tentativa de envio ao n8n. Útil para diagnóstico.
> `acked_at`: preenchido por `n8n-sync-back` quando o n8n devolve `outbox_id` no callback. `delivered + acked_at IS NOT NULL` = ciclo completo confirmado.
> RLS: admin-only. service_role bypassa automaticamente.
> Triggers automáticos populam esta tabela a partir de `crm_events` (user_registered) e `profiles` (profile completed).
> Worker de flush: edge function `integration-outbox-flush`. Ver `docs/CRM_N8N_OUTBOX_OPERATIONS.md`.
> Primeiro fluxo de negócio: `lead_created`. Ver `docs/CRM_N8N_FIRST_BUSINESS_FLOW.md`.

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
> RLS: habilitado, sem policies permissivas. Acesso exclusivo via service_role (edge functions). Grants revogados de anon/authenticated.

---

### `rate_limits`
Controle de rate limit por chave.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| key | text | NO | — | — |
| window_start | timestamptz | NO | `now()` | — |
| request_count | int | NO | `1` | — |

> RLS: habilitado, sem policies permissivas. Acesso exclusivo via `check_rate_limit()` (SECURITY DEFINER). Grants revogados de anon/authenticated.

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
| commission_pct | numeric(5,2) | NO | `0` | — |
| monthly_goal | numeric(10,2) | NO | `0` | — |
| created_at | timestamptz | NO | `now()` | — |
| user_id | uuid | YES | NULL | auth.users.id |

> RLS: admin-only para escrita. Leitura via RPC `get_active_sellers_for_dropdown` (admin + salao).
> `user_id` (CRM P3): FK para `auth.users(id) ON DELETE SET NULL`. Nullable. UNIQUE WHERE NOT NULL — um usuário Supabase pode estar vinculado a no máximo um seller. Usado para resolução automática de "Minhas contas" no CRM via `admin_get_my_seller_id()`. Gerenciado na página admin/Vendedores.

---

### `customer_notes`
Notas internas por cliente. Visíveis apenas por admins — nunca pelo cliente.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| customer_id | uuid | NO | — | profiles.id |
| content | text | NO | — | — |
| created_by | uuid | YES | NULL | auth.users.id |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |

> RLS: admin-only via `is_admin()` (D-01: sem subquery em profiles). `customer_id → profiles(id) ON DELETE CASCADE`. `created_by → auth.users(id) ON DELETE SET NULL` (preserva nota histórica se admin for removido).
> CHECK `length(trim(content)) > 0` — conteúdo vazio não é aceito.
> Trigger `trg_customer_notes_updated_at` mantém `updated_at`.

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

### `price_lists`
Tabelas de preço B2B — uma por nível comercial ou parceiro.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| name | text | NO | — | — |
| description | text | YES | NULL | — |
| priority | int | NO | `0` | — |
| is_active | boolean | NO | `true` | — |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |

> RLS: admin tem acesso total. Usuários autenticados acessam via RPC `get_my_price_list_items()`. Anon sem acesso.
> `priority` reservado para resolução futura multi-lista; sem efeito na v1.

---

### `price_list_items`
Preços específicos por produto dentro de uma tabela de preço.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| price_list_id | uuid | NO | — | price_lists.id |
| product_id | uuid | NO | — | catalog_products.id |
| price | numeric(10,2) | NO | — | — |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |

> UNIQUE `(price_list_id, product_id)` — um produto tem no máximo um preço por tabela.
> CHECK `price >= 0`.
> RLS: admin tem acesso total. Usuários acessam via RPC `get_my_price_list_items()`.

**Regra de resolução de preço:**
1. Se `profiles.price_list_id IS NOT NULL` E `price_lists.is_active = true` E existe `price_list_items` para o produto → usar `price_list_items.price`
2. Caso contrário → usar `catalog_products.price`

Esta regra é aplicada no catálogo (via `get_my_price_list_items`) e no checkout (`create-order`, step 3b).

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

### `stock_countable_products`
Projeção de `catalog_products` para o módulo de estoque (contagem física e classificação em `/estoque/config`).
`SELECT cp.* FROM catalog_products cp WHERE (cp.is_active = true OR cp.stock_only = true) AND NOT EXISTS (SELECT 1 FROM kit_components kc WHERE kc.kit_product_id = cp.id)`.
Inclui: produtos ativos no catálogo B2B + produtos `stock_only`. **Exclui sempre**: kits (produtos que aparecem como `kit_product_id` em `kit_components`) — fisicamente não existe "o kit" pra contar, só os componentes.
Usar esta view em vez de `catalog_products` diretamente nas telas de contagem/classificação (`ContagemDetalhe.tsx`, `Config.tsx`). Ver D-24 em `docs/decisions.md`.

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
  p_pickup_unit_slug text        DEFAULT NULL,
  p_payment_splits   jsonb       DEFAULT NULL
) → uuid
```
Cria pedido pelo operador do salão. Calcula subtotal server-side a partir dos preços reais do `catalog_products` (ignora preço do frontend). Aplica `partner_price` se cliente é parceiro. Status fixo `recebido`, origin fixo `salao`, delivery_method fixo `pickup`. Resolve seller padrão se não informado. Unidade de pickup obrigatória.
`p_payment_splits`: array `[{method, amount}]`. Se informado, valida que soma == subtotal (tolerância R$0,01) e grava `payment_method = 'MISTO'` automaticamente.
Acessível por: `authenticated` (salao verificado internamente). JWT verification desabilitada no gateway (--no-verify-jwt) — função faz a própria verificação de role internamente.

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
  → TABLE (
      id uuid, full_name text, phone text, document_type text, document text,
      business_type text, employees text, revenue text, email text,
      is_partner boolean, customer_segment text,
      access_status text, auth_phone text,
      credentials_created_at timestamptz, last_password_reset_at timestamptz,
      price_list_id uuid, price_list_name text,
      assigned_seller text,       -- código legado (n8n compat)
      seller_id uuid,             -- sellers.id resolvido via assigned_seller_id (FK)
      seller_name text,           -- sellers.name legível
      next_action text,
      next_action_at timestamptz,
      total_orders bigint,        -- COUNT de todos os pedidos
      total_spent numeric,        -- SUM de pedidos não cancelados/expirados
      first_order_at timestamptz,
      last_order_at timestamptz
    )
```
Lista todos os perfis com `role = 'user'` para o admin. Inclui dados de seller (resolvido via `assigned_seller_id` FK), próxima ação e agregados de pedidos via subquery lateral.
`seller_id` é resolvido por `LEFT JOIN sellers ON sellers.id = profiles.assigned_seller_id` — join direto por FK, não por code.
Acessível por: `authenticated` (admin verificado internamente).

---

### `admin_set_profile_seller`
```
admin_set_profile_seller(p_user_id uuid, p_seller_id uuid) → void
```
Atribui (ou desvincula com `NULL`) o owner comercial de um cliente. Grava em `profiles.assigned_seller_id` (FK, source of truth) e sincroniza `profiles.assigned_seller` (text, compat n8n). Valida que o seller existe e está ativo.
Acessível por: `authenticated` (admin verificado internamente).

---

### `admin_set_profile_next_action`
```
admin_set_profile_next_action(p_user_id uuid, p_next_action text, p_next_action_at timestamptz) → void
```
Define ou limpa a próxima ação planejada para um cliente. Normaliza `p_next_action` via `NULLIF(TRIM(...), '')`. Aceita NULL em ambos os parâmetros para limpar.
Acessível por: `authenticated` (admin verificado internamente).

---

### `admin_get_my_seller_id`
```
admin_get_my_seller_id() → uuid
```
Retorna o `sellers.id` vinculado ao usuário autenticado via `sellers.user_id = auth.uid()`. Retorna `NULL` se o usuário não tiver seller vinculado ou se o seller estiver inativo.
Acessível por: `authenticated`.
Usado pela fila comercial para resolver "Minhas contas" automaticamente.

---

### `admin_set_seller_user_id`
```
admin_set_seller_user_id(p_seller_id uuid, p_user_id uuid) → void
```
Vincula (ou desvincula com `NULL`) um usuário Supabase a um seller. Valida que o chamador é admin.
Constraint: `sellers.user_id` é UNIQUE WHERE NOT NULL — um usuário só pode estar vinculado a um seller.
Acessível por: `authenticated` (admin verificado internamente).

---

### `admin_list_customer_notes`
```
admin_list_customer_notes(p_customer_id uuid)
  → TABLE (id uuid, customer_id uuid, content text, created_by uuid, created_by_name text, created_at timestamptz, updated_at timestamptz)
```
Lista notas do cliente com nome do autor (LEFT JOIN profiles). Ordenado por `created_at DESC`.
Acessível por: `authenticated` (admin verificado internamente).

---

### `admin_create_customer_note`
```
admin_create_customer_note(p_customer_id uuid, p_content text) → void
```
Insere nota interna. `created_by = auth.uid()`. Valida conteúdo não-vazio.
Acessível por: `authenticated` (admin verificado internamente).

---

### `admin_update_customer_note`
```
admin_update_customer_note(p_note_id uuid, p_content text) → void
```
Atualiza conteúdo de uma nota. Valida conteúdo não-vazio. Erro se nota não encontrada.
Acessível por: `authenticated` (admin verificado internamente).

---

### `admin_delete_customer_note`
```
admin_delete_customer_note(p_note_id uuid) → void
```
Remove uma nota pelo id. Erro se nota não encontrada.
Acessível por: `authenticated` (admin verificado internamente).

---

### `get_my_price_list_items`
```
get_my_price_list_items() → TABLE (product_id uuid, price numeric(10,2))
```
Retorna os itens de preço da tabela vinculada ao usuário autenticado. Retorna vazio se sem lista ou lista inativa. O frontend usa para sobrepor os preços do catálogo.
Acessível por: `authenticated`.

---

### `resolve_product_prices`
```
resolve_product_prices(p_user_id uuid, p_product_ids uuid[])
  → TABLE (product_id uuid, resolved_price numeric(10,2))
```
Resolve preços para um conjunto de produtos aplicando a regra de resolução (price_list_items → fallback catalog_products.price). Usada internamente pela edge function `create-order` via serviceClient.
Acessível por: `authenticated`, `service_role`.

---

### `admin_set_profile_price_list`
```
admin_set_profile_price_list(p_user_id uuid, p_price_list_id uuid) → void
```
Vincula ou desvincula (`p_price_list_id = NULL`) um parceiro de uma tabela de preço. Valida que a tabela existe antes de vincular.
Acessível por: `authenticated` (admin verificado internamente).

---

### `admin_update_customer_segment`
```
admin_update_customer_segment(p_user_id UUID, p_segment TEXT) → void
```
Atualiza a classificação comercial de um cliente. `p_segment` aceita `'network_partner'`, `'wholesale_buyer'` ou `NULL` (para desclassificar).
Acessível por: `authenticated` (admin verificado internamente).

---

### `admin_update_profile`
```
admin_update_profile(
  p_user_id      uuid,
  p_full_name    text,
  p_phone        text,
  p_document_type text,
  p_document     text,
  p_business_type text,
  p_employees    text,
  p_revenue      text
) → void
```
Atualiza dados cadastrais de um cliente (admin). Usa COALESCE — campos NULL preservam valor existente.
Acessível por: `authenticated` (admin verificado internamente).

---

### `resolve_partner_login_email`
```
resolve_partner_login_email(p_phone text) → text
```
Resolve o e-mail de login de um parceiro a partir do telefone (E.164). Consulta `profiles` JOIN `auth.users` onde `auth_phone = p_phone` AND `customer_segment = 'network_partner'` AND `access_status = 'active'`. Retorna o e-mail ou NULL se não encontrado.
Usado pelo login silencioso de parceiros (sem Supabase Phone provider).
Acessível por: `anon`, `authenticated`.

---

### `admin_update_product_sort_orders`
```
admin_update_product_sort_orders(updates jsonb) → void
```
Atualiza `sort_order` em lote para múltiplos produtos. `updates` = `[{"id": "uuid", "sort_order": 0}, ...]`.
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

### `build_partner_order_payload`
```
build_partner_order_payload(p_order_id uuid) → jsonb
```
Monta o payload para o webhook n8n de pedidos `network_partner`. Expande kits via `kit_components` e retorna `separation_list` consolidada por produto.
Acessível por: `service_role` / SECURITY DEFINER (chamada interna).

**Retorno:**
```json
{
  "event": "partner_order_created",
  "order": { "id", "created_at", "status", "total", "subtotal", "discount_amount", "payment_method", "origin", "notes", "delivery_method", "customer": { "name", "whatsapp", "email" } },
  "items": [{ "product_id", "product_name", "qty", "unit_price", "line_total", "is_kit", "components": [{ "product_id", "product_name", "qty_per_kit", "total_qty" }] }],
  "separation_list": [{ "product_name", "qty" }]
}
```

---

### `send_pending_partner_order_webhooks`
```
send_pending_partner_order_webhooks() → int
```
Busca pedidos `network_partner` com `partner_webhook_sent_at IS NULL` e items já inseridos, dispara `pg_net.http_post` para o webhook n8n e marca `partner_webhook_sent_at = now()`. Usa `FOR UPDATE SKIP LOCKED` para evitar duplicatas em runs concorrentes.
Executada via pg_cron (`partner-order-webhook-notifier`) a cada minuto.
Retorno: quantidade de pedidos processados.

---

### `release_expired_orders`
```
release_expired_orders() → integer
```
Libera pedidos `aguardando_pagamento` > 1h, restaura estoque, marca como `expirado`. Executada via pg_cron a cada 5 min.
Retorno: contagem de pedidos liberados.

---

### `is_estoque`
```
is_estoque() → boolean
```
Retorna true se o usuário autenticado pode acessar o módulo de estoque. Unificado com `salao` em 2026-07-02 (D-23) — checa `role = 'salao'` internamente. Nome mantido por compatibilidade com as policies/RPCs que já o referenciam.

---

### `my_store_id`
```
my_store_id() → uuid
```
Retorna `profiles.store_id` do usuário autenticado. SECURITY DEFINER — usada em RLS de `stock_counts`/`stock_count_items`/`store_stock_targets` para evitar subquery direta em `profiles` (regra D-01).

---

### `confirm_stock_count`
```
confirm_stock_count(p_stock_count_id uuid) → jsonb
```
Confirma uma contagem física e concilia cada item contra `store_stock_targets`, gerando/atualizando `replenishment_orders` quando o total contado fica abaixo da meta da loja. Revalida `total_units` no servidor. Não reexecutável sobre a mesma contagem (`RAISE EXCEPTION` se já `confirmed`).
Retorno: `{ stock_count_id, store_id, confirmed_at, items_total, items_replenished, items_sufficient, items_skipped: [{product_id, reason}] }` — `reason` é `'no_units_per_box'` ou `'no_target_defined'`.
Acessível por: `authenticated` (admin ou colaborador `salao` da própria loja, verificado internamente).

---

### `update_replenishment_order_status`
```
update_replenishment_order_status(p_order_id uuid, p_new_status text, p_shipped_quantity int DEFAULT NULL) → void
```
Avança o status de um pedido de reposição: `open→picking`, `open|picking→shipped` (exige `p_shipped_quantity > 0`). `shipped` é terminal.
Acessível por: `authenticated` (admin ou colaborador `salao` da loja central, verificado internamente).

---

### `admin_set_user_role`
```
admin_set_user_role(p_user_id uuid, p_role text, p_store_id uuid DEFAULT NULL) → void
```
Define `role` (`user`/`admin`/`salao`) e, opcionalmente, `store_id` de um usuário `salao` (colaborador de loja física com acesso também ao módulo de estoque). Admin-only, verificado internamente. `store_id` é validado contra `stores` quando informado e sempre limpo (`NULL`) para roles diferentes de `salao`. `store_id` é **opcional** mesmo para `salao` — sem loja, o colaborador só acessa o módulo de venda.
**Substitui** o update direto de `profiles.role` feito antes por `/admin/usuarios` — RLS de `profiles` só tem policies `self_select`/`self_update` (própria linha) desde `20250307000006_fix_catalog_rls_simple.sql`, sem policy admin-wide; um update direto do client não tinha efeito para linhas de terceiros. Ver D-22 em `docs/decisions.md`.

---

### `get_system_users`
```
get_system_users() → TABLE (id, role, full_name, email, created_at, last_sign_in_at, permissions, store_id, store_name)
```
Lista usuários com `role IN ('admin','salao')`, com o nome da loja (`stores.name`) quando o `salao` tem `store_id` vinculado. Usada por `/admin/usuarios`.

---

## Constraints & CHECK values

| Tabela | Coluna | Valores válidos |
|--------|--------|----------------|
| profiles | role | `'user'`, `'admin'`, `'salao'` |
| profiles | price_category | `'retail'`, `'wholesale'`, `'vip'` |
| profiles | customer_segment | `'network_partner'`, `'wholesale_buyer'`, NULL |
| profiles | access_status | `'not_created'`, `'active'`, `'blocked'` |
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
| price_list_items | price | `>= 0` |
| catalog_products | package_type | `'CX'`, `'UND'`, NULL |
| stores | type | `'central'`, `'satellite'` |
| stock_counts | status | `'draft'`, `'confirmed'` |
| replenishment_orders | status | `'open'`, `'picking'`, `'shipped'` |

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
| `produtos`/`lojas`/`contagens` (nomes em português) | `catalog_products`/`stores`/`stock_counts` — tabelas técnicas são sempre em inglês |
| `stores` = `pickup_units` | São tabelas diferentes — `stores` (módulo de estoque) não tem FK física com `pickup_units` (checkout), apenas mesmos `slug` |
