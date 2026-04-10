# Template de Handoff — Rei dos Cachos B2B

_Toda entrega relevante de implementação deve seguir este formato._

---

## Formato obrigatório

```markdown
## 1. Objetivo
O que foi solicitado, em 1-2 frases.

## 2. Diagnóstico
Análise do estado antes da implementação. O que existia, o que faltava, o que precisava mudar.

## 3. Arquivos alterados

| Arquivo | Ação | Descrição |
|---|---|---|
| `caminho/arquivo` | NOVO / EDITADO / REMOVIDO | O que mudou |

## 4. O que foi implementado
Lista objetiva do que foi feito, agrupado por camada (backend, frontend, docs).

## 5. Contrato de dados
Como o próximo agente (ou o frontend) deve consumir o que foi criado.
Incluir: payloads, assinaturas de RPC, campos novos, queries de exemplo.

## 6. Pendências
O que ficou de fora ou precisa ser feito depois. Se não houver, escrever "Nenhuma".

## 7. Riscos / Observações
Qualquer coisa que possa dar problema, quebrar, ou que mereça atenção.
Se não houver, escrever "Nenhum".

## 8. Checklist de validação

- [ ] Item verificável 1
- [ ] Item verificável 2
- [ ] ...

## 9. Próximo prompt sugerido
Sugestão de prompt para dar continuidade, com ID se aplicável.
```

---

## Regra de Feature Freeze

Antes de iniciar qualquer entrega, verificar se algum arquivo envolvido está em feature freeze (listado em `CLAUDE.md` > "Áreas em Feature Freeze"). Se estiver:
- Registrar o alerta no handoff na seção **7. Riscos / Observações**
- Confirmar que o checklist específico da área foi cumprido integralmente
- Nunca omitir essa verificação

## Regras

1. **Não omitir seções.** Se uma seção não se aplica, escrever "N/A" ou "Nenhum".
2. **Contrato de dados é obrigatório** quando a entrega afeta a interface entre backend e frontend.
3. **Pendências devem ser honestas.** Não esconder trabalho incompleto.
4. **Riscos devem ser concretos.** "Pode dar problema" não ajuda; "Pedidos antigos sem delivery_method precisam de DEFAULT 'shipping'" ajuda.
5. **Checklist deve ser verificável.** Cada item deve ser algo que alguém pode testar e marcar como feito.
6. **Nunca incluir secrets, tokens ou credenciais** no handoff.

---

## Exemplo mínimo

```markdown
## 1. Objetivo
Adicionar suporte a retirada na loja no fluxo de pedidos.

## 2. Diagnóstico
Tabela `orders` não tinha campo de método de entrega. Edge function `create-order` calculava frete fixo de 20%.

## 3. Arquivos alterados

| Arquivo | Ação | Descrição |
|---|---|---|
| `supabase/migrations/20250317000001_pickup_support.sql` | NOVO | Tabela pickup_units + colunas delivery em orders + RPC atualizada |
| `supabase/functions/create-order/index.ts` | EDITADO | Aceita delivery_method e pickup_unit_slug |
| `docs/SCHEMA.md` | EDITADO | Documentação das novas tabelas e colunas |

## 4. O que foi implementado
- Tabela `pickup_units` com 3 unidades seedadas
- Colunas `delivery_method`, `pickup_unit_slug`, `pickup_unit_address` em `orders`
- Edge function valida unidade e zera frete quando pickup
- RPC `create_manual_order` aceita `p_delivery_method` e `p_pickup_unit_slug`

## 5. Contrato de dados
// Listar unidades
supabase.from('pickup_units').select('slug, name, address').eq('is_active', true).order('sort_order')

// Criar pedido com retirada
{ delivery_method: 'pickup', pickup_unit_slug: 'serra', ...resto }

## 6. Pendências
- Frontend: toggle de entrega no checkout
- Frontend: badge de retirada no admin/pedidos

## 7. Riscos / Observações
Nenhum risco para pedidos existentes (DEFAULT 'shipping').

## 8. Checklist de validação
- [ ] Aplicar migration
- [ ] Deploy edge function
- [ ] Testar pedido com pickup
- [ ] Verificar pedidos antigos inalterados

## 9. Próximo prompt sugerido
RDC_FRONT_E7_P1_ANT_V1 — Implementar UI de retirada no checkout e badge no admin.
```
