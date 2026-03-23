# Backlog Futuro — Rei dos Cachos B2B

_Features planejadas mas fora do escopo atual. Não implementar sem alinhamento explícito._

---

## CRM — Etapa 3 (concluída)

- [x] Tags automáticas via trigger SQL — DONE
- [x] Edge function `crm-dispatcher` com UAZAPI — DONE
- [x] Visualização de tags por cliente no debug screen — DONE
- [x] Credenciais UAZAPI configuradas — DONE
- [ ] Painel admin para ativar/desativar automações e editar templates — pendente (Etapa 4)

## CRM — Etapa 4 (em progresso)

- [ ] Editor de mensagens das automações no admin
- [ ] UX do campo "Tags Vinculadas" (melhoria)
- [ ] Visualização da fila `crm_dispatch_queue` no admin
- [ ] Blindagem contra duplicidade em seeds/migrations de automações
- [ ] Ativar Boas-vindas e Fidelizacao após validação de templates e limpeza de duplicatas

## CRM — Etapa 5+ (futuro)

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
