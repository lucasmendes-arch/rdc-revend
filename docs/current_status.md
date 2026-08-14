# current_status.md — Estado atual do projeto

_Atualizado em: 2026-08-14_

> Este documento substitui o conteúdo anterior (2026-04-12, sobre o CRM em fase inicial —
> desde então o escopo do projeto cresceu para RH, DP, Estoque e o dashboard Trinks).
> Fonte primária de memória operacional continua sendo `private-docs/memory.md`;
> este arquivo é o retrato do momento para retomada rápida de contexto.

---

## 1. Onde o projeto está

Rei dos Cachos B2B deixou de ser só e-commerce + CRM. Hoje o repositório cobre:

- **Comercial/Atacado** — catálogo, checkout, pedidos, cupons, portal do parceiro (base histórica, estável)
- **RH** — recrutamento (vagas, candidatos, formulário público, kanban, automações)
- **DP (Departamento Pessoal)** — admissão, contratos, colaboradores ativos
- **Estoque** — contagem física por loja, reposição, e desde julho a fonte real do estoque do checkout
- **Unidades (Trinks)** — dashboard de faturamento das 5 unidades do salão (branch aberta, não mergeada)

Claude é o único agente cuidando do projeto inteiro (backend + frontend) — não há mais divisão com um segundo agente (Ant/Antigravity).

---

## 2. O que foi feito nas últimas sessões (cronológico, resumo)

### Estoque → Checkout (2026-07-02 a 2026-07-24)
- Módulo de contagem física por loja (`stores`, `stock_counts`, `replenishment_orders`), com sortimento derivado das metas por loja e reposição que substitui (não soma) a última contagem.
- **Mudança estrutural em 24/07**: o checkout do site B2B parou de depender do sync do Google Sheets — `inventory.quantity` passou a ser alimentado pela contagem física confirmada de Linhares (central). `create-order` (feature freeze) não foi tocado; só a fonte de reabastecimento mudou. Ver decisão [D-26] em `docs/decisions.md`.
- Unificação de roles: `estoque` foi absorvido por `salao` — mesmo colaborador de loja física faz venda e contagem.

### Módulo RH — Recrutamento (2026-07-17 a 2026-07-27)
- Schema completo: vagas, candidatos, catálogo de cargos, kanban, formulário público de candidatura.
- Motor de automações genérico (Fase 3, 19/07): substitui as 8 automações do ClickUp e a automação de WhatsApp do n8n. Fila WhatsApp própria via Uazapi, drenada por cron.
- Rastreamento de conversão (pixel/GA) no formulário público, CTA de WhatsApp no sucesso, links de anúncio por vaga.
- Fase 1 de triagem de entrevistas por WhatsApp (entrada de mensagens do candidato) construída e testada ponta a ponta em 27/07 — **suspensa por decisão do usuário** logo em seguida (ver pendências).
- Correção de dado: vaga sem cargo do catálogo escondia descrição e campos obrigatórios do formulário público (27/07 a 03/08) — agora mostra badge "Sem cargo" + aviso.

### Módulo DP — Departamento Pessoal (2026-07-18 a 2026-07-24)
- Schema + RPC de transição RH→DP (`promote_candidate_to_dp`), duas telas: kanban de admissão e tabela de colaboradores ativos.
- Role `administrativo` criado (20/07): RH+DP+Estoque completo, sem outros poderes de admin.
- Geração automática de contratos de Formação e Desligamento via Google Drive/Docs — **confirmada funcionando ponta a ponta em 23/07** (documento real + notificação WhatsApp). Pivotou de service account (não funciona em conta pessoal) para OAuth com refresh token.
- Unificação visual do card de contratação DP com o card de candidato RH.

### Segurança — Checkup geral (2026-07-23)
- Varredura completa (RLS, edge functions, `npm audit`, sondagem ativa em produção com a chave anon).
- **Achado crítico confirmado explorado**: `get_system_users()` vazando e-mail/telefone/role de toda a equipe para qualquer anônimo (regressão introduzida 2 dias antes por um `DROP FUNCTION` que apagou os grants). Corrigido no mesmo dia.
- `upload-product-image` sem autenticação nenhuma — corrigido (auth + allowlist de tipo/tamanho/pasta).
- **Fase 1 aplicada com 2 ressalvas em aberto**: `send-order-whatsapp` continua com bypass de auth (é código morto, decisão de apagar-ou-blindar pendente com o humano); `webhook-mercadopago` segue fail-open porque `MERCADOPAGO_WEBHOOK_SECRET` nunca foi configurado nos secrets do projeto.
- Fases 2-4 (build TypeScript quebrado, deps vulneráveis, refresh token rotacionando a cada chamada, `create-order` com complexidade 133, etc.) documentadas e **pendentes**.

### Design system (2026-07-26)
- Refundação visual: ink primário (quase-preto/quase-branco) como ação principal, dourado virou accent puro (nunca mais CTA). Tipografia trocada para Geist. Rampa de neutro única `--ink-*`.
- Escopo entregue: tokens, primitivos shadcn, Portal do Parceiro, as duas sidebars. **Admin/Comercial/RH/DP/Estoque herdaram os tokens mas não foram revisados tela a tela.**

### Dropdowns → StyledSelect (2026-07-21, em andamento)
- Substituição sistêmica de `<select>` nativo por componente próprio (Popover+Command, estilo ClickUp). 83 selects mapeados em 28 arquivos.
- **Concluído**: RH + DP (10 arquivos). **Pendente**: Comercial/Atacado, Estoque, Sistema (Usuários), Marketing, e as telas de cliente final.

### Widgets de data (2026-07-27 a 2026-08-03)
- Os 11 `<input type="date">` nativos restantes viraram `DateField`/`QuickDatePopover` (componente compartilhado, antes duplicado entre RH e DP).

### Upsell removido (2026-07-22)
- Bug de precificação (checkout cobrava mais do que mostrava na tela) resolvido removendo a feature inteira, por decisão do usuário — não foi corrigida. Tabela `upsell_offers` ficou dormente.

### Dashboard Trinks — faturamento das unidades (2026-07-28 a 2026-08-11)
- Nova tela `/admin/unidades` consolidando faturamento, serviços/produtos, produção por profissional e agenda das 5 unidades, puxado do Trinks via edge function `sync-trinks`.
- Backfill de 12 meses feito (~R$2,7 mi, 1.289 dias-unidade). Backend e edge function já estão no ar em produção desde 28/07.
- **Commitado em `ac2620f`, branch `feat/trinks-dashboard` — ainda não mergeada em `main`, não foi pro Vercel.**

---

## 3. Pendências (por área, aproximadamente em ordem de prioridade)

### Segurança (herdado do checkup 2026-07-23)
- [ ] `webhook-mercadopago`: configurar `MERCADOPAGO_WEBHOOK_SECRET` e deployar a versão fail-closed (código já commitado, só falta o secret + deploy)
- [ ] Decidir: apagar ou blindar `send-order-whatsapp` (código morto com bypass de auth)
- [ ] Fase 2 do checkup: build TypeScript quebrado (5 erros reais, incluindo bug visível em produção no badge do carrinho), `npm audit fix`, `callEdgeFunction` rotacionando refresh token, trigger de contrato disparando em todo save, URL hardcoded nos triggers
- [ ] Fases 3-4: unificar `generate-contract`/`generate-contract-automation` (duplicados), zerar ESLint, testes para cálculos críticos, quebrar componentes-monstro (`Clientes.tsx` 2013 linhas, `Candidatos.tsx` 1588)

### Trinks dashboard
- [ ] Mergear `feat/trinks-dashboard` em `main` (deploy)
- [ ] Agendar o cron horário (`cron.schedule`, deixado comentado de propósito na migration `20260728000002`)
- [ ] São Gabriel (260078) volta zerada; `no_shows`/`cancellations` sempre 0; agenda futura não aparece no filtro de status atual
- [ ] Cuidado operacional permanente: host de sessões do Trinks é single-thread e lento (17-47s/login) — nunca disparar chamadas em paralelo, derruba os fluxos de produção do n8n

### Triagem de entrevistas por WhatsApp (RH)
- [ ] Decisão do usuário: retomar ou não. Backend está no ar mas suspenso — só falta apontar o webhook da Uazapi (configuração externa, não código)
- Fases 2-4 (classificar, follow-up automático, mover card sozinho) não têm decisão tomada — Fase 4 principalmente

### Dropdowns (StyledSelect)
- [ ] Continuar rollout: Comercial/Atacado, Estoque, Sistema, Marketing, telas de cliente final

### DP
- [ ] Validação visual em browser real (drag-and-drop, abas do modal) nunca foi feita
- [ ] Upload real de documentos/contratos pro R2 (hoje é stub), checklist configurável, alertas de vencimento
- [ ] Contrato de "prestação de serviço" fora de escopo — sem template real ainda

### Automação RH
- [ ] Popular `store_whatsapp_credentials` com tokens reais por loja (hoje cai no fallback global)
- [ ] Recriar as 8 regras específicas que existiam no ClickUp é configuração do usuário pela tela — não fazer proativamente

### Vaga sem cargo (dado, não código)
- [ ] Vaga "Cabeleireiro Cachos / Linhares" ainda sem cargo vinculado no catálogo — formulário de Linhares sem descrição/currículo obrigatório até ser editada em `/admin/rh/vagas`

### Design system
- [ ] Revisão tela a tela de Admin/Comercial/RH/DP/Estoque (só herdaram os tokens, não foram revisados)

### Housekeeping
- [ ] 9 branches remotas já contidas em `origin/main` esperando decisão pra apagar
- [ ] Tabelas dormentes (`upsell_offers`, `crm_customers`, `crm_interactions`, `catalog_sync_runs`) — candidatas a drop depois de confirmar que nada externo as consulta

---

## 4. Direção do projeto

- O centro de gravidade migrou do e-commerce puro para uma plataforma operacional completa do salão: recrutamento → admissão → colaborador ativo → estoque por loja → faturamento por unidade. O CRM de marketing original (funil, tags, automações de carrinho) é a base mais antiga e estável, mantida mas não é mais o foco de desenvolvimento.
- Estoque e checkout convergiram: a contagem física de Linhares é hoje a fonte de verdade do site B2B, fechando um ciclo que antes dependia de planilha manual.
- RH/DP são o módulo mais ativo no momento — decisão pendente do usuário é até onde automatizar a triagem por WhatsApp (a linha vermelha é mover card sozinho sem confirmação humana).
- Trinks é a fronteira mais nova (visibilidade financeira por unidade), ainda não em produção — próximo passo natural é validar os dados e mergear.
- Dívida técnica está mapeada e priorizada (checkup de segurança), mas as duas pendências de maior risco real (webhook MP fail-open, upload sem allowlist já corrigida) têm uma pendente de configuração externa, não de código.

---

## 5. Ferramentas por papel

| Papel | Escopo |
|---|---|
| **Claude** | Projeto inteiro — backend, SQL, migrations, RLS, edge functions, RPCs, integrações, frontend |
| **Humano** | Direção, priorização, validação final, testes manuais, configuração externa (secrets, Uazapi, credenciais Google) |

---

## 6. Regras operacionais (lembrete)

1. Consultar `CLAUDE.md`, `docs/SCHEMA.md` e `private-docs/memory.md` antes de qualquer tarefa.
2. Nunca expor secrets — só nome da variável de ambiente.
3. Validações críticas (preço, estoque, mínimo de pedido) ficam no backend.
4. `supabase/functions/create-order/index.ts` está em feature freeze permanente — checklist em `docs/create-order-contract.md`.
5. Testar `npx tsc --noEmit -p tsconfig.app.json` antes de entregar (o comando sem `-p` não checa nada neste repo).
