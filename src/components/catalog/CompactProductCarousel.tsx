import { Check, ShoppingCart } from 'lucide-react'
import type { PublicProduct } from '@/hooks/useCatalogProducts'
import { img } from '@/lib/imageOptimizer'

interface CompactProductCarouselProps {
    title: string
    products: PublicProduct[]
    cartAddedId: string | null
    getQty: (id: string) => number
    setQty: (id: string, qty: number) => void
    onAdd: (product: PublicProduct) => void
    onSelect: (product: PublicProduct) => void
    getSuggestedPrice: (price: number, compareTo: number | null) => number
}

import { useState, useRef, useCallback } from 'react'

export default function CompactProductCarousel({
    title,
    products,
    cartAddedId,
    getQty,
    setQty,
    onAdd,
    onSelect,
    getSuggestedPrice
}: CompactProductCarouselProps) {
    const [activeIndex, setActiveIndex] = useState(0)
    const scrollRef = useRef<HTMLDivElement>(null)
    const rafRef = useRef<number | null>(null)

    const handleScroll = useCallback(() => {
        if (rafRef.current) return
        rafRef.current = requestAnimationFrame(() => {
            const el = scrollRef.current
            if (el && el.children.length > 0) {
                const card = el.children[0] as HTMLElement
                const gap = parseFloat(getComputedStyle(el).gap) || 0
                const index = Math.round(el.scrollLeft / (card.offsetWidth + gap))
                setActiveIndex(Math.min(index, products.length - 1))
            }
            rafRef.current = null
        })
    }, [products.length])

    if (products.length === 0) return null

    return (
        <div className="mb-8 w-full">
            <div className="flex items-center justify-between px-4 mb-3 sm:mb-4 lg:mb-5">
                <h2 className="text-[15px] sm:text-lg md:text-lg lg:text-xl font-black text-foreground">{title}</h2>
                <button className="text-[12px] sm:text-sm font-bold text-gold-text hover:text-gold transition-colors">Ver todos</button>
            </div>

            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex gap-3 sm:gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth px-4 sm:px-4 pb-4 sm:pb-6 scrollbar-none w-full"
            >
                {products.map((product) => {
                    const suggested = getSuggestedPrice(product.price, product.compare_at_price)

                    return (
                        <div
                            key={product.id}
                            className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[190px] xl:w-[200px] snap-start bg-white rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow flex flex-col relative overflow-hidden group"
                        >

                            <div
                                className="w-full h-[140px] sm:h-[160px] md:h-[170px] lg:h-[170px] xl:h-[180px] bg-surface-alt flex items-center justify-center p-1 sm:p-2 cursor-pointer relative"
                                onClick={() => onSelect(product)}
                            >
                                {product.main_image ? (
                                    <img
                                        src={img.card(product.main_image)}
                                        alt={product.name}
                                        loading="lazy"
                                        className="w-full h-full object-contain mix-blend-multiply transition-transform duration-500 group-hover:scale-105"
                                    />
                                ) : (
                                    <ShoppingCart className="w-8 h-8 sm:w-12 sm:h-12 text-muted-foreground/25" />
                                )}
                            </div>

                            <div className="p-2.5 sm:p-4 flex flex-col flex-1">
                                <h3
                                    className="font-medium text-foreground text-[11px] sm:text-[13px] md:text-[13px] lg:text-[14px] leading-snug line-clamp-2 mb-1.5 sm:mb-2 cursor-pointer group-hover:text-amber-600 transition-colors"
                                    onClick={() => onSelect(product)}
                                >
                                    {product.name}
                                </h3>

                                <div className="mt-auto">
                                    {product.is_professional || title.toLowerCase().includes('profissional') ? (
                                        <div className="text-[10px] sm:text-xs md:text-xs lg:text-[13px] font-bold mb-0.5 sm:mb-1 opacity-0 pointer-events-none" aria-hidden="true">
                                            Revenda: -
                                        </div>
                                    ) : (
                                        <div className="text-[10px] sm:text-xs md:text-xs lg:text-[13px] text-green-700 font-bold mb-0.5 sm:mb-1">
                                            Revenda: R$ {suggested.toFixed(2)}
                                        </div>
                                    )}
                                    <div className="text-sm sm:text-base md:text-[15px] lg:text-base font-bold text-foreground mb-2 sm:mb-3">
                                        R$ {product.price.toFixed(2)}
                                    </div>

                                    <div className="flex items-center gap-1.5 sm:gap-2 mt-2">
                                        <div className="flex items-center gap-0.5 max-w-[70px] sm:max-w-[85px]">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setQty(product.id, getQty(product.id) - 1) }}
                                                disabled={getQty(product.id) <= 1}
                                                className="w-6 h-6 sm:w-7 sm:h-8 flex items-center justify-center rounded border border-border bg-white text-muted-foreground hover:bg-surface-alt transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm font-medium"
                                                aria-label="Diminuir quantidade"
                                            >
                                                −
                                            </button>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                aria-label="Quantidade"
                                                value={getQty(product.id)}
                                                onChange={(e) => {
                                                    const v = parseInt(e.target.value, 10);
                                                    if (!isNaN(v)) setQty(product.id, v);
                                                }}
                                                onBlur={(e) => {
                                                    const v = parseInt(e.target.value, 10);
                                                    if (isNaN(v) || v < 1) setQty(product.id, 1);
                                                }}
                                                className="w-7 h-6 sm:w-9 sm:h-8 text-center text-[11px] sm:text-xs font-semibold text-foreground border border-border rounded bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                                            />
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setQty(product.id, getQty(product.id) + 1) }}
                                                className="w-6 h-6 sm:w-7 sm:h-8 flex items-center justify-center rounded-lg border border-border bg-white text-muted-foreground hover:bg-surface-alt transition-colors text-xs sm:text-sm font-medium"
                                                aria-label="Aumentar quantidade"
                                            >
                                                +
                                            </button>
                                        </div>

                                        <button
                                            onClick={(e) => { e.stopPropagation(); onAdd(product) }}
                                            className={`flex-1 h-6 sm:h-8 flex items-center justify-center gap-1 sm:gap-1.5 rounded text-[10px] sm:text-[11px] font-bold transition-all uppercase tracking-wide ${cartAddedId === product.id
                                                ? 'bg-green-600 text-white'
                                                : 'bg-gold-light text-gold-text border border-gold-border hover:bg-gold hover:text-white'
                                                }`}
                                        >
                                            {cartAddedId === product.id ? (
                                                <>
                                                    <Check className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Adicionado</span><span className="sm:inline sm:hidden">OK!</span>
                                                </>
                                            ) : (
                                                <>
                                                    <ShoppingCart className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Comprar</span><span className="sm:inline sm:hidden">ADD</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
                {/* Spacer */}
                <div className="flex-shrink-0 w-2" aria-hidden="true" />
            </div>

            {/* Dots */}
            <div className="flex items-center justify-center gap-1.5 mt-2 mb-2" aria-hidden="true">
                {products.map((_, i) => (
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
