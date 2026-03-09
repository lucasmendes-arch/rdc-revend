# session_compact.md — Compactação da sessão longa
# Atualizado em: 2026-03-09

## 1. Objetivo

Resumo compacto da conversa longa para retomada rápida com qualquer IA.

---

## 2. Resumo executivo

O projeto CRM do Rei dos Cachos avançou da fundação até o fechamento operacional da Etapa 3.

### Etapa 2
Foi concluído o tracking dos eventos:
- cadastro
- visita
- visualização de produto
- carrinho
- checkout
- compra
- abandono

Houve:
- correção de conflitos entre types e schema;
- correção do CRM debug;
- correção de bug no cadastro;
- correção de deduplicação de add_to_cart;
- correção de sobreposição do botão de WhatsApp no checkout;
- validação técnica de abandono;
- validação do purchase_completed via revisão técnica e testes SQL parciais.

Status final:
- `QA_APPROVED_COM_RESSALVAS`

### Etapa 3
Foi implementado:
- motor de tags híbridas via trigger SQL;
- backfill de tags;
- visualização de tags no debug;
- gestão manual de tags;
- filtro de clientes por tag;
- dispatcher WhatsApp com UAZAPI validado em produção;
- redesign do kanban de clientes;
- correção de scroll horizontal do board.

Também foi corrigido:
- problema de perfis novos aparecendo sem nome por falha no fluxo de `Cadastro.tsx`.

Status final:
- `QA_APPROVED`

---

## 3. Estado atual resumido

### Concluído
- Etapa 1
- Etapa 2
- Etapa 3

### Em hold
- abertura formal da Etapa 4

Motivo do hold:
- a conversa ficou longa e foi necessário consolidar memória e status
- houve foco em corrigir UX do kanban antes de avançar

---

## 4. Decisões importantes

1. Claude = backend, SQL, RLS, edge functions, dispatcher, integrações.
2. Ant = frontend, UX, admin, kanban, CRM debug, filtros, visual.
3. Sempre pensar em paralelização.
4. Preferir 1 prompt consolidado quando a tarefa for leve/documental.
5. Não expor secrets em handoff.
6. Evitar metáforas e respostas longas demais; ser direto.
7. Para UX crítica, validar por print e não apenas por handoff.

---

## 5. UAZAPI

### Definido
- API oficial do WhatsApp: UAZAPI

### Já validado
- dispatcher funcionando em produção
- endpoint correto identificado durante a validação
- secrets configurados no ambiente

### Regra
- não escrever credenciais reais em handoff

---

## 6. Últimos problemas relevantes resolvidos

- CRM debug quebrando por colunas incompatíveis com o schema
- cadastro não persistindo profile corretamente em alguns casos
- kanban com cards ilegíveis
- scroll horizontal do kanban não funcionando

---

## 7. Próximo passo provável

Abrir formalmente a Etapa 4:
- automações WhatsApp operacionais
- poucas automações iniciais
- foco em segurança, idempotência, ativação/desativação e governança
