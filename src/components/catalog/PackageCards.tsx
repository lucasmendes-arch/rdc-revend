import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { Check, Lock, ShoppingCart, TrendingUp, X } from 'lucide-react'
import { toast } from 'sonner'
import { Link, useNavigate } from 'react-router-dom'
import { PACKAGES, selectProductsForPackage } from '@/config/packages'
import { useCart } from '@/contexts/CartContext'
import type { PublicProduct } from '@/hooks/useCatalogProducts'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatBRL } from '@/lib/format'

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
      if (item.product.id === 'not_found' ) continue
      const finalPrice = isPartner && item.product.partner_price ? item.product.partner_price : item.product.price;
      addItem({ id: item.product.id, name: item.product.name, price: finalPrice, image: item.product.main_image }, item.qty)
      addedCount += item.qty
    }

    // Green feedback
    setAddedPkgId(pkgId)
    setTimeout(() => setAddedPkgId(null), 1200)

    toast.success(`${addedCount} produtos adicionados ao pedido`, {
      action: {
        label: 'Ver pedido',
        onClick: () => navigate('/checkout'),
      },
    })
  }

  return (
    <div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth px-4 sm:px-0 scroll-pl-4 sm:scroll-pl-0 pt-4 pb-3 scrollbar-none w-full"
      >
        {packageSelections.map(({ pkg, selected }) => {
          const pkgTotal = selected.reduce((sum, item) => {
            if (item.product.id === 'not_found') return sum;
            const finalPrice = isPartner && item.product.partner_price ? item.product.partner_price : item.product.price;
            return sum + (finalPrice * item.qty);
          }, 0);
          const multiplierValue = parseFloat(pkg.multiplier.replace('x', ''));
          const dynamicRevenue = pkgTotal * multiplierValue;
          const added = addedPkgId === pkg.id;

          return (
            <div
              key={pkg.id}
              onClick={() => setDetailsPkgId(pkg.id)}
              className={`relative flex-shrink-0 w-[272px] sm:w-[280px] snap-start rounded-lg border bg-card shadow-xs p-4 sm:p-5 flex flex-col cursor-pointer transition-colors ${pkg.highlight
                ? 'border-brand ring-1 ring-brand'
                : 'border-border hover:border-ink-300'
                }`}
            >
              {pkg.highlight && (
                <Badge variant="solid" className="absolute -top-2.5 left-4 z-10">Mais popular</Badge>
              )}

              <div className="mb-3">
                <h3 className="text-[15px] font-semibold text-foreground tracking-tight leading-tight">{pkg.name}</h3>
                <p className="text-[13px] text-muted-foreground mt-1 leading-snug">{pkg.description}</p>
              </div>

              <div className="mb-3">
                {isGuest ? (
                  <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <Lock className="w-4 h-4 flex-shrink-0" />
                    Preço ao cadastrar
                  </div>
                ) : (
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-title text-[24px] font-semibold text-foreground numeric leading-none">
                      R$ {pkgTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    {isPartner && <Badge variant="neutral">Atacado</Badge>}
                  </div>
                )}
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
                  <div className="flex items-center mb-4">
                    <div className="flex -space-x-3">
                      {displayImages.map((imgUrl, i) => (
                        <div
                          key={i}
                          className="w-11 h-11 shrink-0 rounded-full border-2 border-card bg-surface overflow-hidden relative"
                          style={{ zIndex: i }}
                        >
                          <img src={imgUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {remaining > 0 && (
                        <div
                          className="w-11 h-11 shrink-0 rounded-full border-2 border-card bg-muted text-ink-600 flex items-center justify-center text-[12px] font-medium numeric relative"
                          style={{ zIndex: 10 }}
                        >
                          +{remaining}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {!isGuest && (
                <p className="flex items-start gap-1.5 text-[12px] text-success leading-snug mb-4">
                  <TrendingUp className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>
                    Retorno estimado* <span className="font-semibold numeric whitespace-nowrap">R$ {dynamicRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </span>
                </p>
              )}

              <div className="mt-auto flex flex-col gap-1">
                {isGuest ? (
                  <Button asChild variant={pkg.highlight ? 'default' : 'secondary'} className="w-full">
                    <Link to="/cadastro" onClick={(e) => e.stopPropagation()}>Criar conta para comprar</Link>
                  </Button>
                ) : (
                  <Button
                    variant={pkg.highlight ? 'default' : 'secondary'}
                    className={`w-full ${added ? 'bg-success-subtle text-success border-success-border hover:bg-success-subtle' : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleSelectPackage(pkg.id) }}
                  >
                    {added ? <><Check /> Adicionado</> : <><ShoppingCart /> Adicionar kit</>}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-ink-500"
                  onClick={(e) => { e.stopPropagation(); setDetailsPkgId(pkg.id) }}
                >
                  Ver composição ({pkg.displayProductCount} itens)
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Dots — só no mobile */}
      <div className="flex sm:hidden items-center justify-center gap-1.5 mt-1" aria-hidden="true">
        {PACKAGES.map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all ${i === activeIndex
              ? 'w-4 h-1.5 bg-foreground'
              : 'w-1.5 h-1.5 bg-border'
              }`}
          />
        ))}
      </div>

      <p className="mt-3 px-4 sm:px-0 text-[12px] text-muted-foreground leading-relaxed max-w-3xl">
        * Valores estimados com base em preços médios de revenda praticados no mercado. Resultados podem variar conforme localidade, clientela e dedicação do revendedor. Não constitui garantia de lucro.
      </p>

      {detailsPkgId !== null && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={() => setDetailsPkgId(null)} />
          <div className="relative bg-popover border border-border rounded-t-xl sm:rounded-xl shadow-xl w-full sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-[0.98] duration-150">
            {(() => {
              const entry = packageSelections.find(e => e.pkg.id === detailsPkgId)
              if (!entry) return null

              return (
                <>
                  <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-4 border-b border-border">
                    <div className="min-w-0">
                      <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Kit {entry.pkg.name}</h3>
                      <p className="text-[13px] text-muted-foreground mt-0.5">{entry.pkg.displayProductCount} produtos inclusos</p>
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDetailsPkgId(null)} aria-label="Fechar">
                      <X />
                    </Button>
                  </div>
                  <div className="overflow-y-auto flex-1">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Produto</th>
                          <th className="!text-right">Qtd.</th>
                          {!isGuest && <th className="!text-right hidden sm:table-cell">Preço</th>}
                          {!isGuest && <th className="!text-right">Total</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {entry.selected.map((item, idx) => (
                          <tr key={idx}>
                            <td className="text-foreground">
                              {item.product.id === 'not_found'
                                ? <span className="text-muted-foreground">{item.originalName} (sem estoque)</span>
                                : item.product.name}
                            </td>
                            <td className="text-right text-muted-foreground whitespace-nowrap">{item.qty}x</td>
                            {!isGuest && (
                              <td className="text-right text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                                {formatBRL((isPartner && item.product.partner_price ? item.product.partner_price : item.product.price))}
                              </td>
                            )}
                            {!isGuest && (
                              <td className="text-right font-medium text-foreground whitespace-nowrap">
                                {item.product.id === 'not_found' ? '—' : `${formatBRL(((isPartner && item.product.partner_price ? item.product.partner_price : item.product.price) * item.qty))}`}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!isGuest && (
                    <div className="flex items-baseline justify-between px-4 sm:px-5 py-3 border-t border-border bg-surface">
                      <span className="text-[14px] font-semibold text-foreground">Total do kit</span>
                      <span className="font-title text-[20px] font-semibold text-foreground numeric">
                        R$ {entry.selected.reduce((sum, item) => {
                          if (item.product.id === 'not_found') return sum;
                          const price = isPartner && item.product.partner_price ? item.product.partner_price : item.product.price;
                          return sum + (price * item.qty);
                        }, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  <div className="px-4 sm:px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <Button variant="secondary" onClick={() => setDetailsPkgId(null)}>
                      {isGuest ? 'Fechar' : 'Cancelar'}
                    </Button>
                    {isGuest ? (
                      <Button asChild>
                        <Link to="/cadastro">Criar conta grátis para comprar</Link>
                      </Button>
                    ) : (
                      <Button
                        onClick={() => {
                          handleSelectPackage(entry.pkg.id);
                          setDetailsPkgId(null);
                        }}
                      >
                        <ShoppingCart />
                        Adicionar kit {entry.pkg.name}
                      </Button>
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
