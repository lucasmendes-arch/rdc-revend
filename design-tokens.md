# Design Tokens — Rei dos Cachos

> Fonte de verdade: `src/index.css` (tokens) + `tailwind.config.ts` (exposição).
> Este arquivo documenta; ele não define. Se divergirem, o CSS vence.

---

## 0. A direção

Clean, minimalista, premium. Referências: **Loggi, Vercel, Stripe**.

Cinco regras que explicam todas as decisões abaixo:

1. **Uma rampa de neutro só.** `--ink-0` … `--ink-950`, fria-neutra. Não existe
   cinza quente e cinza frio na mesma tela.
2. **Ação primária é ink**, não dourada. O dourado saiu do botão e virou sinal
   de marca: spine do nav ativo, badge de parceiro. É saturado justamente
   porque é raro.
3. **Set semântico fechado**: `success` / `warning` / `danger` / `info` /
   `neutral`. Status novo escolhe uma família. Não se inventa cor.
4. **Hairline faz o trabalho da sombra.** Sombra só em overlay real (dropdown,
   modal, drawer), sempre curta e de baixa opacidade.
5. **Sem gradiente decorativo, sem sombra colorida, sem `translate` no hover.**

Tokens semânticos são *alias* da rampa (`--background: var(--ink-0)`). O dark
mode inverte a rampa uma vez e todo o resto acompanha sozinho — inclusive o
botão primário, que vira branco com texto preto sem nenhuma regra extra.

---

## 1. Cores

### Rampa de neutro

| Token | Light | Dark | Papel |
|---|---|---|---|
| `--ink-0` | `#FFFFFF` | `#0E1015` | Fundo da página |
| `--ink-25` | `#FCFCFD` | `#12151B` | Superfície acima do fundo |
| `--ink-50` | `#F8F9FA` | `#171A21` | Card (dark), zebra de tabela |
| `--ink-100` | `#F1F2F4` | `#1D212A` | Muted, hover de linha |
| `--ink-200` | `#E6E8EB` | `#282D38` | **Hairline — a borda do sistema** |
| `--ink-300` | `#D3D6DB` | `#3A3F4B` | Borda forte, hover de borda |
| `--ink-400` | `#9BA1AC` | `#696F7C` | Placeholder, ícone inativo |
| `--ink-500` | `#6E7480` | `#878E9C` | Texto secundário |
| `--ink-600` | `#545A66` | `#A9AFBB` | Texto de apoio |
| `--ink-700` | `#3C424D` | `#C6CBD4` | |
| `--ink-800` | `#262A31` | `#DBDFE6` | |
| `--ink-900` | `#16181D` | `#F2F4F7` | **Texto principal / ação primária** |
| `--ink-950` | `#0B0D10` | `#FFFFFF` | Overlay de modal |

Classes Tailwind: `bg-ink-50`, `text-ink-500`, `border-ink-300`…

> A rampa foi calibrada de propósito para ficar próxima do `gray-*` do Tailwind.
> Sobraram ~200 usos legados de `gray-*`/`slate-*` nas telas admin; com a rampa
> fria eles harmonizam sozinhos no light. A borda quente antiga (`#E8E4DC`) era
> a origem real da sujeira visual.

### Semântico base (alias da rampa)

| Token | Light | Dark |
|---|---|---|
| `--background` | `ink-0` | `ink-0` |
| `--foreground` | `ink-900` | `ink-900` |
| `--card` | `ink-0` | `ink-50` |
| `--popover` | `ink-0` | `ink-100` |
| `--primary` | `ink-900` | `ink-900` *(= claro)* |
| `--primary-foreground` | `ink-0` | `ink-0` *(= escuro)* |
| `--secondary` | `ink-100` | `ink-100` |
| `--muted` | `ink-50` | `ink-100` |
| `--muted-foreground` | `ink-500` | `ink-500` |
| `--accent` | `ink-100` | `ink-100` |
| `--border` / `--input` | `ink-200` | `ink-200` |
| `--ring` | `ink-900` | `ink-700` |
| `--surface` | `ink-50` | `ink-25` |
| `--surface-alt` | `ink-100` | `ink-50` |

### Marca (dourado)

| Token | Light | Dark | Uso |
|---|---|---|---|
| `--brand` | `#BC8329` | — | Marca sólida, uso contido |
| `--brand-strong` | `#95601A` | claro | **Texto** dourado (contraste ≥ 4.5:1) |
| `--brand-solid` | `#E4A02F` | — | Spine do nav, dot, indicador |
| `--brand-subtle` | `#FDF6E9` | escuro | Fundo de badge de marca |
| `--brand-border` | `#EBD9BB` | escuro | Borda de badge de marca |

Tailwind: `bg-brand`, `text-brand-strong`, `border-brand-border`…

A escala legada `gold-*` (`text-gold-text`, `ring-gold`, `bg-gold`,
`border-gold-border` — ~170 usos) aponta para **exatamente** os mesmos tokens.
Não é uma segunda paleta. Em código novo, preferir `brand-*`.

**Nunca** usar `--brand-solid` como cor de texto sobre branco: ele existe para
área pequena e preenchida.

### Set semântico

Cada família tem quatro papéis: `DEFAULT` (texto), `solid`, `subtle` (fundo),
`border`.

| Família | Quando usar |
|---|---|
| `success` | Deu certo: pago, entregue, aprovado |
| `warning` | Alguém precisa agir agora: aguardando pagamento, doc pendente |
| `danger` | Deu errado / encerrado sem sucesso |
| `info` | Em movimento, sem ação pendente |
| `neutral` | Em progresso interno ou arquivado (usa a rampa `ink`) |

`--destructive` é alias de `--danger-solid`, não uma quinta cor.

> `warning` foi puxado para laranja (26°) e não amarelo, para não colidir com o
> dourado da marca (36–38°) quando os dois aparecem na mesma tela.

---

## 2. Tipografia

**Geist** (UI) + **Geist Mono** (código/ID), via Google Fonts.
**Playfair Display** sobrevive apenas em `/lookbook`, uma peça editorial de
impressão — não faz parte da identidade do portal e não deve ser usada em tela
de produto.

```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Playfair+Display:wght@500;600;700&display=swap');
```

### Tracking negativo progressivo

É o detalhe que faz título grande parecer apertado e caro em vez de esparramado.
Quanto maior o corpo, mais negativo:

| Classe | Valor | Uso |
|---|---|---|
| `tracking-tighter` | `-0.03em` | Display |
| `tracking-tight` | `-0.02em` | h1–h3, título de card, valor grande |
| `tracking-snug` | `-0.01em` | Botão, input, item de nav |
| `tracking-normal` | `0` | Body |
| `tracking-eyebrow` | `+0.08em` | Rótulo de seção em caixa-alta |

`h1..h4` já recebem `font-weight: 600` + tracking negativo via CSS global.

### Escala em uso

| Tamanho | Uso |
|---|---|
| `text-[11px]` | Eyebrow, badge, cabeçalho de tabela |
| `text-[12px]` | Texto auxiliar, metadados |
| `text-[13px]` | Item de nav, célula de tabela, botão `sm` |
| `text-sm` (14) | Body de UI, input |
| `text-[15px]` | Título de card, título de modal, título de página compacto |
| `text-xl`–`text-2xl` | Título de página / saudação do portal |

### Utilitários

| Classe | O que faz |
|---|---|
| `.eyebrow` | Rótulo de seção completo: 11px, 600, uppercase, `+0.08em`, muted |
| `.numeric` | `tabular-nums` + tracking `-0.01em` — **todo valor monetário e métrica** |
| `.mono` | Geist Mono + tabular — ID de pedido, SKU, código |

`th`, `td`, `output`, `time` e `[data-numeric]` já recebem `tabular-nums`
automaticamente. Número que dança de largura entre linhas é o que faz uma
tabela parecer amadora.

---

## 3. Raio e elevação

`--radius: 0.5rem` (8px).

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

Sombra colorida foi aposentada. `.shadow-gold` sobreviveu como classe (13 usos)
mas hoje é elevação neutra.

---

## 4. Componentes

### Button — `src/components/ui/button.tsx`

Altura padrão **36px** (`h-9`), não 40px.

| Variante | Visual | Uso |
|---|---|---|
| `default` | Ink sólido | A ação principal da tela. **Uma por tela.** |
| `secondary` / `outline` | Branco + hairline | Par natural do ink (Cancelar, Voltar) |
| `ghost` | Sem superfície | Terciária, toolbar, ícone |
| `destructive` | Vermelho sólido | Exclusão confirmada |
| `brand` | Dourado | Raro e deliberado: CTA de marca no portal. Não usar em admin/RH/DP |
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

Cabeçalho em caixa-alta 11px, `h-9`, sem fundo cinza. Célula `px-3 py-2.5`,
13px, `tabular-nums`. Linha separada por hairline; a tabela inteira vive sobre
superfície branca.

### Dialog

Overlay `ink-950/45` + `blur-[2px]` — o contexto continua visível. Entrada em
fade + escala 0.98 em 150ms, sem `slide-in` (modal não deve pular na tela).

### Shell de página — `src/components/portal/PortalPage.tsx`

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
| `.nav-spine` | Faixa dourada de 2px do item de nav ativo |
| `.btn-primary` / `.btn-action` / `.btn-gold` | Ação primária ink |
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

### Migrado (0 usos de `amber-*` restantes)

Portal (dashboard, layout, shell) · autenticação (Login, Cadastro,
RedefinirSenha) · funil de compra (Catálogo, Checkout) · vitrine
(`components/catalog/*`) · pedidos (MeusPedidos, PedidoSucesso) · guards de rota.

### Dívida conhecida

- **Área admin: ~390 usos de `amber-*`** em `comercial-atacado/admin`, `rh`,
  `dp`, `estoque`, `sistema`, `financeiro`, `marketing`, `salao`. Essas telas
  herdaram tokens, tipografia e primitivos, mas não passaram por revisão tela a
  tela. É o maior bloco restante.
- **Camada de coerência dark** (`.dark .bg-white`, `.dark .text-gray-500`… em
  `index.css`): traduz ~200 classes hardcoded legadas sem tocar 42 arquivos. É
  dívida consciente — o alvo é migrar as telas para tokens semânticos e ir
  apagando regras de lá.
- **`ring-gold`** (51 usos, telas admin) ainda pinta o anel de foco de bronze
  em vez do ink global. Resolver junto com a migração do admin.
- **`statusConfig` local** ainda existe em `admin/Pedidos.tsx`,
  `admin/Clientes.tsx`, `PedidoSucesso.tsx`, `sistema/Usuarios.tsx` e
  `OrderCouponModal.tsx`. Devem passar a importar `orderStatus.ts`.
- **`/portal/comprar`** é rota órfã: nunca foi terminada e hoje redireciona
  para `/catalogo`. Remover a rota é decisão de produto.
- **`/lookbook`** usa `stone-*` + Playfair de propósito (peça de impressão) e
  está fora do sistema.
