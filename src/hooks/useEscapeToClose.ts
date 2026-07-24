import { useEffect } from 'react'

// Fecha um modal ao apertar Esc. `active` deixa o listener registrado só
// enquanto o modal está de fato aberto — necessário pros modais que são
// renderizados inline dentro da página (não desmontam/montam como
// componente próprio), onde o hook não pode ser condicionado a um `if`.
export function useEscapeToClose(onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, active])
}
