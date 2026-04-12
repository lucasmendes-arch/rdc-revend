# current_status.md — Estado atual do projeto
# Atualizado em: 2026-04-12

## Status geral

### Etapa 1 — Fundação CRM
- DONE

### Etapa 2 — Tracking de eventos
- QA_APPROVED_COM_RESSALVAS

### Etapa 3 — Tags + Dispatcher + Admin/UX
- QA_APPROVED

### Etapa 4 — Automações WhatsApp operacionais
- OPERATIONAL_V1

### Etapa 5 — Fluxo de Parceiros e Salões
- OPERATIONAL_V1 (2026-04-10)

### Etapa 6 — Portal do Parceiro + Catálogo Avançado (Atual)
- IN_PROGRESS

---

## O que já existe funcionando

### Eventos CRM
- user_registered
- visitou
- visualizou_produto
- adicionou_carrinho
- iniciou_checkout
- purchase_completed
- cart_abandoned

### Tags CRM
- adicionou-carrinho
- iniciou-checkout
- abandonou-carrinho
- novo-cliente
- recorrente

### Admin/UX
- CRM Debug funcional
- visualização de tags
- gestão manual de tags
- runs visíveis
- kanban redesenhado
- filtro por tags
- scroll horizontal do board funcional

### Dispatcher e Fila
- crm-dispatcher validado com UAZAPI
- crm-queue-processor deployado e ativo
- fila crm_dispatch_queue operacional
- pg_cron job ativo (a cada 1 minuto)
- pg_net e pg_cron habilitados no Supabase

### Automações cadastradas no banco
- CRM: Recuperacao Carrinho (tag) — is_active=true (única ativa)
- CRM: Boas-vindas Novo Cliente — is_active=false (seeds, aguarda validação)
- CRM: Fidelizacao Cliente Recorrente — is_active=false (seeds, aguarda validação)

---

## Ponto de atenção

Duplicidades das automações "Boas-vindas Novo Cliente" e "Fidelizacao Cliente Recorrente" foram identificadas no banco durante o dia 2026-03-09. A migration usa `ON CONFLICT DO NOTHING`, o que previne novo seed idempotente, mas duplicatas existentes devem ser removidas manualmente se confirmadas. Verificar antes de ativar essas automações.

---

## Pendências imediatas (Etapa 4)

1. Editor de mensagens das automações — não implementado
2. UX do campo "Tags Vinculadas" — precisa melhoria
3. Visualização da fila (crm_dispatch_queue) no admin — não existe
4. Blindagem contra duplicidade em seeds/migrations de automações

---

## Ferramentas por papel

### Claude
- backend
- SQL
- edge functions
- integrações externas
- dispatcher
- automações

### Antigravity
- frontend
- UX
- admin
- kanban
- CRM Debug
- refinamentos visuais

---

## Regras operacionais

1. Sempre avaliar se existe frente paralela para Ant.
2. Não abrir mais etapa sem necessidade se a etapa atual tiver bloqueio visual grave.
3. Não expor secrets no handoff.
4. Validar UI crítica por print.
5. Respostas objetivas e curtas.

---

## Recomendação de operação atual

- Manter apenas automação de recuperação de carrinho ativa.
- Não ativar Boas-vindas nem Fidelizacao até resolver duplicidades e validar templates com a equipe.
- Não expandir automações até evoluir UX/admin e ampliar validações.

## Funcionalidades entregues — 2026-04-10

### Portal do Parceiro (network_partner)
- Login silencioso por telefone (RPC `resolve_partner_login_email` → email → signInWithPassword)
- Preços da tabela de preço aplicados no catálogo (`get_my_price_list_items` → merge no hook)
- `isPartner` derivado de `is_partner boolean OR customer_segment = 'network_partner'`
- PackageCards ocultos para parceiros
- Popup de perfil incompleto suprimido para parceiros
- Preço único (sem riscado), apenas preço da tabela definida

### Admin — Catálogo
- Ordenação manual de produtos por categoria (drag-and-drop, `sort_order`)
- Edição de dados cadastrais do cliente no painel de detalhes
- Vinculação de tabela de preço ao parceiro (dropdown, fix do bug de estado stale)
- Aplicação de preço por categoria (bulk upsert em `price_list_items`)

## Funcionalidades entregues — 2026-04-12

### Catálogo — Refino Visual P3
- Grid desktop: imagens com `aspect-square` + `object-contain` + `scale-[1.1]` — preenchimento uniforme mobile/desktop
- PackageCards: card clicável abre modal de detalhes (botão "Ver + detalhes" removido)
- PackageCards: miniaturas mobile `w-14 h-14` com overlap `-space-x-5`
- PackageCards: textos aumentados proporcionalmente (nome 18px, desc 13px, contagem 14px, preço 22px, retorno 13px)
- PackageCards: padding `p-4`, alinhamento lateral com `px-4` simples (sem margem negativa)
- CategoryBubbles: gap `gap-4 → gap-2`, `scroll-pl-4` corrige snap ignorando padding
- Títulos: "Seleção dos Mais Vendidos" alinhado ao estilo h2 dos carrosséis
- Badges de produto removidas de todos os cards (grid + carousel)
- Commit: `19b8d41` → merged em main `d8bfb77`, deploy Vercel automático

## Pendências conhecidas

- Editor de mensagens das automações CRM
- Painel da fila crm_dispatch_queue no admin
- `partner_price` acessível a `authenticated` não-parceiros se solicitado explicitamente (proteção apenas via lógica frontend)
- **WhatsApp button bug**: `isModalOpen` lido pontualmente no render — não reativo. Botão fica oculto após fechar ProfileCompletionModal até refresh.

## Próximos candidatos

- Fix WhatsApp button: estado reativo para `isModalOpen` via context ou event
- Relatório de vendas por segmento (network_partner vs wholesale_buyer)
- Histórico de pedidos no portal do parceiro
- Notificações WhatsApp para parceiros
