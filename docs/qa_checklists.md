# Checklists de QA — Rei dos Cachos B2B

_Validações manuais por etapa. Marcar com ✅ ao confirmar em produção._
_Executar as queries no SQL Editor do Supabase Dashboard._

---

## Etapa 2 — Tracking CRM · STATUS: QA_APPROVED_COM_RESSALVAS

> Implementação técnica concluída. Tracking de funil frontend (`user_registered`, `visitou`, `visualizou_produto`, `adicionou_carrinho`, `iniciou_checkout` e os bugs decorrentes de deduplicação agressiva / botões que sobrepunham UI) está **funcionando perfeitamente e validado de forma funcional na GUI**. O Event Abando (_cron_) também detecta e cria abandono. 
>  **Ressalvas de QA restantes:** O cenário 5 de `purchase_completed` foi avaliado apenas via injeções técnicas de webhook, _ainda pendendo simulação via transação real de cartão via Mercado Pago no frontend futuro para 100% de end-to-end check_.
> Responsável pelo QA: humano ou orquestradora.
> Etapa 3 **pode sofrer inicio após as observações acima**.

---

### 1. Pré-condições

```sql
-- Confirmar que as tabelas CRM existem
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'crm_%'
ORDER BY table_name;
-- Esperado: crm_automation_runs, crm_automations, crm_customer_tags, crm_events, crm_tags

-- Confirmar policy INSERT em crm_events para usuários
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'crm_events';
-- Esperado: admin_manage_crm_events (ALL) + auth_insert_own_crm_event (INSERT)

-- Confirmar constraint de event_type
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.crm_events'::regclass AND contype = 'c';
-- Esperado: lista com user_registered, purchase_completed, cart_abandoned, etc.
```

```
[ ] Tabelas crm_* existem (mínimo 5 tabelas)
[ ] Policy auth_insert_own_crm_event existe em crm_events
[ ] Constraint event_type inclui user_registered e purchase_completed
```

---

### 2. Cadastro de usuário → user_registered

**Ação:** Criar conta nova em `/cadastro`.

```sql
-- Verificar evento gerado
SELECT event_type, user_id, metadata, created_at
FROM crm_events
WHERE event_type = 'user_registered'
ORDER BY created_at DESC LIMIT 5;
```

```
[ ] Evento 'user_registered' aparece na tabela
[ ] metadata contém: name, email, business_type
[ ] user_id corresponde ao usuário criado (não é null)
[ ] Não apareceu mensagem de erro "Erro ao criar conta" na UI
```

---

### 3. Navegação no funil → eventos sequenciais

**Ação:** Logar com usuário de teste e navegar: catálogo → produto → carrinho → checkout.

```sql
-- Verificar sequência de eventos do usuário de teste
SELECT event_type, metadata, created_at
FROM crm_events
WHERE user_id = '<UUID_DO_USUARIO_TESTE>'
ORDER BY created_at DESC LIMIT 10;
```

```
[ ] Evento 'visitou' aparece ao acessar catálogo (com metadata.page)
[ ] Evento 'visualizou_produto' aparece ao abrir produto (com metadata.product)
[ ] Evento 'adicionou_carrinho' aparece ao adicionar item (com metadata.cart_items_count)
[ ] Evento 'iniciou_checkout' aparece ao abrir /checkout (com metadata.total_value)
[ ] client_sessions.status acompanha corretamente cada evento
```

---

### 4. Deduplicação

**Ação:** Visitar catálogo, sair e voltar imediatamente (< 10 segundos).

```sql
SELECT event_type, created_at
FROM crm_events
WHERE user_id = '<UUID_DO_USUARIO_TESTE>'
  AND event_type = 'visitou'
  AND created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;
```

```
[ ] Apenas 1 linha de 'visitou' em < 10s (dedup localStorage ativo)
[ ] Após aguardar 11s e revisitar → novo evento 'visitou' é criado
```

---

### 5. Compra confirmada via MercadoPago

> Requer pagamento real ou simulação de webhook via ferramenta externa. **(*Ressalva:* Validado apenas via testes lógicos, pende transação completa verídica via GUI e app bancário)**

```sql
-- Verificar idempotência
SELECT * FROM processed_webhooks
WHERE source = 'mercadopago'
ORDER BY processed_at DESC LIMIT 5;

-- Verificar evento de compra
SELECT event_type, metadata, created_at
FROM crm_events
WHERE event_type = 'purchase_completed'
ORDER BY created_at DESC LIMIT 5;

-- Verificar sessão atualizada
SELECT session_id, status, updated_at
FROM client_sessions
WHERE user_id = '<UUID_DO_USUARIO_TESTE>'
ORDER BY updated_at DESC LIMIT 1;
```

```
[✅] processed_webhooks aceita INSERT source='mercadopago' e result é atualizado após processamento
[✅] Evento 'purchase_completed' inserido em crm_events com metadata.order_id e metadata.amount
[✅] Idempotência: ON CONFLICT (source, external_id) bloqueia duplicata (0 rows affected)
[ ] client_sessions.status = 'comprou' — requer pagamento MP real aprovado (edge function completa)
[ ] Reenvio do mesmo webhook retorna {received: true, duplicate: true} — requer edge function completa
```
> Validação SQL direta: 3/5 itens confirmados em 2026-03-08 via SQL Editor (RDC_CRM_E2_P6_CLD_V1).
> Itens restantes dependem de pagamento MercadoPago real (sandbox vazio, sem acesso de rede no ambiente de execução).

---

### 6. Abandono de carrinho (cron)

**Ação:** Deixar sessão em status `adicionou_carrinho` sem finalizar.

```sql
-- Forçar para teste manual (apenas em ambiente de teste)
UPDATE client_sessions
SET updated_at = NOW() - INTERVAL '3 hours'
WHERE user_id = '<UUID_DO_USUARIO_TESTE>'
  AND status IN ('adicionou_carrinho', 'iniciou_checkout');

-- Executar detecção manualmente
SELECT detect_abandoned_carts();

-- Verificar resultado
SELECT status, updated_at FROM client_sessions
WHERE user_id = '<UUID_DO_USUARIO_TESTE>';

SELECT event_type, metadata, created_at FROM crm_events
WHERE user_id = '<UUID_DO_USUARIO_TESTE>'
  AND event_type = 'cart_abandoned'
ORDER BY created_at DESC LIMIT 3;
```

```
[ ] detect_abandoned_carts() retorna contagem > 0
[ ] client_sessions.status = 'abandonou'
[ ] Evento 'cart_abandoned' em crm_events com metadata.previous_status
[ ] Segunda execução de detect_abandoned_carts() NÃO cria evento duplicado (sessão já está 'abandonou')
```

---

### 7. Debug screen admin

**Ação:** Acessar `/admin/crm` com usuário admin.

```
[ ] Página carrega sem erro
[ ] Lista de clientes com sessão aparece na coluna esquerda
[ ] Ao selecionar cliente: seções Perfil, Sessão, Tags, Eventos, Pedidos, Runs, Automações exibidas
[ ] Tags ativas: vazia (nenhuma tag atribuída ainda — correto, Etapa 3)
[ ] Automações: 3 automações listadas como 'inativa'
[ ] Eventos recentes: sequência correta do funil visível
[ ] Runs recentes: vazio (correto — runs só existirão na Etapa 3)
```

---

### 8. Resultado geral

```
[ ] Todos os grupos acima passaram
[ ] Nenhum erro crítico no console do browser durante os testes
[ ] Nenhuma exception não tratada nas edge functions (verificar logs no Supabase Dashboard)
```

**Ao concluir:** atualizar o status da Etapa 2 em `docs/roadmap.md` de `READY_FOR_QA` para `✅ DONE` e liberar Etapa 3.

---

## Etapa 3 P3 — Dispatcher WhatsApp · STATUS: ✅ VALIDADO

> Deploy realizado. Endpoint UAZAPI correto: `POST /send/text` com token no header e campo `text`.
> Teste Mode B (HTTP POST direto): `dispatched: 1` — mensagem recebida no WhatsApp em 2026-03-08.
> Automação de recuperação de carrinho criada (is_active=false, ativar para produção).

```
[✅] Edge function crm-dispatcher deployada
[✅] Secrets UAZAPI_URL e UAZAPI_TOKEN configurados
[✅] Modo B testado: dispatched=1, mensagem WhatsApp recebida
[✅] Idempotência confirmada: segundo disparo retorna skipped=1
[✅] crm_automation_runs registra status 'success' com action_response
[ ] Modo A (Database Webhook) configurado no Supabase Dashboard
[ ] Automação ativada em produção para fluxo real
```

---

## Etapa 3 P1 — Motor de Tags · STATUS: READY_FOR_QA

> Migration `20250313000004` aplicada via `supabase db push`.

### 1. Verificar estrutura instalada

```sql
-- Confirmar tag adicionou-carrinho
SELECT slug, name, type FROM crm_tags ORDER BY created_at DESC LIMIT 5;

-- Confirmar trigger ativo
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'crm_events';
-- Esperado: crm_events_apply_tags, INSERT, AFTER

-- Confirmar funcoes criadas
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'assign_crm_tag', 'remove_crm_tag',
    'apply_crm_tags_from_event', 'backfill_crm_tags'
  );
-- Esperado: 4 linhas
```

```
[ ] Tag adicionou-carrinho existe em crm_tags
[ ] Trigger crm_events_apply_tags existe e é AFTER INSERT
[ ] 4 funcoes criadas
```

### 2. Backfill de usuarios existentes

```sql
SELECT backfill_crm_tags();
-- Retorna: numero de usuarios processados (pode ser 0 se banco estiver vazio)
```

```
[ ] Executado sem erro
[ ] Usuarios com orders.status='pago' receberam novo-cliente ou recorrente
[ ] Usuarios com cart_abandoned sem compra receberam abandonou-carrinho
```

### 3. Teste do trigger em tempo real

```sql
-- Usar user_id de um usuario de teste existente
-- Simular evento de adicionar ao carrinho
INSERT INTO public.crm_events (user_id, session_id, event_type, metadata)
VALUES (
  '<UUID_USUARIO_TESTE>',
  'user_<UUID_USUARIO_TESTE>',
  'adicionou_carrinho',
  '{"cart_items_count": 1}'::jsonb
);

-- Verificar tag atribuida automaticamente
SELECT ct.source, ct.assigned_at, t.slug, t.name
FROM crm_customer_tags ct
JOIN crm_tags t ON t.id = ct.tag_id
WHERE ct.user_id = '<UUID_USUARIO_TESTE>'
ORDER BY ct.assigned_at DESC;
-- Esperado: linha com slug='adicionou-carrinho', source='system'
```

```
[ ] Tag adicionou-carrinho atribuida automaticamente apos INSERT em crm_events
[ ] source = 'system'
[ ] Inserir mesmo evento novamente nao duplica a tag (idempotencia)
```

### 4. Teste de avanco de funil (purchase_completed remove tags de funil)

```sql
-- Simular compra do mesmo usuario
INSERT INTO public.crm_events (user_id, session_id, event_type, metadata)
VALUES (
  '<UUID_USUARIO_TESTE>',
  'user_<UUID_USUARIO_TESTE>',
  'purchase_completed',
  '{"order_id":"00000000-0000-0000-0000-000000000001","amount":500}'::jsonb
);

-- Verificar tags resultantes
SELECT t.slug FROM crm_customer_tags ct
JOIN crm_tags t ON t.id = ct.tag_id
WHERE ct.user_id = '<UUID_USUARIO_TESTE>';
-- Esperado: novo-cliente (se 1 pedido pago) OU recorrente (se 2+)
-- NAO esperado: adicionou-carrinho, iniciou-checkout, abandonou-carrinho
```

```
[ ] Tag novo-cliente OU recorrente atribuida
[ ] Tags de funil (adicionou-carrinho, etc.) removidas apos purchase_completed
[ ] Nenhum erro no console ou na query
```

### 5. Resultado geral

```
[ ] Todos os grupos acima passaram
[ ] Tags visiveis em /admin/crm ao buscar usuario de teste
[ ] Nenhuma exception nos logs do Supabase (Dashboard > Edge Functions > Logs)
```

**Ao concluir:** marcar esta secao como DONE e iniciar Etapa 3 P2 (painel admin de tags).

---

## Etapa 1 — Fundação CRM · STATUS: ✅ DONE

```
[✅] Migrations aplicadas via supabase db push
[✅] Tabelas crm_* existem no banco
[✅] pg_cron ativo (confirmado via Dashboard > Extensions)
[✅] RPC get_crm_customer_debug funciona
[✅] Debug screen /admin/crm carrega sem erro
[✅] Seeds: 6 tags de sistema visíveis no banco
[✅] Seeds: 3 automações visíveis e inativas
```

---

## Template para novas etapas

```markdown
## Etapa N — [Nome] · STATUS: READY_FOR_QA

> Descrição do contexto.

### 1. Pré-condições
\```sql
-- query de verificação
\```
\```
[ ] item
\```

### 2. [Cenário]
\```
[ ] passo
\```

### N. Resultado geral
\```
[ ] Todos os grupos passaram
\```
```
