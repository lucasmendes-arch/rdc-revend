# session_compact.md — Compactação da sessão longa
# Atualizado em: 2026-03-23

## 1. Objetivo

Resumo compacto para retomada rápida com qualquer IA.

---

## 2. Estado atual do projeto

### Branch ativa
`feature/bloco-ajustes-comercial-auth-pricing` — **NÃO mergeada para main ainda.**

### Infra
- Supabase project ref: `kjfsmwtwbreapipifjtu`
- Frontend: Vercel (auto-deploy de `main`)
- WhatsApp: UAZAPI (não alterar)
- Pagamentos: MercadoPago (produção ativo)

---

## 3. O que foi implementado nesta rodada

### BLOCO 1 — Correções de UX (concluído e validado)

**Reset de senha:**
- `src/pages/RedefinirSenha.tsx` — nova página pública que consome o token `PASSWORD_RECOVERY` via `onAuthStateChange`, form de nova senha, redireciona para `/login` on success
- `src/App.tsx` — rota pública `/redefinir-senha` adicionada
- `src/pages/Login.tsx` — `redirectTo` aponta para `/redefinir-senha`

**Catálogo público:**
- `/catalogo` movido para fora do `ProtectedRoute` — acesso sem login
- `isGuest = !user` propagado para componentes filhos
- Preços ocultos para guests (ícone Lock + CTA cadastro)
- Carousel: blur nos itens 5+ para guests; drag-scroll desktop fixado
- PackageCards: preços e CTA substituídos para guests
- "Ver todos" via `?view=todos` — flat grid ordenado por categoria
- Header do catálogo restaurado: logo + "Rei dos Cachos" + "atacado"

**Funil do admin:**
- `src/hooks/useSessionTracking.ts` — `statusRank` e `shouldUpdateStatus` com lógica comercial correta (comprou=10, nunca regride; abandonou permite retomada para checkout/carrinho)
- Migration `20260323000001_fix_funnel_priority_guard.sql` — `detect_abandoned_carts()` com `AND status <> 'comprou'` para nunca sobrescrever compra com abandono

### BLOCO 2 — Vendedores e Financeiro (concluído e validado)

**FASE 1 — Banco de dados (aplicado em produção via `supabase db push`):**
- Migration `20260323000002_sellers_table.sql`:
  - Tabela `sellers`: `id, name, code, email, phone, commission_pct, is_default, active, created_at, updated_at`
  - Trigger `update_sellers_updated_at` — mantém `updated_at`
  - Trigger `sellers_enforce_single_default` — garante no máximo 1 seller padrão (BEFORE INSERT OR UPDATE OF is_default)
  - UNIQUE INDEX parcial `sellers_single_default_idx WHERE is_default = true` — proteção de race condition
  - RLS: somente `is_admin()` tem acesso
- Migration `20260323000003_orders_seller_id.sql`:
  - `ALTER TABLE orders ADD COLUMN seller_id uuid REFERENCES sellers(id) ON DELETE SET NULL`
  - Index `orders_seller_id_idx`
  - RPC `create_manual_order` atualizada: parâmetro `p_seller_id uuid DEFAULT NULL`, resolução server-side (explícito > padrão ativo > NULL), incluído no INSERT e no evento CRM

**FASE 2 — Edge function (deployado em produção):**
- `supabase/functions/create-order/index.ts`:
  - `seller_id?: string` na interface `OrderRequest`
  - Bloco 7.5: resolve seller — usa `body.seller_id` ou busca `sellers WHERE is_default=true AND active=true LIMIT 1` ou NULL
  - `seller_id: resolvedSellerId` no INSERT de `orders`

**FASE 3 — UI Admin (na branch, build ok):**
- `src/pages/admin/Vendedores.tsx` — CRUD completo: tabela com toggle ativo/inativo, badge padrão, botão "Tornar padrão", modal criar/editar com todos os campos, confirmação de delete
- `src/components/admin/AdminLayout.tsx` — item "Vendedores" com `UserCheck` icon entre Marketing e Usuários
- `src/App.tsx` — rota `/admin/vendedores`

**FASE 4 — Pedidos com seller (na branch, build ok):**
- `src/pages/admin/Pedidos.tsx`:
  - Interface `Order` com `seller_id` e `sellers(name, code)`
  - Query com join `sellers(name, code)`
  - Filtro por vendedor no header (select dropdown)
  - Badge amber nos cards do kanban com código/nome do seller
  - Linha "Vendedor:" no detalhe expandido mobile

**FASE 5 — Financeiro com breakdown (na branch, build ok):**
- `src/pages/admin/Financeiro.tsx`:
  - Interface e query com `seller_id, sellers(name, code, commission_pct)`
  - `sellerBreakdown` no useMemo: agrupa pedidos pagos do mês por seller
  - Seção "Por Vendedor — Mês Atual": tabela com nome, código, pedidos, faturamento, comissão calculada (só aparece quando há dados)

**Seletor de seller no novo pedido manual:**
- `src/pages/admin/NewOrder.tsx`:
  - Query sellers ativos
  - Select "Vendedor" na seção Detalhes com opção "Usar vendedor padrão"
  - `p_seller_id` incluído no payload do `create_manual_order`

### Guard-rails (commitados em main)
- `AGENTS.md` — contrato para agentes IA
- `docs/GUARDRAILS.md` — 10 seções de regras congeladas
- `docs/RELEASE_CHECKLIST.md` — checklist de smoke test

---

## 4. Sellers em produção

| Nome | Código | Padrão | Ativo |
|------|--------|--------|-------|
| Rebeca Santos | REBECA | sim | sim |

ID: `1e8638de-d8e2-44df-8cfa-e506c16c9724`

---

## 5. O que está pendente (próxima rodada)

- [ ] Merge `feature/bloco-ajustes-comercial-auth-pricing` → `main` (e Vercel deploy)
- [ ] BLOCO 3A — Operação de salão: role `salao`, `SalaoRoute`, tela `/salao/pedido`
- [ ] BLOCO 3B — Preços por parceiro: tabela `partner_prices`, override no catálogo, validação server-side no create-order
- [ ] Editor de mensagens das automações CRM
- [ ] Painel da fila `crm_dispatch_queue` no admin
- [ ] Configurar Redirect URL no Supabase Dashboard: adicionar `<dominio>/redefinir-senha`

---

## 6. Decisões importantes

1. Trigger + UNIQUE INDEX para `sellers.is_default` — trigger para operação normal, índice para race condition e bypass
2. `create-order` edge function resolve seller server-side — nunca confiar no frontend para isso
3. `create_manual_order` RPC: `p_seller_id DEFAULT NULL` — retrocompatível com todas as chamadas existentes
4. `/catalogo` é rota pública — nunca mover de volta para `ProtectedRoute`
5. `shouldUpdateStatus`: `comprou` é terminal e nunca regride; `abandonou` permite retomada para checkout/carrinho
6. Branch `feature/bloco-ajustes-comercial-auth-pricing` ainda não mergeada para main — frontend das mudanças desta rodada só vai para Vercel após o merge
7. Não expor secrets em handoff

---

## 7. Últimos problemas resolvidos

- `supabase db push` falhou com "Cannot find project ref" → fix: `supabase link --project-ref kjfsmwtwbreapipifjtu`
- Conflict no merge com remote main (10+ commits à frente) → resolvido preservando ambos os lados
- Pedidos de teste criados manualmente atualizados/deletados via Node.js com service role key
- Seller Rebeca aparecendo desativada: foi clique acidental no toggle durante resposta do chat (não há código que desative automaticamente)
