# CRM ↔ n8n — Architecture Reset
> Consolidado em: 2026-04-20
> Status: **referência oficial de arquitetura a partir desta data**

---

## Nova Premissa

O n8n **não é** apenas um executor de ações externas.
O n8n **é** o orquestrador da máquina de estados do lead dentro do CRM.

| Camada | Responsabilidade |
|---|---|
| **CRM (Supabase)** | Fonte da verdade. Armazena estado, histórico, dados. Publica eventos. |
| **n8n** | Orquestrador. Decide sequências, delays, transições de estado. |
| **Canais (WhatsApp, email...)** | Executores. Realizam ações ordenadas pelo n8n. |

O CRM nunca decide "quando mandar follow-up" — isso é responsabilidade do n8n.
O n8n nunca guarda dados de negócio — devolve tudo ao CRM via `n8n-sync-back`.

---

## 1. Arquitetura atual confirmada

### Componentes existentes

| Componente | Tipo | Status | Descrição |
|---|---|---|---|
| `integration_outbox` | Tabela | ✅ Produção | Outbox canônico. Buffer de eventos CRM → n8n |
| `claim_outbox_items()` | RPC | ✅ Produção | Claim atômico com `FOR UPDATE SKIP LOCKED` |
| `reset_stuck_outbox_items()` | RPC | ✅ Produção | Itens travados em `processing` > 10min voltam a `pending` |
| `integration-outbox-flush` | Edge Function | ✅ Produção | Worker de relay: lê outbox, POSTa ao n8n, atualiza status |
| `n8n-sync-back` | Edge Function | ✅ Produção | Recebe callback do n8n, atualiza `profiles`, audita em `crm_events` |
| `enqueue_lead_created()` | Trigger function | ✅ Produção | Popula outbox quando `user_registered` é inserido em `crm_events` |
| `enqueue_profile_completed()` | Trigger function | ✅ Produção | Popula outbox quando perfil fica completo (document + address_city) |
| `crm_events` | Tabela | ✅ Produção | Log imutável de eventos de negócio por usuário |
| `crm_tags` / `crm_customer_tags` | Tabelas | ✅ Produção | Motor de tags: sistema e custom |
| `crm_automations` / `crm_automation_runs` | Tabelas | ✅ Produção | Automações WhatsApp via UAZAPI (engine interna legada) |
| `crm-dispatcher` | Edge Function | ✅ Produção | Dispara WhatsApp via UAZAPI — engine interna de automação |
| `crm-queue-processor` | Edge Function | ✅ Produção | Processa `crm_dispatch_queue` para envios com delay |
| `crm_dispatch_queue` | Tabela | ✅ Produção | Fila de envios WhatsApp com delay agendado |

### Campos do outbox que sustentam o worker

| Campo | Função |
|---|---|
| `status` | `pending → processing → delivered → failed` |
| `attempt_count` / `max_attempts` | Controle de tentativas |
| `next_retry_at` | Backoff exponencial (`2^attempt` minutos, máx 60) |
| `last_http_status` | HTTP status da última tentativa |
| `delivered_at` | Quando o n8n aceitou o POST |
| `acked_at` | Quando o n8n devolveu callback via `n8n-sync-back` |
| `idempotency_key` | Previne duplicatas (ex: `lead_created:{user_id}`) |

### Fluxos que já funcionam

```
[A] Registro → lead_created no outbox
    user_registered (crm_events)
      └─ enqueue_lead_created()
           └─ integration_outbox (status=pending)

[B] Perfil completo → profile_completed no outbox
    profiles UPDATE (document + address_city preenchidos)
      └─ enqueue_profile_completed()
           └─ integration_outbox (status=pending)

[C] Worker → relay ao n8n
    integration-outbox-flush (POST manual ou pg_cron)
      └─ claim_outbox_items() → POST n8n webhook
           ├─ sucesso → status=delivered, delivered_at
           ├─ falha parcial → status=pending, next_retry_at
           └─ exaustão → status=failed

[D] n8n → retorno ao CRM
    n8n-sync-back (POST com x-api-key)
      └─ atualiza profiles (clickup_task_id, lead_status, last_synced_at)
      └─ INSERT crm_events (profile_synced)
      └─ integration_outbox.acked_at = now()

[E] Engine interna WhatsApp (pré-n8n)
    crm_customer_tags INSERT
      └─ Database Webhook → crm-dispatcher
           └─ UAZAPI → WhatsApp
```

---

## 2. O que muda com a nova premissa

### Antes (arquitetura implícita)
```
CRM → outbox → n8n [cria task ClickUp] → devolve clickup_task_id
```
O n8n era usado como executor de uma ação pontual (criar task externa).
Cada evento gerava uma chamada → resposta → fim.

### Depois (nova arquitetura)
```
CRM → outbox → n8n [avalia estado do lead]
                  → decide: enviar mensagem? esperar? avançar estado?
                  → executa sequência com delays
                  → devolve transição de estado ao CRM
CRM → atualiza lead_status → pode gerar novo evento → n8n reage
```

O n8n passa a ser o **responsável pelo ciclo de vida do lead**:
- Recebe `lead_created` → inicia sequência de nutrição
- Recebe `lead_state_changed` → decide próxima ação
- Executa follow-ups com delays sem travar o CRM
- Devolve ao CRM apenas decisões de estado (`lead_status`, tags, `next_action`)

### Separação de responsabilidades redefinida

```
┌─────────────────────────────────────────────────────┐
│  CRM (Supabase)                                      │
│  - Fonte da verdade: profiles, orders, crm_events    │
│  - Publica eventos via integration_outbox            │
│  - Recebe atualizações de estado via n8n-sync-back   │
│  - NÃO decide quando agir sobre o lead               │
└──────────────────┬──────────────────────────────────┘
                   │ eventos (via outbox-flush)
┌──────────────────▼──────────────────────────────────┐
│  n8n (Orquestrador)                                  │
│  - Recebe eventos do CRM                             │
│  - Mantém estado interno da sequência (por lead)     │
│  - Decide: agir agora, esperar, pular, encerrar      │
│  - Agenda delays e follow-ups                        │
│  - Devolve transições de estado ao CRM               │
└──────────────────┬──────────────────────────────────┘
                   │ ações
┌──────────────────▼──────────────────────────────────┐
│  Canais / Executores                                 │
│  - WhatsApp (UAZAPI)                                 │
│  - Email, SMS (futuro)                               │
│  - Qualquer API externa                              │
└─────────────────────────────────────────────────────┘
```

---

## 3. O que continua válido sem mudança

| Componente | Por quê continua válido |
|---|---|
| `integration_outbox` + RPCs | Outbox pattern correto. `claim_outbox_items()` com SKIP LOCKED é adequado para qualquer payload. |
| `integration-outbox-flush` | Worker genérico — não está acoplado a tipo de evento. |
| `n8n-sync-back` | Contrato de retorno válido. Já aceita `outbox_id` para fechar ciclo. |
| `acked_at` em outbox | Rastreabilidade ponta a ponta. |
| `crm_events` como log imutável | Fonte de auditoria correta. Não muda. |
| `crm_tags` / `crm_customer_tags` | Sistema de tags é complementar. Tags são estado derivado, útil para segmentação. |
| `assign_crm_tag()` / `remove_crm_tag()` | Helpers corretos. O n8n pode solicitar atribuição/remoção de tags via `n8n-sync-back`. |
| Motor de tags (trigger em `crm_events`) | Continua válido para tags derivadas de eventos internos (comprou, abandonou). |
| RLS em todas as tabelas | Correto. Não muda. |

---

## 4. O que precisa ser reinterpretado

### 4.1 `lead_status` — definição atual é vaga

Hoje `profiles.lead_status` recebe valores livres como `'novo'`, `'em-contato'` etc., sem CHECK constraint.
O n8n como orquestrador vai escrever `lead_status` — **precisa de um contrato fixo**.

> Sem enum definido, dois workflows do n8n podem gravar valores diferentes para o mesmo estado.

### 4.2 Contratos de payload do outbox

O payload de `lead_created` foi desenhado para criar uma task no ClickUp (campos de endereço, `catalog_url`).
Na nova arquitetura, o n8n precisa de campos diferentes para **orquestrar estados**:
- qual é o `lead_status` atual ao enviar o evento?
- quais tags o lead tem nesse momento?
- o lead já teve alguma interação anterior?

O payload atual não carrega `current_lead_status` nem `current_tags`.

### 4.3 Contratos de callback (`n8n-sync-back`)

O `n8n-sync-back` aceita qualquer campo de `CLICKUP_OWNED_FIELDS`.
Na nova arquitetura, o n8n devolve **transições de estado**. Faz mais sentido ter:
- `lead_status` como campo de transição explícita (já existe como CLICKUP_OWNED)
- `next_action` / `next_action_at` (já existem em `profiles`)
- Mas não há campo explícito para "qual sequência do n8n está ativa para este lead"

### 4.4 Engine interna de WhatsApp (`crm-dispatcher` + `crm_automations`)

Existe um motor de automação interno (UAZAPI) que também envia WhatsApp.
Com o n8n como orquestrador, há dois sistemas fazendo decisões sobre quando contatar o lead.
**Isso cria risco de duplicidade de mensagens.**

A engine interna deve ser considerada legada ou complementar — não orquestradora.

### 4.5 Rastreabilidade do ciclo de automação

Hoje é possível rastrear o item do outbox (via `acked_at`), mas não é possível responder:
- "em qual step da sequência do n8n este lead está?"
- "quantas mensagens já foram enviadas para este lead nesta sequência?"
- "quando foi o último follow-up?"

Isso é dados de orquestração — devem ficar no CRM para visibilidade.

### 4.6 Eventos pouco semânticos para orquestração

Os eventos atuais em `crm_events` são orientados a funil de e-commerce (`visitou`, `adicionou_carrinho`).
Para o n8n orquestrar estados, são necessários eventos mais explícitos:
- `lead_state_changed` (com `from_state`, `to_state`)
- `followup_sent` (auditoria de mensagens enviadas)
- `customer_replied` (lead respondeu — decisão crítica para o n8n)

---

## 5. O que precisa ser ajustado

### Prioridade alta

| Ajuste | Motivo | Impacto |
|---|---|---|
| **Definir enum fixo para `lead_status`** | Sem isso, o n8n grava valores inconsistentes e o CRM não consegue filtrar estado com confiança | Alto |
| **Enriquecer payload do outbox com estado atual** | `current_lead_status` e `current_tags[]` ausentes no payload. O n8n precisa saber o estado do lead ao receber o evento, não só quem ele é. | Alto |
| **Adicionar campo `n8n_execution_id` em `profiles`** | Para rastrear "qual execução do n8n está ativa para este lead" — hoje impossível responder via SQL | Médio |

### Prioridade média

| Ajuste | Motivo | Impacto |
|---|---|---|
| **Criar evento canônico `lead_state_changed`** | Hoje não existe. É necessário para o n8n reagir a transições de estado. | Médio |
| **Desambiguar engine interna vs n8n** | `crm-dispatcher` e n8n podem conflitar. Definir quem faz o quê. | Médio |
| **Adicionar `n8n_sequence_step` em `profiles` ou em tabela separada** | Para responder "em qual step da sequência este lead está" | Médio |

### Prioridade baixa

| Ajuste | Motivo | Impacto |
|---|---|---|
| **Atualizar `CRM_N8N_FIRST_BUSINESS_FLOW.md`** | Documento foi escrito com premissa de ClickUp. Precisa refletir orquestração de estados. | Baixo |
| **Revisar `crm_automations` seeds** | Automações internas têm templates voltados a e-commerce genérico, não B2B cosméticos. | Baixo |

---

## 6. Proposta de arquitetura oficial

### Fluxo canônico

```
1. Evento de negócio ocorre no CRM
   → INSERT integration_outbox com payload enriquecido
     (inclui: event_type, user_id, payload, current_lead_status, current_tags)

2. integration-outbox-flush (pg_cron / minuto)
   → POST n8n webhook
     envelope: { outbox_id, event_type, user_id, payload, attempt, created_at }

3. n8n avalia o evento
   → consulta estado atual do lead (via payload ou via query ao Supabase se necessário)
   → decide: iniciar sequência / avançar step / encerrar / pausar
   → executa ação (WhatsApp, email, etc.)
   → POST n8n-sync-back com transição de estado

4. n8n-sync-back recebe transição
   → atualiza profiles: lead_status, n8n_execution_id, next_action, next_action_at
   → INSERT crm_events: lead_state_changed (from, to, source='n8n')
   → integration_outbox.acked_at = now()
```

### Princípios que governam as decisões

1. **O CRM nunca agenda ações temporais** — isso é do n8n
2. **O n8n nunca guarda estado permanente de negócio** — devolve tudo via sync-back
3. **Todo evento relevante vira registro em `crm_events`** — inclusive transições vindas do n8n
4. **Tags são estado derivado** — atribuídas pelo motor de tags ou pelo n8n via sync-back
5. **`lead_status` é o campo de estado primário** — deve ter valores canônicos fixos

### Quando usar tags vs campos vs eventos

| Necessidade | Mecanismo correto |
|---|---|
| Segmentação de lista ("todos os leads em nutrição") | `profiles.lead_status` (campo indexável) |
| Qualificação comportamental ("abandonou carrinho") | `crm_tags` (slug indexável) |
| Auditoria de o que aconteceu e quando | `crm_events` (log imutável) |
| Estado operacional atual do lead | `profiles.lead_status` + `profiles.next_action_at` |
| Rastrear execução ativa do n8n | `profiles.n8n_execution_id` (a implementar) |

---

## 7. Modelo de estado do lead

### Estados propostos

| Estado | Significado operacional | Quem transiciona |
|---|---|---|
| `novo` | Registrou, ainda não houve contato | Sistema (default) |
| `em_nutricao` | Sequência de follow-up em andamento pelo n8n | n8n |
| `em_contato` | Vendedor ou n8n enviou mensagem, aguarda resposta | n8n / Vendedor |
| `respondeu` | Lead respondeu a uma mensagem | n8n (via webhook de resposta) |
| `qualificado` | Lead confirmou interesse, apto para abordagem comercial | n8n / Vendedor |
| `convertido` | Realizou a primeira compra | Sistema (trigger em `orders`) |
| `recorrente` | Segunda compra ou mais | Sistema (trigger em `orders`) |
| `inativo` | Sem interação por período configurável | n8n (detecção de inatividade) |
| `pausado` | Fluxo pausado manualmente | Vendedor (admin) |
| `opt_out` | Solicitou não receber mais comunicações | n8n / Vendedor |

### Como implementar

```sql
-- Migration: adicionar CHECK constraint em profiles.lead_status
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_lead_status_check
  CHECK (lead_status IS NULL OR lead_status IN (
    'novo', 'em_nutricao', 'em_contato', 'respondeu',
    'qualificado', 'convertido', 'recorrente',
    'inativo', 'pausado', 'opt_out'
  ));
```

> `NULL` é permitido para compatibilidade com leads legados sem estado definido.
> Migrar gradualmente: primeiro definir o CHECK, depois preencher `lead_status = 'novo'` para registros NULL.

### Transições válidas (guia, não hard constraint)

```
novo ──────────────────► em_nutricao ──► em_contato ──► respondeu ──► qualificado ──► convertido
 │                           │               │                                              │
 └──────────────────────────►│               └──────────────────────────────────────────►  recorrente
                             │
                             └──► inativo ──► (reativação possível via lead_reactivated)
                             
qualquer estado ──► pausado (manual)
qualquer estado ──► opt_out (irreversível operacionalmente)
```

---

## 8. Eventos canônicos sugeridos

| Evento | Existe hoje? | Ação necessária |
|---|---|---|
| `user_registered` | ✅ Sim | Manter. Entry point do funil. |
| `lead_created` | ✅ Sim (no outbox, não em `crm_events`) | Considerar também registrar em `crm_events` para auditoria. |
| `profile_completed` | ✅ Sim | Manter. |
| `purchase_completed` | ✅ Sim | Manter. |
| `cart_abandoned` | ✅ Sim | Manter. |
| `tag_added` | ✅ Sim | Manter. |
| `profile_synced` | ✅ Sim | Manter. Renomear eventualmente para `n8n_callback_received`? |
| `lead_state_changed` | ❌ Não existe | **Criar.** Evento crítico para orquestração. Payload: `{ from, to, reason, source }` |
| `followup_sent` | ❌ Não existe | **Criar.** Auditoria de cada mensagem enviada pelo n8n. |
| `customer_replied` | ❌ Não existe | **Criar.** Sinaliza que o lead respondeu — gatilho para transição de estado. |
| `lead_reactivated` | ❌ Não existe | **Criar.** Quando inativo volta ao funil. |
| `lead_opted_out` | ❌ Não existe | **Criar.** Transição para `opt_out` — irreversível. |
| `inactivity_detected` | ✅ Sim (no CHECK mas sem trigger real) | Implementar trigger real de detecção. |
| `followup_step_due` | ❌ Não existe | **Opcional.** Caso o CRM queira agendar próximos steps (hoje delegado ao n8n). |

### Eventos derivados (não precisam ser criados — são deriváveis)

- "Lead está em nutrição há X dias" → query em `crm_events` por `lead_state_changed`
- "Lead foi contatado N vezes" → query em `crm_events` por `followup_sent`

---

## 9. Próximos prompts recomendados

**Ordem sugerida — cada um depende do anterior:**

```
1. RDC_BACK_LEAD_STATUS_ENUM_V1
   Criar migration com CHECK constraint para profiles.lead_status (enum canônico).
   Migrar leads NULL para 'novo'. Atualizar SCHEMA.md.

2. RDC_BACK_OUTBOX_PAYLOAD_ENRICH_V1
   Enriquecer payload do outbox para lead_created e profile_completed:
   adicionar current_lead_status e current_tags[] ao momento do enfileiramento.
   Atualizar enqueue_lead_created() e enqueue_profile_completed().

3. RDC_BACK_EVENT_LEAD_STATE_CHANGED_V1
   Criar evento canônico lead_state_changed em crm_events.
   Criar RPC set_lead_state(user_id, from_state, to_state, source, reason)
   que insere o evento e atualiza profiles.lead_status atomicamente.
   Usar essa RPC no n8n-sync-back ao receber transição de estado.

4. RDC_BACK_N8N_EXECUTION_TRACKING_V1
   Adicionar profiles.n8n_execution_id (text) para rastrear execução ativa.
   Permitir que n8n-sync-back grave/limpe esse campo.
   Queries SQL para responder: "quais leads têm execução ativa?".

5. RDC_BACK_CRON_OUTBOX_V1
   Configurar pg_cron para integration-outbox-flush.
   Seguir padrão de partner_order_webhook.
   Documentar e testar.

6. RDC_BACK_EVENT_FOLLOWUP_SENT_V1
   Criar evento followup_sent em crm_events.
   Permitir que n8n registre cada mensagem enviada via n8n-sync-back.
   Queries de auditoria: quantas mensagens por lead, última data de contato.

7. RDC_N8N_WORKFLOW_LEAD_NURTURING_V1
   Montar primeiro workflow real de nutrição no n8n:
   lead_created → delay 1h → WhatsApp → aguarda resposta.
   Usar contrato de callback atualizado (lead_state_changed).
```

---

## 10. Riscos de arquitetura

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| **Dois orquestradores conflitando** — `crm-dispatcher` (engine interna) e n8n enviando WhatsApp para o mesmo lead | Alta | Alto — lead recebe mensagem duplicada | Definir: n8n orquestra, engine interna só para casos sem n8n ativo |
| **`lead_status` sem enum** — n8n grava `"Em Contato"` e outro sistema espera `"em_contato"` | Alta | Alto — filtros e segmentação quebram silenciosamente | Migration com CHECK constraint (prompt 1) |
| **Payload pobre no outbox** — n8n recebe `lead_created` sem saber o estado atual do lead | Alta | Médio — n8n pode iniciar sequência para lead que já converteu | Enriquecimento de payload (prompt 2) |
| **Rastreabilidade parcial** — `acked_at` confirma callback mas não "qual step da sequência" | Média | Médio — impossível auditar ciclo de vida completo | `n8n_execution_id` + `followup_sent` eventos (prompts 4 e 6) |
| **pg_cron não agendado** — outbox acumula itens pendentes sem flush automático | Média | Alto — leads não recebem comunicação | Configurar cron (prompt 5) |
| **`opt_out` não implementado** — n8n não tem como registrar que lead não quer contato | Baixa | Alto — risco legal e de reputação | Evento `lead_opted_out` + estado `opt_out` antes de escalar volume |

---

## Decision Summary

### O que decidimos agora
- O n8n é o orquestrador da máquina de estados do lead, não apenas executor de ações pontuais
- `integration_outbox` + `integration-outbox-flush` + `n8n-sync-back` são a infraestrutura canônica — nada muda neles
- `lead_status` precisa de enum fixo — isso é pré-requisito para tudo que vem depois
- A engine interna (`crm-dispatcher`) é legada para os fluxos n8n — pode coexistir mas não orquestra
- Tags continuam como estado derivado complementar, não substituto de `lead_status`

### O que não vamos fazer
- Não criar engine de orquestração dentro do próprio Supabase — isso é do n8n
- Não duplicar lógica de delay/sequência no CRM — já existe no n8n
- Não substituir `crm_events` por outra estrutura — é o log canônico, permanece
- Não migrar `crm-dispatcher` agora — coexistência controlada até n8n cobrir os mesmos fluxos

### O que vem a seguir
1. **Migration `lead_status` enum** — sem isso o n8n não pode gravar estado de forma confiável
2. **Enriquecimento de payload** — o n8n precisa saber o estado atual ao receber o evento
3. **Evento `lead_state_changed`** — contrato canônico para transições de estado entre CRM ↔ n8n
