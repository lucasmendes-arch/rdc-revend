# BaseOp — Memória do Projeto

Documento vivo. Atualizar ao final de cada sessão de trabalho.

---

## Contexto

BaseOp é um sistema pessoal de produtividade para um empreendedor com múltiplos projetos paralelos (salões de beleza, SaaS, automações, conteúdo). O problema central: perda de contexto entre sessões e ferramentas. A solução: captura rápida via Telegram → processamento IA → persistência Supabase → visualização webapp.

## Decisões Importantes

| # | Decisão | Razão | Data |
|---|---------|-------|------|
| D-01 | Webhook na Vercel, não no n8n direto | Endpoint público estável mesmo com n8n reiniciando | 2026-03-15 |
| D-02 | `gpt-4o-mini` para classificação | Suficiente para resumo/tags, custo 10x menor que gpt-4o | 2026-03-15 |
| D-03 | RLS service_role + anon SELECT | Single-user MVP, sem auth. Frontend só lê | 2026-03-15 |
| D-04 | `VITE_` prefix nas env vars | Vite só expõe variáveis com esse prefixo ao browser | 2026-03-15 |
| D-05 | TanStack Query staleTime 60s | Evita refetch excessivo, Realtime cuida de updates críticos | 2026-03-15 |
| D-06 | Dedup + rate limit em memória na Edge Function | Suficiente para single-user, sem custo de DB extra | 2026-03-15 |
| D-07 | MemoryTimeline como componente reutilizado | Usado em ProjectDetail e Memory page, evita duplicação | 2026-03-15 |

## Estado Atual

- **Fase:** MVP construído (10/10 etapas)
- **Frontend:** 5 páginas funcionais, 6 hooks, design dark zinc
- **Backend:** Schema SQL pronto, Edge Function pronta
- **n8n:** Workflow documentado, ainda não montado
- **Deploy:** Não realizado ainda
- **Dados:** Nenhum dado real ainda — tudo pronto para primeiro uso

## Aprendizados

1. Supabase Realtime precisa de `ALTER PUBLICATION supabase_realtime ADD TABLE` — feito no schema
2. Edge Functions na Vercel (pasta `api/`) rodam separadas do frontend Vite — `vercel.json` com rewrites cuida do routing
3. PostgREST do Supabase resolve RPCs por nome de parâmetro — renomear param quebra chamadas
4. `auth.role() = 'service_role'` no RLS é o guard para acesso total via backend

## Convenções de Trabalho com IA

- Commits em inglês, prefixo semântico (`feat/fix/refactor/docs`)
- `Co-Authored-By: Claude` nos commits assistidos
- Respostas em português
- Plano detalhado antes de implementar
- Entrega em etapas sequenciais com confirmação
- Documentação atualizada ao final de cada sessão
- Não criar arquivos desnecessários — preferir editar existentes
- Schema SQL como source of truth do banco — não inventar nomes de colunas

## Nomenclatura do Schema

| Conceito | Nome correto | NÃO usar |
|----------|-------------|----------|
| Tipo de entrada | `tipo` | `type`, `entry_type` |
| Estágio do projeto | `estagio` | `stage`, `phase` |
| Próxima ação | `proxima_acao` | `next_action` |
| Conteúdo | `conteudo` | `content`, `body` |
| Resumo | `resumo` | `summary` |
| Título | `titulo` | `title` |
| Descrição | `descricao` | `description` |
| Versão memória | `version` (int) | `v`, `ver` |
