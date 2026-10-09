# Brief de migração visual — rodada 2026-10-09

Contrato para padronizar TODAS as telas no mesmo sistema. Leia inteiro antes
de editar. Tokens e direção: `design-tokens.md` + `src/index.css`.
Primitivos: `src/components/admin/ui/AdminPage.tsx` (leia o arquivo).

## Direção

SaaS moderno (Linear / Lightfield). Neutro levemente quente (`ink-*`), ouro da
logo como ÚNICA cor de marca, chapado. Títulos de página e números de KPI em
Bricolage Grotesque (`h1` já herda; KPI usa `font-title`). Todo o resto Geist.

Proibido: roxo/violeta como marca, degradê em botão, glow, sombra colorida,
`hover:-translate-y-*`, `hover:shadow-lg`, ícone dentro de quadradinho colorido
como decoração, rótulo em CAIXA-ALTA com tracking (`uppercase tracking-*`).

## 1. Shell de página (admin)

Toda página dentro de `AdminLayout` usa `AdminPage`:

```tsx
<AdminLayout>
  <AdminPage
    title="Vagas"
    description="Cadastro de vagas por unidade"
    actions={<Button onClick={openCreate}><Plus />Nova vaga</Button>}
    tabs={<PageTabs items={…} value={…} onChange={…} />}   // se a página tem sub-abas
    toolbar={<Toolbar><SearchInput … /><AdminSelect … /></Toolbar>}
  >
    …conteúdo…
  </AdminPage>
</AdminLayout>
```

- REMOVER o cabeçalho feito à mão (`<div className="bg-card border-b sticky top-0 …"><h1>`),
  e qualquer wrapper de padding do conteúdo (`px-4 sm:px-6 py-4`, `p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto`).
  O AdminPage já dá `px-4 sm:px-6 lg:px-8`.
- `AdminHeader` está deprecado: troque por `AdminPage`. `AdminPeriodFilter` vai no `toolbar`
  (ele não tem mais padding próprio).
- Kanban / conteúdo que rola de borda a borda: `flush` e o próprio conteúdo controla o padding
  (use a const `PAGE_X` exportada para alinhar).
- Página de formulário/config: `width="default"` (1200px) ou `width="narrow"` (768px).
- Tela de detalhe/edição: `back={{ to: '/admin/pedidos', label: 'Pedidos' }}`.
- O cabeçalho NÃO é sticky (as abas da área já são). Só uma barra de ação de formulário longo
  pode ser sticky no rodapé (`sticky bottom-0`).
- Título = nome da página em sentence case ("Tabelas de preço", não "Tabelas de Preço").
  Não colocar ícone ao lado do título.
- Sub-navegação dentro da página (abas por unidade, por status) → `PageTabs` (sublinhado ouro).
  Alternar visão do mesmo dado (lista/kanban) → `Segmented`.

## 2. Botões

Usar `<Button>` de `@/components/ui/button` (não `<button className="px-4 py-2 rounded-lg …">`).

| Intenção | Variante |
|---|---|
| A ação principal da tela (Novo X, Salvar) — UMA por tela | `default` (ouro) |
| Secundária (Exportar, Reordenar, Cancelar, Voltar) | `secondary` |
| Ação de toolbar / ícone / terciária | `ghost` (`size="icon"` / `"icon-sm"`) |
| Excluir confirmado | `destructive` |

- `bg-success-solid text-white` como botão de "Novo"/"Salvar" → vira `default` (ouro).
  Verde só para WhatsApp (exceção de marca documentada) ou confirmação de pagamento.
- `btn-action`/`btn-gold` em `<button>` cru → `<Button>`.
- Rótulo em sentence case, verbo + objeto: "Nova vaga", "Salvar alterações".
- No mobile pode esconder o texto (`<span className="hidden sm:inline">`) mas o botão mantém `aria-label`.

## 3. Superfícies

- Caixa padrão: `Panel` (ou `Card`) = `rounded-lg border border-border bg-card shadow-xs`.
  `rounded-xl`/`rounded-2xl` em card de conteúdo → `rounded-lg`. `rounded-xl` só modal/drawer
  e card de mídia (foto de produto). `shadow-sm`/`shadow-md` em card estático → `shadow-xs`.
- Padding de card: `p-4 sm:p-5`. Gap entre cards: `gap-3` (grid de KPI) / `gap-4` (painéis) /
  `space-y-6` entre seções.
- Título de seção dentro da página: `AdminSection` ou `<h2 className="text-[15px] font-semibold tracking-tight">`.
  Título dentro de card: 14px semibold. Nunca `text-lg font-bold`/`text-xl` dentro de card.
- KPIs: `StatCard` dentro de `StatGrid` (ou `AdminSummaryCard`, que já tem o mesmo visual).

## 4. Tipografia

- `font-bold` → `font-semibold` em título/valor. `font-bold` não existe mais no sistema
  (exceto número enorme isolado, e mesmo aí prefira `font-semibold font-title`).
- Escala: 26 (título página) · 15 (seção) · 14 (título card) · 13–13.5 (corpo de UI) · 12 (meta/legenda).
  Evitar `text-[10px]`/`text-[11px]` para texto que alguém precisa ler — mínimo 11.5–12px.
- Rótulos (`uppercase tracking-wide text-[10px] font-bold`) → `text-[12px] font-medium text-muted-foreground`
  (sentence case). Label de campo: `.field-label` ou `<Label>`.
- Valor monetário/número: `tabular-nums`.

## 5. Cor

- Ouro (`bg-brand`/`bg-primary`) = ação primária, item ativo, seleção. Texto/ícone dourado sobre
  branco = SEMPRE `text-brand-strong` (nunca `text-gold`/`text-brand`/`text-primary` em texto).
  **Nunca `text-white` sobre ouro** (contraste 1.9:1) — use `text-primary-foreground`.
- Legado `gold-*` → `brand-*` (`text-gold-text`→`text-brand-strong`, `border-gold`→`border-brand`,
  `bg-gold-light`→`bg-brand-subtle`, `border-gold-border`→`border-brand-border`, `bg-gold`→`bg-brand`).
- Status: `Badge` com variante semântica (`success|warning|danger|info|neutral|brand`).
  Pedido: `getOrderStatus()` de `@/lib/design/orderStatus`.
- Mantém as exceções categóricas documentadas em design-tokens.md §8 (origem do pedido, papel do
  usuário, cor de etapa do kanban escolhida pelo usuário, verde WhatsApp).
- Sem `bg-white`, `text-gray-*`, `slate-*`, `zinc-*`, `amber-*` — usar tokens.

## 6. Formulário e filtro

- Input/Textarea de `@/components/ui/*` (h-9, rounded-md). `<select>` nativo é proibido → `StyledSelect`.
  `<input type="date">` nativo proibido → `DateField`.
- Busca: `SearchInput`. Filtro dropdown: `AdminSelect` (h-9) ou `StyledSelect`.
- Pills de filtro: `h-8 px-3 rounded-md border text-[13px]`; ativo = `bg-brand-subtle border-brand-border text-brand-strong`.

## 7. Tabela

- Preferir `Table/TableHeader/TableRow/TableHead/TableCell` de `@/components/ui/table`.
  `<table>` cru → adicionar `className="data-table"` e REMOVER as classes ad-hoc de th/td
  (uppercase, bg-gray, padding próprio). Tabela vive dentro de `Panel flush` (ou
  `rounded-lg border overflow-hidden`).
- Coluna numérica alinhada à direita (`text-right`).

## 8. Estados e feedback

- Vazio: `EmptyState` (ícone + título + descrição + ação). Carregando: `PageLoading` ou Skeleton.
- `alert(...)` → `toast.error(...)` / `toast.success(...)` de `sonner`. Mensagem diz o que houve e o que fazer.
- `window.confirm` pode ficar se não houver alternativa simples na página (não criar modal novo só pra isso).

## 9. Modais

`Dialog` do shadcn. Cabeçalho: título 16px semibold. Rodapé: `secondary` (Cancelar) à esquerda
da `default` (ação). Modal com vários campos = UM botão "Salvar alterações" no fim.

## 10. Regras de execução

- NÃO mudar lógica, queries, RPCs, nomes de props, nem comportamento. É uma passada visual/estrutural.
  Se encontrar BUG funcional óbvio (crash, botão que não faz nada), corrija e relate.
- NÃO tocar em arquivos fora da sua lista. Precisa mudar um componente compartilhado? Relate no final.
- NÃO tocar `supabase/functions/create-order/` (feature freeze).
- NÃO fazer git commit / push / checkout. O líder commita.
- Rodar `npx tsc --noEmit -p tsconfig.app.json` ao final e zerar erros NOS SEUS arquivos
  (erros em arquivos de outros agentes podem aparecer — ignore-os).
- Mobile-first: tudo tem que funcionar em 375px sem scroll horizontal da página.
- Relatório final curto: o que mudou por arquivo, bugs encontrados, o que ficou pendente.
