# Visão Geral do Estado do Projeto (Rei dos Cachos B2B)

Este documento foi gerado através de uma auditoria técnica profunda e read-only no repositório. O objetivo é servir como fonte central de verdade (Contexto) para os próximos passos de desenvolvimento, especialmente para o sistema de CRM e automações.

---

## 1. Visão Geral do Projeto

**Nome:** Rei dos Cachos Store B2B (vite_react_shadcn_ts)
**Objetivo:** E-commerce B2B (atacado/revenda) para produtos capilares, conectando salões de beleza, varejistas e profissionais com acesso a preços e catálogos exclusivos.
**Ambiente:** Desenvolvimento / Produção gerenciados via Vite + Supabase Cloud + Edge Functions.

---

## 2. Árvore Principal de Diretórios

```text
/ (root)
├── src/
│   ├── assets/       # Imagens e mídia estática
│   ├── components/   # Componentes UI (shadcn, admin, catalog, landing)
│   ├── config/       # Configurações estáticas (ex: packages.ts)
│   ├── contexts/     # Provedores de estado global (AuthContext, CartContext)
│   ├── hooks/        # Custom React hooks (React Query wrappings, etc)
│   ├── lib/          # Utilitários core (supabase.ts, utils.ts)
│   ├── pages/        # Telas da aplicação (cliente e /admin/*)
│   ├── services/     # Camada de serviços de API / DB (ex: crm.ts)
│   ├── types/        # Contratos TypeScript (ex: crm.ts)
│   └── utils/        # Funções helper puras
├── supabase/
│   ├── functions/    # Edge Functions do Supabase (TypeScript/Deno)
│   └── migrations/   # Histórico de tabelas, triggers e RLS (.sql)
├── package.json      # Dependências e scripts npm
├── tailwind.config.ts# Configuração do Tailwind CSS
└── vite.config.ts    # Configuração do Vite
```

---

## 3. Stack Real Detectada

| Categoria | Tecnologia Confirmada |
| :--- | :--- |
| **Frontend Core** | React 18.3, TypeScript 5.8, Vite 5.4 |
| **Roteamento** | react-router-dom 6.30 |
| **Estilização** | Tailwind CSS 3.4 + Radix UI Primitives + Lucide Icons |
| **State/Data Fetching** | TanStack React Query 5.83, Context API (Auth, Cart) |
| **Backend / DB** | Supabase JS Client 2.97 (PostgreSQL, Auth, Edge Functions) |
| **Validações** | Zod + React Hook Form |
| **Utilitários** | date-fns, sonner, recharts |

---

## 4. Rotas e Telas (`src/App.tsx`)

A aplicação é dividida em fluxo deslogado (landing/auth), fluxo de cliente (B2B restrito) e Painel Admin.

**Públicas / Deslogado:**
- `/login` (Tela de Autenticação)
- `/cadastro` (Tela de Registro complexa com webhook Fiqon)

**Privadas (Cliente / `ProtectedRoute`):**
- `/catalogo` (Listagem de produtos B2B, adição ao carrinho)
- `/checkout` (Finalização de compra, cálculo, integração MP)
- `/pedido/sucesso/:id` (Tela de sucesso pós-compra)
- `/meus-pedidos` (Histórico do usuário)

**Admin (`AdminRoute` sob `/admin/*`):**
- `/admin/catalogo` (Gestão de produtos)
- `/admin/pedidos` (Kanban de ordens)
- `/admin/clientes` (Dashboard atual do CRM: funil visual, detalhes de sessão)
- `/admin/estoque` (Gerenciador de estoque `inventory`)
- `/admin/usuarios` (Gestão de roles admin/user)
- `/admin/categorias` (Classificação taxonômica do catálogo)
- `/admin/upsell` (Ofertas cross-sell pós-carrinho)
- `/admin/financeiro` (Métricas de receita e ticket médio)
- `/admin/crm-debug` (Visão técnica de tags, automações e logs da Etapa 1 do CRM)

---

## 5. Auth, Admin e Guards

**Autenticação (`AuthContext.tsx`):**
- Utiliza `supabase.auth.onAuthStateChange` como SSOT (Single Source of Truth).
- Possui um fallback timeout (3s) para evitar telas de loading infinitas se o Supabase demorar a responder.
- A role do usuário (`'user' | 'admin' | null`) é buscada na tabela `profiles` de forma assíncrona após o login.

**Guards:**
- `ProtectedRoute`: Bloqueia o acesso sem usuário autenticado.
- `AdminRoute`: Bloqueia acesso se o `role` não for estritamente `'admin'` (validação via Context, embora as requisições ao DB estejam seguras pelo RLS).

---

## 6. Integração com Supabase (Segurança e Arquitetura)

### Row Level Security (RLS)
As migrations mostram uma rígida preocupação com segurança:
- **Profiles:** Uso da função Postgres `get_all_profiles()` com `SECURITY DEFINER` para permitir que administradores vejam o perfil dos outros clientes sem gerar erro de recursão infinita no RLS.
- **Tabelas de CRM/Admin:** RLS habilitado com verificação via função `public.is_admin()` para leitura/escrita.
- Os usuários regulares só conseguem ler/escrever dados associados ao próprio `uid()`.

### Supabase Migrations
Detectadas **35 migrations SQL** organizadas cronologicamente (`20250221...` até `20250313_crm_foundation.sql`). 

### Edge Functions
Localizadas em `supabase/functions/`:
- `create-order`
- `create-user`
- `debug-sync`
- `sync-google-sheets`
- `sync-nuvemshop`
- `test-sync`
- `webhook-mercadopago` (webhook de recebimento de pagamentos)

---

## 7. Tabelas e Entidades Detectadas

**Catálogo e Pedidos:**
- `catalog_products`, `categories`, `inventory`, `kit_components`
- `orders`, `order_items`
- `upsell_offers`

**Clientes e Sessões:**
- `profiles` (estende `auth.users` com CPF/CNPJ, tipo de loja, faturamento, etc.)
- `client_sessions` (funil: `visitou` → `visualizou` → `carrinho` → `checkout` → `comprou` ou `abandonou`)

**Módulo CRM (Foundation recém-criada na Migration 20250313000001):**
- `crm_events` (log imutável de tracking)
- `crm_tags` (dicionário de tags system/custom)
- `crm_customer_tags` (vínculo cliente-tag com source system/manual/automation)
- `crm_automations` (regras e payloads para disparo de WhatsApp)
- `crm_automation_runs` (logs de disparo e logs de erro)
- `processed_webhooks` (tabela utilitária para idempotência)

---

## 8. Padrões de Código e Arquitetura Frontend

- **Hooks:** Forte uso de React Query para Data Fetching (`useQuery`, `useMutation`), organizados em `src/hooks/` (ex: `useAdminProducts.ts`, `useSessionTracking.ts`).
- **Services:** Centralização de chamadas do Supabase em `src/services/` isolando a UI da comunicação HTTP (ex: `crmService`).
- **Types:** Centralização de tipagens base do DB em `src/types/` (ex: `crm.ts` com enums de status e tags).
- **Utils:** Funções agnósticas (mapeadores de cor, labels, parsers) em `src/utils/` (ex: `crm.ts`).
- **Componentes UI:** Alta reutilização baseada no ecossistema shadcn/ui. Classes injetadas via tailwind-merge (`cn()`).

---

## 9. Integrações Externas (Inferidas via Env Vars e Código)

- **Supabase:** Core Auth + DB + Functions (`VITE_SUPABASE_URL`, `ANON_KEY`)
- **Nuvemshop:** Sync de produtos importados (`VITE_NUVEMSHOP_STORE_ID`)
- **Mercado Pago:** Pagamentos via Checkout / Edge Function
- **WhatsApp / Fiqon:** Automações transacionais via webhooks e Edge Functions no Supabase (detectado via payload rules da fundação CRM).

---

## 10. Riscos Técnicos e Pontos de Atenção (Frágeis)

1. **Carrinho via LocalStorage:** Atualmente, o estado do carrinho parece residir primordialmente no cliente via `CartContext`. Embora haja um `cart_items_count` na sessão, os *produtos* exatos no carrinho não são facilmente acessíveis para abandono de carrinho sem criar novas integrações DB.
2. **Funil Híbrido:** O "Status no Funil" atual (`client_sessions`) baseia-se em timestamps e progressão em sentido único. Disparar automações complexas requer o cron job atual garantindo a transição para "abandonou".
3. **RLS Complexo:** Modificações envolvendo perfil de outros usuários exigem atenção redobrada devido ao RLS. (Uso mandatório da RPC `get_all_profiles()`).

---

## 11. Pronto para Etapa 1 do CRM?

**Sim, 100% pronto.**  
A base (migrations SQL finalizadas com RPCs e views de debug, Tipagens globais em `src/types/crm.ts`, Services e a tela Admin `/admin/crm-debug`) está implantada e funcional.  

A infraestrutura foi desenhada pensando exclusivamente via WhatsApp (`CrmChannel = 'whatsapp'`), focando em recuperar base legada via Etiquetas (Tags comportamentais e de timing).

---

## 12. Contexto Essencial para Futuros Prompts

Se você acionar a IA no futuro, peça sempre para que ela:
1. Respeite as tipagens de `/src/types/crm.ts` para qualquer mapeamento de Tag ou Automation.
2. Utilize o `crmService` localizado em `/src/services/crm.ts` ou mantenha o mesmo padrão se criar queries de React Query.
3. Não use DML direta na tabela de `profiles` para visões admin; use `supabase.rpc('get_all_profiles')`.
4. Os ícones devem vir exclusivamente do `lucide-react`.
5. Estilos utilizam Tailwind. NUNCA crie CSS sem ser estritamente necessário; use utilitários do Tailwind.

---

## 13. Perguntas em Aberto

1. O motor do cron (`pg_cron`) atual fará a chamada direta do webhook Fiqon ou fará a chamada a uma nova Edge Function que processará as `crm_automations` enfileiradas?
2. A sincronização NuvemShop sobrescreve dados de preço editados manualmente no admin local? (Não explicitado no estado atual sem verificar código NuvemShop-Sync).
3. A "Limpeza de banco" que está ocorrendo num script (visto no editor paralelo: `scripts/limpar-dados-teste.sql`) afeta temporariamente o funil?
