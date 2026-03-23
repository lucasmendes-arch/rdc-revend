# Registro de Prompts — Rei dos Cachos B2B

_Histórico dos prompts estruturados usados para implementação assistida por IA._
_Ferramenta principal: Claude Code (CLD). Ferramentas auxiliares: Antigravity/Gemini (ANT)._

---

## Convenção de IDs

```
RDC_{MÓDULO}_{ETAPA}_P{PARTE}_{FERRAMENTA}_V{VERSÃO}
```

Ferramentas: `CLD` = Claude Code · `ANT` = Antigravity/Gemini

Status possíveis: `DONE` · `DONE_COM_REVIEW` · `SKIPPED_BY_MERGE` · `READY_FOR_QA` · `PENDING` · `BLOCKED`

---

## CRM — Etapa 1

### RDC_CRM_E1_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Fundação do CRM — tabelas, RLS, seeds, debug screen.
**Resultado:** 6 tabelas criadas (`crm_events`, `crm_tags`, `crm_customer_tags`, `crm_automations`, `crm_automation_runs`, `processed_webhooks`), debug screen `/admin/crm`, seeds de tags e automações. Migration `20250313000001`.

---

## CRM — Etapa 2

### RDC_CRM_E2_P1_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Tracking real de eventos — backend (migrations, detect_abandoned_carts, webhook) e ajuste inicial de frontend.
**Resultado:** Policy INSERT em `crm_events` para usuários autenticados; `detect_abandoned_carts()` reescrita para emitir `cart_abandoned`; `webhook-mercadopago` com idempotência via `processed_webhooks` e inserção de `purchase_completed`. `useTrackInitiateCheckout` corrigido de `CHECKOUT_ABANDONED` → `'iniciou_checkout'`. Migrations `20250313000002`, `20250313000003`.

---

### RDC_CRM_E2_P2_ANT_V1
**Status:** DONE
**Ferramenta:** Antigravity/Gemini
**Data:** 2026-03-08
**Descrição:** Implementação frontend/core dos eventos CRM — integração de `crmService.trackEvent` nos hooks e páginas.
**Resultado:** Eventos de tracking integrados em `useSessionTracking.ts`, `Cadastro.tsx` e `crm.ts`. Criação de `src/types/crm.ts` e `src/services/crm.ts` com estrutura inicial de tipos e service.

---

### RDC_CRM_E2_P3_ANT_V2
**Status:** SKIPPED_BY_MERGE
**Ferramenta:** Antigravity/Gemini
**Data:** 2026-03-08
**Descrição:** Iteração planejada sobre frontend CRM — absorvida e substituída por RDC_CRM_E2_P4_CLD_V1.
**Resultado:** Conteúdo relevante incorporado na consolidação do P4. Prompt não executado de forma independente.

---

### RDC_CRM_E2_P4_CLD_V1
**Status:** DONE_COM_REVIEW
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Consolidação e ajuste fino da Etapa 2 — revisão técnica completa, correção de riscos residuais.
**Resultado:**
- `Cadastro.tsx`: `user.id` movido para dentro de `if(user)` — eliminado TypeError silencioso
- `crm.ts`: joins com FK inexistente removidos de `getAutomations()` e `getAutomationRuns()`; `triggered_at` → `created_at`
- `types/crm.ts`: `CrmRunStatus` corrigido (`'processing'` → `'running'`); `CrmEventRecord` adicionado; `CrmAutomationRun` reescrito com colunas reais; `CrmEvent` marcado `@deprecated`
- `useSessionTracking.ts`: import morto `CrmEventCode` removido; `useTrackPurchase` marcado `@deprecated`
- Build limpo confirmado

---

## Docs

### RDC_CRM_DOCS_P1_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Auditoria e criação da documentação operacional.
**Resultado:** Pasta `docs/` criada com `architecture.md`, `roadmap.md`, `decisions.md`, `prompt_registry.md`, `qa_checklists.md`, `backlog_future.md`. `README.md` reescrito.

---

### RDC_CRM_E2_P5_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Fechamento documental da Etapa 2 — atualização de status nos docs oficiais.
**Resultado:** `prompt_registry.md` com status e entradas faltantes; `roadmap.md` marcado READY_FOR_QA; `qa_checklists.md` expandido com queries SQL e estrutura executável.

---

### RDC_CRM_E2_P6_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Validação técnica do cenário de abandono e compra MercadoPago (Etapa 2 QA steps 5 e 6).
**Resultado:**
- detect_abandoned_carts(): validada tecnicamente — lógica, idempotência natural via status, SECURITY DEFINER, constraint cart_abandoned, cron job ativo (*/10 * * * *) confirmados por code review
- Compra MP — SQL simulation: processed_webhooks INSERT, crm_events purchase_completed INSERT, UPDATE result e idempotência ON CONFLICT todos validados via SQL Editor
- Bloqueios: sandbox MP vazio, sem acesso à internet no ambiente, sem service_role key — 2 itens do checklist dependem de pagamento real
- qa_checklists.md atualizado: 3/5 itens do step 5 marcados como validados

---

### RDC_CRM_E2_P7_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Fix do painel `/admin/crm` após QA — correção de schema mismatches entre código e banco real.
**Resultado:**
- `services/crm.ts`: `getCustomerTags()` — select corrigido de `added_by, created_at` → `source, assigned_by, assigned_at`
- `utils/crm.ts`: `getRunStatusInfo` — case `'processing'` (inexistente no DB) → `'running'`
- `pages/admin/CrmDebug.tsx`: 10+ fixes:
  - `supabase.rpc('get_all_profiles')` substituído por queries diretas em `profiles` e `client_sessions`
  - Inline runs query: join `(name, code)` → `(name)`; `.order('triggered_at')` → `.order('created_at')`
  - `auto.code` → `auto.trigger_type`; `auto.status === 'active'` → `auto.is_active`; `getAutomationStatusLabel` removido inline
  - `tag.code` → `tag.slug`; `getTagCategoryLabel(tag.category)` → `tag.type`
  - `ct.tag?.code` → `ct.tag?.slug`
  - `parseRunMetadata(run.metadata)` → `parseRunMetadata(run.action_payload)`
  - `run.triggered_at` → `run.created_at`; `run.error_log` → `run.error_message`
  - Imports desnecessários `getTagCategoryLabel`, `getAutomationStatusLabel` removidos
- Build limpo confirmado

---

### RDC_CRM_E2_P8_ANT_V1
**Status:** DONE
**Ferramenta:** Antigravity/Gemini
**Data:** 2026-03-08
**Descrição:** Correções de QA da Etapa 2 (Frontend/UX) — sobreposição do botão WhatsApp e deduplicação de carrinho.
**Resultado:** Botão oculto da rota `/checkout`. Deduplicação inteligente de array de produtos incrementada.

---

### RDC_CRM_E2_P9_ANT_V1
**Status:** DONE
**Ferramenta:** Antigravity/Gemini
**Data:** 2026-03-08
**Descrição:** Atualização Documental da Etapa 2 — registro de aprovação com ressalvas, prompts e itens novos de backlog futuro.
**Resultado:** Documentação sincronizada (`roadmap.md`, `prompt_registry.md`, `qa_checklists.md`, `backlog_future.md`).

---

## CRM — Etapa 3

### RDC_CRM_E3_P1_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Motor de tags híbridas — Etapa 3 P1. Trigger SQL AFTER INSERT em crm_events atribui/remove tags automaticamente em crm_customer_tags.
**Resultado:**
- Migration `20250313000004_crm_tag_engine.sql` criada
- `assign_crm_tag(user_id, slug, source)`: helper idempotente via ON CONFLICT DO NOTHING
- `remove_crm_tag(user_id, slug)`: remoção de tag ao avançar no funil
- `apply_crm_tags_from_event()`: trigger function SECURITY DEFINER, EXCEPTION capturado (nunca trava o INSERT)
- Trigger `crm_events_apply_tags` AFTER INSERT ON crm_events
- `backfill_crm_tags()`: retroativo para usuários existentes, executar via SQL Editor
- Seed `adicionou-carrinho` adicionado
- docs/roadmap.md e docs/qa_checklists.md atualizados

### RDC_CRM_E3_P3_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Dispatcher WhatsApp via UAZAPI — edge function crm-dispatcher com idempotência, rastreamento em crm_automation_runs e suporte a dois modos de invocação.
**Resultado:**
- `supabase/functions/crm-dispatcher/index.ts` criado e validado em produção
- Modo A: Supabase Database Webhook em crm_customer_tags INSERT (trigger por tag)
- Modo B: HTTP POST direto com user_id e automation_id opcional
- UAZAPI endpoint correto: `POST /send/text` com `token` no header e campo `text` (não `message`)
- Template rendering: substituição simples de `{variavel}`
- Phone sanitization: normaliza para DDI 55 + dígitos
- Idempotência: uma execução success por (automation_id × user_id)
- crm_automation_runs: criado como 'running', atualizado para 'success' ou 'failed'
- `supabase/migrations/20250313000005_crm_dispatcher_setup.sql` criado:
  - Fix de phone_field ('customer_whatsapp' → 'phone') em todas as automações
  - Automação de exemplo com trigger_type='tag_added' para abandonou-carrinho (is_active=false)
- Bug corrigido: seeds usavam phone_field='customer_whatsapp' que não existe em profiles
- **Validação em produção:** `dispatched: 1` confirmado — mensagem recebida no WhatsApp

---

### RDC_CRM_E3_P3_VAL_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-08
**Descrição:** Validação e correção do endpoint UAZAPI no crm-dispatcher.
**Resultado:**
- Endpoint `/send-message?token=TOKEN` retornava 405 — não existe na API UAZAPI
- Endpoint correto descoberto via testes: `POST /send/text` com `token` no header e body `{number, text}`
- `crm-dispatcher/index.ts` corrigido: endpoint, header token, campo `text`
- `action_payload` no run atualizado para `{number, text}` (consistência)
- Redeploy via `npx supabase functions deploy crm-dispatcher --project-ref kjfsmwtwbreapipifjtu`
- Teste final: `dispatched: 1, skipped: 0` — WhatsApp recebido com sucesso

---

### RDC_CRM_E4_P4_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-09
**Descrição:** Fila de disparo com delay — crm_dispatch_queue, crm-queue-processor, suporte a delay_minutes no dispatcher.
**Resultado:**
- `supabase/migrations/20250313000007_crm_dispatch_queue.sql` criado
- Tabela `crm_dispatch_queue` com status, scheduled_at, idempotency_key UNIQUE, attempt_count (máx 3)
- `claim_crm_queue_items()`: claim atômico FOR UPDATE SKIP LOCKED — safe para cron concorrente
- `reset_stuck_crm_queue_items()`: recupera itens presos em 'processing' >5min
- `supabase/functions/crm-queue-processor/index.ts` criado e deployado (`--no-verify-jwt`)
- `crm-dispatcher` atualizado: delay_minutes > 0 → enfileira; delay_minutes = 0 → envia imediato
- `force=true` bypassa fila e envia imediato (comportamento de disparo manual admin)
- Resposta do dispatcher estendida: `{ dispatched, skipped, queued }`
- Deploy: ambas as functions deployadas com `--no-verify-jwt`
- pg_cron: SQL fornecido para agendar a cada minuto via `net.http_post`

---

## CRM — Etapa 4 (continuação)

### RDC_CRM_E4_P1_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-09
**Descrição:** Seeds das automações operacionais da Etapa 4 — templates B2B, boas-vindas e fidelização.
**Resultado:**
- `supabase/migrations/20250313000006_crm_e4_automations.sql` criado
- Template de recuperação de carrinho atualizado (tom B2B)
- `CRM: Boas-vindas Novo Cliente` inserida com `ON CONFLICT DO NOTHING` (is_active=false)
- `CRM: Fidelizacao Cliente Recorrente` inserida com `ON CONFLICT DO NOTHING` (is_active=false)
- Ambas aguardam validação de templates com a equipe antes de ativar

---

### RDC_CRM_E4_P8_ANT_V1
**Status:** NOT_EXECUTED
**Ferramenta:** Antigravity/Gemini
**Data:** 2026-03-09
**Descrição:** Previsto para melhoria de UX do campo "Tags Vinculadas" e refinamentos de admin.
**Resultado:** Não executado — limite de contexto do Antigravity atingido no dia. Pendente para próxima sessão.

---

### RDC_CRM_E4_P10_CLD_V1
**Status:** DONE
**Ferramenta:** Claude Code
**Data:** 2026-03-09
**Descrição:** Fechamento documental do dia 2026-03-09 — atualização da documentação operacional para refletir estado consolidado da Etapa 4.
**Resultado:**
- `docs/current_status.md`: Etapa 4 atualizada para OPERATIONAL_V1, pendências e recomendações adicionadas
- `docs/roadmap.md`: Etapa 3 marcada QA_APPROVED, seção formal de Etapa 4 adicionada
- `docs/qa_checklists.md`: seção Etapa 4 com validações do dia e pontos de atenção
- `docs/prompt_registry.md`: P1, P8 e P10 registrados
- `docs/session_compact.md`: estado atual sincronizado
- `docs/backlog_future.md`: itens concluídos marcados, pendências de Etapa 4 adicionadas

---

## Template para novos prompts

```
### RDC_{MÓDULO}_{ETAPA}_P{N}_{FERRAMENTA}_V{N}
**Status:** PENDING
**Ferramenta:**
**Data:**
**Descrição:**
**Resultado:**
```
