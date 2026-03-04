import { useCallback, useMemo, useRef, useState } from 'react'
import { ShoppingCart, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { PACKAGES, selectProductsForPackage } from '@/config/packages'
import { useCart } from '@/contexts/CartContext'
import type { PublicProduct } from '@/hooks/useCatalogProducts'

interface PackageCardsProps {
  products: PublicProduct[]
}

export default function PackageCards({ products }: PackageCardsProps) {
  const { addItem } = useCart()
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  // Memoize heavy knapsack computation
  const packageSelections = useMemo(
    () => PACKAGES.map(pkg => ({
      pkg,
      selected: selectProductsForPackage(pkg, products),
    })),
    [products]
  )

  const handleScroll = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el && el.children.length > 0) {
        const card = el.children[0] as HTMLElement
        const gap = parseFloat(getComputedStyle(el).gap) || 0
        const index = Math.round(el.scrollLeft / (card.offsetWidth + gap))
        setActiveIndex(Math.min(index, PACKAGES.length - 1))
      }
      rafRef.current = null
    })
  }, [])

  const handleSelectPackage = (pkgId: number) => {
    const entry = packageSelections.find(e => e.pkg.id === pkgId)
    if (!entry || entry.selected.length === 0) {
      toast.error('Nenhum produto disponível para este pacote')
      return
    }

    for (const p of entry.selected) {
      addItem({ id: p.id, name: p.name, price: p.price, image: p.main_image })
    }

    toast.success(`${entry.selected.length} produtos adicionados ao carrinho!`, {
      action: {
        label: 'Ver Pedido',
        onClick: () => navigate('/pedido'),
      },
    })
  }

  return (
    <div className="mb-4 -mx-3 sm:mx-0">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scroll-smooth px-3 sm:px-0 pb-2 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible sm:gap-3"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {packageSelections.map(({ pkg, selected }) => (
          <div
            key={pkg.id}
            className={`flex-shrink-0 w-[calc(100vw-2rem)] sm:w-auto snap-start rounded-xl border-2 p-2.5 sm:p-4 flex flex-col transition-all ${
              pkg.highlight
                ? 'border-amber-400 bg-gradient-to-b from-amber-50 to-white shadow-lg relative'
                : 'border-border bg-white hover:border-gold-border'
            }`}
          >
            {pkg.highlight && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-white whitespace-nowrap">
                Mais Popular
              </span>
            )}

            <h3 className="font-bold text-sm sm:text-base text-foreground">{pkg.name}</h3>
            <p className="text-[10px] sm:text-xs text-muted-foreground mb-2">{pkg.description}</p>

            {/* Price highlight pill */}
            <div className="inline-flex self-start items-center px-3 py-1 rounded-full bg-gold-light border border-gold-border mb-1">
              <span className="text-base sm:text-xl font-bold gradient-gold-text">
                R$ {pkg.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="space-y-1 text-[10px] sm:text-xs text-muted-foreground mb-3">
              <div>{selected.length} produtos inclusos</div>
              <div className="text-green-600 font-semibold">
                Faturamento esperado: R$ {pkg.expectedRevenue.toLocaleString('pt-BR')}
              </div>
              {/* Multiplier highlight pill */}
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 border border-green-200">
                <TrendingUp className="w-3 h-3 text-green-600" />
                <span className="font-semibold text-green-700">Multiplicador: {pkg.multiplier}</span>
              </div>
            </div>

            <div className="flex-1" />

            <button
              onClick={() => handleSelectPackage(pkg.id)}
              className={`w-full flex items-center justify-center gap-1.5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white transition-all uppercase tracking-wide ${
                pkg.highlight ? 'bg-amber-500 hover:bg-amber-600' : 'btn-gold'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Adicionar Plano
            </button>
          </div>
        ))}
      </div>

      {/* Dots indicator — mobile only */}
      <div className="flex items-center justify-center gap-1.5 mt-2 sm:hidden" aria-hidden="true">
        {PACKAGES.map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all ${
              i === activeIndex
                ? 'w-4 h-1.5 bg-amber-500'
                : 'w-1.5 h-1.5 bg-border'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
