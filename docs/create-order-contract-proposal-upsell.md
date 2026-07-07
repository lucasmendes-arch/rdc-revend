# Proposta de mudança de contrato — validação server-side de upsell no `create-order`

> **STATUS: PROPOSTA — NÃO IMPLEMENTADA. NÃO APROVADA.**
> Este documento não altera `docs/create-order-contract.md` nem `supabase/functions/create-order/index.ts`. É material de revisão para decisão humana, a ser confrontado contra o checklist de feature freeze antes de qualquer linha de código ser escrita.

> Data: 2026-07-07
> Motivação: bug confirmado de divergência de cobrança (ver `[[project-upsell-price-bug]]` na memória operacional) — o total exibido no Checkout usa `upsell_offers.discounted_price`, mas o `create-order` nunca leu essa tabela; o cliente é cobrado pelo preço cheio de `catalog_products`. Mitigação temporária já aplicada: a única oferta ativa foi desativada via UPDATE direto em 2026-07-07 (não altera código).

---

## 1. Restrição de partida (não negociável)

O invariante existente do contrato — **"Preço sempre vem do servidor — nunca aceitar `unit_price` ou `total` do cliente"** (seção "Invariantes que NUNCA podem ser quebrados") — permanece intacto. Esta proposta não introduz nenhum campo de preço no payload. O único dado novo que o cliente pode enviar é um **identificador** de oferta; o `discounted_price` continua sendo lido do banco, nunca do body da requisição.

---

## 2. Mudança proposta no Input

```diff
 {
-  items: { product_id: string; qty: number }[]   // obrigatório, mínimo 1 item
+  items: { product_id: string; qty: number; upsell_offer_id?: string }[]   // obrigatório, mínimo 1 item
   customer_name: string
   ...
 }
```

`upsell_offer_id` é **opcional e por item** (não global no body). Ausente ou `null` → item segue exatamente o comportamento atual (preço de `catalog_products`/`price_list_items`), sem nenhuma mudança de caminho. Isso torna a mudança aditiva e retrocompatível: qualquer carrinho sem upsell continua idêntico ao de hoje.

---

## 3. Por que ID explícito, e não "casar por product_id" implicitamente

Alternativa descartada: o servidor buscar sozinho, para cada item do carrinho, se existe uma `upsell_offer` ativa com aquele `product_id`, e aplicar o desconto automaticamente.

Motivo da rejeição:
- **Ambiguidade de origem.** Um cliente que compra aquele mesmo produto pelo fluxo normal do catálogo (não pela etapa de oferta do Checkout) receberia o desconto "de graça", mesmo nunca tendo visto a oferta — a tabela não tem hoje nenhum jeito de restringir isso, e não deveria ser decisão da IA presumir a regra de negócio.
- **Sem necessidade de desempate.** Nada na tabela impede duas linhas com `is_active = true` para o mesmo `product_id` (o `.limit(1)` que evita isso hoje é só uma regra do hook do frontend, não uma constraint no banco). Com ID explícito, o servidor sabe exatamente qual oferta o cliente está reivindicando, sem precisar decidir "qual das ativas vale".
- **Simetria com o padrão já usado no contrato.** `coupon_id`/`coupon_code` já seguem esse modelo (cliente informa um identificador, servidor busca e revalida o valor real). Manter o mesmo padrão para upsell é consistente com o resto do contrato.

---

## 4. Nova etapa na sequência de execução

Inserir como **etapa 5c**, logo após a etapa 5b (resolução de price list) e antes da etapa 6 (validação de produtos/estoque):

> **5c. Resolução de upsell.** Para cada item com `upsell_offer_id` presente:
> 1. Buscar a oferta em `upsell_offers` pelo `id` (via `serviceClient`, bypassa RLS — mesmo padrão já usado para preços).
> 2. **Oferta não encontrada** → rejeitar (400, `upsell_offer_invalid`).
> 3. **`is_active = false`** → rejeitar (400, `upsell_offer_inactive`). Este é o caso "a oferta expirou entre o carrinho e a finalização" — hoje a única forma de uma oferta deixar de valer é esse campo virar `false` (não existe janela de validade por data na tabela; ver seção 7).
> 4. **`offer.product_id ≠ item.product_id`** → rejeitar (400, `upsell_offer_mismatch`). Verificação de segurança: impede um cliente de mandar o ID de uma oferta válida associada a outro produto para tentar aplicar desconto indevido em item diferente.
> 5. **`item.qty ≠ offer.quantity`** → rejeitar (400, `upsell_offer_quantity_mismatch`, com a quantidade exigida no corpo do erro). Este é o "limite de quantidade" — `upsell_offers.quantity` (coluna adicionada em `20250311000007_upsell_quantity.sql`, **não documentada em `docs/SCHEMA.md`** — gap encontrado durante esta análise, sinalizado à parte) representa o tamanho do lote da oferta (ex.: "leve 10 por R$11,99 cada"). Não há desconto parcial: ou o carrinho tem exatamente a quantidade do lote, ou o item não se qualifica.
> 6. Se todas as checagens passarem, `unitPrice` desse item = `offer.discounted_price`, **sobrepondo** tanto `catalog_products.price` quanto qualquer resolução de `price_list_items` para essa linha (ver decisão em aberto na seção 6).
> 7. Log estruturado `upsell_offer_applied` (`order_id` pendente neste ponto — logar após criação do pedido, junto do `order_created` existente): `offer_id`, `product_id`, `qty`, `discounted_price`.

**Por que rejeitar (400) em vez de aplicar o preço cheio silenciosamente:** é exatamente o padrão que causou o bug atual. Se o servidor "cai para trás" silenciosamente no preço cheio quando a oferta não é mais válida, o total cobrado volta a divergir do que o cliente viu na tela antes de confirmar — a mesma classe de problema, só que num caminho de erro em vez de no caminho feliz. Rejeitar com um código de erro específico segue o mesmo padrão já usado por `stock_insufficient` e "produto não encontrado": erro claro, pedido não criado, cliente tenta de novo com o carrinho corrigido. Fica a cargo do frontend (fora de escopo desta proposta) recalcular o total sem o desconto e mostrar isso ao cliente antes de nova tentativa.

---

## 5. Novos códigos de erro (aditivo ao contrato)

| Status | `error_code` (novo campo) | Condição |
|---|---|---|
| 400 | `upsell_offer_invalid` | `upsell_offer_id` não existe em `upsell_offers` |
| 400 | `upsell_offer_inactive` | Oferta existe mas `is_active = false` |
| 400 | `upsell_offer_mismatch` | `offer.product_id` diferente do `product_id` do item |
| 400 | `upsell_offer_quantity_mismatch` | `item.qty` diferente de `offer.quantity` |

Proposta: adicionar um campo `error_code` (string, opcional) ao corpo de erro existente `{error: string}` → `{error: string, error_code?: string}`. É aditivo — qualquer consumidor atual que só lê `.error` continua funcionando sem mudança.

---

## 6. Decisões em aberto para o humano (não decidi sozinho)

1. **Precedência entre upsell e price list.** Se um parceiro com tabela de preço ativa também mandar um `upsell_offer_id` válido, qual preço vence? Três opções:
   - (a) upsell sempre vence (desconto promocional sobrepõe tabela negociada)
   - (b) price list sempre vence (tabela negociada é mais específica ao cliente)
   - (c) usa o **menor** dos dois valores (nunca cobra mais que qualquer um dos dois mecanismos prometeria)
   Recomendação: (c), por ser a opção que nunca decepciona nenhuma promessa de preço já feita ao cliente — mas é decisão de negócio, não técnica.

2. **A tabela deveria ganhar janela de validade explícita (`starts_at`/`ends_at`)?** Hoje "expirar" só existe via `is_active` manual. Isso é suficiente, ou o time de marketing precisa agendar ofertas com data de início/fim sem depender de alguém desativar manualmente? Fora do escopo desta proposta (seria uma migration adicional), mas vale decidir antes ou depois deste fix.

3. **UX de erro no frontend** (implementação futura, fora desta proposta): ao receber `upsell_offer_*`, o Checkout precisa invalidar a query `useActiveUpsell`, limpar o estado `upsellAdded`/`upsellOfferId` e recalcular o total antes de deixar o cliente tentar de novo. Não desenhei essa parte em detalhe — é decisão de UX, não de contrato de backend.

---

## 7. Notas de implementação para quando for aprovado (não código, só mapeamento de impacto)

- **Frontend (`Checkout.tsx`)**: precisa capturar `upsellOffer.id` no momento de `handleAddUpsell` e enviá-lo em `orderBody.items` só na linha do item correspondente. Recomendação: manter esse ID em estado local do Checkout (ex.: `upsellOfferId`), **não** adicionar campo novo ao `CartItem` do `CartContext` — esse tipo é compartilhado por Catálogo, `CartDrawer`, `PackageCards` e Portal (ver inventário funcional em `docs/inventario-catalogo-checkout.md`), e alargar o shape ali tem raio de impacto maior do que necessário para este fix.
- **Mistura de origem no carrinho**: se o cliente já tinha o mesmo produto no carrinho antes de aceitar o upsell (raro, mas possível), o `addItem` do `CartContext` **não atualiza o preço** de um item existente — só soma quantidade (confirmado em `src/contexts/CartContext.tsx:116-120`). Nesse cenário, `item.qty` no carrinho será maior que `offer.quantity`, a checagem da etapa 5c (item 5) falha, e o pedido é rejeitado com `upsell_offer_quantity_mismatch` — comportamento conservador e correto (não aplica desconto sobre uma quantidade ambígua), mas pode confundir o cliente na UX se não for tratado com uma mensagem clara.
- **Kits**: se `upsell_offer.product_id` apontar para um kit, o desconto se aplica normalmente à linha do pedido (`unit_price_snapshot`); a resolução de estoque via `kit_components` (etapa 8 do contrato atual) já é independente de preço — sem interação/regressão esperada.
- **Sem mudança na etapa de estoque, cupom, frete ou pagamento** — a alteração é isolada ao cálculo de `unitPrice` por linha, antes do cálculo de subtotal (etapa 4 atual).

---

## 8. Checklist do freeze — como esta proposta se posiciona (para sua revisão, não autoavaliação de aprovação)

Mapeando contra `docs/create-order-contract.md`, seção "Checklist obrigatório":

- **Invariante de preço server-side preservado?** Sim — preço só é lido do banco via `upsell_offer_id`; nenhum valor numérico de desconto trafega no body.
- **Sequência 1→21 não é reordenada?** A proposta insere uma etapa nova (5c) sem remover ou reordenar as existentes.
- **Campo novo no body sem validação server-side?** Não — `upsell_offer_id` tem 4 checagens obrigatórias antes de qualquer uso (existência, ativo, produto correspondente, quantidade).
- **Rollback de orders/items/stock continua funcional?** Sim — a rejeição por `upsell_offer_*` acontece **antes** de qualquer insert (etapa 5c fica antes da etapa 6 em diante), então não há necessidade de rollback nesse caminho — o pedido simplesmente não é criado.

Os demais itens do checklist (testes locais, staging, logs pós-deploy) só se aplicam no momento da implementação, não desta proposta.

---

## 9. Gap de documentação encontrado (à parte, não bloqueante)

`docs/SCHEMA.md` não lista a coluna `upsell_offers.quantity` (existe desde `20250311000007_upsell_quantity.sql`). Não corrigi agora por estar fora do escopo pedido nesta tarefa — sinalizando para você decidir se quer que eu atualize junto ou separadamente.
