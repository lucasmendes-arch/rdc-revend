# Decisões Técnicas — Rei dos Cachos B2B

_Registro de decisões arquiteturais relevantes, com contexto e consequências._

---

## [D-01] RLS via função SECURITY DEFINER (não subquery em profiles)

**Data:** 2025-03-07
**Contexto:** Policies que usavam subquery em `profiles` causavam recursão infinita no Supabase hosted.
**Decisão:** Criar `public.is_admin()` como SECURITY DEFINER com `SET search_path = public`. Nunca usar subquery em `profiles` dentro de policies de outras tabelas.
**Consequência:** Admin check é centralizado, sem recursão. Migrations posteriores seguem este padrão.

---

## [D-02] client_sessions com 1 registro por usuário

**Data:** 2025-03-12
**Contexto:** Havia múltiplas sessões por usuário causando duplicidade no Kanban.
**Decisão:** `session_id = 'user_{uuid}'` para usuários autenticados. Uma sessão por usuário.
**Consequência:** O status avança mas nunca regride (exceto `abandonou` que é set pelo cron). Migration `20250312000001` consolidou duplicatas.

---

## [D-03] crm_events — event_type como string com CHECK constraint

**Data:** 2026-03-08
**Contexto:** Alternativa era enum PostgreSQL ou tabela de lookup.
**Decisão:** `text NOT NULL CHECK (event_type IN (...))`. Mais fácil de expandir com migration.
**Consequência:** Expandir event_types requer `ALTER TABLE DROP CONSTRAINT / ADD CONSTRAINT`. Feito em `20250313000002`.

---

## [D-04] Idempotência de webhooks via processed_webhooks

**Data:** 2026-03-08
**Contexto:** MercadoPago pode re-enviar o mesmo webhook. Precisávamos garantir que `purchase_completed` não fosse emitido duas vezes.
**Decisão:** Tabela `processed_webhooks` com PK `(source, external_id)`. INSERT tenta inserir; se erro 23505 (duplicate key) → webhook já processado → retorna 200 sem processar.
**Consequência:** Sem RLS (tabela interna). Acesso exclusivo via service_role em edge functions.

---

## [D-05] purchase_completed vem só do webhook (server-side)

**Data:** 2026-03-08
**Contexto:** `useTrackPurchase` existia no frontend mas nunca foi chamado por nenhuma página.
**Decisão:** Manter `useTrackPurchase` como `@deprecated`. A confirmação real de compra vem do `webhook-mercadopago` (após verificação com API do MP). Isso evita registrar compras que não foram confirmadas.
**Consequência:** Não há evento CRM de compra sem confirmação de pagamento.

---

## [D-06] CrmEvent vs CrmEventRecord — conflito de interfaces

**Data:** 2026-03-08
**Contexto:** `CrmEvent` em `types/crm.ts` modelava "definição de tipo de evento" (com `name`, `is_active`) — estrutura que nunca foi implementada no banco. A tabela real `crm_events` armazena registros de eventos.
**Decisão:** Adicionar `CrmEventRecord` com colunas reais. Marcar `CrmEvent` como `@deprecated`. Não remover para não quebrar referências existentes.
**Consequência:** `CrmEvent` é ficção documentada. Não usar em código novo.

---

## [D-07] Deduplicação de eventos CRM via localStorage (10s)

**Data:** 2026-03-08
**Contexto:** Hooks de tracking são chamados no render/useEffect e podem disparar duplicatas rápidas (ex: re-renders, StrictMode).
**Decisão:** `crmService.trackEvent()` usa `localStorage` com janela de 10 segundos por chave `crm_{userId}_{sessionId}_{eventType}_{page}`.
**Consequência:** Em modo incógnito ou após limpeza de localStorage, eventos podem duplicar. Aceitável para esta fase.

---

## [D-09] Orquestração multi-ferramenta — merge de prompts intermediários

**Data:** 2026-03-08
**Contexto:** A Etapa 2 foi dividida entre Claude Code (backend/consolidação) e Antigravity/Gemini (frontend/core). O prompt P3 (ANT_V2) foi planejado mas seu conteúdo foi absorvido pelo P4 (CLD_V1) durante revisão de consolidação.
**Decisão:** Quando um prompt intermediário é superado por outro de consolidação, marcá-lo como `SKIPPED_BY_MERGE` no `prompt_registry.md` — sem apagar histórico, sem re-executar.
**Consequência:** Padrão estabelecido para sincronização entre ferramentas. O orquestrador deve sempre verificar o `prompt_registry.md` antes de despachar um prompt já registrado.

---

## [D-08] Automações criadas como is_active = false

**Data:** 2026-03-08
**Contexto:** Seeds criam automações de boas-vindas, carrinho abandonado e checkout. Templates são placeholders.
**Decisão:** Todas criadas com `is_active = false`. Admin ativa manualmente após configurar API WhatsApp real.
**Consequência:** Nenhuma automação dispara em produção até ativação explícita.

---

## [D-10] Segmentação comercial — profile como source of truth + snapshot no pedido

**Data:** 2026-04-08
**Contexto:** Necessidade de classificar clientes como `network_partner` ou `wholesale_buyer` para relatórios e regras de negócio diferenciadas.
**Decisão:** `profiles.customer_segment` é a source of truth (editável pelo admin via RPC). `orders.customer_segment_snapshot` é uma cópia congelada no momento da criação do pedido (via RPCs e edge function). Backfill inicial usou `is_partner` como proxy (`true` → `network_partner`, `false` → `wholesale_buyer`).
**Consequência:** Alterar o segmento de um cliente não retroage pedidos antigos. Relatórios por período usam o snapshot do pedido, não o perfil atual. NULL é permitido para legado ambíguo.

---

## [D-11] isPartner derivado de dois campos — is_partner boolean legado + customer_segment

**Data:** 2026-04-10
**Contexto:** Parceiros criados antes do campo `customer_segment` tinham `is_partner = true`. Parceiros criados após o backfill têm `is_partner = false` mas `customer_segment = 'network_partner'`.
**Decisão:** `AuthContext.isPartner = !!data.is_partner || data.customer_segment === 'network_partner'`. Ambos os campos são verificados para máxima cobertura.
**Consequência:** Novos parceiros precisam ter `customer_segment = 'network_partner'` via admin. O campo `is_partner` pode ser considerado legado mas não deve ser removido sem backfill.

---

## [D-12] Login de parceiros via telefone — resolução server-side sem Phone provider

**Data:** 2026-04-10
**Contexto:** Parceiros `network_partner` têm `auth_phone` no perfil e precisam logar com telefone + senha. O Supabase Phone provider exige OTP, incompatível com a arquitetura de senha fixa.
**Decisão:** RPC `resolve_partner_login_email(p_phone)` acessível por `anon` resolve telefone → e-mail server-side. O frontend faz login normal com `signInWithPassword({ email, password })`. A detecção de telefone no campo é feita por heurística de dígitos (10-13 dígitos após strip de separadores).
**Consequência:** O `auth_phone` em `profiles` precisa estar em E.164 e sincronizado com `access_status = 'active'`. Se o e-mail mudar, o login por telefone para de funcionar até atualização.

---

## [D-13] Ordenação manual de produtos — sort_order por categoria

**Data:** 2026-04-10
**Contexto:** O catálogo ordenava por `updated_at DESC`, impossibilitando controle manual da ordem de exibição.
**Decisão:** `catalog_products.sort_order int DEFAULT 0`, índice em `(category_id, sort_order)`. Ordenação padrão do catálogo: `sort_order ASC, updated_at DESC`. Escrita via RPC SECURITY DEFINER `admin_update_product_sort_orders(jsonb)`. Admin UI com drag-and-drop por categoria.
**Armadilha evitada:** O frontend re-ordenava os produtos localmente com `sortBy = 'name_asc'` como default, sobrescrevendo o sort_order do banco. Corrigido mudando o default para `'default'` (preserva ordem da query).

---

## [D-15] Auth loading — roleLoadedRef, uma única carga por sessão

**Data:** 2026-04-15
**Contexto:** `AuthContext` setava `loading=true` em todo evento de auth, incluindo `TOKEN_REFRESHED` e `SIGNED_IN` disparados no alt-tab (renovação automática de token). Isso desmontava rotas protegidas (`SalaoRoute`, `AdminRoute`), apagando estado local de formulários.
**Decisão:** Introduzir `roleLoadedRef` (useRef booleano). `loading=true` + `fetchAccountMetadata` só disparam quando `roleLoadedRef.current === false` (primeira carga ou pós-logout). Eventos subsequentes atualizam apenas `session` e `user` sem tocar `loading` ou `role`.
**Consequência:** Formulários longos (ex: /salao/pedido) sobrevivem a renovações de token. Na prática, `loading` é um bloqueio de rota de mão única por sessão. Admin e catálogo também param de piscar no alt-tab.

---

## [D-16] Login pós-auth — navegação via useEffect, não imperativa

**Data:** 2026-04-15
**Contexto:** `Login.tsx` chamava `navigate()` imediatamente após `signInWithPassword()`. Como `onAuthStateChange` é assíncrono, o React renderizava a nova rota antes de `role` estar disponível no `AuthContext`. `SalaoRoute` via `role=null` e redirecionava para `/`, impedindo o acesso.
**Decisão:** Substituir o `navigate()` imperativo por `setPendingNav(true)` + `useEffect` que observa `[pendingNav, authLoading, user, role]`. A navegação só ocorre quando `authLoading=false` e `user` está definido — garantindo que o role já está resolvido.
**Consequência:** Elimina a race condition no login de qualquer role. A dupla query ao DB (uma em `handleSubmit` para decidir rota, outra no `AuthContext`) foi eliminada — `AuthContext` é a única fonte de verdade do role.

---

## [D-17] create-user edge function — --no-verify-jwt (ES256 vs HS256)

**Data:** 2026-04-15
**Contexto:** O Supabase passou a assinar JWTs com `ES256` (curva elíptica). O gateway de edge functions com JWT verification habilitada esperava `HS256`, retornando `UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM` antes de chegar no código da função.
**Decisão:** Deploy da `create-user` com `--no-verify-jwt`. A função já faz sua própria verificação de auth (busca o usuário pelo token + checa role `salao` ou `admin` no DB), então a verificação de gateway é redundante.
**Consequência:** A função é acessível sem JWT válido no gateway, mas rejeita qualquer chamada sem um Bearer token de usuário autenticado com role correto. Padrão a replicar em futuras edge functions que façam auth própria.

---

## [D-18] Pagamento dividido — payment_splits JSONB em orders

**Data:** 2026-04-15
**Contexto:** Operadores do salão precisavam registrar pagamentos mistos (ex: R$100 PIX + R$50 Dinheiro) em um único pedido.
**Decisão:** Nova coluna `orders.payment_splits JSONB` com estrutura `[{method, amount}]`. Quando informado, `create_salao_order` valida que a soma bate com o subtotal (tolerância R$0,01) e grava `payment_method = 'MISTO'` automaticamente. Pedidos com pagamento único mantêm `payment_splits = NULL` — retrocompatível.
**Consequência:** Admin Pedidos exibe badge roxo com detalhamento dos splits. `payment_method = 'MISTO'` é o discriminador para saber se há splits.

---

## [D-19] Clientes criados pelo salão — wholesale_buyer automático

**Data:** 2026-04-15
**Contexto:** Todo cliente cadastrado pelo operador do salão é um comprador atacado, não um parceiro da rede (`network_partner`).
**Decisão:** `handleCreateClient` em `/salao/pedido` sempre seta `customer_segment = 'wholesale_buyer'` após criação via edge function `create-user`. Sem checkbox — decisão é automática e implícita.
**Consequência:** Admin pode alterar a classificação depois via `admin_update_customer_segment`. O campo `is_partner` (legado) não é alterado.

---

## [D-14] Tabelas de preço — price list merge no hook, não na query

**Data:** 2026-04-10
**Contexto:** Parceiros com `price_list_id` têm preços personalizados por produto via `price_list_items`.
**Decisão:** `useCatalogProducts(fetchPriceList: true)` busca `get_my_price_list_items()` em paralelo e faz merge no `useMemo`: produtos com entry na price list têm `partner_price` sobrescrito. Produtos sem entry usam o preço padrão do catálogo.
**Consequência:** Falha na RPC de price list não bloqueia o catálogo, mas exibe preço padrão. `priceListError` é exposto pelo hook para que o frontend possa alertar o usuário. Validação de NaN e price > 0 no merge garante que entradas corrompidas sejam ignoradas.
