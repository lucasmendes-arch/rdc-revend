# CRM → n8n Outbox — Guia Operacional

## Visão geral

A tabela `integration_outbox` funciona como buffer de mensagens entre o banco e o n8n.
Triggers do Postgres inserem eventos; a edge function `integration-outbox-flush` lê em batch e entrega via HTTP POST ao webhook do n8n.

```
crm_events (INSERT)
  └─ trigger enqueue_lead_created()
       └─ INSERT integration_outbox (status=pending)

profiles (UPDATE)
  └─ trigger enqueue_profile_completed()
       └─ INSERT integration_outbox (status=pending)

[agendador]
  └─ POST /functions/v1/integration-outbox-flush
       ├─ claim_outbox_items() — FOR UPDATE SKIP LOCKED
       ├─ POST n8n webhook por item
       ├─ status=delivered  → sucesso
       ├─ status=pending    → retry agendado (backoff)
       └─ status=failed     → esgotou tentativas
```

---

## Parâmetros do worker

| Parâmetro | Valor | Onde alterar |
|---|---|---|
| Batch size | 10 itens/execução | `BATCH_SIZE` no index.ts |
| Max attempts | 5 (por item) | `max_attempts` na tabela (default) |
| Backoff | 2^attempt minutos (1, 2, 4, 8, 16 → max 60) | `MAX_BACKOFF_MINUTES` no index.ts |
| Timeout de travamento | 10 minutos | `reset_stuck_outbox_items()` na migration |

---

## Status dos itens

| Status | Significado |
|---|---|
| `pending` | Aguardando processamento (ou retry agendado via `next_retry_at`) |
| `processing` | Reivindicado pelo worker, envio em andamento |
| `delivered` | n8n retornou HTTP 2xx — entrega confirmada |
| `failed` | Esgotou `max_attempts` sem sucesso — requer intervenção manual |

> **Não existe status `acknowledged`.** A confirmação de processamento interno do n8n chega via `n8n-sync-back` que atualiza `profiles.lead_status` etc. — esses são eventos separados e não dependem do outbox.

---

## Variáveis de ambiente necessárias

```
N8N_WEBHOOK_URL     — URL do webhook receptor no n8n (obrigatório)
N8N_WEBHOOK_SECRET  — Enviado como header X-Webhook-Secret (opcional, mas recomendado)
```

---

## Como rodar manualmente

```bash
curl -X POST https://<project>.supabase.co/functions/v1/integration-outbox-flush \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Resposta esperada:
```json
{ "processed": 3, "delivered": 2, "retried": 1, "failed": 0 }
```

---

## Como agendar

### Opção recomendada: pg_cron (já usado no projeto)

O projeto já usa `pg_cron` para `partner_order_webhook`. Mesma abordagem:

```sql
SELECT cron.schedule(
  'flush-integration-outbox',
  '* * * * *',  -- a cada minuto
  $$
  SELECT net.http_post(
    url     := 'https://<project>.supabase.co/functions/v1/integration-outbox-flush',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
    ),
    body    := '{}'::jsonb
  )
  $$
);
```

> Verificar que `pg_net` e `pg_cron` estão habilitados no projeto antes de aplicar.
> Substituir `<project>` e `app.supabase_anon_key` com os valores reais.

### Alternativa: chamada externa

Qualquer scheduler externo (cron do servidor, GitHub Actions, n8n próprio) pode fazer POST para a URL acima a cada minuto. Útil se o pg_cron não estiver disponível.

---

## Investigar falhas

### Ver todos os itens com problema

```sql
SELECT
  id,
  event_type,
  user_id,
  status,
  attempt_count,
  max_attempts,
  last_http_status,
  last_error,
  next_retry_at,
  created_at
FROM integration_outbox
WHERE status IN ('failed', 'processing')
ORDER BY created_at DESC;
```

### Ver itens travados em processing

```sql
SELECT id, event_type, attempt_count, processed_at
FROM integration_outbox
WHERE status = 'processing'
  AND processed_at < now() - interval '10 minutes';
```

---

## Queries de observabilidade

### Dashboard de status

```sql
SELECT
  status,
  count(*)                                           AS total,
  count(*) FILTER (WHERE attempt_count > 0)          AS com_retries,
  max(attempt_count)                                 AS max_tentativas,
  min(created_at)                                    AS mais_antigo
FROM integration_outbox
GROUP BY status
ORDER BY status;
```

### Pendentes prontos para processar agora

```sql
SELECT count(*) AS elegíveis
FROM integration_outbox
WHERE status = 'pending'
  AND attempt_count < max_attempts
  AND (next_retry_at IS NULL OR next_retry_at <= now());
```

### Pendentes aguardando backoff

```sql
SELECT id, event_type, attempt_count, next_retry_at
FROM integration_outbox
WHERE status = 'pending'
  AND next_retry_at > now()
ORDER BY next_retry_at;
```

### Retries por evento

```sql
SELECT event_type, count(*) AS total, sum(attempt_count) AS total_tentativas
FROM integration_outbox
GROUP BY event_type
ORDER BY total_tentativas DESC;
```

---

## Como reprocessar um item falho

```sql
-- Reseta um item específico para pending (tentativas do zero)
UPDATE integration_outbox
SET
  status        = 'pending',
  attempt_count = 0,
  last_error    = NULL,
  next_retry_at = NULL
WHERE id = '<uuid-do-item>';
```

---

## Como cancelar um item problemático

```sql
UPDATE integration_outbox
SET status = 'failed', last_error = 'Cancelado manualmente em ' || now()::text
WHERE id = '<uuid-do-item>';
```

---

## Payload enviado ao n8n

```json
{
  "outbox_id":  "uuid",
  "event_type": "lead_created",
  "user_id":    "uuid",
  "payload":    { "full_name": "...", "email": "...", ... },
  "attempt":    1,
  "created_at": "2026-04-19T..."
}
```

O campo `outbox_id` permite ao n8n chamar `n8n-sync-back` correlacionando com o evento original se necessário.
