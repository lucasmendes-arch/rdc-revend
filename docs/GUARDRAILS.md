# GUARDRAILS.md — Invariantes e Regras Congeladas do Produto

Regras aprovadas pelo dono do produto. Qualquer alteração exige aprovação explícita.
Última revisão: 2026-03-23

---

## 1. Header do Catálogo

**Arquivo:** `src/pages/Catalogo.tsx` — bloco `<header>`

- O header DEVE exibir a assinatura visual composta por:
  - Logo `logo-rei-dos-cachos.png` com `brightness-0 invert` (branco sobre fundo gold)
  - Texto "Rei dos Cachos" em `font-black uppercase` branco
  - Subtexto "atacado" em branco com opacidade reduzida (`text-white/70`)
- Fundo do header: `bg-gold` com borda inferior `border-amber-600`
- Header é `sticky top-0 z-40`
- Em mobile: logo + texto de assinatura à esquerda, ações à direita na mesma linha
- Em desktop: logo + assinatura | barra de busca centralizada | ações à direita

**Congelado:** remoção ou alteração da assinatura visual requer aprovação explícita.

---

## 2. Rota `/catalogo` — Pública e Sem Login

**Arquivo:** `src/App.tsx`

- `/catalogo` é rota **pública** — DEVE estar FORA do `<ProtectedRoute>`
- Qualquer usuário (com ou sem conta) pode acessar `/catalogo` diretamente
- Visitante não autenticado entra em modo guest (`isGuest = !user`)

**Congelado:** mover `/catalogo` para dentro de `ProtectedRoute` é regressão crítica.

---

## 3. Guest Mode — Regras de Visibilidade para Visitante

**Arquivo:** `src/pages/Catalogo.tsx`, `CompactProductCarousel.tsx`, `PackageCards.tsx`

- Visitante (`isGuest === true`) NUNCA vê preços de custo
- Visitante NUNCA vê preço de revenda sugerido
- No lugar dos preços: ícone `Lock` + texto "Ver preço ao cadastrar"
- No lugar de botões de compra/adicionar: CTA com Link para `/cadastro`
- Texto do CTA: "Cadastre-se para comprar" (cards) ou "Cadastre-se" (compacto)
- No `CompactProductCarousel`: itens de índice ≥ 4 recebem overlay blur
  - Camada visual: `pointer-events-none` (não bloqueia scroll)
  - Camada interativa: Lock + texto + botão "Criar conta"
- `PackageCards`: preços e potencial de retorno ocultos; CTA no lugar do botão de pacote
- Modal de detalhes do pacote: colunas de preço e total ocultas; footer com link para cadastro

**Congelado:** qualquer vazamento de preço para visitante é bug crítico.

---

## 4. Modo "Ver Todos" — Catálogo Corrido

**Arquivo:** `src/pages/Catalogo.tsx`

- Ativado por `?view=todos` na URL (query param, não rota separada)
- Exibe grid plano contínuo sem carrosséis e sem blocos por categoria
- Produtos ordenados pela mesma sequência das categorias em `dbCategories`
- Banner de saída: "Todos os produtos (X)" + botão "Voltar ao catálogo"
- PackageCards, CategoryBubbles e carrosséis de destaque ficam ocultos neste modo
- Busca funciona normalmente dentro do modo viewAll
- Guest mode respeitado integralmente neste modo

---

## 5. Funil de Estágios (CRM)

**Arquivo:** `src/hooks/useSessionTracking.ts`

Ranking de prioridade aprovado:
```
visitou: 1
visualizou_produto: 2
adicionou_carrinho: 3
iniciou_checkout: 4
abandonou: 5
comprou: 10  ← terminal
```

Regras de transição (`shouldUpdateStatus`):
- `comprou` é **terminal** — nunca regride para nenhum outro status
- `comprou` sempre vence qualquer status atual
- `abandonou → iniciou_checkout` é permitido (retomada de jornada)
- Sem outras transições "para trás" (sem regressão boba para visitou/visualizou)

**Migration:** `supabase/migrations/20260323000001_fix_funnel_priority_guard.sql`
- `detect_abandoned_carts()` tem guarda `AND status <> 'comprou'` no WHERE
- Aplicar via `supabase db push` requer `supabase link` ativo com o projeto correto

**Congelado:** alterar statusRank ou shouldUpdateStatus pode quebrar o kanban de CRM.

---

## 6. Recovery de Senha

**Arquivo:** `src/pages/Login.tsx`, `src/pages/RedefinirSenha.tsx`, `src/App.tsx`

- `redirectTo` em `resetPasswordForEmail` aponta para `${window.location.origin}/redefinir-senha`
- `/redefinir-senha` é rota **pública** em App.tsx
- Página consome o token via `onAuthStateChange` (evento `PASSWORD_RECOVERY`)
- Após redefinição: redireciona para `/login` com mensagem de sucesso
- **Ação manual necessária no Supabase Dashboard:**
  - Auth → URL Configuration → Redirect URLs: adicionar `https://rdc-revend.vercel.app/redefinir-senha`

---

## 7. WhatsApp Flutuante

**Arquivo:** `src/components/landing/WhatsAppButton.tsx`
**Lógica de exibição:** `ConditionalWhatsApp` em `src/App.tsx`

Rotas onde o botão NÃO deve aparecer:
- `/admin/*`
- `/cadastro`
- `/login`
- `/redefinir-senha`

Em todas as outras rotas (incluindo `/catalogo` — para visitantes e autenticados), o botão DEVE aparecer.

**Congelado:** remover o componente ou mudar a lista de exclusões requer aprovação.

---

## 8. Branding e Identidade Visual

- Cor principal: amber/gold (`bg-gold`, `border-amber-600`, `text-gold-text`)
- Botões CTA primários: classe `btn-gold` ou `bg-amber-500 hover:bg-amber-600`
- Fonte dos títulos de seção: `font-bold` a `font-black`
- Ícone de marca: `Crown` do `lucide-react`
- Badge B2B: `inline-flex` com `Crown` + texto "B2B" em `text-gold-text`
- Pill de destaque "Mais Popular" nos pacotes: `bg-amber-500 text-white`
- Dots de carrossel ativos: `w-4 h-1.5 bg-amber-500`; inativos: `w-1.5 h-1.5 bg-border`

---

## 9. Componentes Compartilhados — Contratos de Interface

### `CompactProductCarousel`
Props obrigatórias: `title`, `products`, `cartAddedId`, `getQty`, `setQty`, `onAdd`, `onSelect`, `getSuggestedPrice`
Props opcionais com efeito visual: `isGuest` (ativa guest mode), `onViewAll` (exibe botão "Ver todos")

### `PackageCards`
Props obrigatórias: `products`
Props opcionais: `isGuest` (oculta preços e troca CTAs)

### `CategoryBubbles`
Props: `categories`, `activeCategories`, `onToggleCategory`

---

## 10. Restrições de Infraestrutura

- Nunca commitar `.env`, `env.local`, segredos ou tokens
- `supabase db push` só pode ser executado com `supabase link` confirmado
- Force push em `main` proibido
- Migrations são cumulativas — nunca editar uma migration já aplicada em produção
