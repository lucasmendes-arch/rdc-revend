# Backlog Futuro — Rei dos Cachos B2B

_Features planejadas mas fora do escopo atual. Não implementar sem alinhamento explícito._

---

## CRM — Etapa 3 (próxima)

- [ ] Tags automáticas via trigger SQL (cart_abandoned → tag `abandonou-carrinho`, purchase_completed → tag `novo-cliente`/`recorrente`)
- [ ] Edge function `crm-dispatcher`: lê automações ativas, verifica idempotência, envia via Fiqon/Z-API
- [ ] Painel admin para ativar/desativar automações e editar templates
- [ ] Visualização de tags por cliente no debug screen
- [ ] Configurar credenciais Fiqon/Z-API + ajustar `action_config` nos seeds

## CRM — Etapa 4+ (futuro)

- [ ] Segmentação de clientes por tag (listagem filtrável)
- [ ] Relatório de disparos: taxa de sucesso, falhas, por automação
- [ ] Reativação de clientes inativos (INACTIVE_30D, INACTIVE_90D) — depende de job agendado
- [ ] Multicanal (email) — não iniciar antes de WhatsApp estabilizado
- [ ] Score de cliente (frequência, ticket médio)

## Produto / Catálogo

- [ ] Carrinho persistido no servidor (hoje é só localStorage)
- [ ] Histórico de preços por produto
- [ ] Produtos em destaque configuráveis pelo admin (is_highlight existe, UI pendente)

## Checkout

- [ ] Validar o flow do webhook `purchase_completed` com uma transação real de Mercado Pago (ainda não testado fim a fim)
- [ ] Avaliar a criação de um evento adicional (`purchase_initiated`) para rastrear especificamente o clique final de pagamento que redireciona pro MP, além do evento que abriu o checkout.
- [ ] Parcelamento via MercadoPago (cartão) — fluxo já parcialmente implementado
- [ ] Cálculo de frete via API dos Correios
- [ ] Nota fiscal / dados fiscais

## Admin

- [ ] Relatório de abandono de carrinho (lista de quem abandonou e valor do carrinho)
- [ ] Dashboard com métricas consolidadas (GMV, ticket médio, conversão)
- [ ] Exportação de pedidos para planilha (sync-google-sheets existe, UI pendente)

## Infraestrutura

- [ ] Otimização geral de performance / carregamento (Imagens lentas reportadas durante o QA da Etapa 2)
- [ ] Testes automatizados (Vitest — estrutura já existe, sem cobertura real)
- [ ] Monitoramento de edge functions (logs no Supabase dashboard)
- [ ] Alertas de estoque baixo (inventory.quantity < threshold)
