# Escuta de WhatsApp (log passivo de conversas)

Fundação para acompanhar as conversas das unidades: tempo até a primeira
resposta, conversas sem atendimento e, no futuro, pós-atendimento e resumo por
LLM. **Nesta etapa só existe a escuta e o log.**

> **100% passivo.** Nenhum código daqui chama endpoint da Uazapi: não envia,
> não marca como lido, não simula "digitando". A única chamada à Uazapi é a
> configuração do webhook (abaixo), feita à mão.

## Como funciona

```
Uazapi ──POST──▶ edge fn webhook-uazapi ──▶ whatsapp_raw_events (bruto, idempotente)
                  │ 1. confere segredo          │
                  │ 2. descarta grupo/status/   ▼ whatsapp_process_raw_event()  (na hora, em 2º plano;
                  │    eventos que não são msg     │                            cron de 1 min reprocessa)
                  │ 3. token → instância em escuta ├─▶ phone_br_key → conciliação com trinks_clients
                  └ 4. responde 200                ├─▶ whatsapp_contacts (sem cadastro único / LID)
                                                   ├─▶ whatsapp_conversations (regra de silêncio)
                                                   └─▶ whatsapp_messages (append-only)
```

- Migration: `supabase/migrations/20261010000001_whatsapp_listener.sql`
- Parser do payload: `supabase/functions/_shared/uazapi-message.ts` (+ `.test.ts`)
- Edge function: `supabase/functions/webhook-uazapi/index.ts`
- Tela: `/admin/crm/conversas` (só admin)

### Regras

- **Telefone:** `phone_br_canonical()` (55 + DDD + número) e `phone_br_key()`
  (DDD + 8 últimos dígitos) são a única regra do sistema. `normalize_phone_br()`
  do RH virou apelido de `phone_br_key()`. Placeholder (`0000-0000`,
  `11111-1111`), DDD inexistente, DDD digitado duas vezes, número truncado e
  número internacional dão `NULL`. Casos: `supabase/tests/phone_br_cases.json`.
- **Idempotência:** `UNIQUE (instance_id, provider_message_id)` no bruto e nas
  mensagens. Reentrega da Uazapi responde 200 sem duplicar.
- **Conversa = telefone × instância** (`party_key`). Mensagem nova (recebida ou
  enviada) entra na conversa cujo silêncio não passou do limite; senão a
  anterior fecha (`closed_at = última mensagem + limite`) e abre outra.
  Mensagens fora de ordem entram na conversa cuja janela as cobre.
- **Primeira resposta:** `first_outbound_at` = 1º envio de qualquer tipo;
  `first_human_reply_at` = 1º envio **não-API** depois da 1ª mensagem recebida.
  Tempo de resposta = `first_human_reply_at - first_inbound_at`. Reações não
  contam em nada.
- **Conciliação** (rede toda, `phone_1` e `phone_2`): uma cliente → `matched`.
  Mais de uma → fica a da unidade da instância, se for só uma. Empate que
  persiste → `shared` ("telefone compartilhado"), com as empatadas em
  `ambiguous_client_ids`; nunca se escolhe uma no chute. Nenhuma → `unmatched`
  e vira `whatsapp_contacts`. Só LID, sem telefone → `unresolved_lid`, também
  vira contato (`party_key = 'lid:<jid>'`) para análise.
- **Append-only:** trigger bloqueia `UPDATE`/`DELETE` em `whatsapp_messages`
  (só aceita FK virando `NULL` por `ON DELETE SET NULL`).

## Variáveis de ambiente e configuração

| Onde | Nome | Para quê |
|---|---|---|
| Secrets das edge functions | `UAZAPI_WEBHOOK_SECRET` | Segredo compartilhado do webhook (já existe no cofre, de 2026-07-27). Sem ele, a função rejeita tudo. |
| Secrets das edge functions | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Padrão do Supabase. |
| Banco: `whatsapp_listen_settings` | `conversation_gap_hours` (padrão **12**) | Limite de silêncio da conversa. Editável sem deploy. |
| Banco: `whatsapp_listen_settings` | `raw_retention_days` (padrão `NULL`) | `NULL` guarda o bruto para sempre. Com valor, o job horário apaga o bruto processado mais velho que isso. |
| Banco: `whatsapp_instances` | `store_id`, `role`, `phone_number`, `listen_enabled` | Só instâncias com `listen_enabled = true` são gravadas. |

`SUPABASE_ACCESS_TOKEN` (em `.env.local`) só é usado pelos scripts de teste.

## Ligar a escuta de uma instância

### 1. Marcar a instância no banco

```sql
-- Se a instância ainda não está em whatsapp_instances, cadastre pela tela de
-- instâncias (Automações do RH) ou por admin_upsert_whatsapp_instance().
UPDATE whatsapp_instances
   SET store_id = (SELECT id FROM stores WHERE slug = 'linhares'),
       role = 'atendimento',
       phone_number = '55279XXXXXXXX',
       listen_enabled = true
 WHERE name = '<nome exato da instância>';
```

O webhook identifica a instância pelo `token` que a Uazapi manda no payload,
comparado com `whatsapp_instances.uazapi_token`. Token desconhecido ou
instância com `listen_enabled = false` → 200 e nada é gravado.

### 2. Conferir se a instância já tem webhook

```bash
curl -s https://reidoscachos.uazapi.com/webhook -H "token: $TOKEN_DA_INSTANCIA"
```

Sempre devolve um array. Anote o que já existe (n8n, chatbot etc.).

### 3. Adicionar o nosso SEM sobrescrever

**Use `"action": "add"`.** Sem `action`, a Uazapi opera no "modo simples" e
**substitui** o webhook existente.

`$WEBHOOK_URL` = `https://sivbyjwhmeftmtlghmnz.supabase.co/functions/v1/webhook-uazapi`
mais o parâmetro de query `secret` com o valor de `UAZAPI_WEBHOOK_SECRET`. A
Uazapi não deixa configurar header no webhook, por isso o segredo vai na query.

```bash
curl -s -X POST https://reidoscachos.uazapi.com/webhook \
  -H "token: $TOKEN_DA_INSTANCIA" -H "Content-Type: application/json" \
  -d '{
    "action": "add",
    "enabled": true,
    "url": "'"$WEBHOOK_URL"'",
    "events": ["messages"],
    "excludeMessages": ["isGroupYes"],
    "addUrlEvents": false,
    "addUrlTypesMessages": false
  }'
```

- **Não** use `excludeMessages: ["wasSentByApi"]`, que a doc da Uazapi sugere
  contra loop. Aqui não há loop (não enviamos nada) e os envios por API
  precisam entrar no log para `first_outbound_at`.
- Depois, rode o `GET /webhook` de novo e confira que os webhooks antigos
  continuam lá, junto com o nosso.
- Diagnóstico de entrega: `GET /webhook/errors` (token da instância).

### 4. Conferir

Mande uma mensagem de outro celular para o número da unidade e responda pelo
aparelho. Em até alguns segundos ela deve aparecer em `/admin/crm/conversas`.

```sql
SELECT status, status_reason, count(*) FROM whatsapp_raw_events GROUP BY 1, 2;
```

## Backfill do `phone_key`

Não precisa rodar nada: `trinks_clients.phone_key` e `phone_2_key` são colunas
**geradas**. O backfill de toda a base aconteceu no `ALTER TABLE` da migration,
e todo import/webhook do Trinks já grava a chave.

Se a regra de `phone_br_canonical()` mudar no futuro, recalcule com:

```sql
UPDATE trinks_clients SET phone_1 = phone_1;
REINDEX INDEX idx_candidates_phone_key;  -- índice de expressão do RH
```

## Taxa de conciliação

Na tela `/admin/crm/conversas` (cards no topo, filtráveis por unidade) ou:

```sql
SELECT whatsapp_reconciliation_stats();               -- rede toda
SELECT whatsapp_reconciliation_stats('<store_id>');   -- uma unidade
```

Devolve `total` (números únicos com conversa), `matched`, `unmatched`,
`shared`, `unresolved_lid` e `match_rate` (%), pela identificação mais
recente de cada número.

A reconciliação de contatos roda de hora em hora (`whatsapp-reconcile`): número
que era "sem cadastro" e ganhou cadastro único no Trinks passa a apontar para a
cliente, junto com as conversas dele. Para rodar na hora:
`SELECT whatsapp_reconcile_contacts();`

## Telefones compartilhados (limpeza no Trinks)

```sql
-- Prováveis cadastros duplicados: mesmo telefone e mesmo primeiro nome.
SELECT phone_key, clients_count, names, phones, trinks_client_ids, registered_on, last_appointment_on
  FROM crm_shared_phone_groups_v
 WHERE same_first_name
 ORDER BY clients_count DESC, phone_key;
```

Sem o filtro `same_first_name`, a view lista todos os telefones usados por mais
de uma cliente (mãe e filha etc.).

## Mensagens automáticas (ausência/saudação)

A mensagem automática do WhatsApp Business sai do próprio aparelho e chega
igual a uma resposta digitada (`wasSentByApi = false`, nenhum campo a
distingue). Para ela não virar "tempo de resposta de 2 segundos", cadastre o
texto em `whatsapp_auto_reply_texts`. O envio igual (sem diferença de
maiúsculas e espaços) continua no log e em `first_outbound_at`, mas não conta
em `first_human_reply_at`. Cadastrar ou remover um texto recalcula as conversas
da instância (trigger).

```sql
-- Copiando de um envio real (mais seguro que digitar o texto):
INSERT INTO whatsapp_auto_reply_texts (instance_id, label, body)
SELECT instance_id, 'Fora do horário', body FROM whatsapp_messages WHERE id = '<id da mensagem>';
```

Cadastrado: Colatina, "Fora do horário" (2026-10-10).

## Jobs (pg_cron)

| Job | Quando | O quê |
|---|---|---|
| `whatsapp-process-pending` | todo minuto | reprocessa bruto pendente há mais de 30s ou com erro (até 5 tentativas) |
| `whatsapp-close-stale` | a cada 15 min | fecha conversas abertas que passaram do limite de silêncio |
| `whatsapp-reconcile` | minuto 12 de cada hora | reconcilia contatos com o CRM + limpa o bruto (se `raw_retention_days`) |

## Testes

```bash
npx vitest run supabase/functions/_shared/uazapi-message.test.ts   # parser do payload
npm run test:phone      # casos de telefone contra phone_br_canonical/phone_br_key no banco
npm run test:whatsapp   # fumaça ponta a ponta no banco (desfeito no final, não grava nada)
```

## Fora do escopo desta etapa

Classificação/resumo por LLM (os campos `intent`, `sentiment`, `summary`,
`summary_model`, `summarized_at` de `whatsapp_conversations` estão vazios de
propósito), pós-atendimento, conversa → agendamento, número de massa e
qualquer envio.
