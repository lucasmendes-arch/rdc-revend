import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { Check, ShoppingCart, TrendingUp } from 'lucide-react'
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
  const [addedPkgId, setAddedPkgId] = useState<number | null>(null)

  const packageSelections = useMemo(
    () => PACKAGES.map(pkg => ({
      pkg,
      selected: selectProductsForPackage(pkg, products),
    })),
    [products]
  )

  // Auto-scroll removed as requested by user


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

    // Green feedback
    setAddedPkgId(pkgId)
    setTimeout(() => setAddedPkgId(null), 1200)

    toast.success(`${entry.selected.length} produtos adicionados ao carrinho!`, {
      action: {
        label: 'Ver Pedido',
        onClick: () => navigate('/checkout'),
      },
    })
  }

  return (
    <div className="mb-4 -mx-3 sm:-mx-4 lg:-mx-6 w-[calc(100%+1.5rem)] sm:w-[calc(100%+2rem)] lg:w-[calc(100%+3rem)]">
      {/* Container extends to the edges of the screen, scroll starts exactly at text alignment */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-4 sm:gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth px-3 sm:px-4 lg:px-6 pt-4 pb-4 sm:pt-6 sm:pb-6 scrollbar-none w-full"
      >
        {packageSelections.map(({ pkg, selected }) => (
          <div
            key={pkg.id}
            className={`flex-shrink-0 w-[270px] sm:w-auto snap-start rounded-xl border-2 p-3 sm:p-5 flex flex-col transition-all ${pkg.highlight
              ? 'border-amber-400 bg-gradient-to-br from-amber-50 to-white shadow-md relative'
              : 'border-border bg-white shadow-sm hover:border-gold-border'
              }`}
          >
            {pkg.highlight && (
              <span className="absolute -top-3 left-4 px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-amber-500 text-white whitespace-nowrap z-10 shadow-sm">
                Mais Popular
              </span>
            )}

            <div className="flex flex-col mb-1.5 sm:mb-2">
              <h3 className="font-extrabold text-[15px] sm:text-lg text-foreground leading-tight">{pkg.name}</h3>
              <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5 leading-snug">{pkg.description}</p>
            </div>

            {/* Price pill */}
            <div className="mt-1 mb-3">
              <span className="text-[18px] sm:text-2xl font-black gradient-gold-text">
                R$ {pkg.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="space-y-1.5 text-[11px] sm:text-sm text-muted-foreground mb-4">
              <div className="flex items-center gap-1.5 text-green-700 font-semibold">
                <TrendingUp className="w-3.5 h-3.5" /> Retorno Estimado: R$ {pkg.expectedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="flex-1" />

            <button
              onClick={() => handleSelectPackage(pkg.id)}
              className={`w-full flex items-center justify-center gap-2 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm font-bold transition-all tracking-wide ${addedPkgId === pkg.id
                ? 'bg-green-600 shadow-none text-white'
                : pkg.highlight
                  ? 'bg-amber-500 hover:bg-amber-600 shadow-sm text-white'
                  : 'bg-surface-alt font-semibold text-foreground border border-border hover:bg-gold hover:text-white hover:border-gold'
                }`}
            >
              {addedPkgId === pkg.id ? (
                <>
                  <Check className="w-4 h-4" />
                  Adicionado!
                </>
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4" />
                  Adicionar Plano
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Dots — mobile only */}
      <div className="flex items-center justify-center gap-1.5 mt-2 sm:hidden" aria-hidden="true">
        {PACKAGES.map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all ${i === activeIndex
              ? 'w-4 h-1.5 bg-amber-500'
              : 'w-1.5 h-1.5 bg-border'
              }`}
          />
        ))}
      </div>
    </div>
  )
}
