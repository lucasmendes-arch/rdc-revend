# Backlog Futuro — Rei dos Cachos B2B

_Última atualização: 2026-04-08_
_Handoff detalhado: `docs/handoff_backlog_2026-04-08.md`_

---

## Concluído recentemente

- [x] Segmentação comercial de clientes (`profiles.customer_segment`)
- [x] Snapshot de segmento em pedidos (`orders.customer_segment_snapshot`)
- [x] Edição de segmento no admin com optimistic update
- [x] Financeiro: filtros por período, presets, chart comparativo

## CRM — Etapa 4 (pendências)

- [ ] Editor de mensagens das automações no admin
- [ ] UX do campo "Tags Vinculadas" (melhoria)
- [ ] Visualização da fila `crm_dispatch_queue` no admin
- [ ] Blindagem contra duplicidade em seeds/migrations de automações
- [ ] Limpeza de automações duplicadas no banco
- [ ] Ativar Boas-vindas e Fidelizacao após validação de templates

## Bloco A — Acesso de Parceiros (PRIORIDADE ALTA)

- [ ] Criação de login para parceiros já cadastrados
- [ ] Fluxo de convite por email/WhatsApp com token temporário
- [ ] Reset de senha administrado pelo admin
- [ ] Gestão de acessos no painel (ativo/pendente/bloqueado)

## Bloco B — Tabelas de Preço por Parceiro/Nível (PRIORIDADE ALTA)

- [ ] Tabela `price_lists` + `price_list_items`
- [ ] Vínculo parceiro → price list
- [ ] Níveis de parceiro (Nível 1, Nível 2, etc.)
- [ ] Resolução de preço: price list > fallback preço padrão
- [ ] Admin: CRUD de price lists
- [ ] Exibição ao parceiro logado

## Bloco C — Evolução do Financeiro (PRIORIDADE MEDIA)

- [ ] Filtro por segmento comercial no financeiro
- [ ] Quebra de faturamento parceiros vs atacado
- [ ] Gráfico comparativo por segmento
- [ ] Exportação de relatório (CSV/Excel)

## Bloco D — Dashboard 360 (PRIORIDADE MEDIA)

- [ ] Separar Financeiro de Dashboard Operacional
- [ ] Dashboard: pedidos do dia, pendentes, carrinhos abandonados, estoque
- [ ] Visão CRM resumida (tags, automações, fila)
- [ ] Visão de canais (site, WhatsApp, loja, manual)
- [ ] Alertas e atalhos operacionais

## Bloco F — Integrações e Operação (PRIORIDADE BAIXA)

- [ ] Validar fluxo n8n → ClickUp
- [ ] Expor outbox no admin
- [ ] Validar webhook MercadoPago com transação real
- [ ] Verificar jobs pg_cron em produção
- [ ] Sync-back: validação final

## Bloco G — Admin Operacional (PRIORIDADE BAIXA)

- [ ] Filtros avançados em Pedidos (status, origem, segmento, período)
- [ ] Sync logs no admin
- [ ] Alertas operacionais (pedidos parados, estoque baixo)
- [ ] Atalhos rápidos no dashboard

## Produto / Catálogo

- [ ] Carrinho persistido no servidor (hoje é só localStorage)
- [ ] Histórico de preços por produto
- [ ] Produtos em destaque configuráveis pelo admin

## Checkout

- [ ] Validar webhook `purchase_completed` com pagamento real MP
- [ ] Parcelamento via MercadoPago (cartão)
- [ ] Cálculo de frete via API dos Correios
- [ ] Nota fiscal / dados fiscais

## Infraestrutura

- [ ] Otimização de performance / carregamento de imagens
- [ ] Testes automatizados (Vitest — estrutura existe, sem cobertura)
- [ ] Monitoramento de edge functions
- [ ] Alertas de estoque baixo
