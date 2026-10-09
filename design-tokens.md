# Design Tokens — Rei dos Cachos

> Fonte de verdade: `src/index.css` (tokens) + `tailwind.config.ts` (exposição).
> Este arquivo documenta; ele não define. Se divergirem, o CSS vence.

---

## 0. A direção (2026-10-09, 3ª versão)

SaaS moderno no padrão **Linear / Lightfield**: muito branco, neutro de
saturação mínima, tipografia limpa, componentes chapados. A única cor de marca
é o **ouro da logo**, medido do PNG (`#FFA000`–`#FFB800`), usado chapado.

O que mudou em 2026-10-09 (rodada de coesão):
- O neutro saiu do cinza frio (hue 240, zinc) para um **neutro levemente
  quente** (stone, hue 20–40, saturação ≤ 14%). Ao lado do ouro, o zinc
  deixava tudo "seco"; o stone casa com o ouro sem virar creme.
- **Bricolage Grotesque** entrou como voz de título (h1 de página e número de
  KPI). É o único ponto de personalidade tipográfica; o resto é Geist.
- Admin em **canvas embutido**: moldura (sidebar + fundo) em `ink-50` e o
  conteúdo num painel branco com hairline e raio 12 a partir de `lg`.
- **`AdminPage`** virou o shell único de toda tela do admin (ver §4).

Histórico: a versão "ink" (Stripe/Vercel, dourado-marrom `#BC8329`) foi
rejeitada por ser "seca, morta", e o dourado dela não batia com a logo. A
versão "Coroa" (roxo real + botão em degradê com glow) foi rejeitada como
feia: o roxo brigava com o dourado e o botão parecia 3D.
**Não voltar a nenhuma das duas.**

Cinco regras:

1. **Neutro quente de saturação mínima** (`--ink-*`). Nada de roxo, creme
   ou cinza azulado no fundo.
2. **Ouro da logo chapado** (`--primary` = `--brand` = `#FFAA00`): ação
   primária, item ativo, seleção, aba ativa. Sem degradê, sem bisel, sem glow.
   Texto sobre o ouro é sempre `text-primary-foreground` (nunca branco).
3. **Set semântico fechado**: `success` / `warning` / `danger` / `info` /
   `neutral`.
4. **Hairline faz o trabalho da sombra.** Sombra curta e neutra.
5. **A luz é ambiente**: `.bg-ambient` é um véu dourado suave no topo das
   páginas de entrada (login, início do portal, catálogo). Nunca no botão.

---

## 1. Cores

### Rampa de neutro

| Token | Light | Papel |
|---|---|---|
| `--ink-0` | `#FFFFFF` | Painel, card |
| `--ink-50` | `#F8F7F5` | Moldura do app, sidebar, superfície |
| `--ink-100` | `#F2F1EE` | Muted, hover |
| `--ink-200` | `#E6E3DF` | **Hairline** e borda de input |
| `--ink-300` | `#D5D1CC` | Borda forte / hover de borda |
| `--ink-400` | `#A39E98` | Placeholder, ícone inativo |
| `--ink-500` | `#78726C` | Texto secundário |
| `--ink-900` | `#1D1815` | **Texto principal** |

Dark: mesma rampa invertida em neutro escuro quente (`#131110` de fundo).

### Marca

| Token | Light | Uso |
|---|---|---|
| `--primary` / `--brand` | `#FFAA00` | Botão primário, aba/nav ativa, checkbox, contador |
| `--primary-foreground` | `#1A140E` | Texto sobre o ouro (~11:1) |
| `--brand-strong` | `#A85A00` | **Texto e ícone** dourado sobre branco (≥ 4.5:1) |
| `--brand-subtle` / `--brand-border` | `#FFF8E5` / `#FDE3A1` | Badge de marca, filtro ativo, avatar |
| `--ring` | ouro escurecido | Foco (≥ 3:1) |

**Nunca** usar `--brand` como cor de texto sobre branco (~1.8:1). Texto e
ícone dourados são sempre `text-brand-strong`.

A escala legada `gold-*` aponta para os mesmos tokens. `.gradient-gold` e
`.bg-brand-gradient` existem só por compatibilidade e hoje são cor sólida.

### Set semântico

| Família | Quando usar |
|---|---|
| `success` | Deu certo: pago, entregue, aprovado |
| `warning` (18°, longe do ouro) | Alguém precisa agir: aguardando pagamento |
| `danger` | Deu errado / vencido / cancelado |
| `info` | Em movimento, sem ação pendente |
| `neutral` | Em progresso interno ou arquivado |

---

## 2. Tipografia

| Família | Onde |
|---|---|
| **Bricolage Grotesque** (500–700, eixo óptico) | `h1` (herda do CSS base) e valor de KPI (`font-title`) |
| **Geist** | Todo o resto: corpo, rótulo, botão, tabela, h2/h3 |
| **Geist Mono** | ID, SKU |
| Playfair Display | Só `/lookbook` |

Escala do admin: 26 (título de página) · 15 (seção) · 14 (título de card) ·
13–13.5 (corpo de UI) · 12 (meta, legenda, cabeçalho de tabela). Nada abaixo de
11.5px para texto que precisa ser lido.

`font-bold` não faz parte do sistema: título e valor são `font-semibold`.
Rótulo é sentence case 12px `font-medium text-muted-foreground` — **sem**
caixa-alta com tracking (inclusive cabeçalho de tabela). `.eyebrow` segue
existindo com essa forma. `tabular-nums` em todo valor monetário e métrica.

---

## 2.1 Navegação

**Sidebar do admin** = parte da moldura (`bg-sidebar` = `ink-50`), 224px,
itens de 32px em 13px. Item ativo = cartão branco com hairline + ícone em
`text-brand-strong`. Logo no topo, sem caixa. Rodapé: Usuários, Ver loja,
tema, e o **bloco do usuário** (e-mail, papel, botão sair).

**Admin em áreas + abas** (`AdminLayout.tsx`):

| Área | Abas |
|---|---|
| Resultados | Unidades · Marketing |
| Catálogo | Produtos · Categorias · Disponibilidade · Estoque (módulo inteiro em /estoque/*, com sub-abas próprias) |
| Vendas Atacado | Pedidos · Clientes · Vendedores · Tabelas de preço · Financeiro (só do atacado) |
| CRM | Clientes · Segmentos · Campanhas (clientes dos salões, dados do Trinks) |
| Pessoas | Vagas · Candidatos · Contratação · Parceiros · Contratos · Cargos · Formulário |

`role='administrativo'` vê Estoque + Pessoas. As abas da área ficam **fixas
no topo do painel** (sticky, com blur), aba ativa sublinhada em ouro. Página
nova = item novo no array da área (a área "possui" a rota pelo prefixo dos
dois primeiros segmentos).

`<main>` usa `overflow-x-clip`, **não** `overflow-x-hidden`: `hidden`
transforma o painel num scroll container e quebra silenciosamente todo
`sticky` dentro das páginas.

---

## 3. Raio e elevação

`--radius: 0.5rem` (8px): sm 4 · md 6 · lg 8 · xl 12 · 2xl 16.

| Classe | Valor | Uso |
|---|---|---|
| `rounded-sm` | 4px | Badge de tabela, botão `xs` |
| `rounded-md` | 6px | **Botão, input, select, item de nav** |
| `rounded-lg` | 8px | **Card, painel** |
| `rounded-xl` | 12px | Modal, card de mídia |
| `rounded-2xl` | 16px | Raro |
| `rounded-full` | — | Pill de status, avatar, contador |

### Sombras

```css
--shadow-xs: 0 1px 2px 0 …/0.04          /* card estático */
--shadow-sm: 0 1px 2px -1px, 0 1px 3px 0 /* card em hover */
--shadow-md: 0 2px 4px -2px, 0 4px 12px  /* dropdown, popover */
--shadow-lg: 0 8px 24px -6px             /* modal, drawer */
```

Mapeamento Tailwind (o `shadow-sm` do shadcn cai no token certo sem edição):

| Classe | Token |
|---|---|
| `shadow-xs` / `shadow-sm` | `--shadow-xs` |
| `shadow` / `shadow-md` | `--shadow-sm` |
| `shadow-lg` | `--shadow-md` |
| `shadow-xl` / `shadow-2xl` | `--shadow-lg` |

Sombra curta e neutra. Não existe sombra colorida nem glow; `.shadow-gold` é só elevação neutra (legado).

---

## 4. Componentes

### Button — `src/components/ui/button.tsx`

Altura padrão **36px** (`h-9`), não 40px.

| Variante | Visual | Uso |
|---|---|---|
| `default` | Ouro da logo chapado, texto quase-preto | A ação principal da tela |
| `secondary` / `outline` | Branco + hairline | Par natural do ink (Cancelar, Voltar) |
| `ghost` | Sem superfície | Terciária, toolbar, ícone |
| `destructive` | Vermelho sólido | Exclusão confirmada |
| `brand` | Preto (inverte no dark) | Ação forte sem cor de marca (raro) |
| `link` | Sublinhado | Navegação inline |

Tamanhos: `xs` (28) · `sm` (32) · `default` (36) · `lg` (40) · `icon` (36) · `icon-sm` (32).

### Badge — `src/components/ui/badge.tsx`

Variantes: `neutral` (padrão) · `success` · `warning` · `danger` · `info` ·
`brand` · `solid` · `outline`. Prop `dot` adiciona bolinha herdando a cor.

Para status de pedido **não escolher a variante na mão** — usar
`getOrderStatus()` (ver §5).

### Card

`rounded-lg` + `border-border` + `shadow-xs`. Padding `p-5`.
`CardTitle` é **15px semibold tracking-tight** — não `text-2xl`. Título de 24px
num card é o default do shadcn e o sinal mais óbvio de template não customizado.

### Input / Textarea / StyledSelect

`h-9`, `rounded-md`, hairline, `hover:border-ink-300`, foco em `ring-2 ring-ring
ring-offset-2`. `text-base` no mobile é intencional (< 16px faz o Safari do iOS
dar zoom); `md:text-sm` devolve a densidade no desktop.

Alturas de `StyledSelect` espelham Input/Button: `default` h-9, `inline` h-8,
`xs` h-7.

### Table

> 2026-10-09: cabeçalho passou a sentence case 12px sobre faixa `bg-surface` (sem caixa-alta).

Cabeçalho em caixa-alta 11px, `h-9`, sem fundo cinza. Célula `px-3 py-2.5`,
13px, `tabular-nums`. Linha separada por hairline; a tabela inteira vive sobre
superfície branca.

### Dialog

Overlay `ink-950/45` + `blur-[2px]` — o contexto continua visível. Entrada em
fade + escala 0.98 em 150ms, sem `slide-in` (modal não deve pular na tela).

### Shell de página do admin — `src/components/admin/ui/AdminPage.tsx`

Único lugar que decide título, ações, respiro lateral e ritmo vertical de uma
tela do admin. Antes, 18 das 25 telas montavam o próprio cabeçalho (títulos de
18/20/24px, bold ou semibold, sticky ou não, botão primário verde numa e
dourado noutra) — era o que fazia o admin parecer vários sistemas costurados.

```tsx
<AdminLayout>
  <AdminPage
    title="Vagas"
    description="Cadastro de vagas por unidade"
    actions={<Button><Plus />Nova vaga</Button>}
    tabs={<PageTabs items={…} value={…} onChange={…} />}
    toolbar={<Toolbar><SearchInput … /><AdminSelect … /></Toolbar>}
  >
    …
  </AdminPage>
</AdminLayout>
```

| Prop | Uso |
|---|---|
| `width` | `full` (padrão: tabela, kanban, dashboard) · `default` (1200px) · `narrow` (768px, formulário) |
| `flush` | Conteúdo sem padding (kanban que rola de borda a borda; alinhar com `PAGE_X`) |
| `back` | Link de volta em tela de detalhe/edição |
| `tabs` / `toolbar` | Sub-abas da página e barra de busca/filtros |

Primitivos no mesmo arquivo: `PageTabs` (sub-navegação, sublinhado ouro),
`Segmented` (alternar visão do mesmo dado), `Toolbar`, `SearchInput`,
`AdminSection`, `Panel` (a caixa padrão), `StatCard`/`StatGrid` (KPI),
`EmptyState`, `PageLoading`. `AdminHeader` e `AdminSummaryCard` estão
deprecados (mantidos com o mesmo visual). Regras completas da migração em
`docs/design-migration-brief.md`.

Tabela escrita à mão: `<table className="data-table">` dá o mesmo visual do
componente `ui/table`. Rótulo de campo: `.field-label`.

### Shell de página do portal — `src/components/portal/PortalPage.tsx`

Único lugar que decide largura, respiro lateral e ritmo vertical do portal.

```tsx
<PortalPage title="Bom dia, Maria" subtitle="…" badge={<Badge/>} actions={<>…</>}>
  <PortalSection title="Resumo do mês">…</PortalSection>
  <PortalSection title="Produtos" bleed aside={<Segmented/>}>…</PortalSection>
</PortalPage>
```

- **Largura**: `max-w-6xl` (1152px). Antes não havia `max-width` nenhuma — em
  monitor largo o dashboard esticava até a borda, com card de pedido de 2000px.
- **`bleed`**: deixa o conteúdo sangrar até a viewport no mobile e voltar para
  dentro do container a partir de `sm`. É o que carrossel precisa para o scroll
  pegar a largura toda no iOS sem esticar no desktop.
- Identidade do parceiro (saudação, rótulo comercial, subtítulo) vem de
  `portalIdentity.ts`, não de um componente de cabeçalho.

### Hierarquia do dashboard

Portal de revendedor é ferramenta de operação, não vitrine. A ordem das seções
codifica isso:

1. **O que trava dinheiro** — aviso de pedido aguardando pagamento, no topo
2. **Estado do mês** — pedidos, investido, último
3. **Recompra** — a ação mais frequente de um revendedor
4. **Pedidos recentes**
5. **Vitrine** — produtos e lançamentos
6. **Suporte**

Antes eram três carrosséis horizontais empilhados acima de tudo — o vocabulário
de app de consumo. Os dois de produto viraram um só com controle segmentado:
mesmo conteúdo, metade da altura.

### Utilitários de superfície

| Classe | O que faz |
|---|---|
| `.surface-card` | Card do sistema: `bg-card` + hairline + raio 8 |
| `.surface-card-interactive` | Hover escurece **só a borda** — o card não se move |
| `.nav-spine` | Traço de 2px em ouro (legado; a sidebar nova usa cartão branco) |
| `.btn-primary` / `.btn-action` / `.btn-gold` | Ação primária: ouro da logo chapado |
| `.btn-secondary` / `.btn-gold-outline` | Ação secundária branca + hairline |

> `.btn-gold` (33 usos) e `.btn-action` (59 usos) são legados **no nome**, não no
> visual: hoje ambos são a ação primária ink, para não existirem dois pretos
> ligeiramente diferentes. Em código novo usar `.btn-primary`.

---

## 5. Status de pedido — `src/lib/design/orderStatus.ts`

Fonte única. Antes, `statusConfig` estava duplicado em 7 arquivos e o **mesmo**
status tinha cores diferentes por tela (`separacao` amarelo em /meus-pedidos e
roxo em /admin/pedidos; `enviado` roxo num e azul-céu noutro). Pior: o funil
inteiro era colorido — oito etapas, oito cores — o que anula a hierarquia.

**A cor comunica o que fazer, não em que etapa está.** O nome da etapa fica no
rótulo.

| Status | Tom | Rótulo |
|---|---|---|
| `recebido` | `info` | Recebido |
| `aguardando_pagamento` | `warning` | Aguardando pagamento |
| `pago` | `success` | Pago |
| `separacao` | `neutral` | Em separação |
| `enviado` | `info` | Enviado |
| `entregue` | `success` | Entregue |
| `concluido` | `neutral` | Concluído |
| `cancelado` | `danger` | Cancelado |
| `expirado` | `neutral` | Expirado |

```tsx
const st = getOrderStatus(order.status)
<Badge variant={st.tone}>{st.short}</Badge>
```

`getOrderStatus` nunca lança: status novo criado no backend degrada para neutro
com o próprio código como rótulo, em vez de sumir da tela.

Exporta ainda `ORDER_STATUS_SEQUENCE` (ordem canônica para filtros/selects) e
`ACTIVE_ORDER_STATUSES` (o que conta como pedido em aberto).

---

## 6. Movimento

Curto e sem deslocamento vertical grande.

| Classe | Animação |
|---|---|
| `.animate-fade-in-up` | fade + 8px, 280ms, `cubic-bezier(.22,1,.36,1)` |
| `.animate-delay-100/200/300` | 60 / 120 / 180ms |
| `animate-accordion-down/up` | 180ms |

Transição padrão de elemento interativo: `transition-colors` em 150ms.
**Não** usar `hover:-translate-y-*` nem `hover:shadow-md` — em UI de dado isso
lê como site institucional.

`prefers-reduced-motion: reduce` está respeitado globalmente em `index.css`.

---

## 7. Acessibilidade

- `:focus-visible` global: `outline: 2px solid hsl(var(--ring))` com offset 2px.
  O anel é ink (não dourado): o dourado sumia sobre branco.
- Contraste: `--brand-strong` (texto dourado) e todos os `DEFAULT` das famílias
  semânticas foram escolhidos para ≥ 4.5:1 sobre o seu `subtle` e sobre branco.
- `--ink-400` é o piso para texto: abaixo disso, só ícone decorativo e borda.

---

## 8. Cobertura e dívida

### Migrado (0 usos de `amber-*`, `ring-gold`, `gray/slate/zinc-*` e `bg-white`)

Portal (dashboard, layout, shell) · autenticação (Login, Cadastro,
RedefinirSenha) · funil de compra (Catálogo, Checkout) · vitrine
(`components/catalog/*`) · pedidos (MeusPedidos, PedidoSucesso) · guards de rota.

Admin inteiro (2026-09-30): `comercial-atacado/admin`, `rh`, `dp`, `estoque`,
`sistema`, `financeiro`, `marketing`, `salao`. Critério usado na troca do
`amber-*`, para repetir em código novo:

| Era `amber` porque… | Virou |
|---|---|
| anel de foco | `ring-ring` (ink) |
| ação principal (botão sólido) | `bg-primary text-primary-foreground hover:bg-primary/90` |
| item selecionado (card, radio, pill) | `border-foreground bg-surface` |
| checkbox / radio | `text-primary` / `accent-ink-900` |
| parceiro, preço de parceiro, destaque, vendedor padrão, origem Portal | `brand-*` |
| pendência real (aguardando, sem cargo, não classificado, divergência) | `warning-*` |
| informativo sem ação | `info-*` |
| decoração (ícone de título, link, chip, eyebrow) | neutro (`text-muted-foreground`, `bg-surface-alt`, `.eyebrow`) |

`gray-*`/`slate-*`/`zinc-*`/`bg-white` foram trocados pelo equivalente exato
que a camada dark já aplicava (`bg-white`→`bg-card`, `bg-gray-50`→`bg-surface`,
`text-gray-500`→`text-muted-foreground`, `border-gray-200`→`border-border`,
demais tons → `ink-N`), e as regras correspondentes saíram do `index.css`.

`statusConfig` de pedido não existe mais fora de `orderStatus.ts`: `admin/Pedidos`,
`PedidoSucesso` e `OrderCouponModal` derivam de `ORDER_STATUS`. Onde `<Badge>`
não serve (bolinha, chip com ring, painel), usar `toneClasses(tone)`.

**Famílias semânticas (2026-09-30, 2ª passada):** `red-*` → `danger`,
`green-*`/`emerald-*` → `success`, e os `yellow/orange/blue/teal` que eram
**estado** (estoque baixo, sem compra, ainda não contado, em separação, tabela
de preço aplicada, zerado) → `warning`/`info`/`danger`. Mapas de status de
pedido em `admin/Clientes` e `sistema/Usuarios` também passaram a derivar de
`orderStatus.ts`. Com isso a **camada de coerência dark do `index.css` foi
apagada inteira**; só sobrou o ajuste do Recharts.

**Cabeçalho de `/estoque` e `/salao`:** saiu a barra `bg-gold` com texto branco.
Agora segue o shell do portal/admin: `bg-background` + hairline, marca num
tile 32px com borda, título ink 13px, ações `text-ink-500 hover:bg-muted`,
item de nav ativo `bg-muted text-foreground`.

### Exceções deliberadas (não são dívida)

Cor **categórica**, que identifica *qual*, não *como está*. Trocar por uma
família semântica mentiria (origem "Site" não é "sucesso"). Ficam hardcoded,
sempre com variante `dark:` própria:

- Origem do pedido (`originConfig` em `admin/Pedidos`: WhatsApp, Site, Salão, Loja)
- Papel do usuário (`sistema/Usuarios`: admin roxo, administrativo azul)
- Segmento "Comprador Atacado" (teal, par do dourado de "Parceiro da Rede")
- Fonte do candidato (violeta) e selo "automação" (RH/DP)
- Etapas do funil de cliente e ícones de KPI do Financeiro
- Chip de unidade/loja no estoque (violeta)
- Verde WhatsApp: botões "enviar pelo WhatsApp" e bolha da conversa (marca do WhatsApp)

### Dívida conhecida

- **Escala legada `gold-*`** (~130 usos: `text-gold-text`, `bg-gold`…): aponta
  para os tokens `brand`, então é só nome. Em código novo, `brand-*`.
- `statusConfig` de **acesso** (não de pedido) em `admin/Clientes.tsx` e
  `sistema/Usuarios.tsx` segue local — é outro domínio.
- **`/portal/comprar`** é rota órfã: nunca foi terminada e hoje redireciona
  para `/catalogo`. Remover a rota é decisão de produto.
- **`/lookbook`** usa `stone-*` + Playfair de propósito (peça de impressão) e
  está fora do sistema.
