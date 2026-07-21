# SCHEMA.md — Single Source of Truth · RDC Revend
> Atualizado em: 2026-07-18
> Gerado a partir das migrations `20250221000001` → `20260719000005`
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
| permissions | jsonb | NO | `'{}'` | — |

> `customer_segment` válidos: `'network_partner'`, `'wholesale_buyer'`. NULL = não classificado (legado pendente de revisão). Source of truth da segmentação comercial do cliente.
> `price_list_id` FK para `price_lists`. NULL = sem tabela especial, usa `catalog_products.price`. Quando preenchida e lista ativa, o sistema usa preços de `price_list_items` no catálogo e no checkout.
> `price_category` (text, DEFAULT 'retail'): campo legado — não tem efeito operacional na resolução de preços. Mantido por retrocompatibilidade.
> `access_status` válidos: `'not_created'`, `'active'`, `'blocked'`. Gerenciado pela edge function `admin-partner-credentials`. `auth_phone` armazena o telefone normalizado E.164 usado como login.
> Colunas de integração (Etapa 9): `clickup_task_id`, `lead_source`, `lead_status`, `assigned_seller`, `integration_notes`, `last_synced_at`, `updated_by` — todas nullable, usadas pelo fluxo n8n/ClickUp.
> `assigned_seller_id` (CRM P1): FK para `sellers.id ON DELETE SET NULL`. Source of truth do owner comercial. A coluna legada `assigned_seller` (text) é mantida em paralelo e sincronizada pela RPC — usada pela integração n8n/ClickUp.
> `next_action` (CRM P1): texto livre da próxima ação planejada pelo comercial. `next_action_at`: data/hora agendada (UTC). Ambos nullable. Editáveis via RPC `admin_set_profile_next_action`.
> `permissions` (jsonb, DEFAULT `'{}'`, desde `20260420000002`): permissões granulares por usuário, além do `role`. Chave em uso: `can_edit_orders` (boolean) — exigida por `admin_update_order` mesmo para admins. Alterada só via RPC `admin_set_user_permission` (admin-only); retornada por `get_system_users`.
> **Módulo de Estoque:** `store_id` (FK `stores.id`) vincula um colaborador `role='salao'` à sua loja física — opcional (NULL = só acessa o módulo de venda, não o de contagem de estoque). Unificado com o antigo role `'estoque'` em 2026-07-02 (D-23): não existe mais `role='estoque'`, colaborador de loja física é sempre `salao` + `store_id`. Ver função `is_estoque()` (nome mantido por compatibilidade, mas checa `role='salao'`) e `my_store_id()`.
> **`role='administrativo'`** (desde `20260720000001`): tipo de acesso de escritório com RH+DP (mesmo `has_rh_access()` de admin) e Estoque completo (Contagem, Pedidos, Relatório, Estoque Atual, Histórico, Config — mesmo `has_full_stock_access()` de admin, todas as lojas, sem `store_id` fixo). Não tem nenhum outro poder de admin (catálogo geral, pedidos comerciais, usuários, tabelas de preço, credenciais WhatsApp — essa última continua `is_admin()`-only). Atribuído via `admin_set_user_role` (admin-only); `store_id` sempre `NULL` pra esse role.

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
> **Exclusão de item stock_only** (`/estoque/config`): DELETE real quando o item nunca foi citado em contagem/reposição; se a FK `RESTRICT` (`stock_count_items.product_id` / `replenishment_orders.product_id`) barrar, o fallback é `UPDATE SET stock_only = false` — com `is_active` já `false`, o item sai da view `stock_countable_products` preservando o histórico. Ou seja: linha com `stock_only=false AND is_active=false AND source='stock_only'` = item só-contagem "excluído".

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
> **Dupla função (D-25):** além de alimentar a reposição (`confirm_stock_count`), a meta define o **sortimento da contagem** nas lojas satélite — produto só aparece em `/estoque/contagem/:id` se tiver meta > 0 pra loja (meta vazia/0 = loja não trabalha com o produto). Loja `type='central'` conta a view inteira, independente de meta. Filtro client-side em `ContagemDetalhe.tsx`.

---

### `replenishment_requests` + `replenishment_request_items`
Pedido de reposição **consolidado**: UM pedido por loja destino, com os itens que precisam de reposição dentro (2026-07-04, substitui `replenishment_orders`).

`replenishment_requests`:

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| destination_store_id | uuid | NO | — | stores.id |
| source_stock_count_id | uuid | YES | NULL | stock_counts.id |
| status | text | NO | `'open'` | — |
| generated_at | timestamptz | NO | `now()` | — |
| picked_by | uuid | YES | NULL | auth.users.id |
| shipped_at | timestamptz | YES | NULL | — |

`replenishment_request_items`:

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| request_id | uuid | NO | — | replenishment_requests.id (CASCADE) |
| product_id | uuid | NO | — | catalog_products.id (RESTRICT) |
| suggested_quantity | int | NO | — | — |
| shipped_quantity | int | YES | NULL | — |
| picked_at | timestamptz | YES | NULL | — |

> `picked_at` = checklist de separação do kanban (NULL = ainda não separado); editável só com o pedido em `picking`, via RPC `set_replenishment_item_picked(p_item_id, p_picked)` (admin ou estoque da central).
> Durante o picking, `shipped_quantity` também pode ser declarado antecipadamente via RPC `set_replenishment_item_shipped_qty(p_item_id, p_shipped_quantity)` — 0 = produto em falta, parcial = separação com menos unidades, NULL = limpa a declaração (0 ≤ qty ≤ sugerido; marca `picked_at`). O "Confirmar envio" pré-preenche com esse valor.

> `status` válidos: `'open'`, `'picking'`, `'shipped'` (terminal). Índice único parcial `(destination_store_id) WHERE status='open'` — só um pedido aberto por loja; `confirm_stock_count` **apaga e recria** o pedido aberto da loja inteiro (a contagem mais recente é a verdade, D-20) e não toca em pedidos `picking`/`shipped`. Escrita apenas via RPCs `confirm_stock_count` e `update_replenishment_request_status`. RLS de leitura igual à tabela legada (satélite vê a própria loja; central e admin veem tudo). UI: kanban em `/estoque/pedidos`.

---

### `replenishment_orders` (LEGADA)
Pedido de reposição por produto — **substituída por `replenishment_requests`** em 2026-07-04; mantida só como histórico, nada mais escreve nela.

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
Log de sincronizações de catálogo. Sync Nuvemshop removida em 2026-07-13 (histórico preservado, nada mais escreve `source='nuvemshop'`); Google Sheets segue ativo.

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

### `job_roles`
Catálogo global de cargos (RH) — template reutilizável entre unidades. Ao criar uma vaga em `job_openings`, selecionar um cargo aqui copia os campos descritivos como snapshot editável (editar o cargo depois **não** altera vagas já criadas).

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| title | text | NO | — | — (UNIQUE) |
| description | text | YES | NULL | — |
| contract_type | text | NO | — | — |
| compensation_type | text | NO | — | — |
| fixed_amount | numeric(10,2) | YES | NULL | — |
| variable_percentage | numeric(5,2) | YES | NULL | — |
| variable_basis | text | YES | NULL | — |
| work_schedule | text | YES | NULL | — |
| workload_hours | numeric(4,1) | YES | NULL | — |
| requirements | text | YES | NULL | — |
| benefits | text | YES | NULL | — |
| education_level | text | YES | NULL | — |
| color | text | NO | `'#0D9488'` | — |
| is_active | boolean | NO | `true` | — |
| requires_experience | boolean | NO | `true` | — |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |

> `contract_type` válidos: `'clt'`, `'mei'`, `'pj'`, `'estagio'`.
> `compensation_type` válidos: `'fixa'`, `'variavel'`, `'mista'`. CHECK garante consistência com `fixed_amount`/`variable_percentage` conforme o tipo (ver [Constraints](#constraints--check-values)).
> `education_level` válidos (opcional, `20260720000003`): `'fundamental_incompleto'`, `'fundamental_completo'`, `'medio_incompleto'`, `'medio_completo'`, `'superior_incompleto'`, `'superior_completo'`, `'pos_graduacao'`. Antes chamado `seniority_level` (júnior/pleno/sênior) — repropositado pra grau de escolaridade.
> `color` (hex, `20260720000004`): exibido nos cards/badges de vaga do kanban RH (`/admin/rh/candidatos`) e nos dropdowns de vaga/etapa. Editável em `/admin/rh/cargos`, mesmo padrão de `tags.color`. **Não** é copiado como snapshot pra `job_openings` — o join é sempre ao vivo via `job_openings.job_role_id → job_roles.color`, então mudar a cor do cargo reflete em todas as vagas ligadas a ele. Vaga manual sem `job_role_id` cai no default `'#0D9488'` no frontend.
> `is_active = false` "aposenta" o cargo sem apagar (some do select de novas vagas, preserva histórico).
> `requires_experience` (módulo DP, `20260718000015`): só relevante quando `contract_type='mei'` — editável em `/admin/rh/cargos` (checkbox visível só nesse caso). `false` = cargo aceita candidato sem experiência prévia; ao promover um candidato dessa vaga pra DP com `employment_type='mei'`, o processo nasce em `current_stage='contrato_formacao'` (trilha de formação) em vez de direto em `'contratacao'`. Lido via `job_openings.job_role_id → job_roles` dentro de `promote_candidate_to_dp` — vaga manual sem cargo vinculado assume `true` (caminho padrão, sem formação).
> RLS: `has_rh_access()` (admin OU `profiles.permissions->>'can_manage_rh' = 'true'`).

---

### `job_openings` (vagas)
Vaga por unidade. Colunas descritivas (`description`, `contract_type`, `compensation_type`, `fixed_amount`, `variable_percentage`, `variable_basis`, `work_schedule`, `workload_hours`, `requirements`, `benefits`) são um **snapshot** copiado de `job_roles` no momento da criação — todas nullable, editáveis independentemente do cargo de origem.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| store_id | uuid | NO | — | stores.id |
| role_title | text | NO | — | — |
| job_role_id | uuid | YES | NULL | job_roles.id (ON DELETE RESTRICT) |
| status | text | NO | `'aberta'` | — |
| description | text | YES | NULL | — |
| contract_type | text | YES | NULL | — |
| compensation_type | text | YES | NULL | — |
| fixed_amount | numeric(10,2) | YES | NULL | — |
| variable_percentage | numeric(5,2) | YES | NULL | — |
| variable_basis | text | YES | NULL | — |
| work_schedule | text | YES | NULL | — |
| workload_hours | numeric(4,1) | YES | NULL | — |
| requirements | text | YES | NULL | — |
| benefits | text | YES | NULL | — |
| created_at | timestamptz | NO | `now()` | — |

> `status` válidos: `'aberta'`, `'fechada'`.
> `job_role_id` é só rastro de origem — `ON DELETE RESTRICT` impede excluir um cargo com vagas vinculadas (desativar em vez de excluir).
> CRUD feito direto via `supabase.from('job_openings')` no frontend, sem RPC dedicada. RLS: `has_rh_access()`.

---

### `candidates`
Candidato a uma vaga (`job_openings`). Um candidato pertence a exatamente uma vaga — sem candidato "solto" sem vaga. Alimentado pelo Kanban (`/admin/rh/candidatos`, cadastro manual) e pelo formulário público (`/candidatura/:slug`, via RPC).

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| job_opening_id | uuid | NO | — | job_openings.id (ON DELETE RESTRICT) |
| name | text | NO | — | — |
| age | int | YES | NULL | — |
| whatsapp | text | NO | — | — |
| stage | text | NO | `'pendente'` | — |
| source | text | NO | — | — |
| photo_url | text | YES | NULL | — |
| resume_url | text | YES | NULL | — |
| notes | text | YES | NULL | — |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |
| stage_started_at | timestamptz | NO | `now()` | — |
| start_date | date | YES | NULL | — |
| due_date | date | YES | NULL | — |
| assignee_id | uuid | YES | NULL | auth.users.id (ON DELETE SET NULL) |
| due_date_reached_processed_at | timestamptz | YES | NULL | — |

> `stage` válidos (13 — funil sugerido + 3 "saídas" que aceitam drop vindo de qualquer etapa, sem transição restrita no CHECK): `pendente`, `conversa_iniciada`, `entrevista_marcada`, `no_show`, `decisao_necessaria`, `selecionado`, `em_formacao`, `em_contratacao`, `contratado`, `concluido_arquivado`, `descartado`, `banco_de_talentos`, `sem_contratacao`.
> `source` válidos: `'formulario'` (via `/candidatura/:slug`), `'manual'` (cadastro direto no Kanban).
> `age` é **nullable** (mudou de NOT NULL pra nullable em `20260718000001`): candidatos do formulário público não gravam idade aqui — vira resposta dinâmica em `candidate_answers` (chave `idade`, seed não-sistema). Cadastro manual no Kanban continua preenchendo a coluna normalmente. UI (`Candidatos.tsx`) mostra `age` com fallback pra resposta dinâmica quando `NULL`.
> `stage_started_at`: quando o candidato entrou na etapa **atual** — mantido sozinho pelo trigger `trg_candidates_set_updated_at` toda vez que `stage` muda (sem UPDATE manual). Não tem mais relação com prazo/atraso (ver nota abaixo) — hoje é só rastro informativo.
> `start_date`/`due_date` (`20260720000002`, substituiu `stage_sla_days` — a config de dias por etapa não refletia a realidade do processo seletivo): datas livres por candidato, "início" e "fim", editáveis manualmente no card (`/admin/rh/candidatos`). Card fica com badge "Atrasado" quando `now() > due_date`. `due_date` já existia antes (Fase 3, motor de automações) e continua sendo o campo usado por `change_due_date`/`due_date_reached`/`due_date_changed` — `start_date` é só informativo, sem automação atrelada.
> `assignee_id`/`due_date_reached_processed_at` (Fase 3, motor de automações): responsável livre, editável manualmente no Kanban ou por ação de automação (`change_assignee`). `due_date_reached_processed_at` é controle interno do cron `dispatch_due_date_reached_automations` (evita disparo duplicado do trigger `due_date_reached`) — resetado pra `NULL` automaticamente (mesmo trigger `trg_candidates_set_updated_at`) sempre que `due_date` muda de valor, permitindo um novo prazo disparar de novo no futuro.
> RLS: `has_rh_access()` pra tudo (`authenticated`). **Sem** policy de INSERT/UPDATE/DELETE pra `anon` — candidatura pública entra via RPC `submit_candidate_application` (`SECURITY DEFINER`, bypassa RLS por design, ver nota de segurança na RPC).

---

### `tags` / `candidate_tags`
Tags genéricas do motor de automações (Fase 3) — **separado** da tag de vaga/cargo (`job_openings.role_title`) e da tag de origem (`candidates.source`) já existentes, que continuam sendo atributos diretos do candidato, não entram nesse sistema.

**`tags`**: `id` uuid PK, `name` text NOT NULL, `slug` text NOT NULL UNIQUE, `color` text NOT NULL DEFAULT `'#6B7280'` (hex, exibição no card/badge), `created_at`.

**`candidate_tags`** (many-to-many): `id` uuid PK, `candidate_id` uuid NOT NULL → candidates.id (ON DELETE CASCADE), `tag_id` uuid NOT NULL → tags.id (ON DELETE CASCADE), `source` text NOT NULL DEFAULT `'manual'` CHECK `'manual'|'automation'`, `assigned_by` uuid → auth.users.id (ON DELETE SET NULL), `assigned_at` timestamptz. `UNIQUE(candidate_id, tag_id)`.

> RLS: `has_rh_access()` pra tudo (`authenticated`), ambas as tabelas.

---

### `whatsapp_templates`
Modelos de mensagem reaproveitáveis pela ação `send_whatsapp` de uma automação (Fase 3) — substitui a automação de WhatsApp que rodava no n8n.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| name | text | NO | — | — |
| body | text | NO | — | — |
| is_active | boolean | NO | `true` | — |
| created_by | uuid | YES | NULL | auth.users.id (ON DELETE SET NULL) |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |

> `body` aceita os placeholders (substituição simples via `render_automation_template`, sem SQL dinâmico): `{candidate_name}`, `{job_role_title}`, `{store_name}`, `{new_stage}`, `{previous_stage}`.
> RLS: `has_rh_access()` pra tudo (`authenticated`).

---

### `automations` / `automation_actions`
Motor de automações genérico (Fase 3) — substitui as 8 regras do ClickUp (When → Condition → Then). Recriar as regras específicas é configuração feita pela tela `/admin/rh/automacoes`, não código.

**`automations`**:

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| name | text | NO | — | — |
| description | text | YES | NULL | — |
| trigger_type | text | NO | — | — |
| trigger_stage | text | YES | NULL | — |
| trigger_conditions | jsonb | NO | `'[]'` | — |
| is_active | boolean | NO | `true` | — |
| sort_order | int | NO | `0` | — |
| created_by | uuid | YES | NULL | auth.users.id (ON DELETE SET NULL) |
| created_at / updated_at | timestamptz | NO | `now()` | — |

> `trigger_type` válidos: `'candidate_created'`, `'stage_changed'`, `'due_date_reached'`. `trigger_stage` (mesmos 13 valores de `candidates.stage`) é obrigatório só quando `trigger_type='stage_changed'` (CHECK composto `automations_trigger_stage_required`).
> `trigger_conditions`: array AND-combinado, ex. `[{"field":"job_opening.role_title","op":"eq","value":"Vendedor"}]`. Whitelist fixa de `field` (`evaluate_automation_conditions`): `candidate.age`, `candidate.stage`, `job_opening.role_title`, `store.name`, `store.slug`. `op`: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`. Campo fora da whitelist falha fechado (condição nunca casa).

**`automation_actions`**: `id` uuid PK, `automation_id` uuid NOT NULL → automations.id (ON DELETE CASCADE), `sort_order` int, `action_type` text NOT NULL, `action_config` jsonb NOT NULL DEFAULT `'{}'`, `created_at`.

> `action_type` válidos e shape de `action_config`: `change_stage` `{stage}`; `add_tag`/`remove_tag` `{tag_id}`; `change_due_date` `{mode:"relative_days", days}` ou `{mode:"clear"}`; `change_assignee` `{assignee_id}` ou `{clear:true}`; `send_whatsapp` `{template_id}`; `add_comment` `{text}` (placeholders `{{...}}` renderizados por `render_automation_template`).
> RLS: `has_rh_access()` pra tudo (`authenticated`), ambas as tabelas.

---

### `store_whatsapp_credentials`
Credencial Uazapi por unidade (Fase 3) — opcional; sem linha configurada, o envio cai no fallback da instância global (`UAZAPI_URL`/`UAZAPI_TOKEN`, mesmos env vars já usados por `send-order-whatsapp` e outras 4 edge functions). Populado manualmente pelo admin depois de copiar os dados do credential store do n8n.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| store_id | uuid | NO (PK) | — | stores.id (ON DELETE CASCADE) |
| uazapi_url | text | YES | NULL | — |
| uazapi_token | text | YES | NULL | — |
| is_active | boolean | NO | `true` | — |
| updated_by | uuid | YES | NULL | auth.users.id (ON DELETE SET NULL) |
| updated_at / created_at | timestamptz | NO | `now()` | — |

> **Segurança**: `uazapi_token` é secret — a tabela **não tem nenhuma RLS policy pra `authenticated`** (`REVOKE ALL ... FROM authenticated, PUBLIC`), fica invisível via PostgREST direto. Só a edge function `send-automation-whatsapp` (via `service_role`, bypassa RLS) lê o token cru. Frontend só enxerga via `get_store_whatsapp_credential_status(store_id)` (retorna `configured`, `is_active`, `uazapi_url`, `token_last4` — nunca o token completo) e escreve via `admin_set_store_whatsapp_credential(store_id, url, token)` (write-only, não retorna nada). Ambas as RPCs restritas a `is_admin()` (mais estrito que `has_rh_access()` — única exceção deliberada do módulo: gerenciar secret de canal de envio é mais sensível que operar o funil de RH).

---

### `automation_whatsapp_queue`
Fila da ação `send_whatsapp` — desacopla o envio (rede externa, pode falhar/demorar) da transação que disparou a automação. Populada por `execute_automation_action`, drenada a cada minuto pelo pg_cron `rh-automation-whatsapp-sender` → edge function `send-automation-whatsapp`.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| candidate_id | uuid | NO | — | candidates.id (ON DELETE CASCADE) |
| store_id | uuid | NO | — | stores.id |
| automation_id | uuid | YES | NULL | automations.id (ON DELETE SET NULL) |
| automation_action_id | uuid | YES | NULL | automation_actions.id (ON DELETE SET NULL) |
| template_id | uuid | YES | NULL | whatsapp_templates.id (ON DELETE SET NULL) |
| phone_number | text | NO | — | — |
| rendered_message | text | NO | — | — |
| idempotency_key | text | NO | — | — (UNIQUE) |
| status | text | NO | `'pending'` | — |
| attempt_count | int | NO | `0` | — |
| last_error | text | YES | NULL | — |
| processed_at | timestamptz | YES | NULL | — |
| created_at | timestamptz | NO | `now()` | — |

> `status` válidos: `'pending'`, `'processing'`, `'sent'`, `'failed'`. Reivindicação em lote via `claim_automation_whatsapp_queue_items(batch_size)` (`FOR UPDATE SKIP LOCKED`, marca `'processing'` + incrementa `attempt_count`) — a edge function some `'sent'` no sucesso, ou devolve pra `'pending'` (retry, até 3 tentativas) / `'failed'` (esgotado) na falha, sempre gravando um `candidate_stage_history` (`event_type='whatsapp_sent'`).
> RLS: `SELECT` via `has_rh_access()` (auditoria); sem policy de escrita pra `authenticated` — só a função/edge function (`service_role`) grava.

---

### `candidate_stage_history`
Generalizado na Fase 3 (motor de automações) de "histórico de etapa" pra log de atividade do candidato — continua com o mesmo nome (não renomeado: `promote_candidate_to_dp` e o trigger o referenciam pelo nome atual) e cobre também tag/prazo/responsável/WhatsApp/comentário/erro de automação, além da mudança de etapa original. `new_stage` deixou de ser `NOT NULL` (só obrigatório quando `event_type='stage_change'`).

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| candidate_id | uuid | NO | — | candidates.id (ON DELETE CASCADE) |
| previous_stage | text | YES | NULL | — |
| new_stage | text | YES | NULL | — |
| changed_by | uuid | YES | NULL | auth.users.id (ON DELETE SET NULL) |
| changed_at | timestamptz | NO | `now()` | — |
| event_type | text | NO | `'stage_change'` | — |
| automation_id | uuid | YES | NULL | automations.id (ON DELETE SET NULL) |
| metadata | jsonb | NO | `'{}'` | — |

> `event_type` válidos: `'stage_change'`, `'tag_added'`, `'tag_removed'`, `'due_date_changed'`, `'assignee_changed'`, `'whatsapp_sent'`, `'comment_added'`, `'automation_error'`. `automation_id` não-nulo = a linha foi gerada por uma automação (não por ação manual do operador) — é como o frontend distingue "gerado por automação" de "gerado por usuário", em vez de uma coluna `gerado_por` separada.
> `metadata` por `event_type`: `tag_added`/`tag_removed` → `{tag_id, tag_name}`; `due_date_changed` → `{previous_due_date, new_due_date}`; `assignee_changed` → `{previous_assignee_id, new_assignee_id}`; `whatsapp_sent` → `{template_id, success, error}`; `comment_added` → `{text}` (já renderizado, placeholders substituídos); `automation_error` → `{action_type, error}` (ação que falhou + `SQLERRM`).
> `changed_by` é `NULL` quando a mudança vem de um visitante anônimo (criação via formulário público) ou de uma automação — só é preenchido quando um usuário autenticado move o card no Kanban.
> RLS: só `SELECT` via `has_rh_access()`. Nenhuma policy de INSERT — só a função de trigger `log_candidate_stage_change()` e as funções do motor de automações (`SECURITY DEFINER`) escrevem.
> `promote_candidate_to_dp` (módulo DP) copia só linhas `event_type='stage_change'` pra `employee_timeline` — outros tipos de evento não fazem sentido como "Etapa RH: X → Y".

---

### `form_fields`
Config **global** (não por unidade) das perguntas do formulário público de candidatura — construtor em `/admin/rh/formulario` (tela "Build", nos moldes do ClickUp Forms: cada card é o próprio campo, editável no clique).

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| field_key | text | NO | — | — (UNIQUE) |
| label | text | NO | — | — |
| question_text | text | YES | NULL | — |
| help_text | text | YES | NULL | — |
| placeholder | text | YES | NULL | — |
| field_type | text | NO | — | — |
| required | boolean | NO | `false` | — |
| sort_order | int | NO | `0` | — |
| step | int | NO | `1` | — |
| options | jsonb | YES | NULL | — |
| is_system_field | boolean | NO | `false` | — |
| show_on_card | boolean | NO | `false` | — |
| visible_for_job_role_ids | uuid[] | YES | NULL | — (sem FK — array) |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |

> `field_type` válidos: `'texto'`, `'numero'`, `'telefone'`, `'select'`, `'checkbox'`, `'data'`, `'upload_imagem'`, `'upload_arquivo'`. `select`/`checkbox` usam `options` (array de strings); `checkbox` aceita múltiplas respostas marcadas na mesma pergunta (gravadas juntas em `candidate_answers.value`, separadas por `'; '` — ver `CHECKBOX_DELIM` em `src/components/rh/FormFieldRenderer.tsx`).
> `visible_for_job_role_ids`: restringe a pergunta a aparecer só quando a vaga escolhida pelo candidato (`vaga_id` → `job_openings.job_role_id`) bate com um dos cargos (`job_roles.id`) listados. `NULL`/array vazio = sempre visível (padrão de todo campo existente). Vaga criada sem vínculo a um cargo do catálogo (`job_openings.job_role_id IS NULL`) nunca satisfaz essa condição. Não se aplica a campo de sistema (`nome`/`whatsapp`/`vaga_id` sempre visíveis). Validado nos dois lados: `get_public_application_form` expõe a condição + o `job_role_id` de cada vaga pro frontend filtrar em tempo real (`CandidaturaPublica.tsx`); `submit_candidate_application` reforça a mesma regra na obrigatoriedade e na gravação de `candidate_answers`, já que é `SECURITY DEFINER` chamável por `anon`.
> `label` = nome curto interno (construtor, card do Kanban via `show_on_card`, respostas do candidato). `question_text` = frase que o candidato lê no formulário público; `NULL` cai de volta pra `label`. `help_text` = texto de apoio abaixo da pergunta. `placeholder` = texto fantasma dentro do campo de resposta. Tudo editável pelo construtor, exceto pros 3 campos de sistema.
> `is_system_field = true` em exatamente 3 registros (seed): `nome`, `whatsapp`, `vaga_id` — respostas desses vão direto pras colunas `candidates.name`/`candidates.whatsapp`/`candidates.job_opening_id`, nunca pra `candidate_answers`. `foto`/`curriculo` (seed, `upload_imagem`/`upload_arquivo`) **não** são `is_system_field` (podem ser apagados/renomeados livremente), mas por convenção de `field_key` também vão direto pras colunas `candidates.photo_url`/`candidates.resume_url` quando respondidos.
> Trigger `trg_form_fields_protect_system`: se `is_system_field`, força `required = true` e impede zerar `is_system_field` via UPDATE (imutável após criado) — bloqueio de "campo de sistema" em 2 camadas (esse trigger + a RLS de DELETE abaixo).
> `step`: agrupa perguntas em telas do wizard público — todas nascem em `1`; sem etapas diferentes configuradas, o formulário público é uma tela só (sem barra de progresso).
> RLS: `SELECT` pra `anon` **e** `authenticated` (config pública, sem PII — o formulário precisa ler pra se renderizar sem estar logado). `INSERT`/`UPDATE` só `authenticated` com `has_rh_access()`; `DELETE` adicionalmente exige `NOT is_system_field` na própria policy.

---

### `candidate_answers`
Resposta de um candidato a um campo dinâmico de `form_fields` (não-sistema, não-foto/currículo — esses vão direto pras colunas de `candidates`). Uma linha por pergunta efetivamente respondida; pergunta opcional deixada em branco não gera linha.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| candidate_id | uuid | NO | — | candidates.id (ON DELETE CASCADE) |
| field_id | uuid | NO | — | form_fields.id (ON DELETE CASCADE) |
| value | text | NO | — | — |
| created_at | timestamptz | NO | `now()` | — |

> `value`: bruto pra texto/número/telefone/data/select; URL do R2 pra uploads; opções marcadas separadas por `'; '` pra `checkbox`.
> **`ON DELETE CASCADE`** em `field_id` (decisão deliberada, não é o padrão RESTRICT do resto do schema): o construtor permite apagar qualquer campo não-sistema sem exceção — apagar a pergunta descarta as respostas históricas dela junto. Aceitável por ser dado de formulário, não financeiro/estoque.
> Só escrito pela RPC `submit_candidate_application` (`SECURITY DEFINER`) — **sem policy de INSERT pra ninguém**, nem `authenticated`, pra garantir que uma resposta só nasce atomicamente junto com o candidato dono dela (uma policy de INSERT direta pra `anon` não teria como impedir escrever respostas em candidatos alheios).
> RLS: só `SELECT` via `has_rh_access()`.

---

### `employee_processes`
Módulo Departamento Pessoal (DP) — assume o candidato a partir do momento em que é contratado no RH (`candidates.stage = 'contratado'`). Criado pela RPC `promote_candidate_to_dp`, nunca direto pelo frontend. Identificadores técnicos em inglês (mesma convenção de `candidates`/`job_openings`); valores de negócio (`current_stage`, `employment_type` etc.) continuam em português, mesmo padrão de `candidates.stage`.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| candidate_id | uuid | NO | — | candidates.id (ON DELETE RESTRICT) |
| employment_type | text | NO | — | — |
| store_id | uuid | NO | — | stores.id |
| role_title | text | NO | — | — |
| current_stage | text | NO | — | — |
| status | text | NO | `'em_andamento'` | — |
| started_at | timestamptz | NO | `now()` | — |
| activated_at | timestamptz | YES | NULL | — |
| onboarding_completed | boolean | NO | `false` | — |
| training_applicable | boolean | NO | `true` | — |
| training_completed | boolean | NO | `false` | — |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |

> `employment_type` válidos: `'clt'`, `'mei'` (`20260718000015` — antes existia `mei_sem_experiencia`/`mei_com_experiencia`, removido: não há diferença de tipo de contratação entre os dois, experiência é característica do **cargo**, não uma escolha manual na promoção).
> `role_title` é snapshot de `job_openings.role_title` no momento da promoção (mesmo padrão de `job_openings` copiando de `job_roles`).
> `current_stage` válidos dependem de `employment_type` (CHECK composto `employee_processes_current_stage_valid`):
> - `clt`: `contratacao → experiencia → decisao → (efetivado | encerrado)`
> - `mei`: `contrato_formacao → formacao → decisao_formacao → contratacao → acompanhamento_90d → (efetivado | encerrado)` — `contrato_formacao`/`formacao`/`decisao_formacao` só acontecem quando `job_roles.requires_experience = false` pro cargo da vaga do candidato; `promote_candidate_to_dp` decide o `current_stage` inicial sozinho (`contrato_formacao` se não exige experiência, `contratacao` direto se exige) — ver `job_roles.requires_experience`.
> - `contratacao` é uma etapa única que concentra o **checklist** de documentos + exame admissional (`employee_documents`, item `aso_admissional`) + assinatura de contrato (aba própria, `employee_contracts`) + onboarding/treinamento (`onboarding_completed`/`training_completed` abaixo) — não são etapas de kanban separadas.
> `onboarding_completed`: institucional, mesmo checklist pra todo `employment_type`. `training_applicable`/`training_completed`: treinamento técnico só aplicável a determinados cargos (ex: recepcionista) — cabeleireiro sem experiência já cobre a parte técnica em `formacao` (`mei_sem_experiencia`), então `training_applicable` normalmente vira `false` nesse caso. Ambas editáveis manualmente na aba "Documentos" do card — não fazem parte do CHECK de `current_stage`, são só um checklist de apoio.
> `status` válidos: `'em_andamento'`, `'ativo'`, `'encerrado'` — sincronizado automaticamente por trigger (`trg_employee_processes_sync_status`) a partir de `current_stage`: `efetivado` → `ativo` (+ `activated_at`), `encerrado` → `encerrado`, qualquer outro → `em_andamento`. Não editar `status` direto — mude `current_stage`.
> Índice único parcial `(candidate_id) WHERE status IN ('em_andamento', 'ativo')` — um candidato não pode ter dois processos simultaneamente ativos (permite reabrir só depois de `encerrado`, mesmo padrão de `replenishment_requests`).
> RLS: `has_rh_access()` pra tudo (`authenticated`), mesmo padrão do RH.
> UI: kanban de admissão em `/admin/dp/contratacao` (só `status='em_andamento'` por padrão, toggle pra ver finalizados); lista somente-leitura/gestão dos já `status='ativo'` em `/admin/dp/colaboradores` (sem drag-and-drop — a única ação de mudança de estado ali é encerrar o vínculo).
> Dois caminhos de entrada: via RH (`promote_candidate_to_dp`, nasce `em_andamento` e percorre o kanban) ou cadastro retroativo direto (`register_existing_employee`, nasce já `ativo` — colaborador que nunca passou pelo funil de recrutamento).

---

### `employee_documents`
Checklist de documentos de admissão — fixa por `employment_type`, definida em código (`src/lib/dpConstants.ts`, espelhada na RPC `promote_candidate_to_dp`), populada automaticamente na promoção. Não configurável nesta etapa.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| process_id | uuid | NO | — | employee_processes.id (ON DELETE CASCADE) |
| document_type | text | NO | — | — |
| status | text | NO | `'pendente'` | — |
| file_url | text | YES | NULL | — |
| created_at | timestamptz | NO | `now()` | — |
| updated_at | timestamptz | NO | `now()` | — |

> `document_type` válidos (união das duas checklists): `rg_cpf`, `comprovante_residencia`, `ctps`, `pis_pasep`, `titulo_eleitor`, `comprovante_escolaridade`, `foto_3x4`, `aso_admissional`, `dados_bancarios`, `cnpj_ccmei`.
> Checklist CLT (9 itens): todos exceto `cnpj_ccmei`. Checklist MEI sem/com experiência (5 itens, iguais pros dois): `rg_cpf`, `comprovante_residencia`, `cnpj_ccmei`, `dados_bancarios`, `foto_3x4`.
> `status` válidos: `'pendente'`, `'enviado'`, `'aprovado'`.
> `file_url` fica `NULL` nesta etapa — upload real pro R2 é fora de escopo (UI é stub, "Anexar arquivo" desabilitado).
> RLS: `has_rh_access()` pra tudo (`authenticated`).

---

### `employee_contracts`
Contrato(s) do processo de admissão — normalmente 0 ou 1 linha por processo, cadastro manual na aba "Contrato" do card.

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| process_id | uuid | NO | — | employee_processes.id (ON DELETE CASCADE) |
| contract_type | text | NO | — | — |
| file_url | text | YES | NULL | — |
| signature_date | date | YES | NULL | — |
| term_start | date | YES | NULL | — |
| term_end | date | YES | NULL | — |
| created_at | timestamptz | NO | `now()` | — |

> `contract_type` válidos: `'formacao'`, `'prestacao_servico'`, `'clt'`.
> `file_url` fica `NULL` nesta etapa — mesma ressalva de upload de `employee_documents`.
> RLS: `has_rh_access()` pra tudo (`authenticated`).

---

### `employee_timeline`
Linha do tempo do processo de admissão — mistura histórico herdado do recrutamento (`source='rh'`, copiado 1x na promoção, somente leitura no DP) com anotações feitas dentro do próprio DP (`source='dp'`).

| Coluna | Tipo | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | `gen_random_uuid()` | — |
| process_id | uuid | NO | — | employee_processes.id (ON DELETE CASCADE) |
| author_id | uuid | YES | NULL | auth.users.id (ON DELETE SET NULL) |
| occurred_at | timestamptz | NO | `now()` | — |
| note | text | NO | — | — |
| source | text | NO | — | — |
| created_at | timestamptz | NO | `now()` | — |

> `source` válidos: `'rh'`, `'dp'`. As linhas `'rh'` são geradas 1x pela RPC `promote_candidate_to_dp` a partir de `candidate_stage_history` — não crescem depois (o RH e o DP são módulos distintos a partir da promoção).
> RLS: `has_rh_access()` pra tudo (`authenticated`).

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
Retorna true se o usuário autenticado pode acessar o módulo de estoque. Unificado com `salao` em 2026-07-02 (D-23) — checa `role = 'salao'` internamente. Nome mantido por compatibilidade com as policies/RPCs que já o referenciam. **Só** `salao` — `administrativo` passa pela função separada `has_full_stock_access()` abaixo (acesso irrestrito, sem escopo de loja).

---

### `has_full_stock_access`
```
has_full_stock_access() → boolean
```
Retorna `true` para `role IN ('admin', 'administrativo')` — acesso irrestrito (todas as lojas, sem passar por `my_store_id()`) ao módulo de Estoque. `SECURITY DEFINER`, mesmo padrão de `is_admin()`/`is_estoque()` (regra D-01). Criada em `20260720000001`, substitui `is_admin()` nas policies `"_admin_all"` das 8 tabelas do módulo (`stores`, `stock_categories`, `stock_counts`, `stock_count_items`, `store_stock_targets`, `replenishment_orders`, `replenishment_requests`, `replenishment_request_items`) e no ramo "acesso irrestrito" das RPCs (`confirm_stock_count`, `get_current_store_stock`, `update_replenishment_order_status`, `update_replenishment_request_status`, `admin_delete_replenishment_request`, `admin_reopen_stock_count`, `set_replenishment_item_picked`, `set_replenishment_item_shipped_qty`). O ramo "colaborador de loja" (`is_estoque()` + `store_id = my_store_id()`) continua exclusivo de `salao`, sem mudança.

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
Confirma uma contagem física e concilia cada item contra `store_stock_targets`. **v2 (2026-07-04):** apaga o `replenishment_requests` aberto da loja e cria UM pedido consolidado novo com todos os itens abaixo da meta (nenhum item abaixo = nenhum pedido). Revalida `total_units` no servidor. Não reexecutável sobre a mesma contagem (`RAISE EXCEPTION` se já `confirmed`).
Retorno: `{ stock_count_id, store_id, confirmed_at, items_total, items_replenished, items_sufficient, items_skipped: [{product_id, reason}], replenishment_request_id }` — `reason` é `'no_units_per_box'` ou `'no_target_defined'`; `replenishment_request_id` é `null` quando nada precisou de reposição.
Acessível por: `authenticated` (admin ou colaborador `salao` da própria loja, verificado internamente).

---

### `update_replenishment_request_status`
```
update_replenishment_request_status(p_request_id uuid, p_new_status text, p_shipped_items jsonb DEFAULT NULL) → void
```
Avança o status de um pedido de reposição consolidado: `open→picking`, `open|picking→shipped`. `shipped` é terminal. `p_shipped_items` = `[{"item_id": uuid, "shipped_quantity": int}]` define quantidades enviadas por item; item ausente assume o sugerido.
Acessível por: `authenticated` (admin ou colaborador `salao` da loja central, verificado internamente).

---

### `update_replenishment_order_status` (LEGADA)
```
update_replenishment_order_status(p_order_id uuid, p_new_status text, p_shipped_quantity int DEFAULT NULL) → void
```
Operava a tabela legada `replenishment_orders` (um pedido por produto). Substituída por `update_replenishment_request_status` em 2026-07-04; mantida no banco mas sem uso no frontend.

---

### `admin_set_user_role`
```
admin_set_user_role(p_user_id uuid, p_role text, p_store_id uuid DEFAULT NULL) → void
```
Define `role` (`user`/`admin`/`salao`/`administrativo`) e, opcionalmente, `store_id` de um usuário `salao` (colaborador de loja física com acesso também ao módulo de estoque). Admin-only, verificado internamente. `store_id` é validado contra `stores` quando informado e sempre limpo (`NULL`) para roles diferentes de `salao`. `store_id` é **opcional** mesmo para `salao` — sem loja, o colaborador só acessa o módulo de venda. `administrativo` nunca tem `store_id` (acessa todas as lojas do Estoque, como o admin — ver `has_full_stock_access()`).
**Substitui** o update direto de `profiles.role` feito antes por `/admin/usuarios` — RLS de `profiles` só tem policies `self_select`/`self_update` (própria linha) desde `20250307000006_fix_catalog_rls_simple.sql`, sem policy admin-wide; um update direto do client não tinha efeito para linhas de terceiros. Ver D-22 em `docs/decisions.md`.

---

### `get_system_users`
```
get_system_users() → TABLE (id, role, full_name, email, created_at, last_sign_in_at, permissions, store_id, store_name)
```
Lista usuários com `role IN ('admin','salao','administrativo')`, com o nome da loja (`stores.name`) quando o `salao` tem `store_id` vinculado. Usada por `/admin/usuarios`.

---

### `admin_set_user_permission`
```
admin_set_user_permission(p_user_id uuid, p_key text, p_value boolean) → void
```
Liga/desliga uma permissão granular em `profiles.permissions` (merge de `{p_key: p_value}` no jsonb). Admin-only, verificado internamente via `is_admin()`. Criada em `20260420000002`. Chaves em uso hoje: `can_edit_orders` (restringe uma ação mesmo pra admin), `can_manage_rh` (concede acesso ao módulo de RH pra quem não é admin — usada por `has_rh_access()`).

---

### `admin_update_order`
```
admin_update_order(p_order_id uuid, p_seller_id uuid, p_payment_method text,
                   p_payment_splits jsonb, p_notes text, p_status text,
                   p_discount numeric, p_items jsonb) → void
```
Edição completa de um pedido existente: substitui todos os `order_items` (`p_items`: `[{product_id, product_name, qty, unit_price}]`), recalcula `subtotal`/`total` server-side e atualiza vendedor, pagamento, notas, status e desconto. Exige `is_admin()` **e** `permissions->>'can_edit_orders' = true` no perfil do chamador. `p_seller_id` NULL remove o vendedor. Criada em `20260420000002`.

---

### `has_rh_access`
```
has_rh_access() → boolean
```
Retorna `true` se o usuário autenticado é `admin` OU `administrativo` OU tem `profiles.permissions->>'can_manage_rh' = 'true'` — permissão granular, mesmo padrão de `can_edit_orders`. `SECURITY DEFINER`, mesmo padrão de `is_admin()`/`is_estoque()` (evita subquery direta em `profiles` dentro de policy, regra D-01). Usada em toda a RLS do módulo de RH: `job_openings`, `job_roles`, `candidates`, `candidate_stage_history`, `form_fields` (escrita), `candidate_answers` (leitura).

---

### `get_public_application_form`
```
get_public_application_form(p_store_slug text) → jsonb
```
Resolve a unidade pelo slug e retorna tudo que o formulário público (`/candidatura/:slug`) precisa pra se renderizar numa chamada só:
```json
{
  "store": { "id", "name" },
  "job_openings": [{ "id", "role_title", "status", "job_role_id", "description", "contract_type", "compensation_type", "fixed_amount", "variable_percentage", "variable_basis", "work_schedule", "workload_hours", "requirements", "benefits" }],
  "fields": [{ "id", "field_key", "label", "question_text", "help_text", "placeholder", "step", "field_type", "required", "sort_order", "options", "is_system_field", "visible_for_job_role_ids" }]
}
```
`job_openings` inclui vagas fechadas (frontend mostra "banco de currículos"). Loja não encontrada → `RAISE EXCEPTION`.
`SECURITY DEFINER` — não abre RLS de `stores`/`job_openings`/`form_fields` pra `anon`, só devolve o que a função decide expor.
Acessível por: `anon`, `authenticated`.

---

### `submit_candidate_application`
```
submit_candidate_application(p_store_slug text, p_answers jsonb) → uuid
```
`p_answers`: `[{"field_key": "...", "value": "..."}]`. Ponto de entrada único e atômico da candidatura pública:
1. Resolve a unidade pelo slug.
2. Resolve a vaga (`vaga_id`) e o cargo dela (`job_openings.job_role_id`) **antes** do loop de validação — não dá pra confiar na ordem de `sort_order` pra saber o cargo a tempo de checar campos condicionados por cargo.
3. Valida obrigatoriedade de cada linha de `form_fields` server-side (nunca confia em validação client-side) — pulando a checagem se o campo tiver `visible_for_job_role_ids` e o cargo da vaga escolhida não estiver na lista (campo não se aplica a essa vaga).
4. Extrai `nome`/`whatsapp`/`vaga_id`/`foto`/`curriculo` das respostas por `field_key`; valida que a vaga pertence à unidade resolvida.
5. Rate limit via `check_rate_limit('candidate_application:' || whatsapp_normalizado, 3, 600)` — bloqueia excesso de submissões pro mesmo WhatsApp.
6. `INSERT` em `candidates` (`stage='pendente'`, `source='formulario'`) — dispara sozinho o trigger de `candidate_stage_history` já existente.
7. Demais respostas (não-sistema, não-foto/currículo, aplicáveis ao cargo da vaga escolhida) viram uma linha em `candidate_answers` cada.
Retorna o `id` do candidato criado.
`SECURITY DEFINER` — é o único caminho de escrita pública em `candidates`/`candidate_answers`; nenhuma dessas tabelas tem policy de INSERT pra `anon` (ver nota de segurança em `candidate_answers`).
Acessível por: `anon`, `authenticated`.

---

### `admin_update_form_field_sort_orders`
```
admin_update_form_field_sort_orders(updates jsonb) → void
```
Atualiza `sort_order` em lote (drag-and-drop no construtor). `updates` = `[{"id": "uuid", "sort_order": 0}, ...]`. Mesmo padrão de `admin_update_product_sort_orders`, mas checa `has_rh_access()` em vez de admin-only.
Acessível por: `authenticated`.

---

### `promote_candidate_to_dp`
```
promote_candidate_to_dp(p_candidate_id uuid, p_employment_type text) → uuid
```
Trigger RH → DP: chamada quando o operador move um card do RH pra "Contratado" e escolhe o `employment_type` (`'clt'`/`'mei'`) no modal. Transação única:
1. Resolve `store_id`/`role_title`/`job_role_id` via `candidates → job_openings`.
2. `UPDATE candidates SET stage='contratado'` (idempotente se já estava — o trigger de histórico só grava se o stage mudar de fato).
3. Resolve `job_roles.requires_experience` via `job_role_id` (`true` se vaga manual sem cargo vinculado). `INSERT` em `employee_processes` com `current_stage` inicial: `contrato_formacao` se `employment_type='mei'` E o cargo não exige experiência, `contratacao` em qualquer outro caso. Índice único parcial de `employee_processes` barra dupla promoção (`RAISE EXCEPTION` legível).
4. `INSERT` em `employee_documents` — checklist fixa por `employment_type` (ver tabela `employee_documents`), todos `status='pendente'`.
5. `INSERT` em `employee_timeline` copiando `candidate_stage_history` (só linhas `event_type='stage_change'`, incluindo a transição pra `contratado` do passo 2) como `source='rh'`.
Retorna o `id` de `employee_processes` criado.
`SECURITY DEFINER` — valida `has_rh_access()` explicitamente no corpo antes de qualquer escrita.
Acessível por: `authenticated`.

---

### `register_existing_employee`
```
register_existing_employee(p_name text, p_whatsapp text, p_role_title text, p_store_id uuid, p_employment_type text, p_activated_at date DEFAULT CURRENT_DATE) → uuid
```
Cadastro retroativo de colaborador que já está ativo na empresa e nunca passou pelo funil de recrutamento do RH (funcionário legado). Usado pelo botão "Cadastrar colaborador" em `/admin/dp/colaboradores`. Reaproveita 100% da estrutura existente em vez de duplicar nome/whatsapp em `employee_processes`:
1. `INSERT` em `job_openings` já com `status='fechada'` (o cargo nunca esteve realmente em aberto pra recrutamento — só documenta a origem cargo/unidade).
2. `INSERT` em `candidates` com `source='manual'`, `stage='contratado'`.
3. Chama `promote_candidate_to_dp` normalmente (mesma checklist de documentos, mesma cópia de timeline).
4. `UPDATE employee_processes SET current_stage='efetivado', activated_at=p_activated_at` — trigger `trg_employee_processes_sync_status` já sincroniza `status='ativo'`.
Resultado: o processo nasce direto em `status='ativo'` — não passa pelo kanban de Contratação, some do kanban do RH (mesmo filtro client-side de `employee_processes.candidate_id` já usado pra `promote_candidate_to_dp`), aparece direto em `/admin/dp/colaboradores`.
Retorna o `id` de `employee_processes` criado.
`SECURITY DEFINER` — valida `has_rh_access()` explicitamente no corpo antes de qualquer escrita.
Acessível por: `authenticated`.

---

### Motor de Automações (Fase 3) — RPCs

### `dispatch_candidate_automations`
```
dispatch_candidate_automations(p_candidate_id uuid, p_trigger_type text, p_previous_stage text, p_new_stage text) → void
```
Ponto de entrada do motor: monta um `context jsonb` (candidato + vaga + loja), busca `automations` ativas com `trigger_type`/`trigger_stage` batendo e `trigger_conditions` satisfeitas (`evaluate_automation_conditions`), executa as `automation_actions` de cada uma em ordem via `execute_automation_action`. Cada ação roda dentro de um bloco `EXCEPTION WHEN OTHERS` isolado — falha numa ação grava `event_type='automation_error'` em `candidate_stage_history` e **não** impede as demais ações nem reverte a transição que disparou a automação.
Chamada por: o trigger `log_candidate_stage_change()` (estendido nesta fase, mesmos triggers `candidates_log_stage_insert`/`candidates_log_stage_update` de sempre — sem trigger novo) pra `candidate_created`/`stage_changed`; `dispatch_due_date_reached_automations()` pra `due_date_reached`.
**Guarda de recursão**: usa `pg_trigger_depth()` nativo do Postgres (não um contador manual) — uma ação `change_stage` refaz `UPDATE candidates`, o que re-dispara o mesmo trigger e incrementa a profundidade sozinho. Cap em 10 níveis; ao estourar, grava `automation_error` em vez de continuar a cadeia (protege contra automações que se disparam em círculo).
`SECURITY DEFINER`. Não exposta a `authenticated`/`anon` (`REVOKE ALL ... FROM PUBLIC`) — só chamada internamente.

### `evaluate_automation_conditions` / `execute_automation_action` / `render_automation_template`
Funções internas do motor (não chamadas diretamente pelo frontend): a primeira avalia `automations.trigger_conditions` (whitelist de campo/operador, ver tabela `automations` acima, fail-closed em campo desconhecido); a segunda executa 1 `automation_actions` por tipo (`change_stage`/`add_tag`/`remove_tag`/`change_due_date`/`change_assignee`/`send_whatsapp`/`add_comment`), gravando a linha de atividade correspondente; a terceira substitui os placeholders de um texto (template WhatsApp ou comentário) por dados reais do `context`, sem SQL dinâmico.

### `dispatch_due_date_reached_automations`
```
dispatch_due_date_reached_automations() → int
```
Scan periódico (`cron.schedule('rh-due-date-automations', '*/15 * * * *', ...)`): busca `candidates` com `due_date <= CURRENT_DATE` e `due_date_reached_processed_at IS NULL`, marca processado **antes** de disparar e usa `FOR UPDATE SKIP LOCKED` (mesmo padrão de idempotência de `send_pending_partner_order_webhooks`, evita disparo duplicado em execução concorrente do cron). Retorna quantos candidatos processou.

### `claim_automation_whatsapp_queue_items`
```
claim_automation_whatsapp_queue_items(p_batch_size int DEFAULT 20) → SETOF automation_whatsapp_queue
```
Reivindica um lote de `automation_whatsapp_queue` pendente (`FOR UPDATE SKIP LOCKED`, marca `status='processing'` + incrementa `attempt_count`) pra a edge function `send-automation-whatsapp` processar. Acessível só por `service_role`.

### `get_store_whatsapp_credential_status` / `admin_set_store_whatsapp_credential`
```
get_store_whatsapp_credential_status(p_store_id uuid) → jsonb   -- {configured, is_active, uazapi_url, token_last4, updated_at}
admin_set_store_whatsapp_credential(p_store_id uuid, p_uazapi_url text, p_uazapi_token text) → void
```
Único jeito do frontend interagir com `store_whatsapp_credentials` — a primeira nunca retorna o token completo (só `token_last4`), a segunda é write-only (não retorna nada). Ambas restritas a `is_admin()` (a leitura mascarada checa `has_rh_access()` primeiro, mas a escrita exige `is_admin()` — única exceção do módulo a esse padrão, ver nota de segurança na tabela `store_whatsapp_credentials`).
Acessível por: `authenticated`.

### `admin_reorder_automations` / `admin_reorder_automation_actions`
```
admin_reorder_automations(updates jsonb) → void              -- [{"id","sort_order"}], reordena automations
admin_reorder_automation_actions(updates jsonb) → void        -- idem, reordena automation_actions
```
Mesmo formato de `admin_update_form_field_sort_orders` (Fase 2) — usado pelo drag-and-drop de `/admin/rh/automacoes`. `SECURITY DEFINER`, valida `has_rh_access()`.
Acessível por: `authenticated`.

---

## Constraints & CHECK values

| Tabela | Coluna | Valores válidos |
|--------|--------|----------------|
| profiles | role | `'user'`, `'admin'`, `'salao'`, `'administrativo'` |
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
| job_roles | contract_type | `'clt'`, `'mei'`, `'pj'`, `'estagio'` |
| job_roles | compensation_type | `'fixa'`, `'variavel'`, `'mista'` — CHECK exige `fixed_amount`/`variable_percentage` coerentes com o tipo |
| job_roles | education_level | `'fundamental_incompleto'`, `'fundamental_completo'`, `'medio_incompleto'`, `'medio_completo'`, `'superior_incompleto'`, `'superior_completo'`, `'pos_graduacao'`, NULL |
| job_openings | status | `'aberta'`, `'fechada'` |
| job_openings | contract_type / compensation_type | mesmos valores de `job_roles`, porém nullable (snapshot opcional) |
| candidates | stage | 13 valores — ver tabela `candidates` acima |
| candidates | source | `'formulario'`, `'manual'` |
| form_fields | field_type | `'texto'`, `'numero'`, `'telefone'`, `'select'`, `'checkbox'`, `'data'`, `'upload_imagem'`, `'upload_arquivo'` |
| candidate_stage_history | event_type | `'stage_change'`, `'tag_added'`, `'tag_removed'`, `'due_date_changed'`, `'assignee_changed'`, `'whatsapp_sent'`, `'comment_added'`, `'automation_error'` |
| candidate_tags | source | `'manual'`, `'automation'` |
| automations | trigger_type | `'candidate_created'`, `'stage_changed'`, `'due_date_reached'` |
| automations | trigger_stage | mesmos 13 valores de `candidates.stage`, obrigatório só quando `trigger_type='stage_changed'` |
| automation_actions | action_type | `'change_stage'`, `'add_tag'`, `'remove_tag'`, `'change_due_date'`, `'change_assignee'`, `'send_whatsapp'`, `'add_comment'` |
| automation_whatsapp_queue | status | `'pending'`, `'processing'`, `'sent'`, `'failed'` |
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
| replenishment_orders (legada) | status | `'open'`, `'picking'`, `'shipped'` |
| replenishment_requests | status | `'open'`, `'picking'`, `'shipped'` |
| employee_processes | employment_type | `'clt'`, `'mei'` |
| employee_processes | status | `'em_andamento'`, `'ativo'`, `'encerrado'` (sincronizado por trigger a partir de `current_stage`) |
| employee_processes | current_stage | depende de `employment_type` — ver tabela `employee_processes` acima |
| employee_documents | document_type | `'rg_cpf'`, `'comprovante_residencia'`, `'ctps'`, `'pis_pasep'`, `'titulo_eleitor'`, `'comprovante_escolaridade'`, `'foto_3x4'`, `'aso_admissional'`, `'dados_bancarios'`, `'cnpj_ccmei'` |
| employee_documents | status | `'pendente'`, `'enviado'`, `'aprovado'` |
| employee_contracts | contract_type | `'formacao'`, `'prestacao_servico'`, `'clt'` |
| employee_timeline | source | `'rh'`, `'dp'` |

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
| `vagas`/`candidatos`/`formulario_campos`/`candidato_respostas` (nomes em português do briefing original) | `job_openings`/`candidates`/`form_fields`/`candidate_answers` — módulo de RH segue a mesma convenção: tabelas/colunas em inglês, só os *valores* de status/tipo (`etapa`, `field_type`) ficam em português |
| `unidade_id` (RH) | Não existe — vaga usa `store_id`, RH reaproveita a tabela `stores` já existente (não criou tabela `unidades` própria) |
