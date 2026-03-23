# RELEASE_CHECKLIST.md — Smoke Test Pré-Commit / Pré-Deploy

Execute este checklist antes de qualquer commit que toque UI, rotas, auth ou catálogo.
Marque cada item mentalmente ou fisicamente. Não pule itens.

---

## 1. Header

- [ ] Logo visível no header dourado (`bg-gold`)
- [ ] Assinatura "Rei dos Cachos" + "atacado" visível ao lado do logo
- [ ] Header é sticky — não some ao scrollar
- [ ] Mobile: logo + assinatura à esquerda, ações à direita na mesma linha

---

## 2. Catálogo — Visitante (sem login)

- [ ] `/catalogo` abre sem redirecionar para `/login`
- [ ] Header exibe botões "Entrar" e "Criar conta" (não cart/logout)
- [ ] Nenhum preço de custo visível nos cards
- [ ] Nenhum preço de revenda visível nos cards
- [ ] Ícone Lock + "Ver preço ao cadastrar" no lugar dos preços
- [ ] Botão "Cadastre-se para comprar" no lugar do botão de adicionar
- [ ] Itens de índice ≥ 4 no carrossel com overlay blur e CTA de cadastro
- [ ] PackageCards sem preços (Lock + "Ver preço ao cadastrar")
- [ ] PackageCards com botão "Cadastre-se para comprar" (não "Adicionar Pacote")

---

## 3. Catálogo — Usuário Autenticado

- [ ] Preços de custo visíveis nos cards
- [ ] Preços de revenda sugeridos visíveis (quando aplicável)
- [ ] Botão "Comprar" funcional com seletor de quantidade
- [ ] Cart icon com contagem no header
- [ ] PackageCards com preços e botão "Adicionar Pacote"
- [ ] Logout funciona e redireciona para `/login`
- [ ] Admin: ícone de painel Admin visível no header (somente se role === 'admin')

---

## 4. Busca

- [ ] Digitar no campo de busca filtra produtos em tempo real (debounce ~300ms)
- [ ] Modo busca: grid plano sem carrosséis e sem PackageCards
- [ ] Título da seção muda para `Resultados para "..."` durante busca
- [ ] Limpar busca restaura visualização de carrosséis e PackageCards
- [ ] Guest mode respeitado nos resultados de busca

---

## 5. Ver Todos

- [ ] Botão "Ver todos" visível nas seções de categoria
- [ ] Clicar abre grid plano com URL `?view=todos`
- [ ] Sem carrosséis, sem PackageCards, sem CategoryBubbles no modo viewAll
- [ ] Banner "Todos os produtos (X)" com botão "Voltar ao catálogo"
- [ ] Produtos organizados por categoria (não embaralhados alfabeticamente)
- [ ] Botão Voltar do browser retorna ao catálogo normal
- [ ] Guest mode respeitado no grid do viewAll

---

## 6. Carrinho

- [ ] Adicionar produto abre toast com "Ver pedido"
- [ ] Cart icon exibe contagem correta
- [ ] Drawer do carrinho abre e fecha
- [ ] Remoção de item atualiza contagem
- [ ] Checkout requer autenticação (rota protegida)

---

## 7. Recovery de Senha

- [ ] "Esqueci minha senha" na tela de login aceita e-mail válido
- [ ] Toast/mensagem de confirmação exibida após envio
- [ ] Link do e-mail redireciona para `/redefinir-senha` (não `/login`)
  - Pré-requisito: URL `https://rdc-revend.vercel.app/redefinir-senha` na allowlist do Supabase
- [ ] Formulário de nova senha funciona sem login prévio
- [ ] Após redefinição: redireciona para `/login` com mensagem de sucesso

---

## 8. Elementos Flutuantes e Navegação

- [ ] Botão WhatsApp visível em `/catalogo` (visitante e autenticado)
- [ ] Botão WhatsApp ausente em `/admin/*`, `/cadastro`, `/login`, `/redefinir-senha`
- [ ] Nenhum sobreposição visual entre WhatsApp e carrinho

---

## 9. Regressões de Rota

- [ ] `/` redireciona para `/login`
- [ ] `/catalogo` acessível sem login
- [ ] `/checkout` redireciona para login se não autenticado
- [ ] `/admin/*` redireciona para login se não autenticado ou não admin
- [ ] `/redefinir-senha` acessível sem login

---

## 10. Antes do Push

- [ ] Nenhum arquivo `.env` ou segredo nos staged files (`git status`)
- [ ] `console.log` de debug não commitados
- [ ] Nenhuma regra de `docs/GUARDRAILS.md` violada
- [ ] Branch correta (não commitar diretamente em `main` sem PR)
