import * as React from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Search, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Shell de página do admin — o ÚNICO lugar que decide título, ações,
 * respiro lateral e ritmo vertical de uma tela do admin.
 *
 * Antes, cada página montava o próprio cabeçalho: umas com `AdminHeader`,
 * outras com `<div sticky bg-card border-b>` na mão, títulos em 18/20/24px,
 * bold ou semibold, padding `px-4 sm:px-6` em umas e `lg:px-8` em outras,
 * botão primário verde numa, dourado noutra. Isso é o que fazia o admin
 * parecer vários sistemas costurados.
 *
 *   <AdminPage
 *     title="Pedidos"
 *     description="Pedidos do atacado e do salão"
 *     actions={<Button>Novo pedido</Button>}
 *     tabs={<PageTabs … />}          // sub-abas da própria página (opcional)
 *     toolbar={<Toolbar>…</Toolbar>} // busca + filtros (opcional)
 *   >
 *     …conteúdo…
 *   </AdminPage>
 *
 * Larguras:
 *   - `full`    (padrão) tabela, kanban, dashboard — ocupa o painel todo
 *   - `default` max 1200px — página de formulário largo / configuração
 *   - `narrow`  max 768px  — formulário de uma coluna
 *
 * `flush` remove o padding do conteúdo (kanban que rola de borda a borda,
 * tabela que encosta no painel).
 */

export const PAGE_X = 'px-4 sm:px-6 lg:px-8'

const WIDTH = {
  full: '',
  default: 'max-w-[1200px]',
  narrow: 'max-w-3xl',
} as const

interface AdminPageProps {
  title: React.ReactNode
  description?: React.ReactNode
  /** Elemento ao lado do título (contador, status). */
  badge?: React.ReactNode
  /** Botões à direita do título. Primária por último (mais à direita). */
  actions?: React.ReactNode
  /** Link de volta, para telas de detalhe/edição. */
  back?: { to: string; label: string }
  /** Sub-abas da página (use `PageTabs`). Ficam entre o cabeçalho e o conteúdo. */
  tabs?: React.ReactNode
  /** Barra de busca/filtros (use `Toolbar`). */
  toolbar?: React.ReactNode
  width?: keyof typeof WIDTH
  /** Conteúdo sem padding (kanban, tabela de borda a borda). */
  flush?: boolean
  className?: string
  children: React.ReactNode
}

export function AdminPage({
  title, description, badge, actions, back, tabs, toolbar,
  width = 'full', flush, className, children,
}: AdminPageProps) {
  const frame = cn('w-full mx-auto', WIDTH[width])
  return (
    <div className={cn('pb-12', className)}>
      <header className={cn(PAGE_X, 'pt-6 sm:pt-7', tabs ? 'pb-0' : 'pb-5')}>
        <div className={frame}>
          {back && (
            <Link
              to={back.to}
              className="inline-flex items-center gap-1 -ml-1 mb-2 h-6 px-1 rounded-sm text-[12.5px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              {back.label}
            </Link>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-[22px] sm:text-[26px] leading-[1.15] text-foreground">{title}</h1>
                {badge}
              </div>
              {description && (
                <p className="mt-1 text-[13.5px] text-muted-foreground max-w-prose">{description}</p>
              )}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
          </div>
        </div>
      </header>

      {tabs && (
        <div className={cn(PAGE_X, 'mt-4 border-b border-border')}>
          <div className={frame}>{tabs}</div>
        </div>
      )}

      {toolbar && (
        <div className={cn(PAGE_X, tabs ? 'pt-4' : 'pt-0', 'pb-4')}>
          <div className={frame}>{toolbar}</div>
        </div>
      )}

      <div className={cn(!flush && PAGE_X, !flush && (tabs && !toolbar ? 'pt-5' : 'pt-0'))}>
        <div className={flush ? '' : frame}>{children}</div>
      </div>
    </div>
  )
}

// ─── Sub-abas da página ─────────────────────────────────────────────────────
// Mesmo desenho das abas da área (sublinhado em ouro), um degrau menor.

export interface PageTabItem<K extends string = string> {
  key: K
  label: React.ReactNode
  icon?: LucideIcon
  count?: number
}

interface PageTabsProps<K extends string> {
  items: PageTabItem<K>[]
  value: K
  onChange: (key: K) => void
  className?: string
}

export function PageTabs<K extends string>({ items, value, onChange, className }: PageTabsProps<K>) {
  return (
    // -ml-2.5: o texto da primeira aba alinha com a coluna do título.
    <div role="tablist" className={cn('flex items-center gap-1 overflow-x-auto scrollbar-none -mb-px -ml-2.5', className)}>
      {items.map((it) => {
        const active = it.key === value
        const Icon = it.icon
        return (
          <button
            key={it.key}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(it.key)}
            className={cn(
              'relative h-10 px-2.5 inline-flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap transition-colors',
              active ? 'text-foreground' : 'text-ink-500 hover:text-foreground',
            )}
          >
            {Icon && <Icon className={cn('w-4 h-4', active ? 'text-brand-strong' : 'text-ink-400')} />}
            {it.label}
            {typeof it.count === 'number' && (
              <span className={cn(
                'min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-medium tabular-nums inline-flex items-center justify-center',
                active ? 'bg-brand-subtle text-brand-strong' : 'bg-muted text-ink-500',
              )}>
                {it.count}
              </span>
            )}
            {active && <span aria-hidden className="absolute left-2.5 right-2.5 bottom-0 h-0.5 rounded-full bg-brand" />}
          </button>
        )
      })}
    </div>
  )
}

// ─── Segmentado ─────────────────────────────────────────────────────────────
// Para alternar VISÕES do mesmo dado (lista/kanban, mês/ano) — não para
// navegar entre páginas (isso é PageTabs).

interface SegmentedProps<K extends string> {
  items: { key: K; label: React.ReactNode; icon?: LucideIcon }[]
  value: K
  onChange: (key: K) => void
  size?: 'sm' | 'default'
  className?: string
}

export function Segmented<K extends string>({ items, value, onChange, size = 'default', className }: SegmentedProps<K>) {
  return (
    <div className={cn('inline-flex items-center p-0.5 rounded-md bg-muted border border-border', className)}>
      {items.map((it) => {
        const active = it.key === value
        const Icon = it.icon
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(it.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[5px] font-medium whitespace-nowrap transition-colors',
              size === 'sm' ? 'h-7 px-2 text-[12px]' : 'h-8 px-3 text-[13px]',
              active ? 'bg-card text-foreground shadow-xs ring-1 ring-border' : 'text-ink-500 hover:text-foreground',
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Toolbar ────────────────────────────────────────────────────────────────

export function Toolbar({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>
}

interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
}

/** Busca padrão: h-9, ícone à esquerda, botão de limpar. */
export function SearchInput({ value, onChange, className, placeholder = 'Buscar…', ...props }: SearchInputProps) {
  return (
    <div className={cn('relative w-full sm:w-72', className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 pl-8 pr-8 rounded-md border border-input bg-card text-base md:text-sm text-foreground placeholder:text-ink-400 hover:border-ink-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background transition-colors [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Limpar busca"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-sm text-ink-400 hover:text-foreground hover:bg-muted"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ─── Seção ──────────────────────────────────────────────────────────────────

interface AdminSectionProps {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
}

/** Bloco dentro da página com título de 15px. Sem caixa — use Panel se precisar. */
export function AdminSection({ title, description, actions, className, children }: AdminSectionProps) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-foreground tracking-tight">{title}</h2>}
            {description && <p className="text-[13px] text-muted-foreground mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

// ─── Panel ──────────────────────────────────────────────────────────────────

interface PanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Sem padding interno (tabela/lista que encosta na borda). */
  flush?: boolean
}

/**
 * A caixa padrão do admin: branco, hairline, raio 8 (`rounded-lg`).
 * Cabeçalho opcional separado por hairline. Substitui os
 * `bg-card rounded-xl/2xl border shadow-sm p-4/p-6` espalhados.
 */
export function Panel({ title, description, actions, flush, className, children, ...props }: PanelProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card shadow-xs', className)} {...props}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 h-12 border-b border-border">
          <div className="min-w-0">
            {title && <h3 className="text-[14px] font-semibold text-foreground tracking-tight truncate">{title}</h3>}
            {description && <p className="text-[12px] text-muted-foreground truncate">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={flush ? '' : 'p-4 sm:p-5'}>{children}</div>
    </div>
  )
}

// ─── Indicadores ────────────────────────────────────────────────────────────

interface StatCardProps {
  label: React.ReactNode
  value: React.ReactNode
  /** Linha de contexto abaixo do valor (variação, comparação). */
  hint?: React.ReactNode
  icon?: LucideIcon
  /** Tom do ícone/realce. `brand` só para o indicador principal da tela. */
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'
  /** Torna o card clicável (filtro). */
  onClick?: () => void
  active?: boolean
  className?: string
}

const TONE_ICON: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: 'text-ink-400',
  brand: 'text-brand-strong',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
}

/**
 * KPI: rótulo 12.5px em sentence case, valor em Bricolage 24px.
 * Sem caixa-alta com tracking, sem ícone em quadradinho colorido.
 */
export function StatCard({ label, value, hint, icon: Icon, tone = 'neutral', onClick, active, className }: StatCardProps) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!active : undefined}
      className={cn(
        'text-left rounded-lg border bg-card px-4 py-3.5 shadow-xs min-w-0 transition-colors',
        active ? 'border-brand ring-1 ring-brand/40' : 'border-border',
        onClick && !active && 'hover:border-ink-300',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
        {Icon && <Icon className={cn('w-3.5 h-3.5 shrink-0', TONE_ICON[tone])} />}
        <span className="truncate">{label}</span>
      </div>
      <div className="font-title mt-1.5 text-[22px] sm:text-[24px] leading-none font-semibold text-foreground tabular-nums truncate">
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[12px] text-muted-foreground truncate">{hint}</div>}
    </Comp>
  )
}

export function StatGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('grid grid-cols-2 lg:grid-cols-4 gap-3', className)}>{children}</div>
}

// ─── Estados ────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

/** Vazio = convite para agir. Sem ilustração, sem humor. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-14 px-6', className)}>
      {Icon && (
        <div className="w-10 h-10 rounded-lg border border-border bg-surface flex items-center justify-center mb-3">
          <Icon className="w-5 h-5 text-ink-400" />
        </div>
      )}
      <p className="text-[14px] font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 text-[13px] text-muted-foreground max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Carregando: spinner discreto centralizado. Para listas, prefira Skeleton. */
export function PageLoading({ label = 'Carregando…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground', className)} role="status">
      <span className="w-4 h-4 rounded-full border-2 border-ink-200 border-t-ink-500 animate-spin" aria-hidden />
      {label}
    </div>
  )
}
