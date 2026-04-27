import { Moon, Sun } from 'lucide-react'
import { useAdminTheme } from '@/contexts/AdminThemeContext'

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { isDark, toggle } = useAdminTheme()

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      title={isDark ? 'Tema claro' : 'Tema escuro'}
      className={`flex items-center justify-center transition-colors duration-150 ${className}`}
    >
      {isDark
        ? <Sun className="w-[15px] h-[15px]" />
        : <Moon className="w-[15px] h-[15px]" />}
    </button>
  )
}
