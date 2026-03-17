# BaseOp — Decisões Arquiteturais

## D-01: Webhook na Vercel Edge Function, não no n8n direto

**Decisão:** O endpoint público do Telegram aponta para a Vercel, não para o n8n.

**Contexto:** n8n self-hosted pode reiniciar, cair ou ficar indisponível temporariamente. O Telegram reenvia mensagens se não receber 200.

**Consequência:** Edge Function sempre retorna 200. Se n8n estiver offline, a mensagem é perdida mas o Telegram não entra em loop de retry. Trade-off aceitável para MVP.

---

## D-02: gpt-4o-mini para classificação e resumo

**Decisão:** Usar `gpt-4o-mini` ao invés de `gpt-4o` ou modelos mais caros.

**Contexto:** A tarefa é simples (classificar tipo, gerar resumo curto, sugerir tags). Orçamento: $10/mês.

**Consequência:** 10x mais barato, latência menor. Se qualidade não for suficiente, upgrade pontual para `gpt-4o` é trivial (mudar model no nó do n8n).

---

## D-03: RLS service_role + anon SELECT

**Decisão:** Backend (n8n) acessa via service_role. Frontend (webapp) lê via anon key com SELECT público.

**Contexto:** Single-user MVP, sem autenticação no frontend. O webapp nunca escreve — toda escrita vem do n8n.

**Consequência:** Simples e seguro para single-user. Para multi-usuário (fase 2+), adicionar auth e RLS por user_id.

---

## D-04: Dedup e rate limit em memória na Edge Function

**Decisão:** Usar `Set` e `Map` em memória ao invés de Redis ou tabela no banco.

**Contexto:** Single-user, volume baixo. Edge Functions têm cold starts, mas o Telegram não reenvia se recebeu 200.

**Consequência:** Zero custo infra extra. Risco: cold start perde histórico de dedup, mas como retornamos 200, o Telegram não reenvia. Risco efetivo é nulo.

---

## D-05: TanStack Query com staleTime 60s + Realtime para invalidação

**Decisão:** Cache de 60s para todas as queries, com Supabase Realtime invalidando queries críticas (entries, tasks no Dashboard).

**Contexto:** Evitar refetch excessivo no free tier do Supabase. Realtime garante que dados críticos apareçam rápido.

**Consequência:** Páginas como Projects e Memory podem ter até 60s de delay. Aceitável para single-user.

---

## D-06: Nomes de colunas em português no schema

**Decisão:** Usar `nome`, `titulo`, `conteudo`, `resumo`, `estagio` ao invés de inglês.

**Contexto:** O usuário é brasileiro, os dados são em português, e o sistema é pessoal. Manter consistência com o domínio.

**Consequência:** Tipos TypeScript espelham os nomes em português. Tabela de nomenclatura em `memory.md` evita confusão.

---

## D-07: Vercel para frontend E edge function no mesmo projeto

**Decisão:** Frontend Vite e Edge Function `/api/telegram/webhook` vivem no mesmo repo e deploy.

**Contexto:** Simplificar infra. Vercel roteia `/api/*` para edge functions e `/*` para o SPA automaticamente.

**Consequência:** Um deploy = tudo atualizado. `vercel.json` com rewrites cuida do routing.
