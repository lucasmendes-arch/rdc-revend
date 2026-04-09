import { Component, type ReactNode } from 'react'

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
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-alt p-6">
          <div className="bg-white rounded-2xl shadow-card p-8 max-w-md text-center">
            <h1 className="text-xl font-bold text-foreground mb-2">Algo deu errado</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Ocorreu um erro inesperado. Tente recarregar a pagina.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-lg btn-gold text-white font-medium"
            >
              Recarregar
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
