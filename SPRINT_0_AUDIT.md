# Sprint 0 — Auditoria Técnica CRM/WhatsApp

> Data: 2026-04-17  
> Baseado em: leitura direta de migrations, edge functions e código-fonte  
> Propósito: validar o estado real antes de iniciar o Sprint 1 (motor de sequências)

---

## 1. Estado Real das Automações CRM

### Total de automações seeded: 5

Verificado nas migrations `20250313000001`, `20250313000005` e `20250313000006`:

| # | Nome | Trigger Type | Trigger Condition | is_active | Migration de origem |
|---|------|--------------|-------------------|-----------|---------------------|
| 1 | Recuperação de Carrinho Abandonado | `abandon_cart` | `{"min_cart_items": 1}` | `false` | `000001` |
| 2 | Boas-vindas Pós-compra | `order_created` | `{}` | `false` | `000001` |
| 3 | Lembrete: Iniciou Checkout | `funnel_status_changed` | `{"to_status": "iniciou_checkout"}` | `false` | `000001` |
| 4 | CRM: Recuperacao Carrinho (tag) | `tag_added` | `{"tag_slug": "abandonou-carrinho"}` | `false` | `000005` |
| 5 | CRM: Boas-vindas Novo Cliente | `tag_added` | `{"tag_slug": "novo-cliente"}` | `false` | `000006` |
| 6 | CRM: Fidelizacao Cliente Recorrente | `tag_added` | `{"tag_slug": "recorrente"}` | `false` | `000006` |

**Contagem correta: 6 automações** (o `PROJECT_SUMMARY.md` informou 3 — estava incompleto).

### Classificação por estado real

**Automações candidatas a funcionar se ativadas (trigger_type=`tag_added`):**
- #4 CRM: Recuperacao Carrinho (tag) — única automação que sobreviveu ao refactor do dispatcher. Template atualizado pelo `000006`.
- #5 CRM: Boas-vindas Novo Cliente — funcional se ativada + webhook de tag configurado
- #6 CRM: Fidelizacao Cliente Recorrente — funcional se ativada + webhook de tag configurado

**Automações órfãs (trigger_type ignorado pelo dispatcher no modo webhook):**
- #1 Recuperação de Carrinho Abandonado — `trigger_type='abandon_cart'`
- #2 Boas-vindas Pós-compra — `trigger_type='order_created'`
- #3 Lembrete: Iniciou Checkout — `trigger_type='funnel_status_changed'`

O `crm-dispatcher` em Modo A (webhook de tag) filtra `eligible` com:
```typescript
// crm-dispatcher/index.ts:137-142
const eligible = automations.filter((auto) => {
  if (!triggerTagSlug) return true        // modo B: passa tudo
  if (auto.trigger_type !== 'tag_added') return false  // ← BLOQUEIA #1, #2, #3
  const requiredSlug = auto.trigger_conditions?.tag_slug
  return !requiredSlug || requiredSlug === triggerTagSlug
})
```

As automações #1, #2, #3 nunca disparam via webhook. Só disparariam via chamada direta (Modo B) sem `automation_id`, o que levaria ao problema descrito na seção 2.

### Duplicidade identificada

A automação #1 ("Recuperação de Carrinho Abandonado", `abandon_cart`) e a #4 ("CRM: Recuperacao Carrinho (tag)", `tag_added`) têm o mesmo propósito. A #4 é a versão funcional atual; a #1 é legado inacessível via webhook. Ambas `is_active=false`.

### O que pode disparar mensagem hoje em produção

**Nenhuma automação pode disparar automaticamente hoje.** Todas têm `is_active=false`. Condições necessárias para qualquer disparo:

1. Alguma automação precisa ser manualmente setada para `is_active=true` via SQL ou CrmDebug
2. E o Database Webhook (tag → crm-dispatcher) precisa estar configurado no Supabase Dashboard (não confirmado)
3. Ou alguém chama o dispatcher diretamente via HTTP/CrmDebug com `force=true`

**Disparo manual via CrmDebug:** funciona para qualquer usuário, ignora `is_active` (usa `force=true`). Único vetor de envio confirmado no código.

---

## 2. Dispatcher e Fluxo de Envio

### Arquitetura real ponta a ponta

```
[Evento CRM inserido em crm_events]
        ↓
[Trigger: crm_events_apply_tags → apply_crm_tags_from_event()]
        ↓
[INSERT em crm_customer_tags (tag atribuída)]
        ↓ (apenas se Database Webhook estiver ativo — NÃO CONFIRMADO)
[Supabase Database Webhook → POST crm-dispatcher/index.ts]
        ↓
[Modo A: filtra tag_slug → busca automações tag_added ativas]
        ↓
[Se delay_minutes > 0] → INSERT crm_dispatch_queue (status='pending')
[Se delay_minutes = 0] → POST UAZAPI /send/text
        ↓
[INSERT/UPDATE crm_automation_runs (success/failed)]
```

```
[pg_cron a cada minuto — NÃO CONFIRMADO se está rodando]
        ↓
[POST crm-queue-processor/index.ts]
        ↓
[RPC claim_crm_queue_items(10) → UPDATE status='processing' FOR UPDATE SKIP LOCKED]
        ↓
[Para cada item: POST crm-dispatcher com force=true]
        ↓
[UPDATE crm_dispatch_queue SET status='sent' ou 'failed']
```

### Status do crm_dispatch_queue — constraint CORRETA

**Achado:** O `PROJECT_SUMMARY.md` levantou a hipótese de que `'processing'` poderia violar o CHECK. **Isso estava errado.** A migration `20250313000007` define explicitamente:

```sql
-- 20250313000007_crm_dispatch_queue.sql:22-24
status text NOT NULL DEFAULT 'pending' CHECK (status IN (
  'pending', 'processing', 'sent', 'failed', 'cancelled'
))
```

`'processing'` está na constraint. Não há risco de violação. Item do PROJECT_SUMMARY pode ser removido.

### Bug encontrado no Modo B (chamada direta sem automation_id)

Quando o dispatcher é chamado sem `triggerTagSlug` (Modo B — chamada direta sem tag), o filtro `eligible` retorna **todas** as automações ativas:

```typescript
const eligible = automations.filter((auto) => {
  if (!triggerTagSlug) return true  // ← PASSA TUDO se não vier de um webhook de tag
  ...
})
```

Se alguém chamar `POST crm-dispatcher { user_id: "xxx" }` com 3 automações ativas, **as 3 disparariam simultaneamente** para o mesmo usuário — incluindo automações de abandon_cart, order_created e tag_added sem distinção. Isso é um bug de escopo do Modo B.

### Idempotência — comportamento atual

- Chave: `auto_{automation_id}_user_{user_id}` (linha 155: `crm-dispatcher/index.ts`)
- Uma vez `status='success'` em `crm_automation_runs`, nunca mais dispara
- Não há expiração ou janela temporal
- Para reenviar: precisa deletar o run manualmente via SQL

**Implicação para Sprint 1:** O novo motor de sequências **não pode usar esse modelo**. Cada step da sequência precisa de uma chave de idempotência própria (ex: `seq_{sequence_id}_user_{user_id}_step_{step_order}`).

### Estado do dispatcher

**Parcialmente funcional:**
- ✅ Código correto e completo para Modo A e B
- ✅ UAZAPI integrado (`/send/text` com número E.164)
- ✅ Fila com delay (`crm_dispatch_queue`) funcional
- ✅ Idempotência por run
- ⚠️ Database Webhook (gatilho de entrada do Modo A): **não confirmado** se está ativo em produção
- ⚠️ pg_cron (gatilho do queue-processor): **não confirmado** se está ativo
- ❌ Sem retry em falha de UAZAPI além do attempt_count da fila
- ❌ Modo B sem `triggerTagSlug` dispara todas as automações sem discriminação

---

## 3. Triggers, Webhooks e Crons

### Triggers SQL (confirmados no código)

| Trigger | Tabela | Evento | Função | Estado |
|---|---|---|---|---|
| `crm_events_apply_tags` | `crm_events` | AFTER INSERT | `apply_crm_tags_from_event()` | ✅ Confirmado — `000004` |
| `crm_automations_updated_at` | `crm_automations` | BEFORE UPDATE | `update_crm_automations_updated_at()` | ✅ Confirmado — `000001` |
| `crm_automation_runs_updated_at` | `crm_automation_runs` | BEFORE UPDATE | `update_crm_automation_runs_updated_at()` | ✅ Confirmado — `000001` |
| `crm_dispatch_queue_updated_at` | `crm_dispatch_queue` | BEFORE UPDATE | `update_crm_dispatch_queue_updated_at()` | ✅ Confirmado — `000007` |

### Database Webhook (Supabase Dashboard)

**Não confirmado.** O código do dispatcher suporta o Modo A (webhook de tag), mas a configuração do Database Webhook fica no Supabase Dashboard — não é versionada em código ou migration.

Evidências no código: comentário no `crm-dispatcher/index.ts` linha 12-14:
```typescript
// A) Supabase Database Webhook (INSERT em crm_customer_tags)
//    body = { type: 'INSERT', table: 'crm_customer_tags', record: { user_id, tag_id } }
//    → filtra automações com trigger_type='tag_added' e tag_slug correspondente
```

**Não há evidência de que esse webhook está ou esteve configurado em produção.** Precisa ser verificado manualmente no Supabase Dashboard > Database > Webhooks.

### pg_cron Jobs

**Não confirmados.** A migration `20250313000007` contém a instrução pg_cron **comentada**:

```sql
-- INSTRUCAO: execute este bloco SEPARADAMENTE no SQL Editor apos aplicar
-- a migration acima.
-- SELECT cron.schedule('crm-queue-processor', '* * * * *', $$...$$);
```

Outros jobs (release_expired_orders, detect_abandoned_carts) estão referenciados na arquitetura, mas as migrations que os configuram via pg_cron não foram analisadas nesta auditoria — marcados como "não confirmados nesta leitura."

### Jobs CRM identificados nas migrations

| Job | Função SQL | Frequência no código | Status |
|---|---|---|---|
| Liberar pedidos expirados | `release_expired_orders()` | a cada 5min (ref. na arquitetura) | Não confirmado |
| Detectar abandono de carrinho | `detect_abandoned_carts()` | a cada 10min (ref. na arquitetura) | Não confirmado |
| Processar fila de mensagens | `crm-queue-processor` (edge function) | a cada 1min (comentado no 000007) | **Não confirmado** |

### Event Types — Bug de constraint encontrado

O `n8n-sync-back/index.ts` registra evento `'profile_synced'` em `crm_events`. Porém, esse event_type **não está no CHECK constraint** da tabela:

```sql
-- 20250313000002: CHECK constraint atual de crm_events.event_type
CHECK (event_type IN (
  'visitou', 'visualizou_produto', 'adicionou_carrinho', 'iniciou_checkout',
  'comprou', 'abandonou', 'user_registered', 'purchase_completed',
  'cart_abandoned', 'checkout_abandoned', 'order_created', 'tag_added',
  'inactivity_detected'
  -- 'profile_synced' ← AUSENTE
))
```

Se o `n8n-sync-back` executar e tentar inserir `event_type='profile_synced'`, vai falhar com violação de CHECK constraint. Isso é um **bug silencioso** — a function provavelmente captura o erro e continua, mas o evento de auditoria nunca é registrado.

---

## 4. Riscos Bloqueadores para o Sprint 1

### Risco 1 — Modo B do dispatcher dispara todas as automações (ALTO)
**Arquivo:** `supabase/functions/crm-dispatcher/index.ts:137`  
Chamada direta sem `triggerTagSlug` ativa todas as automações da query, independente de trigger_type. Se 3 automações estiverem ativas e o dispatcher for chamado em Modo B sem automation_id específico, o usuário recebe 3 mensagens. O novo motor de sequências usará o Modo B para processar steps — isso precisa ser corrigido antes.

**Mitigação mínima:** O `crm-sequence-processor` (Sprint 1) sempre passará `automation_id` explícito, isolando o disparo. Mas a lógica permissiva do Modo B continua como armadilha para chamadas futuras.

### Risco 2 — pg_cron do queue-processor não confirmado (ALTO)
**Arquivo:** `supabase/migrations/20250313000007_crm_dispatch_queue.sql:131-150`  
Se o pg_cron não estiver ativo, mensagens com `delay_minutes > 0` ficam presas em `crm_dispatch_queue` com `status='pending'` para sempre. Não há forma de saber isso sem acessar o banco de produção.

**Verificação necessária antes do Sprint 1:**
```sql
SELECT * FROM cron.job WHERE jobname = 'crm-queue-processor';
```

### Risco 3 — Database Webhook não confirmado (ALTO)
Se o webhook de `crm_customer_tags` → `crm-dispatcher` não estiver configurado, **nenhuma automação dispara automaticamente**, nem as que vierem do Sprint 1. O motor de tags funciona (trigger SQL), mas o disparo de mensagem depende desse webhook externo.

**Verificação necessária:** Supabase Dashboard > Database > Webhooks.

### Risco 4 — event_type 'profile_synced' ausente no CHECK (MÉDIO)
**Arquivo:** `supabase/migrations/20250313000002_crm_events_rls_and_types.sql`  
O `n8n-sync-back` insere eventos `'profile_synced'` que violam o CHECK. Não afeta o Sprint 1 diretamente, mas ao expandir event_types para sequências (`sequence_enrolled`, `sequence_completed`, `seller_notified`), essa migration precisa ser revisada antes.

### Risco 5 — Idempotência permanente (MÉDIO)
**Arquivo:** `supabase/functions/crm-dispatcher/index.ts:155`  
Chave `auto_{id}_user_{id}` bloqueia re-envio permanentemente. O Sprint 1 não pode usar esse modelo para sequências multi-step. As sequências precisam de um novo padrão de idempotência por step.

**Não é bloqueador imediato** — o novo motor cria suas próprias tabelas. Mas as automações existentes mantêm o comportamento antigo até migração.

### Risco 6 — Automações legadas com trigger_type incompatível (BAIXO)
As automações #1, #2, #3 (foundation seeds) têm trigger_types (`abandon_cart`, `order_created`, `funnel_status_changed`) que o dispatcher não processa via webhook. Se forem ativadas por engano (SET is_active=true), elas nunca dispararão automaticamente mas consumirão query results e podem confundir o admin no CrmDebug.

**Recomendação:** Marcar como `is_active=false` explicitamente com um comentário no nome (ex: "LEGADO — Recuperação de Carrinho Abandonado") antes de iniciar o Sprint 1.

### Risco 7 — Template com variável {order_id} não resolvida (BAIXO)
**Arquivo:** `supabase/migrations/20250313000001_crm_foundation.sql:358`  
O template "Boas-vindas Pós-compra" usa `{order_id}`, mas `renderTemplate` no dispatcher só injeta `{nome}`:
```typescript
const message = renderTemplate(template, {
  nome: profile.full_name ?? 'Cliente',
  // order_id ← não injetado
})
```
Se essa automação for ativada, `{order_id}` será renderizado literalmente: `"Seu pedido #{order_id} foi recebido"`.

### Risco 8 — UAZAPI sem ambiente separado dev/prod (BAIXO-LATENTE)
A mesma instância UAZAPI é usada em dev e prod. Durante desenvolvimento e testes do Sprint 1, mensagens de teste podem ser enviadas para clientes reais se os secrets não forem diferenciados.

---

## 5. Branching e Estratégia de Entrega

### Situação atual
- Branch única: `main`
- Push to main = deploy automático no Vercel
- Migrations aplicadas manualmente no Supabase (não há migration runner automático)
- Sem staging environment

### Estratégia proposta: Feature Branches + Deploy Manual Controlado

```
main (produção)
  └── sprint-1/crm-sequences  ← branch de trabalho do Sprint 1
        └── feat/crm-seq-tables     ← sub-branch por entregável (opcional)
        └── feat/crm-inactivity-cron
        └── feat/crm-sequence-processor
```

**Regras mínimas:**

1. **Nunca commitar migrations direto na main** sem testar localmente com `supabase db diff` ou `supabase db reset`
2. **Toda migration nova**: testar em banco local (`npx supabase start`) antes de aplicar em produção
3. **Edge functions**: testar com `npx supabase functions serve` antes de deploy
4. **PR antes de merge**: mesmo que seja só revisão própria — força uma leitura do diff antes de ir para main
5. **Deploy de edge function**: separado do push da branch — `npx supabase functions deploy crm-sequence-processor --project-ref kjfsmwtwbreapipifjtu`
6. **Migrations em produção**: aplicadas **manualmente** via `npx supabase db push` ou SQL Editor, após validação local

### Como mitigar a ausência de staging

Sem staging real, o risco principal é aplicar uma migration quebrada em produção. Mitigações:

| Risco | Mitigação |
|---|---|
| Migration quebrada | Testar com `supabase db reset` localmente antes de qualquer push |
| Edge function com bug | `supabase functions serve` localmente + curl de teste antes do deploy |
| Envio acidental de WhatsApp | Criar seed de usuario de teste com número pessoal; automações novas sempre `is_active=false` |
| Rollback de migration | Criar migration de rollback explícita antes de aplicar qualquer ALTER TABLE destrutivo |
| Secrets errados | Supabase Secrets nunca compartilhados dev/prod — criar secrets com sufixo `_TEST` para dev |

**Fluxo de entrega recomendado para cada sprint:**

```
1. Criar branch: git checkout -b sprint-1/crm-sequences
2. Desenvolver + testar localmente (supabase start)
3. PR → revisar diff (migrations, types, edge functions)
4. Merge para main (frontend deploy automático via Vercel)
5. Aplicar migrations em produção (manual: SQL Editor ou supabase db push)
6. Deploy edge functions (manual: supabase functions deploy)
7. Verificar no CrmDebug que novas tabelas existem e RLS está ativo
8. Ativar automações/sequências somente após validação manual com usuário de teste
```

---

## 6. Logging e Observabilidade Atuais

### O que existe hoje

| O que logar | Onde fica | Conteúdo | Retenção |
|---|---|---|---|
| Execuções de automação | `crm_automation_runs` | payload, resposta UAZAPI, erro, attempt_count, status | Permanente (no banco) |
| Eventos de funil | `crm_events` | event_type, user_id, metadata JSONB | Permanente |
| Webhooks externos | `processed_webhooks` | source, external_id, payload, result | Permanente |
| Logs de edge functions | Supabase Dashboard (Logs) | `console.log/error` do Deno runtime | **Ephemeral — expira** |
| Fila de mensagens | `crm_dispatch_queue` | status, attempt_count, last_error, scheduled_at | Permanente |

### O que é possível investigar hoje

| Cenário | Possível? | Como |
|---|---|---|
| "Por que a mensagem X não foi enviada?" | Parcialmente | Verificar `crm_automation_runs` pelo user_id — mas só se houve tentativa |
| "A automação foi disparada?" | Parcialmente | Verificar `crm_automation_runs.status` e `idempotency_key` |
| "A UAZAPI retornou erro?" | Sim | `crm_automation_runs.action_response` e `error_message` |
| "O item da fila foi processado?" | Sim | `crm_dispatch_queue.status` + `last_error` |
| "O evento de compra foi registrado?" | Sim | `crm_events` WHERE event_type='purchase_completed' |
| "A tag foi atribuída?" | Sim | `crm_customer_tags` + timestamp |
| "O webhook do MercadoPago chegou?" | Sim | `processed_webhooks` WHERE source='mercadopago' |
| "O dispatcher foi chamado?" | Não | Logs de edge function são efêmeros — sem persistência |
| "O Database Webhook disparou?" | Não | Nenhum log persistente de webhooks Supabase |
| "Quantas mensagens foram enviadas hoje?" | Sim | COUNT em `crm_automation_runs` WHERE status='success' AND DATE(created_at)=today |

### Lacunas críticas de observabilidade

1. **Sem log persistente de invocações do dispatcher**: Não há registro de quantas vezes o webhook chamou o dispatcher, só dos runs que chegaram a criar um `crm_automation_runs`. Se o webhook falhar antes de criar o run, não há rastro.

2. **Sem alerta de falha de envio**: Se a UAZAPI retornar erro 500 repetidamente, o único sinal são registros `status='failed'` no banco — sem notificação ativa para o admin.

3. **Sem log de opt-out**: Não existe mecanismo de opt-out; quando implementado, precisa de log auditável.

4. **Sem contagem de taxa de entrega**: Não há campo `delivered_at` nem status além de `success`/`failed` — não é possível saber se a mensagem foi entregue ao destinatário final.

5. **Logs de edge function expiram**: `console.log` do crm-dispatcher são visíveis no Supabase Dashboard por ~1 hora. Para o Sprint 1, considerar logar erros críticos em `crm_events` com event_type dedicado (`'automation_error'`) para persistência.

---

## 7. Decisões Humanas Necessárias Antes do Sprint 1

### Obrigatório antes do Sprint 1

| # | Decisão | Contexto |
|---|---|---|
| D1 | **O Database Webhook está configurado em produção?** Verificar Supabase Dashboard > Database > Webhooks. Se não, decidir quando ativar. | Sprint 1 implanta novas tags e sequências — o webhook precisa estar ativo para automações funcionarem |
| D2 | **O pg_cron do crm-queue-processor está rodando?** Verificar: `SELECT * FROM cron.job WHERE jobname = 'crm-queue-processor';` | Mensagens com delay ficam travadas se o cron não estiver ativo |
| D3 | **Limpar automações legadas órfãs?** As 3 automações com trigger_type incompatível (#1, #2, #3) devem ser deletadas ou renomeadas como LEGADO | Evita confusão no CrmDebug e no novo motor de sequences |
| D4 | **Horário comercial para envio de WhatsApp?** Proposta: 8h–20h BRT | O sequence-processor precisa respeitar essa regra |
| D5 | **Limite de mensagens por usuário/dia?** Proposta: máximo 2 mensagens outbound/dia | Proteção contra spam e banimento da instância UAZAPI |

### Recomendado antes do Sprint 2

| # | Decisão | Contexto |
|---|---|---|
| D6 | **Regra de atribuição automática de seller para leads sem owner?** Round-robin, seller default, ou notificação central? | Sprint 2 envolve alertas para vendedora — precisa saber para quem enviar |
| D7 | **`sellers.phone` está populado e em formato válido (E.164)?** Verificar no banco. | Alertas para vendedora dependem de número válido |
| D8 | **Estratégia de namespace para novos event_types?** Adotar prefixo como `crm_*` para eventos internos vs `*` para eventos de funil? | Evita conflito de CHECK constraints ao adicionar `sequence_enrolled`, `seller_notified`, etc. |
| D9 | **Templates das automações de carrinho precisam ser revisados?** O template do #4 tem "Vimos que voce..." — língua informal; #3 usa `{order_id}` que não é injetado. | Resolver antes de ativar |

### Pode esperar (Sprint 3+)

| # | Decisão | Contexto |
|---|---|---|
| D10 | **Perguntas do fluxo de qualificação** — quais, em que ordem, qual scoring | Sprint 5 |
| D11 | **Meta Conversion API** — token configurado no Business Manager? | Sprint 6 |
| D12 | **Política de opt-out** — como o cliente solicita e como o sistema respeita | Sprint 4 (inbound) |
| D13 | **Estratégia de audience sync para Meta Lookalike** | Sprint 6 |
| D14 | **Carrinho server-side** — implementar para que mensagens de recuperação listem produtos | Backlog, depende de decisão de produto |

---

## 8. Recomendação Objetiva

### Pode começar Sprint 1 agora?

**Sim, com ressalvas.** O código base está sólido o suficiente. As 3 correções mínimas abaixo devem ser feitas **antes de escrever a primeira migration do Sprint 1**, não depois.

### Correções mínimas antes do Sprint 1

**Correção A — Verificar e registrar o estado real da infra (5 min)**

Executar no SQL Editor do Supabase:
```sql
-- 1. Verificar pg_cron jobs
SELECT jobname, schedule, command, active FROM cron.job;

-- 2. Verificar automações ativas
SELECT id, name, trigger_type, is_active FROM crm_automations ORDER BY created_at;

-- 3. Verificar fila atual
SELECT status, COUNT(*) FROM crm_dispatch_queue GROUP BY status;
```

E verificar no Dashboard: Supabase > Database > Webhooks.

Registrar resultado aqui para fechar as incertezas D1 e D2.

**Correção B — Adicionar event_types ausentes ao CHECK constraint**

Uma migration simples antes do Sprint 1 evita que novos event_types causem erros em produção:
```sql
-- Corrigir constraint para incluir events já em uso + eventos do Sprint 1
ALTER TABLE public.crm_events DROP CONSTRAINT crm_events_event_type_check;
ALTER TABLE public.crm_events ADD CONSTRAINT crm_events_event_type_check
  CHECK (event_type IN (
    'visitou', 'visualizou_produto', 'adicionou_carrinho', 'iniciou_checkout',
    'comprou', 'abandonou', 'user_registered', 'purchase_completed',
    'cart_abandoned', 'checkout_abandoned', 'order_created', 'tag_added',
    'inactivity_detected',
    'profile_synced',        -- usado em n8n-sync-back mas ausente hoje
    'sequence_enrolled',     -- Sprint 1
    'sequence_step_sent',    -- Sprint 1
    'sequence_completed',    -- Sprint 1
    'sequence_stopped',      -- Sprint 1
    'seller_notified'        -- Sprint 3
  ));
```

**Correção C — Desambiguar automações legadas (opcional mas recomendado)**

Renomear as automações #1, #2, #3 para indicar que são legado inativo:
```sql
UPDATE crm_automations SET name = '[LEGADO] Recuperação de Carrinho Abandonado' 
  WHERE name = 'Recuperação de Carrinho Abandonado';
UPDATE crm_automations SET name = '[LEGADO] Boas-vindas Pós-compra' 
  WHERE name = 'Boas-vindas Pós-compra';
UPDATE crm_automations SET name = '[LEGADO] Lembrete: Iniciou Checkout' 
  WHERE name = 'Lembrete: Iniciou Checkout';
```

### Ordem mais segura dos próximos prompts para Claude

```
Prompt 1 — Sprint 0 fix: migration de correção do CHECK constraint de event_types
            + verificação manual das incertezas D1/D2 (humano verifica, Claude documenta resultado)

Prompt 2 — Sprint 1 parte A: migrations das novas tabelas
            (crm_sequences, crm_sequence_steps, crm_sequence_enrollments, crm_message_log)
            + novas tags de sistema (cadastro-sem-compra, sem-compra-7d, etc.)
            + novas colunas em profiles (last_message_sent_at, opted_out_whatsapp)

Prompt 3 — Sprint 1 parte B: SQL functions de inatividade
            (detect_inactivity(), enroll_in_sequence(), stop_enrollments_on_purchase())
            + configuração pg_cron

Prompt 4 — Sprint 1 parte C: edge function crm-sequence-processor
            (substitui a lógica de step único do dispatcher para sequências)

Prompt 5 — Sprint 1 parte D: seeds das sequências
            (nutricao-pos-cadastro com 4 steps, delays, stop conditions)

Prompt 6 — Sprint 1 validação: checklist de testes manuais + ativação controlada
```

---

## Hotfix Candidates

Bugs inequívocos identificados — não corrigidos nesta tarefa, apenas documentados:

### HF-1 — event_type 'profile_synced' viola CHECK constraint
**Arquivo:** `supabase/functions/n8n-sync-back/index.ts` (insert de crm_event com type='profile_synced')  
**Constraint violada:** `crm_events_event_type_check` em `20250313000002_crm_events_rls_and_types.sql`  
**Impacto:** Auditoria de sync n8n nunca é registrada. Erro silencioso.  
**Fix:** Migration adicionando `'profile_synced'` ao CHECK (coberta pela Correção B acima).

### HF-2 — Template {order_id} não resolvido no dispatcher
**Arquivo:** `supabase/functions/crm-dispatcher/index.ts:183-185`  
**Template afetado:** Automação #2 "Boas-vindas Pós-compra" usa `{order_id}` no template  
**Impacto:** Se ativada, mensagem enviada com texto literal `{order_id}` ao cliente.  
**Fix:** Injetar `order_id` no `renderTemplate` OU remover `{order_id}` do template.

### HF-3 — Modo B do dispatcher: todas as automações disparam sem discriminação
**Arquivo:** `supabase/functions/crm-dispatcher/index.ts:137-143`  
**Condição:** Chamada sem `triggerTagSlug` (Modo B sem especificar tag)  
**Impacto:** Todas as automações ativas disparam para o usuário em uma única chamada.  
**Fix de menor impacto:** Documentar que o Modo B deve sempre usar `automation_id` explícito. Fix real: adicionar guard que só processa automações relevantes ao contexto de chamada.

### HF-4 — crm_automations.is_active DEFAULT true, seeds usam false
**Arquivo:** `supabase/migrations/20250313000001_crm_foundation.sql:118`  
```sql
is_active boolean NOT NULL DEFAULT true,  ← DEFAULT é true
```
**Impacto:** Qualquer nova automação criada via INSERT sem especificar `is_active` fica ativa imediatamente. O padrão de criar `is_active=false` é uma convenção dos seeds, não um default seguro da tabela.  
**Fix:** `ALTER TABLE crm_automations ALTER COLUMN is_active SET DEFAULT false;`  
Isso garante que novas automações sejam seguras por padrão.
