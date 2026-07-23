# Checkup geral — segurança, bugs e excesso de código

**Data:** 2026-07-23
**Escopo:** repositório inteiro (167 arquivos em `src/`, 15 edge functions, 193 migrations)
**Estado do repo na análise:** branch `main`, 8 arquivos modificados + 2 novos não commitados (feature de contratos DP)

Método: typecheck, ESLint, `npm audit`, leitura das 15 edge functions, varredura das 150 policies de
RLS e das 113 funções `SECURITY DEFINER`, e **sondagem ativa contra o projeto em produção usando apenas
a chave anon pública** (que qualquer visitante já obtém do bundle do frontend).

---

## Resumo executivo

| Severidade | Qtd | Situação |
|---|---|---|
| 🔴 Crítico | 1 | Vazamento de dados **confirmado explorável em produção** |
| 🟠 Alto | 3 | Bypass de autenticação em edge functions (2 confirmados na prática) |
| 🟡 Médio | 6 | Build quebrado, falha silenciosa de permissão, fail-open, deps vulneráveis |
| 🔵 Baixo | 7 | Duplicação, complexidade, código morto, cobertura de teste |

Os dois achados de topo (S-01 e S-02) são independentes da feature nova de contratos — S-01 foi
introduzido em `20260722000004` (2 dias atrás) e S-02 existe desde a migração pro R2.

---

## 🔴 CRÍTICO

### S-01 — `get_system_users()` expõe e-mail e telefone de toda a equipe para qualquer anônimo

**Arquivo:** `supabase/migrations/20260722000004_contract_formacao_schema.sql:61-95`

A migration faz `DROP FUNCTION` seguido de `CREATE OR REPLACE`, mas **não refaz o `GRANT`**:

```sql
DROP FUNCTION IF EXISTS public.get_system_users();   -- linha 61: apaga os grants junto

CREATE OR REPLACE FUNCTION public.get_system_users()
...
LANGUAGE sql
SECURITY DEFINER          -- lê auth.users, sem nenhuma checagem interna de role
...
-- fim do arquivo: nenhum GRANT, nenhum REVOKE
```

No PostgreSQL, uma função recém-criada recebe `EXECUTE` para `PUBLIC` por padrão. No Supabase,
`anon` e `authenticated` são membros de `PUBLIC`. Como a função é `SECURITY DEFINER` e — ao contrário
de todas as outras RPCs sensíveis do projeto — **não tem guarda interna** (`IF NOT is_admin() THEN
RAISE`), o resultado é acesso irrestrito.

**Confirmado em produção.** Requisição feita com a chave anon, sem login:

```
POST /rest/v1/rpc/get_system_users   →   HTTP 200, 7 registros
[{"id":"...","role":"admin","full_name":"...","email":"...",
  "last_sign_in_at":"2026-07-23T01:30:28Z","permissions":{"can_edit_orders":true},
  "store_id":null,"store_name":null,"whatsapp_number":null}, ...]
```

**Impacto:** qualquer pessoa que abra `rdc-os.vercel.app`, pegue a chave anon do bundle e faça uma
requisição obtém: nome completo, e-mail, WhatsApp, role, permissões, loja e último login de **todos os
admins, administrativos e colaboradores de loja**. É lista pronta para phishing/credential stuffing
direcionado, e revela quem tem quais privilégios no sistema.

**Agravante:** as versões anteriores (`20260410000005`, `20260411000003`, `20260420000002`,
`20260702000014`) tinham `GRANT ... TO authenticated`. Mesmo essas já eram permissivas demais (qualquer
cliente logado do B2B via a lista da equipe), mas ao menos exigiam conta. A migration de 2 dias atrás
removeu até essa barreira.

**Correção:**

```sql
-- migration nova
REVOKE EXECUTE ON FUNCTION public.get_system_users() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_system_users() TO authenticated;

-- e, dentro da função, adicionar a guarda que todas as outras RPCs sensíveis já têm.
-- Precisa virar plpgsql (hoje é LANGUAGE sql, que não permite RAISE):
CREATE OR REPLACE FUNCTION public.get_system_users()
RETURNS TABLE (...)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_rh_access()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY SELECT ...;
END;
$$;
```

> Nota de escopo: `has_rh_access()` é necessário porque `Contratacao.tsx` (mudança não commitada)
> passou a chamar `get_system_users()` a partir da página de DP para popular o select de responsável.
> Se preferir manter a RPC admin-only, crie uma `get_assignable_rh_users()` separada devolvendo só
> `id` + `full_name` — sem e-mail, sem `last_sign_in_at`, sem `permissions`. **Essa é a opção
> recomendada:** o select do card do DP não precisa de nenhum dado sensível.

**Verificar depois de aplicar:** repetir a chamada com a chave anon e confirmar HTTP 401/403.

---

## 🟠 ALTO

### S-02 — `upload-product-image` não tem autenticação nenhuma

**Arquivo:** `supabase/functions/upload-product-image/index.ts` (arquivo inteiro, 78 linhas)

Única edge function do projeto sem nenhuma verificação de identidade. Não lê `Authorization`, não chama
`getUser()`, não confere role. `CORS: *`. Vai direto do `req.formData()` pro `PUT` no R2 com as
credenciais de serviço.

**Confirmado em produção** — com a chave anon a requisição alcança o corpo do handler:

```
POST /functions/v1/upload-product-image  (só a chave anon, sem login)
→ HTTP 400 {"error":"No file provided (field: \"file\")"}
```

O 400 é a validação *de negócio*, não de autenticação: com um arquivo real anexado, o upload teria
acontecido.

Além da falta de auth, faltam três validações:

1. **Sem limite de tamanho** — `await file.arrayBuffer()` carrega o arquivo inteiro em memória.
2. **Sem allowlist de tipo/extensão** (linha 47-49) — `ext` e `contentType` vêm do cliente. Dá pra
   subir `.html`/`.svg` com `Content-Type: text/html` e servir conteúdo ativo a partir do seu domínio
   público do R2.
3. **`folder` não é sanitizado contra traversal** (linha 45) — o `replace(/^\/+|\/+$/g,'')` tira barras
   das pontas, mas `../../` no meio passa; a chave final vira `../../algo/arquivo.jpg`.

**Impacto:** qualquer um pode encher seu bucket R2 (custo), hospedar malware/phishing sob o seu domínio,
e sobrescrever caminhos fora da pasta pretendida.

**Correção:**

```ts
// no topo do handler, depois do OPTIONS
const authHeader = req.headers.get('Authorization')
if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401)

const userClient = createClient(
  Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
  { global: { headers: { Authorization: authHeader } } }
)
const { data: { user } } = await userClient.auth.getUser()
if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

const { data: isAdmin } = await userClient.rpc('is_admin')
if (!isAdmin) return jsonResponse({ error: 'Acesso negado' }, 403)

// validações de conteúdo
const ALLOWED = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' } as const
const ext = ALLOWED[file.type as keyof typeof ALLOWED]
if (!ext) return jsonResponse({ error: 'Tipo de arquivo não permitido' }, 400)
if (file.size > 5 * 1024 * 1024) return jsonResponse({ error: 'Arquivo maior que 5MB' }, 400)

// folder: allowlist, não sanitização
const ALLOWED_FOLDERS = ['products', 'banners', 'lookbook']
const folder = ALLOWED_FOLDERS.includes(String(folderRaw)) ? String(folderRaw) : 'products'
```

Trocar também `Access-Control-Allow-Origin: '*'` pelo `getCorsHeaders(req)` que as outras funções usam.

---

### S-03 — Três functions aceitam qualquer header `Authorization`, sem validar o token

**Arquivos:**
- `supabase/functions/notify-stock-count/index.ts:43-49`
- `supabase/functions/notify-replenishment/index.ts:31-36`
- `supabase/functions/send-order-whatsapp/index.ts:30-35`

As três fazem só isto:

```ts
const authHeader = req.headers.get('authorization');
if (!authHeader) { return 401 }
// ...e daqui em diante usam a SERVICE_ROLE_KEY, que bypassa RLS
```

Checar a *presença* do header não é autenticação. A chave anon é pública e é um JWT válido, então passa
tanto no `verify_jwt` da plataforma quanto nessa checagem. Nenhuma das três chama `getUser()` nem
confere role.

**Confirmado em produção:**

```
POST /functions/v1/notify-stock-count  (só a chave anon)
body: {"stock_count_id":"00000000-0000-0000-0000-000000000000"}
→ HTTP 200 {"success":false,"message":"Not a confirmed central stock count"}
```

A resposta é o resultado de uma **consulta ao banco já executada com service role** — o handler rodou
inteiro sem autenticação.

**Impacto:** um anônimo pode enumerar UUIDs de `stock_counts`/`orders` (o texto da resposta diferencia
"não existe" de "existe mas não é da central" — oráculo de existência) e disparar mensagens de WhatsApp
arbitrárias pro número do negócio, consumindo cota da UAZAPI e poluindo o canal operacional.

**Correção** — mesmo padrão de `generate-contract/index.ts:100-107`, que já está certo:

```ts
const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: authHeader } },
})
const { data: { user }, error } = await userClient.auth.getUser()
if (error || !user) return json({ error: 'Unauthorized' }, 401)

const { data: ok } = await userClient.rpc('is_estoque')   // ou is_admin, conforme a function
if (!ok) return json({ error: 'Acesso negado' }, 403)
```

---

### S-04 — Webhook do MercadoPago falha aberto se o segredo não estiver configurado

**Arquivo:** `supabase/functions/webhook-mercadopago/index.ts:6-10`

```ts
const secret = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET')
if (!secret) {
  console.warn('MERCADOPAGO_WEBHOOK_SECRET not set — skipping signature check')
  return true          // ← aceita a requisição sem verificar assinatura
}
```

Se a variável sumir do ambiente (rotação, recriação do projeto, deploy novo), o endpoint passa a aceitar
confirmações de pagamento forjadas — qualquer um marca um pedido como pago. A guarda de idempotência
(`processed_webhooks`) não ajuda: ela impede reprocessar o *mesmo* `payment_id`, não impede um
`payment_id` inventado.

Existe uma mitigação parcial: a function busca o pagamento real na API do MP (linha 135) antes de
confirmar, então um `payment_id` inexistente falha. Mas um `payment_id` **legítimo de outra conta ou de
outro pedido** passaria pela verificação e seria aplicado ao pedido errado.

**Correção:** fail-closed.

```ts
if (!secret) {
  console.error('MERCADOPAGO_WEBHOOK_SECRET não configurado — rejeitando webhook')
  return false
}
```

**Menor, mesmo arquivo (linha 55):** `computed !== v1` é comparação não-constante no tempo. Idem
`req.headers.get('x-automation-secret') !== expectedSecret` em
`generate-contract-automation/index.ts:130`. O risco prático em rede é baixo, mas a correção é barata:

```ts
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
```

---

## 🟡 MÉDIO

### B-01 — O build TypeScript está quebrado (5 erros)

`npx tsc --noEmit -p tsconfig.app.json` falha. Contraria a regra do `CLAUDE.md` ("testar que o
TypeScript compila antes de entregar"). O Vite/SWC não faz typecheck, então o deploy na Vercel passa —
os erros só aparecem em runtime.

| Arquivo | Erro |
|---|---|
| `src/components/portal/PortalLayout.tsx:44,133` | `cartCount` não existe em `CartContextType` — **renderiza `undefined` no badge do carrinho em produção** |
| `src/config/packages.ts:164` | falta `partner_price` em `PublicProduct` |
| `src/pages/comercial-atacado/admin/Pedidos.tsx:427,429` | prop `title` em ícone Lucide (não existe; o tooltip nunca aparece) |
| `src/pages/sistema/Usuarios.tsx:625` | cast inválido: `catalog_products` vem como array do PostgREST, tipado como objeto |

O de `PortalLayout` é bug real de usuário final. O de `Usuarios.tsx:625` indica que o código lê
`order_items[].catalog_products.main_image` quando o dado é um array — a imagem provavelmente não
aparece.

**Ação:** corrigir os 5, e adicionar `"typecheck": "tsc --noEmit -p tsconfig.app.json"` ao `package.json`
+ rodar no CI/pre-push.

---

### B-02 — Modal de dados das lojas falha em silêncio e mostra sucesso falso

**Arquivo:** `src/components/dp/LojasDadosModal.tsx:27-40` (arquivo novo, não commitado)

O modal está na página `/admin/dp/contratos`, protegida por `RhRoute` → `has_rh_access()` =
`role IN ('admin','administrativo') OR permissions->>'can_manage_rh' = 'true'`.

Mas ele escreve em `stores`, cuja policy é (`20260720000001_administrativo_role.sql:75-76`):

```sql
CREATE POLICY stores_admin_all ON public.stores
  FOR ALL USING (public.has_full_stock_access()) WITH CHECK (public.has_full_stock_access());
-- has_full_stock_access() = role IN ('admin', 'administrativo')   ← sem can_manage_rh
```

**Descompasso:** um usuário com `permissions.can_manage_rh = true` mas role `user`/`salao` abre o modal,
edita razão social/CNPJ, clica em Salvar — o UPDATE do PostgREST não casa nenhuma linha, **retorna sem
erro**, e o `onSuccess` dispara `toast.success('Dados de X salvos')`. O usuário acredita que salvou. O
contrato seguinte sai com CNPJ em branco.

**Correção (escolher uma):**
- **(a)** esconder o botão "Dados das lojas" para quem não é admin/administrativo; ou
- **(b)** criar uma RPC `admin_set_store_legal_data(...)` com `SECURITY DEFINER` + guarda
  `has_rh_access()`, seguindo o padrão de `admin_set_store_whatsapp_credential`.

**(b) é a melhor** — os dados são de DP, quem opera DP deveria poder editar. E resolve a falha silenciosa
de vez, porque a RPC levanta exceção em vez de não fazer nada.

**Ainda no mesmo arquivo:** CNPJ e endereço entram sem validação nem máscara e vão direto pro contrato
assinado. Validar formato do CNPJ (14 dígitos + dígitos verificadores) antes de gravar.

---

### B-03 — Dependências com vulnerabilidade conhecida

```
dompurify  <=3.4.11   — bypass de CUSTOM_ELEMENT_HANDLING (GHSA-c2j3-45gr-mqc4)
brace-expansion 2.0.0-2.1.1 — DoS (high)
esbuild/vite <=6.4.2  — dev server lê arquivos arbitrários no Windows (moderate, só dev)
```

O `dompurify` importa porque é o que sanitiza `description_html` do produto em
`Catalogo.tsx:1326` — o único ponto de HTML de terceiros renderizado no app.

```bash
npm audit fix          # resolve dompurify + brace-expansion, sem breaking change
```

O esbuild/vite exige `vite@8` (breaking) e só afeta o dev server local — pode ficar para depois, mas
não rode `npm run dev` em rede não confiável até lá.

---

### B-04 — `callEdgeFunction` força refresh de sessão a cada chamada

**Arquivo:** `src/lib/supabase.ts:21-24`

```ts
export async function callEdgeFunction(...) {
  await supabase.auth.refreshSession()   // ← toda invocação
  const { data: authData } = await supabase.auth.getSession()
```

Cada chamada de edge function faz um round-trip extra ao `/auth/v1/token` e **rotaciona o refresh
token**. Duas chamadas em paralelo (comum: gerar contrato + notificar) podem correr para trocar o mesmo
refresh token; o perdedor recebe um token já invalidado, e o usuário é deslogado sem motivo aparente.

**Correção:** usar a sessão em cache e só renovar se estiver perto de expirar — o cliente do Supabase
já faz auto-refresh sozinho.

```ts
const { data: { session } } = await supabase.auth.getSession()
const expSoon = session?.expires_at && session.expires_at * 1000 - Date.now() < 60_000
if (expSoon) await supabase.auth.refreshSession()
const token = (await supabase.auth.getSession()).data.session?.access_token
```

---

### B-05 — Trigger de contrato dispara em todo save dos dados pessoais

**Arquivo:** `supabase/migrations/20260723000001_contract_automation_longer_timeout.sql:45-72`

`trg_employee_contract_data_automation` roda em `AFTER INSERT OR UPDATE` sem comparar `OLD` com `NEW`.
Enquanto o processo estiver em `contrato_formacao`, **cada save** da aba "Dados para contrato" dispara
um `net.http_post` de 30s.

A idempotência existe (a function confere `employee_contracts` antes de chamar o Google), então não
gera contrato duplicado — mas cada save gasta uma invocação de edge function e duas consultas ao banco
à toa. E há uma janela de corrida real: dois saves em sequência rápida, antes do primeiro inserir em
`employee_contracts`, geram **dois** documentos no Drive.

**Correção:** só disparar quando os campos obrigatórios mudarem de incompleto para completo.

```sql
IF TG_OP = 'UPDATE'
   AND OLD.cpf IS NOT DISTINCT FROM NEW.cpf
   AND OLD.birth_date IS NOT DISTINCT FROM NEW.birth_date
   AND OLD.address IS NOT DISTINCT FROM NEW.address THEN
  RETURN NEW;   -- nada relevante mudou
END IF;
```

E fechar a corrida com um índice único, que é a garantia real (a checagem na function é só otimização):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS employee_contracts_process_type_uniq
  ON employee_contracts (process_id, contract_type);
```

---

### B-06 — URL do projeto Supabase hardcoded nos triggers

**Arquivo:** `20260723000001_contract_automation_longer_timeout.sql:35,63`

```sql
url := 'https://sivbyjwhmeftmtlghmnz.supabase.co/functions/v1/generate-contract-automation'
```

Já houve um incidente desse tipo neste projeto (o cron de comissão apontava para o projeto errado).
Se o projeto for recriado ou clonado para staging, os triggers apontam silenciosamente para o ambiente
antigo.

**Correção:** guardar a base URL em `internal_config` (a tabela já existe e já está protegida por RLS
sem policy) e ler junto com o segredo:

```sql
SELECT value INTO v_base_url FROM internal_config WHERE key = 'functions_base_url';
PERFORM net.http_post(url := v_base_url || '/generate-contract-automation', ...);
```

---

## 🔵 BAIXO — excesso de código e manutenibilidade

### Q-01 — `generate-contract` e `generate-contract-automation` são quase o mesmo arquivo

208 e 248 linhas, **124 linhas divergentes nas primeiras 120** — o resto é cópia. `buildFormacaoFieldMap`
está duplicado literalmente, incluindo o mesmo comentário de 3 linhas.

O diff não commitado é a prova do custo: a mesma mudança de placeholders
(`{{cpf}}` → `{{cpf_profissional}}`) teve que ser aplicada nos dois arquivos, e a mudança de
`REQUIRED_FIELDS` em **três** lugares (`src/lib/dpConstants.ts:153`,
`generate-contract/index.ts:39`, `generate-contract-automation/index.ts:22`). O comentário no código
já admite o problema: *"manter os dois em sincronia se a regra mudar"*.

**Ação:** mover `buildFormacaoFieldMap`, `buildDesligamentoFieldMap`, `REQUIRED_FIELDS` e todo o fluxo
Drive (folder → copy → replace → link → insert) para `_shared/contractGeneration.ts`. As duas functions
ficam sendo só o invólucro de autenticação: uma valida JWT+role, a outra valida o header de segredo.
Elimina ~180 linhas e a classe inteira de bug "mudei num lugar e esqueci do outro".

### Q-02 — `create-order` com complexidade ciclomática 133

`supabase/functions/create-order/index.ts` — 703 linhas, complexidade 133 (limite do projeto: 15).
É o pior número do repositório por larga margem. Está em **feature freeze** (`CLAUDE.md`), então não
mexer sem aprovação — mas registrar: a complexidade é o que torna o freeze necessário, e o freeze
impede a refatoração que reduziria a complexidade. Vale planejar uma quebra em módulos
(validação → preço → estoque → pagamento → persistência) com o checklist de
`docs/create-order-contract.md`, em janela dedicada.

### Q-03 — Componentes-monstro no frontend

| Arquivo | Linhas | Complexidade |
|---|---|---|
| `src/pages/comercial-atacado/admin/Clientes.tsx` | 2013 | — |
| `src/pages/rh/Candidatos.tsx` | 1588 | 45 |
| `src/pages/sistema/Usuarios.tsx` | 1474 | 44 (`ClientSidePanel`) |
| `src/pages/comercial-atacado/Catalogo.tsx` | 1443 | — |
| `src/pages/comercial-atacado/admin/NewOrder.tsx` | 1257 | — |

O code splitting por rota já está feito (31 rotas com `lazy()`), então o impacto é de manutenção, não de
bundle. Extrair painéis/modais em arquivos próprios resolve incrementalmente.

### Q-04 — 84 erros de ESLint

Maioria `@typescript-eslint/no-explicit-any` (concentrados em `Usuarios.tsx`, 13 ocorrências), mais
`no-empty` em `salao/NovoPedido.tsx:94` e `no-require-imports` em `tailwind.config.ts:101`. Os `any` em
`Usuarios.tsx` são exatamente a região do erro de tipo B-01 — não é coincidência.

### Q-05 — Schema morto

Tabelas sem nenhuma referência em `src/`: `upsell_offers`, `crm_customers`, `crm_interactions`,
`catalog_sync_runs`. Vêm das remoções de CRM (2026-07-13), Nuvemshop (2026-07-13) e upsell (2026-07-22).
Foram deixadas dormentes de propósito, o que foi a decisão certa na hora. Passados alguns meses sem uso,
vale dropar — cada tabela dormente ainda tem policies de RLS que aparecem em toda auditoria e confundem
quem lê o schema.

### Q-06 — Cobertura de testes: 1 arquivo

`src/test/example.test.ts` é o único teste do repositório, e é um exemplo. Vitest + Testing Library já
estão configurados. Para um sistema que calcula frete, estoque, comissão e desconto, o mínimo seria
cobrir as funções puras de cálculo — sem depender de banco.

### Q-07 — Higiene: nada a fazer

Registrado para constar (verificado, está tudo certo): RLS habilitado em todas as 57 tabelas; nenhum
segredo hardcoded no `src/`; `.gitignore` cobre `.env*`, `*.key`, `*.pem`, `private-docs/`; o único
`dangerouslySetInnerHTML` com conteúdo de terceiros passa por `DOMPurify.sanitize`; os outros 4 são
strings de CSS estáticas. 2 `console.log` e 6 `as any` no `src/` inteiro.

**Não versionar:** `Captura de tela 2026-07-21 204307.png` e `Captura de tela 2026-07-22 130656.png`
estão como untracked na raiz. Adicionar `*.png` da raiz ao `.gitignore` ou movê-los.

---

## Plano de ação

### Fase 1 — Hoje, antes de qualquer outro deploy

| # | Ação | Arquivo | Esforço |
|---|---|---|---|
| 1 | `REVOKE ... FROM PUBLIC, anon` + guarda interna em `get_system_users()`; criar `get_assignable_rh_users()` enxuta para o select do DP | migration nova | 30 min |
| 2 | Autenticação + allowlist de tipo/tamanho/pasta em `upload-product-image` | `upload-product-image/index.ts` | 30 min |
| 3 | `getUser()` + checagem de role nas 3 functions de notificação | `notify-stock-count`, `notify-replenishment`, `send-order-whatsapp` | 45 min |
| 4 | Fail-closed no webhook do MP + comparação constante no tempo | `webhook-mercadopago`, `generate-contract-automation` | 20 min |

Depois de 1-3, repetir as três sondagens com a chave anon e confirmar 401/403.

**Sobre rotação de credenciais:** o vazamento de S-01 expôs e-mails e metadados, não senhas nem tokens.
Não é preciso rotacionar chaves. Mas vale avisar a equipe para tratar com desconfiança qualquer e-mail
que pareça vir do sistema nos próximos dias — a lista vazada é material de phishing direcionado.

### Fase 2 — Esta semana

| # | Ação | Esforço |
|---|---|---|
| 5 | Corrigir os 5 erros de TypeScript; adicionar script `typecheck` e rodar antes do push | 1 h |
| 6 | RPC `admin_set_store_legal_data` + validação de CNPJ no `LojasDadosModal` | 1 h |
| 7 | `npm audit fix` (dompurify + brace-expansion) | 10 min |
| 8 | Corrigir `callEdgeFunction` (parar de rotacionar refresh token a cada chamada) | 20 min |
| 9 | Guarda `OLD`/`NEW` no trigger + índice único em `employee_contracts (process_id, contract_type)` | 40 min |
| 10 | Mover a URL das functions para `internal_config` | 20 min |

### Fase 3 — Próximas duas semanas

| # | Ação | Esforço |
|---|---|---|
| 11 | Extrair `_shared/contractGeneration.ts` e unificar as duas functions de contrato (−180 linhas) | 3 h |
| 12 | Zerar os 84 erros de ESLint, começando pelos `any` de `Usuarios.tsx` | 3 h |
| 13 | Testes para as funções puras de cálculo (frete, total, comissão, desconto) | 4 h |
| 14 | Quebrar `Clientes.tsx` (2013 linhas) e `Candidatos.tsx` (1588) em componentes | 6 h |

### Fase 4 — Backlog

| # | Ação |
|---|---|
| 15 | Dropar as 4 tabelas dormentes, depois de confirmar que nenhum relatório externo as consulta |
| 16 | Refatorar `create-order` (complexidade 133) — exige sair do feature freeze, com o checklist de `docs/create-order-contract.md` |
| 17 | `vite@8` para fechar o CVE do esbuild no dev server |

---

## Um padrão que vale corrigir de forma sistemática

S-01 não foi um descuido isolado: é a terceira vez que este projeto é mordido pela mesma mecânica de
permissões do PostgreSQL. Já houve o caso dos grants ausentes para `service_role` (403 mascarado em
edge function) e agora `DROP FUNCTION` apagando grants. A regra é sempre a mesma: **`DROP FUNCTION`
descarta os privilégios, e o `CREATE` seguinte devolve `EXECUTE` a `PUBLIC` por padrão.**

Toda migration que faz `DROP FUNCTION ... ; CREATE ... SECURITY DEFINER` precisa terminar com:

```sql
REVOKE EXECUTE ON FUNCTION public.<fn>(<args>) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.<fn>(<args>) TO authenticated;
```

Das 42 funções criadas ou redefinidas em julho/2026, **18 não têm `REVOKE ... FROM PUBLIC` em lugar
nenhum**. Dessas, as 20 do tipo `trg_*` são funções de trigger (não chamáveis de forma útil via
PostgREST — risco desprezível) e todas as `admin_*`/`promote_*`/`register_*` têm guarda interna
verificada uma a uma. **`get_system_users` era a única sem nenhuma das duas proteções** — mas essa
margem depende de disciplina manual a cada migration.

Vale um teste de fumaça no CI que faça, com a chave anon, uma chamada a cada RPC sensível e falhe se
alguma responder 200. É a única checagem que pega essa classe de erro de forma confiável.
