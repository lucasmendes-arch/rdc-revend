import { Check, Lock, ShoppingCart } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PublicProduct } from '@/hooks/useCatalogProducts'

interface CompactProductCarouselProps {
    title: string
    products: PublicProduct[]
    cartAddedId: string | null
    getQty: (id: string) => number
    setQty: (id: string, qty: number) => void
    onAdd: (product: PublicProduct) => void
    onSelect: (product: PublicProduct) => void
    getSuggestedPrice: (price: number, compareTo: number | null) => number
    isGuest?: boolean
    onViewAll?: () => void
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
    getSuggestedPrice,
    isGuest = false,
    onViewAll,
}: CompactProductCarouselProps) {
    const [activeIndex, setActiveIndex] = useState(0)
    const scrollRef = useRef<HTMLDivElement>(null)
    const rafRef = useRef<number | null>(null)
    const isDragging = useRef(false)
    const dragStartX = useRef(0)
    const dragScrollLeft = useRef(0)

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

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        const el = scrollRef.current
        if (!el) return
        isDragging.current = true
        dragStartX.current = e.pageX - el.offsetLeft
        dragScrollLeft.current = el.scrollLeft
        el.style.cursor = 'grabbing'
        el.style.userSelect = 'none'
    }, [])

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging.current) return
        const el = scrollRef.current
        if (!el) return
        e.preventDefault()
        const x = e.pageX - el.offsetLeft
        const walk = (x - dragStartX.current) * 1.5
        el.scrollLeft = dragScrollLeft.current - walk
    }, [])

    const handleMouseUp = useCallback(() => {
        isDragging.current = false
        const el = scrollRef.current
        if (el) {
            el.style.cursor = 'grab'
            el.style.userSelect = ''
        }
    }, [])

    if (products.length === 0) return null

    return (
        <div className="mb-8 w-full">
            <div className="flex items-center justify-between px-4 mb-3 sm:mb-4 lg:mb-5">
                <h2 className="text-[15px] sm:text-lg md:text-lg lg:text-xl font-black text-foreground">{title}</h2>
                {onViewAll && (
                    <button
                        onClick={onViewAll}
                        className="text-[12px] sm:text-sm font-bold text-gold-text hover:text-gold transition-colors"
                    >
                        Ver todos
                    </button>
                )}
            </div>

            <div
                ref={scrollRef}
                onScroll={handleScroll}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className="flex gap-3 sm:gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth px-4 sm:px-4 pb-4 sm:pb-6 scrollbar-none w-full cursor-grab select-none"
            >
                {products.map((product, index) => {
                    const suggested = getSuggestedPrice(product.price, product.compare_at_price)
                    // Itens além do 4º ficam bloqueados para visitante
                    const isBlocked = isGuest && index >= 4

                    return (
                        <div
                            key={product.id}
                            className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[190px] xl:w-[200px] snap-start bg-white rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow flex flex-col relative overflow-hidden group"
                        >
                            {/* Overlay de bloqueio para itens 5+ quando visitante */}
                            {isBlocked && (
                                <>
                                    {/* Camada visual — pointer-events-none para não bloquear scroll */}
                                    <div className="absolute inset-0 z-10 rounded-xl pointer-events-none" style={{ backdropFilter: 'blur(6px)', background: 'rgba(255,255,255,0.75)' }} />
                                    {/* Conteúdo interativo */}
                                    <div className="absolute inset-0 z-20 rounded-xl flex flex-col items-center justify-center gap-1.5 px-3">
                                        <Lock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                        <p className="text-[10px] font-semibold text-foreground text-center leading-snug">
                                            Cadastre-se para ver todos
                                        </p>
                                        <Link
                                            to="/cadastro"
                                            className="text-[10px] font-bold px-2.5 py-1 rounded btn-gold text-white whitespace-nowrap"
                                        >
                                            Criar conta
                                        </Link>
                                    </div>
                                </>
                            )}

                            <div
                                className="w-full h-[140px] sm:h-[160px] md:h-[170px] lg:h-[170px] xl:h-[180px] bg-surface-alt flex items-center justify-center p-1 sm:p-2 cursor-pointer relative"
                                onClick={() => !isBlocked && onSelect(product)}
                            >
                                {product.main_image ? (
                                    <img
                                        src={product.main_image}
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
                                    onClick={() => !isBlocked && onSelect(product)}
                                >
                                    {product.name}
                                </h3>

                                <div className="mt-auto">
                                    {/* Preço de revenda: oculto para visitante */}
                                    {!isGuest && (product.is_professional || title.toLowerCase().includes('profissional') ? (
                                        <div className="text-[10px] sm:text-xs md:text-xs lg:text-[13px] font-bold mb-0.5 sm:mb-1 opacity-0 pointer-events-none" aria-hidden="true">
                                            Revenda: -
                                        </div>
                                    ) : (
                                        <div className="text-[10px] sm:text-xs md:text-xs lg:text-[13px] text-green-700 font-bold mb-0.5 sm:mb-1">
                                            Revenda: R$ {suggested.toFixed(2)}
                                        </div>
                                    ))}

                                    {/* Preço de custo: oculto para visitante */}
                                    {isGuest ? (
                                        <div className="flex items-center gap-1 mb-2 sm:mb-3">
                                            <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                            <span className="text-[11px] text-muted-foreground font-medium">Ver preço ao cadastrar</span>
                                        </div>
                                    ) : (
                                        <div className="text-sm sm:text-base md:text-[15px] lg:text-base font-bold text-foreground mb-2 sm:mb-3">
                                            R$ {product.price.toFixed(2)}
                                        </div>
                                    )}

                                    {isGuest ? (
                                        <Link
                                            to="/cadastro"
                                            className="mt-1.5 w-full flex items-center justify-center py-1 rounded text-[9px] sm:text-[10px] font-bold border border-gold-border text-gold-text hover:bg-gold hover:text-white transition-all leading-tight"
                                        >
                                            Cadastre-se
                                        </Link>
                                    ) : (
                                        <div className="flex flex-col gap-1.5 mt-2">
                                            <div className="flex items-center gap-0.5">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setQty(product.id, getQty(product.id) - 1) }}
                                                    disabled={getQty(product.id) <= 1}
                                                    className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded border border-border bg-white text-muted-foreground hover:bg-surface-alt transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium flex-shrink-0"
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
                                                    className="w-8 h-6 sm:w-10 sm:h-7 text-center text-[11px] sm:text-xs font-semibold text-foreground border border-border rounded bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                                                />
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setQty(product.id, getQty(product.id) + 1) }}
                                                    className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-lg border border-border bg-white text-muted-foreground hover:bg-surface-alt transition-colors text-xs font-medium flex-shrink-0"
                                                    aria-label="Aumentar quantidade"
                                                >
                                                    +
                                                </button>
                                            </div>

                                            <button
                                                onClick={(e) => { e.stopPropagation(); onAdd(product) }}
                                                className={`w-full h-7 sm:h-8 flex items-center justify-center gap-1.5 rounded text-[10px] sm:text-xs font-bold transition-all uppercase tracking-wide ${cartAddedId === product.id
                                                    ? 'bg-green-600 text-white'
                                                    : 'bg-gold-light text-gold-text border border-gold-border hover:bg-gold hover:text-white'
                                                    }`}
                                            >
                                                {cartAddedId === product.id ? (
                                                    <>
                                                        <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Adicionado
                                                    </>
                                                ) : (
                                                    <>
                                                        <ShoppingCart className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Comprar
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}
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
