import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

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
