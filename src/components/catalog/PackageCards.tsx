import { useCallback, useMemo, useRef, useState } from 'react'
import { Check, Lock, ShoppingCart, TrendingUp, X } from 'lucide-react'
import { toast } from 'sonner'
import { Link, useNavigate } from 'react-router-dom'
import { PACKAGES, selectProductsForPackage } from '@/config/packages'
import { useCart } from '@/contexts/CartContext'
import type { PublicProduct } from '@/hooks/useCatalogProducts'

interface PackageCardsProps {
  products: PublicProduct[]
  isGuest?: boolean
  isPartner?: boolean
}

export default function PackageCards({ products, isGuest = false, isPartner = false }: PackageCardsProps) {
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
    if (isGuest) {
      navigate('/cadastro')
      return
    }

    const entry = packageSelections.find(e => e.pkg.id === pkgId)
    if (!entry || entry.selected.length === 0) {
      toast.error('Nenhum produto disponível para este pacote')
      return
    }

    let addedCount = 0
    for (const item of entry.selected) {
      if (item.product.id === 'not_found') continue
      const finalPrice = isPartner && item.product.partner_price ? item.product.partner_price : item.product.price
      addItem({ id: item.product.id, name: item.product.name, price: finalPrice, image: item.product.main_image }, item.qty)
      addedCount += item.qty
    }

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
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-4 sm:gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth px-3 sm:px-4 pl-4 lg:px-8 pt-4 pb-4 sm:pt-6 sm:pb-6 scrollbar-none w-full"
      >
        {packageSelections.map(({ pkg, selected }) => {
          const pkgTotal = selected.reduce((sum, item) => {
            if (item.product.id === 'not_found') return sum
            const finalPrice = isPartner && item.product.partner_price ? item.product.partner_price : item.product.price
            return sum + (finalPrice * item.qty)
          }, 0)
          const multiplierValue = parseFloat(pkg.multiplier.replace('x', ''))
          const dynamicRevenue = pkgTotal * multiplierValue

          // Deterministic shuffle for visual variety per package
          const uniqueImages = Array.from(
            new Set(
              selected
                .filter(item => item.product.id !== 'not_found' && item.product.main_image)
                .map(item => item.product.main_image)
            )
          )
          const shuffled = [...uniqueImages]
          let seed = pkg.id
          for (let i = shuffled.length - 1; i > 0; i--) {
            seed = (seed * 16807) % 2147483647
            const j = seed % (i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
          }
          const bannerImages = shuffled.slice(0, 4)
          const remainingCount = pkg.displayProductCount - bannerImages.length

          return (
            <div
              key={pkg.id}
              className={`flex-shrink-0 w-[220px] sm:w-[300px] lg:w-[260px] xl:w-[280px] snap-start rounded-xl border-2 flex flex-col transition-all overflow-hidden relative ${
                pkg.highlight
                  ? 'border-amber-400 bg-gradient-to-br from-amber-50 to-white shadow-md'
                  : 'border-border bg-white shadow-sm hover:border-gold-border'
              }`}
            >
              {/* Mais Popular badge */}
              {pkg.highlight && (
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white whitespace-nowrap z-10 shadow-sm">
                  Mais Popular
                </span>
              )}

              {/* Product image banner strip */}
              {bannerImages.length > 0 && (
                <div className="flex w-full h-[88px] sm:h-[100px] bg-surface-alt border-b border-border/20 shrink-0">
                  {bannerImages.map((imgUrl, i) => (
                    <div key={i} className="flex-1 h-full bg-surface-alt flex items-center justify-center overflow-hidden">
                      <img
                        src={imgUrl!}
                        alt="Produto"
                        className="w-full h-full object-contain mix-blend-multiply"
                      />
                    </div>
                  ))}
                  {remainingCount > 0 && (
                    <div className="w-10 h-full bg-surface-alt flex items-center justify-center text-[11px] font-bold text-muted-foreground shrink-0 border-l border-border/20">
                      +{remainingCount}
                    </div>
                  )}
                </div>
              )}

              {/* Card body */}
              <div className="p-3 sm:p-4 flex flex-col flex-1">
                {/* Name + count */}
                <div className="mb-2">
                  <h3 className="font-extrabold text-[13px] sm:text-[16px] text-foreground leading-tight">{pkg.name}</h3>
                  <p className="hidden sm:block text-[10px] text-muted-foreground mt-0.5 leading-snug">{pkg.description}</p>
                  <span className="text-[10px] sm:text-xs font-bold text-amber-600 mt-0.5 block">
                    {pkg.displayProductCount} produtos
                  </span>
                </div>

                {/* Price */}
                <div className="mb-2">
                  {isGuest ? (
                    <div className="flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground font-medium">Ver após cadastro</span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[20px] sm:text-2xl font-black gradient-gold-text leading-none">
                        R$ {pkgTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      {isPartner && (
                        <span className="text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded uppercase font-bold">Atacado</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Revenue estimate — condensed single line */}
                {!isGuest && (
                  <div className="flex items-center gap-1 text-[9px] sm:text-[10px] text-green-700 font-semibold mb-3 leading-tight">
                    <TrendingUp className="w-3 h-3 shrink-0" />
                    <span>Pot. R$ {dynamicRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}*</span>
                  </div>
                )}

                <div className="flex-1" />

                {/* CTA */}
                {isGuest ? (
                  <Link
                    to="/cadastro"
                    className={`w-full flex items-center justify-center gap-2 py-2 sm:py-2.5 rounded-lg text-xs font-bold transition-all tracking-wide ${
                      pkg.highlight
                        ? 'bg-amber-500 hover:bg-amber-600 text-white'
                        : 'border border-gold-border text-gold-text hover:bg-gold hover:text-white'
                    }`}
                  >
                    Cadastre-se para comprar
                  </Link>
                ) : (
                  <button
                    onClick={() => handleSelectPackage(pkg.id)}
                    className={`w-full flex items-center justify-center gap-2 py-2 sm:py-2.5 rounded-lg text-xs font-bold transition-all tracking-wide ${
                      addedPkgId === pkg.id
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
                )}

                <button
                  onClick={() => setDetailsPkgId(pkg.id)}
                  className="w-full mt-2 py-2 text-xs font-bold text-muted-foreground hover:text-gold transition-colors underline bg-transparent border-none"
                >
                  Ver + detalhes
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Dots */}
      <div className="flex items-center justify-center gap-1.5 mt-2" aria-hidden="true">
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
                          {!isGuest && <th className="py-2.5 px-3 text-right">Preço</th>}
                          {!isGuest && <th className="py-2.5 px-3 text-right rounded-tr-lg">Total</th>}
                          {isGuest && <th className="py-2.5 px-3 text-right rounded-tr-lg" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {entry.selected.map((item, idx) => (
                          <tr key={idx} className="hover:bg-surface/50 transition-colors">
                            <td className="py-3 px-3 font-medium text-foreground text-xs">{item.product.id === 'not_found' ? `${item.originalName} (Sem estoque)` : item.product.name}</td>
                            <td className="py-3 px-3 text-center text-muted-foreground text-xs">{item.qty}x</td>
                            {!isGuest && (
                              <td className="py-3 px-3 text-right text-muted-foreground text-xs tabular-nums">
                                R$ {(isPartner && item.product.partner_price ? item.product.partner_price : item.product.price).toFixed(2)}
                              </td>
                            )}
                            {!isGuest && (
                              <td className="py-3 px-3 text-right font-semibold text-foreground text-xs tabular-nums opacity-90">
                                {item.product.id === 'not_found' ? '-' : `R$ ${((isPartner && item.product.partner_price ? item.product.partner_price : item.product.price) * item.qty).toFixed(2)}`}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      {!isGuest && (
                        <tfoot className="border-t-2 border-border font-bold text-foreground">
                          <tr>
                            <td colSpan={3} className="py-3 px-3 text-right">Total do Pacote</td>
                            <td className="py-3 px-3 text-right text-base text-gold-text">
                              R$ {entry.selected.reduce((sum, item) => {
                                if (item.product.id === 'not_found') return sum
                                const price = isPartner && item.product.partner_price ? item.product.partner_price : item.product.price
                                return sum + (price * item.qty)
                              }, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                  <div className="p-4 sm:p-5 border-t border-border bg-surface flex justify-end gap-3">
                    <button
                      onClick={() => setDetailsPkgId(null)}
                      className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-surface-alt rounded-lg transition-colors"
                    >
                      {isGuest ? 'Fechar' : 'Cancelar'}
                    </button>
                    {isGuest ? (
                      <Link
                        to="/cadastro"
                        className="w-full sm:w-auto px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg shadow-sm hover:-translate-y-0.5 transition-transform flex items-center justify-center gap-2"
                      >
                        Criar conta grátis para comprar
                      </Link>
                    ) : (
                      <button
                        onClick={() => {
                          handleSelectPackage(entry.pkg.id)
                          setDetailsPkgId(null)
                        }}
                        className="w-full sm:w-auto px-6 py-2.5 bg-gold text-white font-bold rounded-lg shadow-sm hover:-translate-y-0.5 transition-transform flex items-center justify-center gap-2"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Adicionar {entry.pkg.name}
                      </button>
                    )}
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
