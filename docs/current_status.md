# current_status.md — Estado atual do projeto
# Atualizado em: 2026-03-09

## Status geral

### Etapa 1 — Fundação CRM
- DONE

### Etapa 2 — Tracking de eventos
- QA_APPROVED_COM_RESSALVAS

### Etapa 3 — Tags + Dispatcher + Admin/UX
- QA_APPROVED

### Etapa 4 — Automações WhatsApp operacionais
- PENDING_START

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

### Dispatcher
- crm-dispatcher validado com UAZAPI

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

## Próxima ação recomendada

Abrir a Etapa 4 com:
- automações WhatsApp operacionais iniciais
- baixo escopo
- governança
- idempotência
- ativação/desativação
- logs

Sugestão de próximo prompt:
- `RDC_CRM_E4_P1_CLD_V1`
