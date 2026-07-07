# Relatório de Complexidade Ciclomática — RDC Revend

> Data: 2026-07-07
> Ferramenta: ESLint 9 + typescript-eslint, regra `complexity` (threshold 0 para medir todas as funções)
> Escopo: `src/` completo — **2.367 funções/componentes analisados**
> Comando: `npx eslint src --rule '{"complexity":["warn",0]}' --format json`

## Como ler os números

Complexidade ciclomática (CC) conta os caminhos independentes dentro de uma função: cada `if`, `&&`, `||`, `?:`, `case`, loop e `catch` soma 1. Referências usuais:

- **1–10**: saudável
- **11–20**: merece atenção ao mexer
- **21–50**: difícil de testar e raciocinar
- **>50**: refatoração recomendada antes de qualquer mudança funcional

Em componentes React, JSX condicional (`{x && <A/>}`, ternários de estilo) infla a CC — um componente com CC 30 não é tão grave quanto uma função de negócio com CC 30. Ainda assim, CC >50 num componente indica que ele acumula responsabilidades demais.

**88 funções** no projeto têm CC ≥ 10 (3,7% do total).

---

## Top 15 — maiores complexidades

| # | CC | Função/Componente | Arquivo | Módulo |
|---|----|----|----|----|
| 1 | **126** | `Checkout` (componente) | `src/pages/Checkout.tsx:28` | Loja (checkout) |
| 2 | **120** | `Catalogo` (componente) | `src/pages/Catalogo.tsx:132` | Loja (catálogo) |
| 3 | **75** | `ClientDetailPanel` | `src/pages/admin/Clientes.tsx:496` | Admin / CRM |
| 4 | **64** | `AdminClientes` (página) | `src/pages/admin/Clientes.tsx:1355` | Admin / CRM |
| 5 | **57** | `AdminCatalogo` (página) | `src/pages/admin/Catalogo.tsx:60` | Admin / catálogo |
| 6 | **55** | `AdminTabelasPreco` (página) | `src/pages/admin/TabelasPreco.tsx:130` | Admin / preços |
| 7 | **48** | `NewOrder` (página) | `src/pages/admin/NewOrder.tsx:82` | Admin / pedidos |
| 8 | **44** | `ClientSidePanel` | `src/pages/admin/Usuarios.tsx:574` | Admin / usuários |
| 9 | **37** | `handleSubmit` (dentro de Checkout) | `src/pages/Checkout.tsx:257` | Loja (checkout) |
| 10 | **37** | `SalaoNovoPedido` (página) | `src/pages/salao/NovoPedido.tsx:70` | Salão |
| 11 | **29** | callback de render do card do kanban (`items.map`) | `src/pages/estoque/Pedidos.tsx:115` | Estoque |
| 12 | **28** | `EstoqueContagemDetalhe` (página) | `src/pages/estoque/ContagemDetalhe.tsx:300` | Estoque |
| 13 | **27** | `AdminFinanceiro` (página) | `src/pages/admin/Financeiro.tsx:221` | Admin / financeiro |
| 14 | **26** | `ProductCard` (contagem) | `src/pages/estoque/ContagemDetalhe.tsx:92` | Estoque |
| 15 | **25** | callback de render das sessões (`items.slice(0,30).map`) | `src/pages/admin/Clientes.tsx:1867` | Admin / CRM |

> Empate na 15ª posição: o `useMemo` de `stats` em `src/pages/admin/Financeiro.tsx:299` também tem CC 25.

Observação estrutural: **`admin/Clientes.tsx` sozinho tem 3 entradas no top 15** (posições 3, 4 e 15) — é o arquivo mais problemático do projeto, o que bate com as 2.078 linhas apontadas no checkup de modernização.

---

## Média de complexidade por módulo/pasta

Ordenado por média. A média é diluída por callbacks pequenos (arrow functions de 1 linha contam como CC 1), então as colunas **máx** e **CC ≥ 10** são mais reveladoras do risco real.

| Módulo | Média | Máx | Funções | CC ≥ 10 |
|---|---|---|---|---|
| `src/utils` | 5,5 | 11 | 11 | 1 |
| `src/components/portal` | 4,1 | 15 | 14 | 2 |
| `src/lib/services` | 3,9 | 12 | 17 | 1 |
| `src/services` | 3,6 | 14 | 10 | 1 |
| `src/pages` (loja: Checkout, Catalogo, etc.) | 3,5 | **126** | 221 | 11 |
| `src/lib/hooks` | 3,5 | 13 | 16 | 1 |
| `src/lib` | 3,3 | 10 | 23 | 1 |
| `src/components/admin` | 2,9 | 19 | 85 | 6 |
| `src/pages/portal` | 2,8 | 24 | 39 | 1 |
| `src/components/catalog` | 2,7 | 15 | 60 | 3 |
| `src/pages/admin` | 2,6 | **75** | 1.046 | **37** |
| `src/pages/estoque` | 2,6 | 29 | 280 | 8 |
| `src/components/estoque` | 2,6 | 11 | 10 | 1 |
| `src/components` (raiz) | 2,5 | 18 | 48 | 1 |
| `src/hooks` | 2,4 | 12 | 105 | 5 |
| `src/pages/salao` | 2,4 | 37 | 99 | 3 |
| `src/contexts` | 2,0 | 10 | 40 | 1 |
| `src/components/ui` (shadcn) | 1,9 | 20 | 224 | 4 |
| `src/config` | 1,8 | 4 | 4 | 0 |
| `src/test` | 1,0 | 1 | 8 | 0 |

### Leitura por área

- **`src/pages/admin` é a área mais problemática em volume**: 37 funções com CC ≥ 10 (42% de todas as funções complexas do projeto) e os monolitos Clientes/Catalogo/TabelasPreco/NewOrder/Usuarios. A média baixa (2,6) engana — é o efeito de 1.046 funções pequenas diluindo meia dúzia de gigantes.
- **A loja pública (`src/pages` raiz) tem os 2 piores casos individuais** (Checkout 126, Catalogo 120), concentrados em 2 arquivos.
- **O módulo estoque confirma o diagnóstico do checkup**: é o código mais novo e o mais saudável em proporção — máx 29 e nenhum monolito, apesar de ser o segundo maior em número de funções.
- **`components/ui`, `contexts`, `hooks`, `config` estão saudáveis** — nada a fazer.

---

## Top 5 — sugestões concretas de refatoração

### 1. `Checkout` — CC 126 (`src/pages/Checkout.tsx:28`, ~1.130 linhas)

É um wizard de 4+ passos (perfil → entrega → upsell → pagamento) inteiro num componente: 15+ `useState`, 4 `useEffect`, cálculo de frete/desconto/total inline e um `handleSubmit` que sozinho tem CC 37.

**Quebra sugerida:**
1. **`useCheckoutTotals(cart, coupon, deliveryMethod, segment)`** — extrair as linhas 135–142 (shippingEstimate, shippingValue, shippingDiscountAmount, effectiveDiscount, orderTotal) para um hook/função pura. É a regra de negócio mais sensível do arquivo e hoje é intestável. Uma função pura permite testes unitários diretos de todas as combinações cupom × entrega × segmento.
2. **`useCoupon()`** — os 5 estados de cupom (code, discount, id, type, isValidating) + `handleApplyCoupon` viram um hook único que devolve `{ coupon, apply, clear }`.
3. **Um componente por passo** — `ProfileStep`, `DeliveryStep`, `UpsellStep`, `PaymentStep`, cada um recebendo só o que usa. O `Checkout` vira orquestrador: estado do step atual, navegação (`handleNext`/`handleBack`) e o submit.
4. **`buildOrderPayload(...)`** — extrair de `handleSubmit` a montagem do payload como função pura. O submit fica: validar → montar payload → chamar edge function → tratar resposta.

> ⚠️ **Atenção:** o Checkout consome a edge function `create-order`, que está em **feature freeze**. Refatorar o frontend não viola o freeze, mas o payload enviado não pode mudar — validar contra `docs/create-order-contract.md` e testar um pedido real antes de considerar entregue.

### 2. `Catalogo` — CC 120 (`src/pages/Catalogo.tsx:132`, ~1.480 linhas)

Acumula: busca com debounce, 6 filtros, ordenação, agrupamento por categoria, modal de produto, quantidades por item, tracking e até sanitização de descrição HTML.

**Quebra sugerida:**
1. **`useCatalogFilters(products)`** — search/debounce, faixa de preço, categorias, "só sugeridos", profissional, sort e os 3 `useMemo` derivados (`filtered`, `filteredSortedByCategory`, `categoriesToDisplay`) num hook que devolve `{ filters, setFilter, clearAll, activeCount, visibleProducts }`. Isso sozinho deve cortar ~40 pontos de CC.
2. **`cleanDescription`/`renderDescription` → `src/utils/productDescription.ts`** — são funções puras de string/HTML sem nenhuma dependência do componente; ganho gratuito.
3. **`FiltersPanel`** (drawer/colapsável com os controles) e **`ProductDetailModal`** como componentes próprios — cada um leva seus ternários de renderização junto.
4. **Quantidades por produto** (`quantities`, `getQty`, `setQty`) — mover para dentro do card de produto ou para um hook `useProductQuantities`; o estado global de quantidades no componente-pai força re-render do catálogo inteiro a cada clique de stepper (bônus de performance, não só legibilidade).

### 3. `ClientDetailPanel` — CC 75 (`src/pages/admin/Clientes.tsx:496`)

Painel de detalhe do cliente com 5 mutations (segmento, tabela de preço, vendedor, perfil, +credenciais), 3 queries e formulário de edição inline — tudo num componente.

**Quebra sugerida:**
1. **Extrair o arquivo primeiro**: `Clientes.tsx` tem 2.078 linhas e 3 componentes grandes. Criar `src/pages/admin/clientes/` com `ClientDetailPanel.tsx`, `WorkQueueCard.tsx` e a página. Sem mudança de lógica, só divisão física — pré-requisito para o resto.
2. **Um sub-componente por seção do painel**: `ClientProfileSection` (form de edição + updateProfileMutation), `ClientAssignmentsSection` (segmento + tabela de preço + vendedor, com suas 3 mutations e 2 queries), `ClientOrdersSection` (histórico). O painel vira um empilhador de seções que só passa `session`.
3. **O bloco de credenciais/acesso** (linhas ~1100+, com create/reset/block/unblock e `buildWhatsAppMessage`) já é quase independente — promover a `ClientAccessSection.tsx` com um hook `useClientAccessMutations(userId)`.

### 4. `AdminClientes` — CC 64 (`src/pages/admin/Clientes.tsx:1355`)

Página do CRM: tabs de segmento, modo funil vs. fila, 4 filtros, 6 `useMemo` encadeados de filtragem/agrupamento e o fluxo de exclusão de cliente.

**Quebra sugerida:**
1. **`useClientSessions({ segment, tag, operational, queueView })`** — a query de sessões + os memos `filteredSessions`, `queueSessions`, `queueCounts`, `grouped` num hook. A página deixa de saber *como* filtrar e passa a só declarar os filtros ativos.
2. **`FunnelView` e `QueueView`** como componentes irmãos — o toggle `viewMode` escolhe qual renderizar, e cada um leva seus callbacks de render (o `items.slice(0,30).map` de CC 25 vai junto para dentro de `QueueView`, virando um `SessionRow` próprio).
3. **`stageColorConfig` e afins → constantes de módulo** fora do componente (hoje são recriados a cada render).
4. **`DeleteClientDialog`** isolado com sua mutation.

### 5. `AdminCatalogo` — CC 57 (`src/pages/admin/Catalogo.tsx:60`)

Página com 4 responsabilidades independentes: CRUD de produto (criar/editar/deletar inline), busca+filtros+paginação, sincronização Nuvemshop (dry-run, confirmação digitada, resultado) e reordenação drag-and-drop.

**Quebra sugerida:** as 4 responsabilidades já são blocos de estado disjuntos — a quebra é quase mecânica:
1. **`ReorderDialog.tsx`** — sensors do dnd-kit, `showReorderPicker/showReorder/reorderCategoryId/reorderItems/reorderSaved`, `openReorder/handleDragEnd/handleSaveOrder` e a mutation `useBulkUpdateSortOrder`. Zero acoplamento com o resto; só precisa de `categories` e callback de sucesso.
2. **`NuvemshopSyncDialog.tsx`** — `syncResult/showSyncResult/showSyncConfirm/syncConfirmText/dryRunPreview` + as duas mutations de sync. Também autocontido.
3. **`ProductFormDialog.tsx`** — formulário compartilhado entre criar e editar (`createForm`/`editForm` hoje duplicam campos), com o `useImageUpload` dentro.
4. A página fica com: lista, busca/filtros/paginação (extraível para `useProductFilters` se ainda incomodar) e a orquestração dos 3 diálogos.

---

## Recomendações gerais

1. **Guard-rail para código novo**: adicionar `complexity: ['warn', 15]` no `eslint.config.js`. O legado vai gerar warnings (88 funções), mas impede que código novo nasça monolítico — alinhado à estratégia do checkup de "conter o legado, não deixar contaminar módulos novos".
2. **Priorização**: os itens 3–5 (arquivos do admin) são refatorações internas de baixo risco. Os itens 1–2 (Checkout e Catálogo) são as páginas de maior tráfego e receita — maior ganho, mas exigem smoke test completo do fluxo de compra após cada etapa.
3. **Sinergia com o plano de modernização**: a quebra dessas páginas casa com a Etapa 1 do checkup (code splitting) e com o item "quebrar páginas monolíticas (oportunista)" já listado lá. Sugestão: tratar Checkout/Catalogo como etapa própria, não como efeito colateral.

## Reprodutibilidade

```bash
npx eslint src --rule '{"complexity":["warn",0]}' --format json -o /tmp/complexity.json
# depois agregar por ruleId === 'complexity', extraindo o número de "has a complexity of N"
```
