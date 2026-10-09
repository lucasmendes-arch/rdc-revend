import { Component, type ReactNode } from 'react'
import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import logo from '@/assets/logo-rei-dos-cachos.png'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

function isChunkLoadError(error: Error): boolean {
  const msg = error.message || ''
  return (
    error.name === 'ChunkLoadError' ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk') ||
    msg.includes('error loading dynamically imported module') ||
    (msg.includes('Importing a module script failed') && msg.includes('assets/'))
  )
}

const RELOAD_KEY = 'rdc_chunk_reload'

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)

    // Auto-reload once on chunk load errors (stale deploy)
    if (isChunkLoadError(error)) {
      const lastReload = sessionStorage.getItem(RELOAD_KEY)
      const now = Date.now()
      // Only auto-reload if we haven't done it in the last 30s (avoid infinite loop)
      if (!lastReload || now - Number(lastReload) > 30_000) {
        sessionStorage.setItem(RELOAD_KEY, String(now))
        window.location.reload()
        return
      }
    }
  }

  render() {
    if (this.state.hasError) {
      // Fica FORA do Router (envolve o BrowserRouter no App), então nada de
      // <Link>: navegação por <a href>. Mesmo shell das telas de entrada.
      return (
        <div className="min-h-screen bg-background bg-ambient flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-[420px] text-center">
            <img src={logo} alt="Rei dos Cachos" className="h-14 w-auto mx-auto mb-10" />
            <h1 className="text-[26px] leading-tight text-foreground">Algo deu errado</h1>
            <p className="text-[14px] text-muted-foreground mt-2">
              Ocorreu um erro inesperado nesta tela. Recarregue a página; se continuar, volte ao início e tente de novo.
            </p>
            <div className="mt-8 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-center gap-2">
              <Button asChild variant="secondary" size="lg">
                <a href="/">Ir para o início</a>
              </Button>
              <Button size="lg" onClick={() => window.location.reload()}>
                <RotateCw />
                Recarregar
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
