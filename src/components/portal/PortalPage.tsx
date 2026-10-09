import { createContext, useContext } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import logo from '@/assets/logo-rei-dos-cachos.png'

/**
 * Shell de página do portal e das telas avulsas do cliente (pedidos,
 * checkout, confirmação).
 *
 * Existe porque toda página vinha reconstruindo o próprio layout na mão
 * (`pt-6 pb-28 space-y-7` no wrapper, `px-4 sm:px-6` repetido em cada
 * section) — e nenhuma delas tinha `max-width`. Em monitor largo o dashboard
 * esticava de ponta a ponta: card de pedido com 2000px, linha de texto que o
 * olho não consegue seguir.
 *
 * Aqui é o único lugar que decide largura, respiro lateral e ritmo vertical.
 */

type PortalWidth = 'default' | 'narrow' | 'compact'

const MAX_W: Record<PortalWidth, string> = {
  default: 'max-w-6xl', // 1152 — dashboard
  narrow: 'max-w-3xl',  // 768  — lista de pedidos, confirmação
  compact: 'max-w-xl',  // 576  — checkout (uma coluna de formulário)
}
const SM_MAX_W: Record<PortalWidth, string> = {
  default: 'sm:max-w-6xl',
  narrow: 'sm:max-w-3xl',
  compact: 'sm:max-w-xl',
}

const shell = (w: PortalWidth) => cn('mx-auto w-full px-4 sm:px-6', MAX_W[w])

const WidthContext = createContext<PortalWidth>('default')

interface PortalPageProps {
  /** Título da página. Aceita nó para permitir skeleton. */
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Badge de identidade/status à direita do título (ex.: "Parceiro"). */
  badge?: React.ReactNode
  /** Ações primária/secundária logo abaixo do título. */
  actions?: React.ReactNode
  /** Largura do conteúdo. `default` (dashboard), `narrow` (lista), `compact` (formulário). */
  width?: PortalWidth
  /** Véu dourado no topo. Desligar em telas de tarefa (checkout). */
  ambient?: boolean
  /** Conteúdo entre o cabeçalho e as seções (ex.: indicador de etapas). */
  headerExtra?: React.ReactNode
  children: React.ReactNode
}

export function PortalPage({
  title, subtitle, badge, actions, width = 'default', ambient = true, headerExtra, children,
}: PortalPageProps) {
  const compactHeader = width !== 'default'
  return (
    // pb generoso no mobile: o CartDrawer e a barra do iOS comem o rodapé.
    // bg-ambient: véu dourado suave no topo — a luz da página, não um bloco.
    <WidthContext.Provider value={width}>
      <div className={cn(ambient && 'bg-ambient', compactHeader ? 'pt-6 sm:pt-10' : 'pt-8 sm:pt-12', 'pb-28 sm:pb-12')}>
        <header className={cn(shell(width), compactHeader ? 'mb-6' : 'mb-10')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1
                className={cn(
                  'leading-[1.1] text-foreground',
                  compactHeader ? 'text-[26px] sm:text-[28px]' : 'text-[28px] sm:text-[36px]',
                )}
              >
                {title}
              </h1>
              {subtitle && (
                <p className={cn('text-muted-foreground max-w-prose', compactHeader ? 'text-[14px] mt-1.5' : 'text-[15px] mt-2')}>
                  {subtitle}
                </p>
              )}
            </div>
            {badge && <div className="shrink-0 mt-1.5">{badge}</div>}
          </div>
          {actions && <div className={cn('flex flex-wrap gap-2', compactHeader ? 'mt-5' : 'mt-6')}>{actions}</div>}
          {headerExtra && <div className="mt-5">{headerExtra}</div>}
        </header>

        <div className={compactHeader ? 'space-y-6' : 'space-y-10'}>{children}</div>
      </div>
    </WidthContext.Provider>
  )
}

interface PortalSectionProps {
  /** Título da seção. Omitir para bloco sem cabeçalho. */
  title?: string
  /** Elemento à direita do título (link "ver tudo", setas, segmented). */
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
  const width = useContext(WidthContext)
  return (
    <section>
      {(title || aside) && (
        <div className={cn(shell(width), 'flex items-center justify-between gap-3 mb-3')}>
          {title ? <h2 className="text-[15px] font-semibold text-foreground tracking-tight truncate">{title}</h2> : <span />}
          {aside && <div className="flex items-center gap-1 shrink-0">{aside}</div>}
        </div>
      )}
      <div className={cn(bleed ? cn('sm:mx-auto sm:w-full sm:px-6', SM_MAX_W[width]) : shell(width), className)}>
        {children}
      </div>
    </section>
  )
}

interface PortalTopBarProps {
  /** Destino do "voltar". Omitido = histórico do navegador. */
  backTo?: string
  backLabel?: string
  onBack?: () => void
  /** Elemento à direita (ex.: carrinho). */
  right?: React.ReactNode
}

/**
 * Barra superior das telas avulsas do cliente (pedidos, checkout,
 * confirmação): voltar à esquerda, logo no centro. Mesma altura e vidro do
 * cabeçalho mobile do PortalLayout, para as telas parecerem uma família só.
 */
export function PortalTopBar({ backTo, backLabel = 'Voltar', onBack, right }: PortalTopBarProps) {
  const navigate = useNavigate()
  const handleBack = () => {
    if (onBack) onBack()
    else if (backTo) navigate(backTo)
    else navigate(-1)
  }
  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-border">
      <div className="mx-auto w-full max-w-6xl h-14 px-2 sm:px-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={handleBack} aria-label={backLabel}>
            <ArrowLeft />
            <span className="hidden sm:inline">{backLabel}</span>
          </Button>
        </div>
        <Link to="/catalogo" aria-label="Rei dos Cachos — catálogo" className="rounded-md">
          <img src={logo} alt="Rei dos Cachos" className="h-8 w-auto" />
        </Link>
        <div className="flex justify-end">{right}</div>
      </div>
    </header>
  )
}

/** Padding lateral do shell, para quem precisa alinhar algo por fora. */
export const PORTAL_SHELL = shell('default')
