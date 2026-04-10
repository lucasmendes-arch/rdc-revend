# Contrato — Edge Function `create-order`

> **STATUS: FEATURE FREEZE PERMANENTE**
> Esta função é área crítica de checkout. Nenhuma alteração sem aprovação explícita do humano e cumprimento integral do checklist abaixo.

_Última revisão: 2026-04-09_

---

## Localização

`supabase/functions/create-order/index.ts`

---

## Responsabilidade

Único ponto de criação de pedidos no sistema. Executa em ambiente confiável (Deno/Edge), com acesso ao `SUPABASE_SERVICE_ROLE_KEY`. Qualquer bug aqui afeta diretamente receita e estoque.

---

## Input (POST body)

```typescript
{
  items: { product_id: string; qty: number }[]   // obrigatório, mínimo 1 item
  customer_name: string                           // obrigatório
  customer_whatsapp: string                       // obrigatório
  customer_email: string                          // obrigatório
  customer_document?: string                      // opcional — CPF/CNPJ para MP
  notes?: string
  payment_method?: 'pix' | 'credit'
  installments?: number                           // só quando payment_method = 'credit'
  shipping?: number                               // valor sugerido pelo cliente (servidor valida)
  delivery_method?: 'shipping' | 'pickup'        // default: 'shipping'
  pickup_unit_slug?: string                       // obrigatório quando delivery_method = 'pickup'
  coupon_code?: string                            // preferível a coupon_id
  coupon_id?: string                              // fallback se coupon_code não disponível
  discount_amount?: number                        // informativo — servidor recalcula
  seller_id?: string                              // opcional — se ausente, usa seller padrão
}
```

**Header obrigatório:** `Authorization: Bearer <user_jwt>`

---

## Output

### Sucesso (201)
```json
{
  "order_id": "uuid",
  "total": 1234.56,
  "payment_url": "https://www.mercadopago.com.br/checkout/v1/..." // null se MP não configurado
}
```

### Erros conhecidos

| Status | Condição |
|--------|----------|
| 401 | Sem Authorization header / token inválido |
| 429 | Rate limit: >5 pedidos em 60s por usuário |
| 400 | Carrinho vazio / campos obrigatórios ausentes / qty inválida / produto não encontrado ou inativo / estoque insuficiente / subtotal < R$ 500 / unidade de retirada inválida |
| 500 | Falha no insert de orders, order_items, ou decremento de estoque (com rollback) |

---

## Sequência de execução (invariantes críticos)

1. **Auth** — `userClient.auth.getUser()` — rejeita sem JWT válido
2. **Rate limit** — `check_rate_limit(order:{user_id}, 5, 60)` — rejeita se exceder
3. **Segment snapshot** — lê `profiles.customer_segment` para snapshot no pedido
4. **Validação do body** — items, campos obrigatórios, qty inteira positiva
5. **Preços do servidor** — busca `catalog_products` via `serviceClient` — **nunca usa preços do cliente**
6. **Validação de produtos** — todos devem existir e ter `is_active = true`
7. **Cálculo de subtotal** — soma `price * qty` de cada item (arredondado a 2 casas)
8. **Resolução de kits** — `kit_components` → decrementos são nos componentes, não no kit
9. **Verificação de estoque** — `inventory` table; produtos sem registro = estoque ilimitado
10. **Pedido mínimo** — subtotal < R$ 500 → rejeita
11. **Delivery method** — pickup valida unidade em `pickup_units`; zera frete
12. **Cupom** — validado via `validate_coupon` RPC (preferencial) ou query direta; desconto recalculado no servidor
13. **Frete** — pickup/free_shipping = 0; senão ≈ 20% do subtotal (tolerância R$ 0,10 vs cliente)
14. **Total** — `MAX(subtotal + shipping - coupon_discount, 0)`, arredondado a 2 casas
15. **Seller** — usa `seller_id` do body ou busca `is_default=true AND active=true`
16. **Insert `orders`** — via serviceClient; `status = 'recebido'`
17. **Insert `order_items`** — rollback de `orders` se falhar
18. **Decremento de estoque** — `decrement_stock` RPC por produto; rollback completo se falhar
19. **Incremento de cupom** — `increment_coupon_usage` RPC (fire-and-forget, não bloqueia)
20. **MercadoPago** — cria preference; atualiza `orders.payment_id` e `status = 'aguardando_pagamento'`; falhas não abortam o pedido
21. **WhatsApp** — notificação fire-and-forget; falhas não abortam o pedido

---

## Invariantes que NUNCA podem ser quebrados

- **Preço sempre vem do servidor** — nunca aceitar `unit_price` ou `total` do cliente
- **Estoque decrementado antes de retornar sucesso** — salvo rollback por erro interno
- **Rollback em cascata** — se order_items falhar → deleta orders; se stock falhar → deleta items + orders
- **Rate limiting** — sempre validado antes de qualquer operação de escrita
- **Auth** — sempre validado; serviceClient nunca exposto ao cliente
- **Total nunca negativo** — `MAX(..., 0)`

---

## Logs disponíveis (Supabase Dashboard > Edge Functions > Logs)

| Evento | Quando |
|--------|--------|
| `request_start` | Após auth OK — contém `user_id` |
| `rate_limit_hit` | Rate limit atingido |
| `stock_insufficient` | Estoque insuficiente — lista itens problemáticos |
| `order_created` | Pedido inserido — contém totais, itens, seller, delivery |
| `order_insert_failed` | Falha no insert de orders |
| `order_items_failed` | Falha nos itens — rollback acionado |
| `stock_decrement_failed` | Falha no estoque — rollback completo acionado |
| `payment_preference_created` | MP preference criada com sucesso |
| `mercadopago_preference_failed` | MP retornou erro (pedido mantido) |
| `mercadopago_error` | Exceção no bloco MP (pedido mantido) |
| `request_completed` | Resposta 201 enviada |
| `unexpected_error` | Exceção não tratada |

---

## Checklist obrigatório para qualquer alteração futura

> **Toda e qualquer mudança nesta função exige marcar TODOS os itens antes de fazer deploy.**

### Antes de escrever código
- [ ] A alteração é estritamente necessária? (feature freeze — recusar cosmético ou refactor)
- [ ] O invariante de preço server-side é preservado?
- [ ] A sequência de execução (1→21) não é reordenada?
- [ ] O rollback de orders/items/stock continua funcional?

### Antes de commitar
- [ ] Nenhuma nova dependência de variável de ambiente sem documentação
- [ ] Nenhum campo novo no body aceito sem validação server-side
- [ ] Nenhum campo de preço, desconto ou total aceito do cliente sem recalcular no servidor
- [ ] Logs adicionados para o novo fluxo (se aplicável)
- [ ] TypeScript compila sem erros

### Antes de fazer deploy
- [ ] Testado localmente com `supabase functions serve` (ou equivalente)
- [ ] Testado em staging/dev com pedido real (produto + pagamento + estoque decrementado)
- [ ] Verificado que pedidos com coupon ainda funcionam
- [ ] Verificado que pedido com pickup ainda funciona
- [ ] Verificado que pedidos antigos no banco não quebram
- [ ] Logs visíveis no Supabase Dashboard após deploy

### Após deploy
- [ ] Confirmar que `order_created` aparece nos logs para um pedido real
- [ ] Confirmar que `request_completed` aparece com `total` correto
- [ ] Confirmar que estoque foi decrementado corretamente
- [ ] Confirmar que MercadoPago preference foi criada (se `MERCADOPAGO_ACCESS_TOKEN` configurado)
