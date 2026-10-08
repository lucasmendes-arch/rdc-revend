import { cn } from '@/lib/utils'

/**
 * Shell de página do portal.
 *
 * Existe porque toda página do portal vinha reconstruindo o próprio layout na
 * mão (`pt-6 pb-28 space-y-7` no wrapper, `px-4 sm:px-6` repetido em cada
 * section) — e nenhuma delas tinha `max-width`. Em monitor largo o dashboard
 * esticava de ponta a ponta: card de pedido com 2000px, linha de texto que o
 * olho não consegue seguir.
 *
 * Aqui é o único lugar que decide largura, respiro lateral e ritmo vertical.
 */

const SHELL = 'mx-auto w-full max-w-6xl px-4 sm:px-6'

interface PortalPageProps {
  /** Título da página. Aceita nó para permitir skeleton. */
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Badge de identidade à direita do título (ex.: "Parceiro"). */
  badge?: React.ReactNode
  /** Ações primária/secundária logo abaixo do título. */
  actions?: React.ReactNode
  children: React.ReactNode
}

export function PortalPage({ title, subtitle, badge, actions, children }: PortalPageProps) {
  return (
    // pb generoso no mobile: o CartDrawer e a barra do iOS comem o rodapé.
    // bg-ambient: véu dourado suave no topo — a luz da página, não um bloco.
    <div className="bg-ambient pt-8 sm:pt-12 pb-28 sm:pb-12">
      <header className={cn(SHELL, 'mb-10')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[28px] sm:text-[36px] leading-[1.1] text-foreground">
              {title}
            </h1>
            {subtitle && <p className="text-[15px] text-muted-foreground mt-2 max-w-prose">{subtitle}</p>}
          </div>
          {badge && <div className="shrink-0 mt-2">{badge}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2 mt-6">{actions}</div>}
      </header>

      <div className="space-y-10">{children}</div>
    </div>
  )
}

interface PortalSectionProps {
  /** Eyebrow da seção. Omitir para bloco sem cabeçalho. */
  title?: string
  /** Elemento à direita do eyebrow (link "ver tudo", setas, segmented). */
  aside?: React.ReactNode
  /**
   * Deixa o conteúdo sangrar até a borda da viewport no mobile, voltando para
   * dentro do container a partir de `sm`. É o que carrossel precisa para o
   * scroll pegar a largura toda no iOS sem esticar em monitor grande.
   */
  bleed?: boolean
  className?: string
  children: React.ReactNode
}

export function PortalSection({ title, aside, bleed, className, children }: PortalSectionProps) {
  return (
    <section>
      {(title || aside) && (
        <div className={cn(SHELL, 'flex items-center justify-between gap-3 mb-3')}>
          {title ? <h2 className="text-[15px] font-semibold text-foreground tracking-tight truncate">{title}</h2> : <span />}
          {aside && <div className="flex items-center gap-1 shrink-0">{aside}</div>}
        </div>
      )}
      <div className={cn(bleed ? 'sm:mx-auto sm:w-full sm:max-w-6xl sm:px-6' : SHELL, className)}>
        {children}
      </div>
    </section>
  )
}

/** Padding lateral do shell, para quem precisa alinhar algo por fora. */
export const PORTAL_SHELL = SHELL
