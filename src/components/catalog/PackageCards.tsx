import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { Check, ShoppingCart, TrendingUp, X } from 'lucide-react'
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
  const [detailsPkgId, setDetailsPkgId] = useState<number | null>(null)

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

    let addedCount = 0
    for (const item of entry.selected) {
      if (item.product.id === 'not_found') continue
      addItem({ id: item.product.id, name: item.product.name, price: item.product.price, image: item.product.main_image }, item.qty)
      addedCount += item.qty
    }

    // Green feedback
    setAddedPkgId(pkgId)
    setTimeout(() => setAddedPkgId(null), 1200)

    toast.success(`${addedCount} produtos adicionados ao carrinho!`, {
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
        className="flex gap-4 sm:gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth px-3 sm:px-4 pl-4 lg:px-8 pt-4 pb-4 sm:pt-6 sm:pb-6 scrollbar-none w-full"
      >
        {packageSelections.map(({ pkg, selected }) => {
          const pkgTotal = selected.reduce((sum, item) => sum + (item.product.id !== 'not_found' ? item.product.price : 0) * item.qty, 0);
          const totalItems = selected.reduce((sum, item) => sum + item.qty, 0);
          const multiplierValue = parseFloat(pkg.multiplier.replace('x', ''));
          const dynamicRevenue = pkgTotal * multiplierValue;

          return (
            <div
              key={pkg.id}
              className={`flex-shrink-0 w-[270px] sm:w-[300px] lg:w-[260px] xl:w-[280px] snap-start rounded-xl border-2 p-3 sm:p-4 flex flex-col transition-all ${pkg.highlight
                ? 'border-amber-400 bg-gradient-to-br from-amber-50 to-white shadow-md relative'
                : 'border-border bg-white shadow-sm hover:border-gold-border'
                }`}
            >
              {pkg.highlight && (
                <span className="absolute -top-3 left-4 px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-amber-500 text-white whitespace-nowrap z-10 shadow-sm">
                  Mais Popular
                </span>
              )}

              <div className="flex flex-col mb-1.5 sm:mb-2 mt-1">
                <h3 className="font-extrabold text-[14px] sm:text-[16px] text-foreground leading-tight">{pkg.name}</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 leading-snug">{pkg.description}</p>
                <span className="text-[11px] sm:text-xs font-bold text-amber-600 mt-1">
                  {pkg.displayProductCount} Produtos Inclusos
                </span>
              </div>

              {/* Price pill */}
              <div className="mt-1 mb-3">
                <span className="text-[18px] sm:text-2xl font-black gradient-gold-text">
                  R$ {pkgTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {(() => {
                const uniqueImages = Array.from(
                  new Set(
                    selected
                      .filter(item => item.product.id !== 'not_found' && item.product.main_image)
                      .map(item => item.product.main_image)
                  )
                );

                if (uniqueImages.length === 0) return null;

                // Deterministic shuffle based on pkg.id so each package looks visually distinct
                const shuffled = [...uniqueImages];
                let seed = pkg.id;
                for (let i = shuffled.length - 1; i > 0; i--) {
                  seed = (seed * 16807) % 2147483647;
                  const j = seed % (i + 1);
                  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }

                const displayImages = shuffled.slice(0, 5);
                const remaining = pkg.displayProductCount - displayImages.length;

                return (
                  <div className="flex items-center mt-2 mb-4 sm:mb-6 pl-2 sm:pl-3">
                    <div className="flex -space-x-3.5 sm:-space-x-4">
                      {displayImages.map((imgUrl, i) => (
                        <div
                          key={i}
                          className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full border-2 border-white bg-white overflow-hidden shadow-sm relative hover:scale-110 transition-transform"
                          style={{ zIndex: i }}
                        >
                          <img src={imgUrl} alt="Produto" className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {remaining > 0 && (
                        <div
                          className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full border-2 border-white bg-surface-alt text-muted-foreground flex items-center justify-center text-[10px] sm:text-xs font-bold shadow-sm relative"
                          style={{ zIndex: 10 }}
                        >
                          +{remaining}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-1 text-[10px] sm:text-xs text-muted-foreground mb-3">
                <div className="flex items-center gap-1.5 text-green-700 font-semibold leading-tight">
                  <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Potencial de retorno estimado*{' '}
                    <span className="whitespace-nowrap">R$ {dynamicRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </span>
                </div>
              </div>

              <div className="flex-1" />

              <button
                onClick={() => handleSelectPackage(pkg.id)}
                className={`w-full flex items-center justify-center gap-2 py-2 sm:py-2.5 rounded-lg text-xs font-bold transition-all tracking-wide ${addedPkgId === pkg.id
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
                    Adicionar Pacote
                  </>
                )}
              </button>
              <button
                onClick={() => setDetailsPkgId(pkg.id)}
                className="w-full mt-2 py-2 text-xs font-bold text-muted-foreground hover:text-gold transition-colors underline bg-transparent border-none"
              >
                Ver + detalhes
              </button>
            </div>
          )
        })}
      </div>

      {/* Dots */}
      <div className="flex items-center justify-center gap-1.5 mt-2" aria-hidden="true">
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

      <div className="mt-4 sm:mt-6 px-4 sm:px-0 text-[10px] sm:text-xs text-muted-foreground leading-relaxed text-center max-w-3xl mx-auto">
        * Valores estimados com base em preços médios de revenda praticados no mercado. Resultados podem variar conforme localidade, clientela e dedicação do revendedor. Não constitui garantia de lucro.
      </div>

      {detailsPkgId !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetailsPkgId(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {(() => {
              const entry = packageSelections.find(e => e.pkg.id === detailsPkgId)
              if (!entry) return null
              const totalItems = entry.selected.reduce((sum, item) => sum + item.qty, 0)

              return (
                <>
                  <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-surface">
                    <div>
                      <h3 className="font-bold text-lg text-foreground">Kit {entry.pkg.name}</h3>
                      <p className="text-sm text-muted-foreground">{entry.pkg.displayProductCount} Produtos Inclusos</p>
                    </div>
                    <button onClick={() => setDetailsPkgId(null)} className="p-2 text-muted-foreground hover:bg-surface-alt rounded-full transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-4 sm:p-5 overflow-y-auto flex-1 bg-white">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border bg-surface-alt font-bold">
                        <tr>
                          <th className="py-2.5 px-3 rounded-tl-lg">Produto</th>
                          <th className="py-2.5 px-3 text-center">Und.</th>
                          <th className="py-2.5 px-3 text-right">Preço</th>
                          <th className="py-2.5 px-3 text-right rounded-tr-lg">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {entry.selected.map((item, idx) => (
                          <tr key={idx} className="hover:bg-surface/50 transition-colors">
                            <td className="py-3 px-3 font-medium text-foreground text-xs">{item.product.id === 'not_found' ? `${item.originalName} (Sem estoque)` : item.product.name}</td>
                            <td className="py-3 px-3 text-center text-muted-foreground text-xs">{item.qty}x</td>
                            <td className="py-3 px-3 text-right text-muted-foreground text-xs tabular-nums">R$ {item.product.price.toFixed(2)}</td>
                            <td className="py-3 px-3 text-right font-semibold text-foreground text-xs tabular-nums opacity-90">
                              {item.product.id === 'not_found' ? '-' : `R$ ${(item.product.price * item.qty).toFixed(2)}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-border font-bold text-foreground">
                        <tr>
                          <td colSpan={3} className="py-3 px-3 text-right">Total do Pacote</td>
                          <td className="py-3 px-3 text-right text-base text-gold-text">R$ {entry.selected.reduce((sum, item) => sum + (item.product.id !== 'not_found' ? item.product.price : 0) * item.qty, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="p-4 sm:p-5 border-t border-border bg-surface flex justify-end gap-3">
                    <button
                      onClick={() => setDetailsPkgId(null)}
                      className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-surface-alt rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        handleSelectPackage(entry.pkg.id);
                        setDetailsPkgId(null);
                      }}
                      className="w-full sm:w-auto px-6 py-2.5 bg-gold text-white font-bold rounded-lg shadow-sm hover:-translate-y-0.5 transition-transform flex items-center justify-center gap-2"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      Adicionar {entry.pkg.name}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
