# AGENTS.md — Contrato de Comportamento para Agentes de IA

Este arquivo é lido automaticamente por agentes (Claude Code, Cursor, Copilot, etc.)
antes de qualquer modificação no repositório.

---

## 1. Leitura obrigatória antes de começar

Antes de alterar qualquer arquivo relacionado a UI, rotas, autenticação, catálogo,
carrinho ou header, o agente DEVE ler:

- `docs/GUARDRAILS.md` — invariantes e regras congeladas do produto
- `docs/RELEASE_CHECKLIST.md` — checklist de smoke test pré-commit
- `docs/architecture.md` — estrutura técnica do projeto
- `docs/current_status.md` — estado atual das features

Se qualquer um desses arquivos não existir, parar e avisar o usuário antes de prosseguir.

---

## 2. Domínios com proteção especial

Os arquivos abaixo não podem ser modificados sem confirmação explícita do usuário:

| Domínio | Arquivos / Componentes |
|---|---|
| Header | `src/pages/Catalogo.tsx` (bloco `<header>`) |
| Auth / Rotas | `src/App.tsx`, `src/components/ProtectedRoute.tsx`, `src/components/AdminRoute.tsx` |
| Catálogo público | `src/pages/Catalogo.tsx` (guest mode, isGuest, price hiding) |
| Carrinho | `src/contexts/CartContext.tsx`, bloco `cartOpen` em Catalogo.tsx |
| Componentes compartilhados | `CompactProductCarousel.tsx`, `PackageCards.tsx`, `CategoryBubbles.tsx` |
| Funil / CRM | `src/hooks/useSessionTracking.ts`, `client_sessions`, `crm_events` |
| WhatsApp flutuante | `src/components/landing/WhatsAppButton.tsx`, `ConditionalWhatsApp` em App.tsx |

---

## 3. Regra de componente compartilhado

Sempre que uma mudança tocar um componente listado acima, o agente deve:

1. Avisar explicitamente que o componente é compartilhado
2. Listar todos os lugares onde ele é usado (`Glob` ou `Grep`)
3. Descrever o impacto da mudança em cada contexto de uso
4. Só então implementar, após confirmação implícita ou explícita do usuário

---

## 4. Regras congeladas — nunca alterar sem aprovação explícita

Ver lista completa em `docs/GUARDRAILS.md`. As mais críticas:

- O header do catálogo DEVE exibir a assinatura "Rei dos Cachos / atacado"
- `/catalogo` DEVE ser rota pública (fora do ProtectedRoute)
- Visitante (isGuest) NUNCA vê preços — Lock icon + CTA de cadastro no lugar
- `comprou` é status terminal no funil — nunca regride para outro status
- WhatsApp flutuante some em `/admin`, `/cadastro`, `/login`, `/redefinir-senha`

---

## 5. Checklist mínimo antes de considerar uma tarefa concluída

Antes de encerrar qualquer tarefa que toque UI ou lógica de negócio:

- [ ] Smoke test visual no localhost (mobile + desktop)
- [ ] Nenhuma regra de `docs/GUARDRAILS.md` foi violada
- [ ] Componentes compartilhados testados nos seus contextos de uso
- [ ] Nenhuma rota pública foi movida para trás de ProtectedRoute acidentalmente
- [ ] Guest mode testado: sem preços vazando, CTAs corretos
- [ ] `docs/RELEASE_CHECKLIST.md` executado mentalmente ou fisicamente

---

## 6. O que o agente NÃO deve fazer sem aprovação

- Remover elementos visuais do header (logo, texto de assinatura, etc.)
- Alterar a lógica de `isGuest` ou as condições de visibilidade de preço
- Mover `/catalogo` de volta para dentro de `ProtectedRoute`
- Alterar o `statusRank` ou `shouldUpdateStatus` no funil
- Remover o botão flutuante do WhatsApp ou mudar suas condições de exibição
- Fazer `git push --force` em `main`
- Commitar arquivos `.env`, segredos ou credenciais
- Aplicar `supabase db push` sem confirmar com o usuário (requer `supabase link` ativo)
