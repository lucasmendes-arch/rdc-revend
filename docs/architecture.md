# Arquitetura — Rei dos Cachos B2B

_Última atualização: 2026-03-08_

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
| `client_sessions` | Tracking do funil por usuário (Kanban admin) |
| `catalog_sync_runs` | Histórico de sincronizações com Nuvemshop |
| `rate_limits` | Rate limiting para edge functions |

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

### RLS — padrão adotado

- Todas as tabelas têm RLS habilitado (exceto `rate_limits`, `processed_webhooks`)
- Função `public.is_admin()` — SECURITY DEFINER, evita recursão em policies
- Nunca usar subquery em `profiles` dentro de policies de outras tabelas
- Admin: `public.is_admin()` em todas as operações sensíveis
- Usuário: `auth.uid() = user_id` para leitura/escrita própria

### Funções SQL relevantes

| Função | Propósito |
|---|---|
| `public.is_admin()` | Verifica role admin sem recursão |
| `decrement_stock(p_product_id, p_qty)` | Decrementa estoque atomicamente |
| `restore_order_stock(p_order_id)` | Restaura estoque ao cancelar pedido |
| `detect_abandoned_carts()` | Marca sessões como abandonou + emite crm_event |
| `check_rate_limit(key, max, window)` | Rate limiting nas edge functions |
| `get_crm_customer_debug(user_id)` | Debug consolidado do CRM por usuário |

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
