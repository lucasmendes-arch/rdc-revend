# Arquitetura — Rei dos Cachos B2B

_Última atualização: 2026-03-17_

## Banco de dados (Supabase PostgreSQL)

### Tabelas principais

| Tabela | Propósito |
|---|---|
| `profiles` | Perfil do usuário (role, dados B2B) — criado por trigger em auth.users |
| `catalog_products` | Produtos do catálogo (sincronizados via Nuvemshop) |
| `categories` | Categorias dos produtos |
| `inventory` | Estoque por produto |
| `orders` | Pedidos realizados |
| `order_items` | Itens de cada pedido |
| `upsell_offers` | Oferta de upsell ativa no checkout |
| `kit_components` | Composição dos kits |
| `client_sessions` | Tracking do funil por usuário (Kanban admin) — UNIQUE (user_id) |
| `catalog_sync_runs` | Histórico de sincronizações com Nuvemshop |
| `rate_limits` | Rate limiting para edge functions |
| `store_settings` | Configurações globais da loja (id=1 singleton, min_cart_value) |
| `coupons` | Cupons de desconto (percent/fixed/free_shipping) |
| `pickup_units` | Unidades físicas para retirada de pedidos |

### Tabelas Promoções (Etapa 6)

| Tabela | Propósito |
|---|---|
| `store_settings` | Configurações globais — `min_cart_value` dinâmico (singleton id=1) |
| `coupons` | Cupons: `discount_type` (`percent`/`fixed`/`free_shipping`), `usage_limit`, `expires_at` |

### Tabelas CRM (Etapa 1+2)

| Tabela | Propósito |
|---|---|
| `crm_events` | Log de eventos do funil por usuário |
| `crm_tags` | Catálogo de tags (system + custom) |
| `crm_customer_tags` | Relação usuário ↔ tag |
| `crm_automations` | Definições de automações (WhatsApp) |
| `crm_automation_runs` | Log de execuções com idempotência |
| `processed_webhooks` | Idempotência para webhooks externos |

### Funil — status de client_sessions

```
visitou → visualizou_produto → adicionou_carrinho → iniciou_checkout → comprou
                                                                     ↓
                                                                 abandonou  (cron)
```

### Views públicas

| View | Propósito |
|---|---|
| `catalog_products_public` | Projeção segura de catalog_products para acesso anon (omite colunas internas) |

### RLS — padrão adotado

- Todas as tabelas têm RLS habilitado (exceto `rate_limits`, `processed_webhooks`)
- Função `public.is_admin()` — SECURITY DEFINER, evita recursão em policies
- Nunca usar subquery em `profiles` dentro de policies de outras tabelas
- Admin: `public.is_admin()` em todas as operações sensíveis
- Usuário: `auth.uid() = user_id` para leitura/escrita própria
- **Anon**: `catalog_products` e `categories` têm policy `USING (true/is_active=true)` + `GRANT SELECT TO anon`

### Funções SQL relevantes

| Função | Propósito |
|---|---|
| `public.is_admin()` | Verifica role admin sem recursão |
| `create_manual_order(p_user_id, p_items, p_total, p_status, p_origin, p_payment_method, p_notes, p_discount, p_coupon_id, p_created_at, p_delivery_method, p_pickup_unit_slug)` | Cria pedido manual (admin-only, SECURITY DEFINER, 12 params, suporta data retroativa, cupom e retirada na loja) |
| `validate_coupon(p_code, p_cart_total)` | Valida cupom; retorna `{valid,id,type,value}` — acessível por anon+authenticated |
| `increment_coupon_usage(p_coupon_id)` | Incrementa used_count do cupom atomicamente |
| `get_customer_timeline(p_user_id, p_limit)` | Timeline consolidada do cliente (perfil, sessão, tags, eventos, pedidos, stats) — admin-only |
| `decrement_stock(p_product_id, p_qty)` | Decrementa estoque atomicamente |
| `restore_order_stock(p_order_id)` | Restaura estoque ao cancelar pedido |
| `detect_abandoned_carts()` | Marca sessões como abandonou + emite crm_event |
| `check_rate_limit(key, max, window)` | Rate limiting nas edge functions |
| `get_crm_customer_debug(user_id)` | Debug consolidado do CRM por usuário |
| `assign_crm_tag(user_id, slug, source)` | Atribui tag CRM idempotentemente |
| `remove_crm_tag(user_id, slug)` | Remove tag CRM |
| `claim_crm_queue_items(batch_size)` | Claim atômico da fila CRM (FOR UPDATE SKIP LOCKED) |
| `release_expired_orders()` | Libera pedidos expirados e restaura estoque (pg_cron 5min) |

> **Referência completa de schema:** ver `docs/SCHEMA.md`

## Edge Functions

| Função | Trigger | Propósito |
|---|---|---|
| `create-order` | Frontend (checkout) | Cria pedido com validação server-side |
| `create-user` | Admin | Cria usuário manualmente |
| `webhook-mercadopago` | MercadoPago webhook | Confirma pagamento, atualiza sessão, emite crm_event |
| `sync-nuvemshop` | Manual/cron | Sincroniza produtos da Nuvemshop |
| `sync-google-sheets` | Manual | Exporta dados para Google Sheets |

## Frontend — estrutura de tracking

```
useTrackPageView()         → 'visitou'            (Catalogo.tsx)
useTrackProductView()      → 'visualizou_produto'  (Catalogo.tsx)
useTrackAddToCart()        → 'adicionou_carrinho'  (Catalogo.tsx)
useTrackInitiateCheckout() → 'iniciou_checkout'    (Checkout.tsx)
Cadastro.tsx               → 'user_registered'     (direto via crmService)
webhook-mercadopago        → 'purchase_completed'  (server-side)
detect_abandoned_carts()   → 'cart_abandoned'      (cron a cada 10min)
```

## Design System

- Fonte: DM Sans (body), Playfair Display (display)
- Gold brand: `--gold-start`, `--gold-end`, `--gold-light`, `--gold-text`, `--gold-border`
- Classes: `gradient-gold`, `btn-gold`, `btn-gold-outline`, `bg-surface`, `bg-surface-alt`
- Sombras: `shadow-card`, `shadow-card-hover`, `shadow-gold`
- Breakpoints: mobile-first — `sm:` 640px / `md:` 768px / `lg:` 1024px / `xl:` 1280px

## Convenções

- Migrations: `YYYYMMDDXXXXXX_descricao.sql` em `supabase/migrations/`
- Commits: inglês, prefixo semântico (`feat/fix/refactor/chore`)
- Nomes técnicos novos: inglês (ex: tabelas CRM, colunas)
- Nomes de negócio/UI: português (ex: status do funil)
