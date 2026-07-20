# Primeiro Fluxo Real de Negócio — CRM ↔ n8n

## Evento escolhido: `lead_created`

### Por que `lead_created` e não `profile_completed`

| Critério | `lead_created` | `profile_completed` |
|---|---|---|
| Cobertura | 100% dos registros | Só usuários que preenchem documento + cidade |
| Trigger | INSERT em `crm_events` | UPDATE em `profiles` (condição edge) |
| Facilidade de teste | Criar usuário = evento | Exige preencher formulário completo |
| Campo chave garantido | `email` sempre presente | Todos os campos presentes |
| Posição no funil | Entrada — mais urgente para contato | Qualificação — usuário já converteu |

`lead_created` foi escolhido porque é o ponto de entrada no funil: o n8n deve ser notificado imediatamente para criar a task de CRM (ClickUp). Além disso, 100% dos registros disparam este evento, enquanto `profile_completed` pode nunca disparar para usuários que abandonam o onboarding.

---

## Arquitetura do fluxo

```
1. Usuário se registra
      └─ AFTER INSERT auth.users
           └─ trigger cria profiles
           └─ app insere crm_events(user_registered)

2. crm_events INSERT (user_registered)
      └─ trigger enqueue_lead_created()
           └─ INSERT integration_outbox(event_type='lead_created', status='pending')

3. [pg_cron a cada minuto]
      └─ POST /functions/v1/integration-outbox-flush
           └─ claim_outbox_items() — FOR UPDATE SKIP LOCKED
           └─ POST n8n webhook com payload
           └─ status → 'delivered', delivered_at = now()

4. n8n processa (cria task ClickUp, etc.)
      └─ POST /functions/v1/n8n-sync-back
           body: { user_id, source: 'n8n', outbox_id, fields: { clickup_task_id, lead_status } }
           └─ profiles.clickup_task_id = '<task-id>'
           └─ profiles.lead_status = 'em_contato'
           └─ profiles.last_synced_at = now()
           └─ crm_events INSERT (profile_synced)
           └─ integration_outbox.acked_at = now()
```

---

## Contrato do evento `lead_created`

### Payload enviado ao n8n (`integration_outbox.payload`)

```json
{
  "full_name":     "Maria Silva",       // nullable — pode ser null no momento do registro
  "email":         "maria@exemplo.com", // OBRIGATÓRIO — sempre presente
  "phone":         "5527999990000",     // nullable
  "business_type": "MEI",               // nullable
  "document_type": "CPF",               // nullable
  "document":      "123.456.789-00",    // nullable
  "address_city":  "Vitória",           // nullable
  "address_state": "ES",                // nullable
  "lead_source":   "site",             // sempre preenchido (default 'site')
  "registered_at": "2026-04-19T...",   // timestamp do evento user_registered
  "catalog_url":   "https://rdc-os.vercel.app/catalogo"
}
```

**Identificador de correlação:** `outbox_id` (UUID) — enviado pela edge function `integration-outbox-flush` no corpo do POST.

### Envelope completo enviado ao n8n

```json
{
  "outbox_id":  "uuid-do-item-no-outbox",
  "event_type": "lead_created",
  "user_id":    "uuid-do-usuario",
  "payload":    { ...campos acima... },
  "attempt":    1,
  "created_at": "2026-04-19T..."
}
```

---

## Retorno esperado do n8n → `n8n-sync-back`

O n8n deve chamar `POST /functions/v1/n8n-sync-back` com:

```json
{
  "user_id":   "uuid-do-usuario",
  "source":    "n8n",
  "outbox_id": "uuid-do-item-no-outbox",
  "fields": {
    "clickup_task_id": "abc123xyz",
    "lead_status":     "em_contato"
  }
}
```

**Header obrigatório:** `x-api-key: <N8N_SYNC_API_KEY>`

### O que muda no CRM após o retorno

| Campo em `profiles` | Valor | Regra |
|---|---|---|
| `clickup_task_id` | ID da task criada | Sempre sobrescrito (ClickUp-owned) |
| `lead_status` | `"em_contato"` | Sempre sobrescrito (ClickUp-owned) |
| `last_synced_at` | now() | Sempre atualizado |
| `updated_by` | `"n8n"` | Sempre atualizado |

**No outbox:**
- `integration_outbox.acked_at` → timestamp do callback

**Em `crm_events`:**
- INSERT com `event_type = 'profile_synced'` e metadata dos campos atualizados

---

## Rastreabilidade ponta a ponta

### 1. O evento entrou no outbox?

```sql
SELECT id, status, attempt_count, created_at, delivered_at, acked_at
FROM integration_outbox
WHERE event_type = 'lead_created'
  AND user_id = '<uuid>'
ORDER BY created_at DESC
LIMIT 1;
```

### 2. Foi enviado ao n8n?

```sql
-- delivered_at preenchido = n8n aceitou o POST
SELECT status, delivered_at, last_http_status
FROM integration_outbox
WHERE event_type = 'lead_created'
  AND user_id = '<uuid>';
```

### 3. O n8n processou e retornou?

```sql
-- acked_at preenchido = n8n chamou n8n-sync-back com outbox_id
SELECT acked_at, delivered_at,
       (acked_at - delivered_at) AS tempo_processamento_n8n
FROM integration_outbox
WHERE event_type = 'lead_created'
  AND user_id = '<uuid>';
```

### 4. O CRM recebeu a volta?

```sql
SELECT clickup_task_id, lead_status, last_synced_at, updated_by
FROM profiles
WHERE id = '<uuid>';
```

### 5. Qual dado mudou?

```sql
SELECT metadata, created_at
FROM crm_events
WHERE user_id = '<uuid>'
  AND event_type = 'profile_synced'
ORDER BY created_at DESC
LIMIT 3;
```

### Dashboard completo do fluxo para um usuário

```sql
SELECT
  o.id           AS outbox_id,
  o.status,
  o.attempt_count,
  o.created_at   AS enfileirado_em,
  o.delivered_at AS enviado_ao_n8n_em,
  o.acked_at     AS n8n_retornou_em,
  p.clickup_task_id,
  p.lead_status,
  p.last_synced_at
FROM integration_outbox o
JOIN profiles p ON p.id = o.user_id
WHERE o.event_type = 'lead_created'
  AND o.user_id = '<uuid>';
```

---

## Teste manual ponta a ponta

### Pré-requisitos

- [ ] Migration `20260419000002` aplicada
- [ ] Migration `20260419000003` aplicada
- [ ] `N8N_WEBHOOK_URL` configurado nos secrets da edge function
- [ ] `N8N_WEBHOOK_SECRET` configurado (opcional)
- [ ] `N8N_SYNC_API_KEY` configurado nos secrets de `n8n-sync-back`
- [ ] Edge functions `integration-outbox-flush` e `n8n-sync-back` deployadas

### Passo 1 — Criar usuário de teste

```bash
# Via Supabase Auth (usando a API pública do projeto)
curl -X POST https://<project>.supabase.co/auth/v1/signup \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email": "teste-outbox@rdc.test", "password": "senha123"}'
```

### Passo 2 — Verificar item no outbox

```sql
SELECT id, status, payload->>'email' AS email, created_at
FROM integration_outbox
WHERE event_type = 'lead_created'
ORDER BY created_at DESC
LIMIT 1;
-- Esperado: status = 'pending'
```

### Passo 3 — Disparar o flush manualmente

```bash
curl -X POST https://<project>.supabase.co/functions/v1/integration-outbox-flush \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
# Esperado: { "processed": 1, "delivered": 1, "retried": 0, "failed": 0 }
```

### Passo 4 — Confirmar entrega

```sql
SELECT status, delivered_at, last_http_status
FROM integration_outbox
WHERE event_type = 'lead_created'
ORDER BY created_at DESC LIMIT 1;
-- Esperado: status = 'delivered', delivered_at preenchido, last_http_status = 200
```

### Passo 5 — Simular retorno do n8n

```bash
curl -X POST https://<project>.supabase.co/functions/v1/n8n-sync-back \
  -H "x-api-key: <N8N_SYNC_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id":   "<uuid-do-usuario>",
    "source":    "n8n",
    "outbox_id": "<uuid-do-item-no-outbox>",
    "fields": {
      "clickup_task_id": "TEST-001",
      "lead_status":     "em_contato"
    }
  }'
# Esperado: { "ok": true, "fields_updated": ["clickup_task_id","lead_status",...], "outbox_acked": true }
```

### Passo 6 — Validar ciclo completo

```sql
SELECT
  o.status,
  o.delivered_at IS NOT NULL AS enviado,
  o.acked_at IS NOT NULL     AS acked,
  p.clickup_task_id,
  p.lead_status
FROM integration_outbox o
JOIN profiles p ON p.id = o.user_id
WHERE o.event_type = 'lead_created'
  AND o.user_id = '<uuid>';
-- Esperado: status=delivered, enviado=true, acked=true, clickup_task_id='TEST-001', lead_status='em_contato'
```

---

## Critérios de sucesso

- [ ] Item aparece em `integration_outbox` com `status=pending` após registro
- [ ] Após flush: `status=delivered`, `delivered_at` preenchido, `last_http_status=200`
- [ ] Após callback do n8n: `acked_at` preenchido, `outbox_acked=true` na resposta
- [ ] `profiles.clickup_task_id` atualizado
- [ ] `profiles.lead_status` atualizado para `'em_contato'`
- [ ] `crm_events` contém entrada `profile_synced` com `fields_updated` listando os campos

---

## Configuração n8n (referência para quem montar o workflow)

O workflow n8n deve:

1. **Webhook trigger** — recebe POST do `integration-outbox-flush`
2. **Extrair** `body.user_id`, `body.payload.email`, `body.outbox_id`
3. **Criar task no ClickUp** com os dados do lead
4. **HTTP Request** → `POST n8n-sync-back` com:
   ```json
   {
     "user_id":   "{{ $json.user_id }}",
     "source":    "n8n",
     "outbox_id": "{{ $json.outbox_id }}",
     "fields": {
       "clickup_task_id": "{{ $json.clickup_task_id }}",
       "lead_status":     "em_contato"
     }
   }
   ```
   Header: `x-api-key: <N8N_SYNC_API_KEY>`
