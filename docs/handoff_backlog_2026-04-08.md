# Handoff — Backlog Futuro Pós-Segmentação Comercial

_Data: 2026-04-08_
_Autor: Claude (assistido por Lucas)_
_Contexto: encerramento da sessão de segmentação comercial + refinamento do financeiro_

---

## 1. Objetivo

Documentar o backlog futuro do projeto Rei dos Cachos B2B após a conclusão da segmentação comercial, com prioridades, dependências e recomendações de continuidade. Este documento serve como guia para as próximas sessões de desenvolvimento.

---

## 2. Estado Atual do Projeto (Resumo Executivo)

O projeto é um e-commerce/CRM B2B para revenda de cosméticos. A stack é React + TypeScript + Vite + Tailwind + Supabase, com deploy automático na Vercel via push na `main`.

### Features consolidadas

| Bloco | Status | Migration mais recente |
|---|---|---|
| Fundação do CRM (tags, eventos, automações) | Concluído | `20250313000001` → `20250313000007` |
| Tracking de eventos (visitou, carrinho, checkout, compra) | Concluído (falta validação real MP) | — |
| Motor de tags híbridas + dispatcher WhatsApp | Concluído | `20250313000004` / `000005` |
| Fila de dispatch com delay (pg_cron) | Operacional | `20250313000007` |
| Pedido manual admin | Concluído | `000008` → `000014` |
| Promoções e cupons B2B | Concluído | `000015` → `000020` |
| Pedido de salão (create_salao_order) | Concluído | — |
| Retirada na loja (pickup_units) | Concluído | `20250317000001` |
| Integração n8n + outbox | Parcial (outbox ativo, sync-back em validação) | `20250317000004` |
| Segmentação comercial de clientes | Concluído | `20260408000001` |
| Financeiro admin (filtros, presets, comparativos) | Concluído | — (frontend only) |

### Infraestrutura ativa

- Supabase: auth, DB, edge functions, pg_cron, pg_net
- UAZAPI: integração WhatsApp para disparos CRM
- MercadoPago: checkout (webhook parcialmente validado)
- Vercel: deploy contínuo via `main`
- n8n: orquestração parcial (outbox → ClickUp)

---

## 3. Backlog Futuro por Módulo

### Bloco A — Provisionamento de Acesso para Parceiros da Rede
**Prioridade: ALTA**
**Dependência: segmentação comercial (concluído)**

| # | Feature | Descrição |
|---|---|---|
| A.1 | Criação de login para parceiros existentes | Gerar credenciais (email/senha) para parceiros já cadastrados na base via `profiles` sem `auth.users` vinculado, ou com cadastro incompleto |
| A.2 | Fluxo de convite por email/WhatsApp | Admin envia link de convite com token temporário; parceiro define senha no primeiro acesso |
| A.3 | Reset de senha administrado | Admin pode disparar reset de senha para um parceiro específico pelo painel |
| A.4 | Gestão de acessos no admin | Listar parceiros com status de acesso (ativo/pendente/bloqueado), revogar acesso, reenviar convite |

**Riscos:**
- Parceiros na base atual podem não ter email válido — necessário definir fallback (WhatsApp?)
- Supabase Auth tem limitações para criação de usuários por admin (pode exigir service_role + `auth.admin.createUser`)
- Tokens de convite precisam de expiração e invalidação após uso

---

### Bloco B — Tabelas de Preço por Parceiro/Nível
**Prioridade: ALTA**
**Dependência: segmentação comercial (concluído) + Bloco A (parcial — precisa de acesso ativo para o parceiro ver preços)**

| # | Feature | Descrição |
|---|---|---|
| B.1 | Tabela `price_lists` | Criar entidade de tabela de preço com nome, descrição, prioridade, `is_active` |
| B.2 | Tabela `price_list_items` | Preço por produto dentro de uma price list (FK para `catalog_products` + `price_lists`) |
| B.3 | Vínculo parceiro → price list | Coluna `price_list_id` em `profiles` ou tabela intermediária para grupos |
| B.4 | Níveis de parceiro | Suporte a classificações como "Parceiro Nível 1", "Nível 2", etc. — pode ser via `price_lists` nomeadas ou campo extra em `profiles` |
| B.5 | Resolução de preço no checkout/catálogo | Lógica: se parceiro tem price list → usa preço da lista; senão → fallback para preço padrão do produto |
| B.6 | Admin: CRUD de price lists | Tela para criar/editar tabelas de preço e vincular produtos/parceiros |
| B.7 | Exibição ao parceiro | Parceiro logado vê apenas os preços da tabela vinculada ao seu perfil |

**Riscos:**
- `profiles.price_category` (`retail`/`wholesale`/`vip`) já existe — decidir se price lists substituem ou complementam esse campo
- Preço no snapshot do pedido (`order_items.unit_price`) já é congelado — price lists não retroagem pedidos antigos
- Performance: resolução de preço por produto × price list pode precisar de cache ou view materializada se catálogo crescer

---

### Bloco C — Evolução do Financeiro
**Prioridade: MEDIA**
**Dependência: segmentação comercial (concluído)**

| # | Feature | Descrição |
|---|---|---|
| C.1 | Filtro por segmento comercial | Dropdown no financeiro para filtrar por `network_partner` / `wholesale_buyer` / todos |
| C.2 | Quebra de faturamento por segmento | KPIs separados: faturamento parceiros vs atacado, com comparativo |
| C.3 | Gráfico comparativo por segmento | Chart com linhas separadas por segmento no período selecionado |
| C.4 | Exportação de relatório | CSV/Excel com dados filtrados por período e segmento |

**Riscos:**
- `orders.customer_segment_snapshot` é a fonte correta para relatórios históricos (não `profiles.customer_segment`)
- Pedidos legados sem snapshot (NULL) precisam de tratamento visual (ex: "Não classificado")

---

### Bloco D — Dashboard 360 do Negócio
**Prioridade: MEDIA**
**Dependência: Bloco C (parcial — financeiro mais maduro facilita a separação)**

| # | Feature | Descrição |
|---|---|---|
| D.1 | Separar Financeiro de Dashboard | Financeiro = receita, faturamento, comissões, comparativos. Dashboard = visão operacional |
| D.2 | Dashboard operacional | Pedidos do dia, pedidos pendentes, carrinhos abandonados, alertas de estoque |
| D.3 | Visão CRM resumida | Tags mais ativas, automações disparadas, fila de dispatch |
| D.4 | Visão de canais | Origem dos pedidos (site, WhatsApp, loja física, manual) com proporção |
| D.5 | Alertas e atalhos | Notificações de pedidos parados, estoque baixo, automações com erro |

**Riscos:**
- Não sobrecarregar o dashboard com queries pesadas — considerar RPCs agregadas ou views materializadas
- Definir com clareza o que é "alerta" vs "informação" para não poluir a tela

---

### Bloco E — CRM / Automações
**Prioridade: MEDIA**
**Dependência: nenhuma nova (infraestrutura já existe)**

| # | Feature | Descrição |
|---|---|---|
| E.1 | Editor de mensagens no admin | Editar `action_config.message_template` das automações diretamente no painel |
| E.2 | Visualização da fila de dispatch | Listar `crm_dispatch_queue` no admin com status, agendamento, erros |
| E.3 | Limpeza de duplicidades | Remover automações duplicadas no banco (Boas-vindas e Fidelização têm duplicatas conhecidas) |
| E.4 | Ativar Boas-vindas e Fidelização | Só após E.1 + E.3 — validar templates e ativar `is_active = true` |
| E.5 | UX de tags vinculadas | Melhorar a interface de associação tag → automação |
| E.6 | Blindagem contra duplicidade em seeds | Garantir idempotência na criação de automações via migrations |

**Riscos:**
- Automações ativas sem templates validados podem disparar mensagens genéricas para clientes reais
- `crm_dispatch_queue` pode acumular itens se o job pg_cron falhar silenciosamente — monitorar

---

### Bloco F — Integrações e Operação
**Prioridade: BAIXA**
**Dependência: nenhuma crítica**

| # | Feature | Descrição |
|---|---|---|
| F.1 | Validar fluxo n8n → ClickUp | Confirmar que o outbox está sendo consumido e que tarefas são criadas no ClickUp |
| F.2 | Expor outbox no admin | Listar `integration_outbox` com status, tentativas, erros |
| F.3 | Validar webhook MercadoPago fim a fim | Testar com transação real: pagamento → webhook → `purchase_completed` → tag → automação |
| F.4 | Verificar jobs pg_cron em produção | Confirmar que `crm-queue-processor` e `detect_abandoned_carts` estão rodando |
| F.5 | Sync-back: validação final | Confirmar que o fluxo de sincronização reversa (externo → Supabase) está funcional |

**Riscos:**
- Jobs pg_cron podem estar registrados mas não executando (verificar `cron.job` e `cron.job_run_details`)
- Webhook MP nunca foi testado com pagamento real — pode ter divergências no payload

---

### Bloco G — Admin Operacional
**Prioridade: BAIXA**
**Dependência: nenhuma crítica**

| # | Feature | Descrição |
|---|---|---|
| G.1 | Filtros avançados em Pedidos | Filtrar por status, origem, segmento, período, vendedor |
| G.2 | Sync logs no admin | Visualizar histórico de sincronizações com status e erros |
| G.3 | Alertas operacionais | Pedidos parados há X dias, estoque abaixo do mínimo, automações com falha |
| G.4 | Atalhos rápidos | Botões de ação rápida no dashboard (ex: "Ver carrinhos abandonados", "Pedidos pendentes") |

---

## 4. Prioridade Sugerida por Bloco

| Prioridade | Bloco | Justificativa |
|---|---|---|
| 1 - ALTA | A — Acesso de parceiros | Sem login, parceiros não acessam o sistema. Desbloqueia B. |
| 2 - ALTA | B — Tabelas de preço | Core do modelo B2B. Parceiro precisa ver preço diferenciado. |
| 3 - MEDIA | C — Evolução do financeiro | Dados de segmento já existem. Baixo esforço, alto valor analítico. |
| 4 - MEDIA | E — CRM / Automações | Infraestrutura pronta, faltam ajustes de UX e ativação segura. |
| 5 - MEDIA | D — Dashboard 360 | Depende de C estar mais maduro. Valor executivo alto. |
| 6 - BAIXA | F — Integrações | Operacional. Importante mas não bloqueia features de negócio. |
| 7 - BAIXA | G — Admin operacional | Quality of life. Melhora o dia a dia mas não é urgente. |

---

## 5. Mapa de Dependências

```
Segmentação Comercial (CONCLUÍDO)
├── Bloco A: Acesso de parceiros
│   └── Bloco B: Tabelas de preço (parcial — parceiro precisa de login para ver preço)
│       └── Bloco B.5/B.7: Resolução e exibição de preço no catálogo
├── Bloco C: Evolução do financeiro (usa customer_segment_snapshot)
│   └── Bloco D: Dashboard 360 (financeiro mais maduro facilita separação)
├── Bloco E: CRM / Automações (independente — infraestrutura já existe)
│   └── E.4: Ativar automações depende de E.1 + E.3
├── Bloco F: Integrações (independente)
└── Bloco G: Admin operacional (independente)
```

---

## 6. Riscos e Observações Gerais

| Risco | Impacto | Mitigação |
|---|---|---|
| `price_category` existente pode conflitar com price lists | Confusão de modelo de preço | Decidir antes de B: price lists substituem ou complementam `price_category` |
| Automações duplicadas no banco | Disparos duplicados ao ativar | Limpar duplicatas (E.3) antes de ativar qualquer automação nova |
| Webhook MP nunca testado com pagamento real | `purchase_completed` pode não disparar | Priorizar F.3 antes de confiar em relatórios de conversão |
| Jobs pg_cron podem estar inativos | Filas acumulam, carrinhos não são detectados | Verificar F.4 periodicamente |
| Parceiros sem email válido | Bloco A fica parcialmente bloqueado | Definir fluxo alternativo (convite por WhatsApp) |
| Pedidos legados com `customer_segment_snapshot = NULL` | Relatórios incompletos | Tratar NULL como "Não classificado" em todas as views |

---

## 7. Checklist de Validação do Estado Atual

### Segmentação comercial
- [x] `profiles.customer_segment` existe com CHECK constraint
- [x] `orders.customer_segment_snapshot` existe com CHECK constraint
- [x] Backfill de profiles executado (is_partner → segment)
- [x] Backfill de orders executado (herda do profile)
- [x] RPC `admin_update_customer_segment` funcional
- [x] `get_all_profiles` retorna `customer_segment`
- [x] `create_manual_order` faz snapshot do segmento
- [x] `create_salao_order` faz snapshot do segmento
- [x] Edge function `create-order` faz snapshot do segmento
- [x] UI admin: dropdown com optimistic update funcionando
- [x] Badges coloridos: laranja (Parceiro da Rede), teal (Comprador Atacado)
- [x] Migration aplicada em produção (`npx supabase db push`)
- [x] Deploy Vercel realizado (push na main)
- [x] `docs/SCHEMA.md` atualizado
- [x] `docs/decisions.md` atualizado (D-10)
- [x] `docs/roadmap.md` atualizado

### Financeiro
- [x] Filtro por período com presets funcionando
- [x] Hero card com gradiente dourado
- [x] Chart comparativo mês atual vs anterior
- [x] Comparativos de variação com badges

---

## 8. Próximos Passos Recomendados

1. **Próxima sessão (recomendado):** Bloco A — Provisionamento de acesso para parceiros
   - Investigar `supabase.auth.admin.createUser()` e fluxo de convite
   - Definir modelo de status de acesso (ativo/pendente/bloqueado)
   - Implementar RPC de convite + tela admin

2. **Sessão seguinte:** Bloco B — Tabelas de preço
   - Decidir se `price_category` será substituído por price lists
   - Modelar `price_lists` + `price_list_items`
   - Implementar resolução de preço no catálogo e checkout

3. **Em paralelo (baixo esforço):** Bloco C.1 — Filtro por segmento no financeiro
   - Já tem os dados, é só adicionar dropdown e filtrar a query

---

## 9. Próximo Prompt Sugerido

```
RDC_BACK_ACESSO_P1_CLD_V1 — Provisionamento de acesso para parceiros da rede

Implementar o fluxo de criação de credenciais para parceiros já cadastrados:
1. RPC admin para criar usuário em auth.users a partir de um profile existente
2. Geração de link de convite com token temporário (magic link ou senha temporária)
3. Coluna de status de acesso no profile (access_status: invited/active/blocked)
4. Endpoint para admin disparar convite por email
5. Tela admin para gestão de acessos (listar, convidar, revogar, reenviar)

Consultar: docs/SCHEMA.md, docs/decisions.md, profiles.customer_segment
Não alterar: UI existente de Clientes.tsx além do necessário para a gestão de acesso
Entregar: migration, RPC, handoff com contrato para frontend
```
