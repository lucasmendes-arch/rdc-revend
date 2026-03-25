# current_status.md — Estado atual do projeto
# Atualizado em: 2026-03-24

## Status geral

### Etapa 1 — Fundação CRM
- DONE

### Etapa 2 — Tracking de eventos
- QA_APPROVED_COM_RESSALVAS

### Etapa 3 — Tags + Dispatcher + Admin/UX
- QA_APPROVED

### Etapa 4 — Automações WhatsApp operacionais
- OPERATIONAL_V1

### Etapa 5 — Fluxo de Parceiros e Salões (Atual)
- AUDITADO_PRONTO_PARA_MERGE (2 rodadas de auditoria técnica concluídas, 7 bloqueios corrigidos)

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

## Próximos candidatos de prompt

- Editor de mensagens das automações (CLD ou ANT)
- Painel da fila crm_dispatch_queue no admin (ANT)
- UX "Tags Vinculadas" (ANT)
