# session_compact.md — Compactação da sessão longa
# Atualizado em: 2026-03-09

## 1. Objetivo

Resumo compacto da conversa longa para retomada rápida com qualquer IA.

---

## 2. Resumo executivo

O projeto CRM do Rei dos Cachos avançou da fundação até a primeira versão operacional da Etapa 4.

### Etapa 2
Tracking de eventos (cadastro, visita, produto, carrinho, checkout, compra, abandono). Correções de types/schema, CRM debug, cadastro, deduplicação e sobreposição de botão. Status: `QA_APPROVED_COM_RESSALVAS` (purchase_completed pende teste real com MP).

### Etapa 3
Motor de tags via trigger SQL, backfill, visualização e gestão de tags, filtro por tag, dispatcher WhatsApp com UAZAPI validado em produção, kanban redesenhado, scroll horizontal corrigido, perfis novos sem nome corrigido. Status: `QA_APPROVED`.

### Etapa 4 (2026-03-09)
- Ambiente local no novo PC configurado (fix: nome do arquivo `.env.local`).
- Migrations `20250313000006` (automations) e `20250313000007` (dispatch_queue) aplicadas manualmente.
- Tabela `crm_dispatch_queue`, funções `claim_crm_queue_items` e `reset_stuck_crm_queue_items` criadas.
- `crm-queue-processor` deployado e ativo.
- `pg_net` e `pg_cron` confirmadas ativas. Job a cada 1 minuto.
- Automação de recuperação de carrinho: operacional.
- Boas-vindas e Fidelizacao: inativas (duplicidades identificadas, aguardam validação).
- Disparo manual testado com sucesso.

Status: `OPERATIONAL_V1`

---

## 3. Estado atual resumido

### Concluído
- Etapa 1 (DONE)
- Etapa 2 (QA_APPROVED_COM_RESSALVAS)
- Etapa 3 (QA_APPROVED)
- Etapa 4 v1 (OPERATIONAL_V1)

### Pendências de Etapa 4
- Editor de mensagens das automações
- UX "Tags Vinculadas"
- Visualização da fila no admin
- Blindagem contra duplicidade de seeds/migrations de automações
- Remover duplicatas de Boas-vindas e Fidelizacao antes de ativar

---

## 4. Decisões importantes

1. Claude = backend, SQL, RLS, edge functions, dispatcher, automações.
2. Ant = frontend, UX, admin, kanban, CRM debug, filtros, visual.
3. Sempre pensar em paralelização.
4. Preferir 1 prompt consolidado quando a tarefa for leve/documental.
5. Não expor secrets em handoff.
6. Evitar metáforas e respostas longas demais; ser direto.
7. Para UX crítica, validar por print e não apenas por handoff.
8. Manter apenas automação de carrinho ativa até UX/admin evoluir.

---

## 5. UAZAPI

- API oficial do WhatsApp: UAZAPI
- Dispatcher funcionando em produção; endpoint e secrets corretos.
- Não escrever credenciais reais em handoff.

---

## 6. Últimos problemas relevantes resolvidos

- CRM debug quebrando por colunas incompatíveis com o schema
- Cadastro não persistindo profile corretamente
- Kanban com cards ilegíveis / scroll horizontal
- Ambiente local no novo PC (fix: nome do arquivo `.env.local`)
- Duplicidades de automações identificadas no banco

---

## 7. Próximos passos

- Editor de mensagens das automações (CLD ou ANT)
- Painel da fila `crm_dispatch_queue` no admin (ANT)
- UX "Tags Vinculadas" (ANT)
- Verificar e remover duplicatas de Boas-vindas/Fidelizacao antes de ativar
