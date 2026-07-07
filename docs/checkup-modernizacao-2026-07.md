# Checkup e Plano de Modernização — RDC Revend

> Data do diagnóstico: 2026-07-02
> Escopo: arquitetura, código, performance, design, segurança e dependências.
> Status: **Roadmap aprovado pelo humano em 2026-07-07 (ordem mantida como proposta). Etapa 0 executada em 2026-07-07 — ver notas de execução na Fase 3. Próxima: Etapa 1 (code splitting).**

---

## Resumo executivo

A base é mais saudável do que o normal para um projeto que cresceu rápido — a RLS do módulo de estoque é exemplar, o TypeScript compila limpo e não foi encontrada brecha de segurança ativa. Os três problemas que mais importam:

1. **Bundle único de 1,97 MB (505 kB gzip) sem code splitting** — quem abre `/estoque` no celular baixa o admin inteiro.
2. **SCHEMA.md desatualizado** — grave porque todo o processo do projeto confia nele como fonte de verdade (falta `profiles.permissions` e as RPCs da migration `20260420000002`).
3. **Três mecanismos de tema concorrentes** e estrutura de pastas duplicada — dívida que encarece cada módulo novo.

---

## Fase 1 — Diagnóstico

### 1. Arquitetura

- **FATO** — Separação por módulo já existe e é razoável: `pages/{admin,portal,salao,estoque}` + guards dedicados (`AdminRoute`, `SalaoRoute`, `EstoqueRoute`, `PortalRoute`) + layouts próprios. O módulo de estoque foi adicionado sem tocar nos módulos existentes.
- **FATO** — `src/App.tsx` importa as ~35 páginas estaticamente (sem `React.lazy`), forçando tudo num único chunk.
- **FATO** — Estrutura duplicada: `src/hooks` **e** `src/lib/hooks`, `src/services` **e** `src/lib/services`, `src/types` **e** `src/lib/types` (lado `lib/` contém só Facebook Conversion API). `use-toast.ts` existe em `src/hooks` e `src/components/ui`.
- **FATO** — Três mecanismos de tema dark/light concorrentes: `next-themes` no `App.tsx` (chave `rdc-theme`), `AdminThemeContext` (chave `rdc-admin-theme`, que também escreve `rdc-theme`) e toggles manuais em `EstoqueLayout.tsx`, `SalaoRoute.tsx` e `salao/NovoPedido.tsx` mexendo direto em `document.documentElement.classList`.
- **INFERÊNCIA** — Risco de um módulo "vazar" tema pro outro (o `EstoqueLayout` remove a classe `dark` no unmount). Cada módulo novo tende a reinventar isso.
- **FATO** — Roles consistentes entre frontend e banco no modelo certo: guard de rota é só UX; autorização real está em RLS + RPCs `SECURITY DEFINER` (`is_admin()`, `is_estoque()`, `my_store_id()`). Nenhuma regra crítica validada só no frontend.
- **FATO** — `AuthContext` faz duas queries em `profiles` no login (role + `permissions`, esta com try/catch "migration não aplicada ainda"). A coluna `permissions` existe desde `20260420000002` — a segunda query é resquício.

### 2. Qualidade de código

- **FATO** — `npx tsc --noEmit` passa limpo.
- **FATO** — 75 ocorrências de `any` em 13 arquivos, todas no admin antigo (`Clientes.tsx` 30, `Usuarios.tsx` 12, `TabelasPreco.tsx` 9…). Módulo de estoque: zero.
- **FATO** — Client Supabase criado sem tipos gerados (`createClient(url, key)` sem generic `Database`). Interfaces manuais por página podem divergir do schema real — a classe de bug que o SCHEMA.md documenta como recorrente.
- **FATO** — Páginas monolíticas no legado: `admin/Clientes.tsx` 2.078 linhas, `Catalogo.tsx` 1.478, `admin/Usuarios.tsx` 1.332, `admin/NewOrder.tsx` 1.257, `Checkout.tsx` 1.132, `salao/NovoPedido.tsx` 1.063. Código novo (estoque) é o oposto: 200–330 linhas, react-query, loading/erro tratados.
- **INFERÊNCIA** — O padrão do módulo estoque é o padrão a promover; o do admin antigo é legado a conter (não reescrever — não deixar contaminar módulos novos).
- **FATO** — Edge functions `debug-sync` e `test-sync` sem nenhuma referência no repositório — órfãs.
- **FATO** — Testes frontend: um único `example.test.ts` placeholder. Testes SQL manuais bons em `supabase/tests/`.
- **FATO** — `axios` usado por um único arquivo (`facebook-conversion-api.ts`); resto usa fetch/supabase-js. Redundante.
- **FATO** — SCHEMA.md não documenta `profiles.permissions` nem as funções de `20260420000002` (`get_system_users` etc.).
- **INFERÊNCIA** — Doc incompleto com status de "source of truth" é pior que ausente: gera confiança falsa. Correção de esforço mínimo.

### 3. Performance

- **FATO** — Build de produção: um único JS de 1.965 kB (505 kB gzip) + CSS de 140 kB. Recharts, html2canvas, dnd-kit, embla, admin, CRM e portal baixados em qualquer rota — inclusive `/estoque/contagem` no celular do balcão.
- **INFERÊNCIA** — Maior alavanca de performance disponível; code splitting por rota deve cortar o carregamento inicial de cada módulo em 60–80%.
- **FATO** — Imagens: pipeline WebP → R2 confirmado (`upload-product-image`); nenhum base64 no src.
- **LACUNA** — Produtos sincronizados da Nuvemshop podem ter `main_image` apontando pro CDN deles (dado, não código) — só verificável no banco.
- **FATO** — Policies RLS chamam `is_admin()`/`is_estoque()`/`my_store_id()` diretamente.
- **INFERÊNCIA** — Postgres pode reavaliar por linha em scans grandes; padrão Supabase recomenda `(SELECT is_admin())` para virar InitPlan. Relevante em `stock_count_items`.
- **LACUNA** — Sem acesso ao banco de produção, sem `EXPLAIN`/`pg_stat_statements` — não é possível afirmar gargalo real hoje.
- **FATO** — `caniuse-lite` 13 meses desatualizado (warning no build).

### 4. Design/UI

- **FATO** — Design system de fato existe e está documentado (`design-tokens.md`): tokens CSS HSL, shadcn/ui completo, identidade gold/charcoal.
- **FATO** — Dois vocabulários convivem: tokens semânticos (`bg-card`, `border-border`) e classes hardcoded (`bg-amber-500`, `border-gray-200`, `bg-white`), com "coherence layer" no CSS remapeando `.dark .bg-white` etc.
- **INFERÊNCIA** — O layer é um curativo inteligente mas frágil: cada classe hardcoded nova exige remap novo, senão quebra no dark mode.
- **FATO** — Loading/erro/vazio tratados nas páginas de estoque; `ErrorBoundary` global existe.
- **LACUNA** — Aplicação não foi rodada; responsividade real em celular/tablet pendente de validação visual (dev server / screenshots).

### 5. Segurança

- **FATO** — RLS do módulo de estoque é o ponto alto: colaborador só edita contagem `draft` da própria loja; confirmação só via RPC; `replenishment_orders` sem policy de escrita pro client; RPCs com autenticação, autorização, validação de transição e revalidação server-side de `total_units`; `REVOKE FROM PUBLIC` explícito. `update_replenishment_order_status` valida transições e `shipped_quantity > 0`.
- **FATO** — Nenhum segredo no client: só `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; zero service_role no `src/`.
- **FATO** — `npm audit`: 24 vulnerabilidades (1 crítica, 15 high), todas em dev-tooling (vitest, ws, tar via CLI supabase, yaml) — não afetam o bundle de produção. Fix disponível via `npm audit fix`.
- **LACUNA** — Só o que está nas migrations foi auditado. Policies alteradas direto no dashboard do Supabase não estão refletidas — um `supabase db pull` fecharia a lacuna.

### 6. Dependências

- **FATO** — Stack uma geração atrás, mas estável: React 18 (19 disponível), Vite 5 (7), Tailwind 3 (4), date-fns 3, react-day-picker 8. Nada bloqueante.
- **RECOMENDAÇÃO** — Atualizar só minors/patches agora; adiar majors até depois da modularização (esforço G, não bloqueante).

---

## Fase 2 — Priorização (impacto × esforço)

### Risco ativo agora (nenhum é incêndio, mas resolve-se primeiro)

| # | Item | Esforço | Bloqueante? |
|---|------|---------|-------------|
| 1 | `npm audit fix` + browserslist (dev deps) | P | Não |
| 2 | Atualizar SCHEMA.md (permissions + RPCs de abril) | P | Não, mas urgente — o processo inteiro confia nele |

### Dívida que encarece os próximos módulos (coração do plano)

| # | Item | Esforço | Impacto |
|---|------|---------|---------|
| 3 | Code splitting por módulo (`React.lazy`) + `manualChunks` | M | Alto — perf mobile de /salao e /estoque |
| 4 | Unificar tema em um único mecanismo | M | Alto — bug latente + custo por módulo novo |
| 5 | Tipos gerados do Supabase (`Database` generic) | M | Alto — elimina a classe de bug mais recorrente |
| 6 | Consolidar `src/lib/{hooks,services,types}`; remover `use-toast` duplicado; AuthContext em 1 query | P | Médio |
| 7 | Remover edge functions órfãs (`debug-sync`, `test-sync`) e `axios` | P | Baixo, mas gratuito |
| 8 | Documentar "como criar um módulo" (pasta, guard, layout, RLS) | P | Alto pro objetivo de OS interno |
| 9 | Embrulhar funções em policies com `(SELECT ...)` | P | Preventivo |

### Polimento (pode esperar)

- Quebrar páginas monolíticas (G, oportunista — só ao mexer nelas)
- Reduzir `any` gradualmente (M)
- Testes automatizados dos fluxos críticos (M/G)
- Modernização visual (Fase 4)
- Majors de dependências (G)

---

## Fase 3 — Roadmap de execução (proposto)

Cada etapa é pequena, independente e validável antes da próxima.
**Validação padrão de toda etapa:** `npx tsc --noEmit` + `npm run build` + smoke test manual de `/admin`, `/salao`, `/estoque` e checkout.

| Etapa | Escopo | Esforço | Risco / mitigação |
|-------|--------|---------|-------------------|
| **0 — Quick wins** ✅ 2026-07-07 | Itens 1, 2, 7 e 9 da priorização | P | Zero risco funcional; não toca rota nem checkout |
| **1 — Code splitting** | `React.lazy` por módulo no `App.tsx` + `manualChunks` para vendors pesados (recharts, html2canvas) | M | Flash de loading entre rotas → Suspense fallback. Validar tamanhos por chunk + navegar todas as rotas |
| **2 — Tema unificado** | Um único provider/chave; remover toggles manuais dos layouts | M | Preferência de tema salva reseta uma vez (aceitável). Validar alternância em cada módulo |
| **3 — Estrutura + AuthContext** | Fundir `lib/{hooks,services,types}` na estrutura principal; 1 query no AuthContext | P/M | Validar login em cada role |
| **4 — Tipos do Supabase** | `supabase gen types` + `createClient<Database>`; adotar nos hooks/páginas novas primeiro, legado gradual | M | Requer acesso ao projeto Supabase via CLI |
| **5 — Convenção de módulo + shell** | Doc "anatomia de um módulo" + padrão de shell/menu que aguenta financeiro/agenda no futuro | M | Pré-requisito da Fase 4 |

### Notas de execução — Etapa 0 (2026-07-07)

- **Item 1**: `npm audit fix` reduziu de 24 para **2 vulnerabilidades** (esbuild/vite no dev server) — o fix restante exige major do Vite (5→8), adiado junto com os demais majors por decisão do plano. `update-browserslist-db` rodado; warning do build sumiu.
- **Item 2**: SCHEMA.md — adicionados `profiles.permissions` e as RPCs `admin_set_user_permission` e `admin_update_order` (a `get_system_users` já tinha sido documentada após o diagnóstico).
- **Item 7**: `debug-sync` e `test-sync` deletadas do repositório **e do projeto Supabase remoto** (estavam deployadas). `axios` substituído por `fetch` nativo em `facebook-conversion-api.ts` (usado pela rota Vercel `api/events/track-conversion.ts`) e removido do package.json.
- **Item 9**: migration `20260707000001_wrap_rls_functions_initplan.sql` aplicada via `supabase db push` — `ALTER POLICY` nas 20 policies do módulo de estoque (stores, stock_counts, stock_count_items, store_stock_targets, stock_categories, replenishment_orders/requests/request_items), embrulhando `is_admin()`/`is_estoque()`/`my_store_id()` em `(SELECT ...)`. Policies legadas (pré-módulo de estoque) **não** foram tocadas — ficam para quando/se aparecerem em profiling real.
- **Extra (pedido do humano)**: regra ESLint `complexity: ['warn', 15]` adicionada ao `eslint.config.js` como trava para código novo — 41 warnings no legado de `src/`, esperados; lint não faz parte do build.

### Fora de escopo (não tocar)

- `supabase/functions/create-order/index.ts` — **feature freeze** (checklist em `docs/create-order-contract.md`)
- Tabela `inventory` — fonte de disponibilidade ativa do checkout (D-21)
- Majors de React/Vite/Tailwind — por ora

---

## Fase 4 — Modernização visual (após etapas 1–5)

Módulo por módulo, começando por onde a operação vive (`/salao`, `/estoque`, mobile-first). Cada mudança visual com justificativa (legibilidade, hierarquia, consistência). Inclui validação visual real com dev server — ainda não feita (lacuna declarada no diagnóstico).

---

## Pendências de decisão do humano

1. ~~Confirmar a ordem das etapas do roadmap.~~ ✅ Confirmada em 2026-07-07 (mantida como proposta).
2. ~~Autorizar Etapa 0 (inclui `npm audit fix`).~~ ✅ Autorizada e executada em 2026-07-07.
3. ~~Etapa 4 precisa de acesso ao projeto Supabase via CLI.~~ ✅ CLI já linkada (verificado na Etapa 0: `db push` e `functions delete` funcionaram).
4. Alguma tela monolítica do admin incomoda no dia a dia a ponto de subir de prioridade?
