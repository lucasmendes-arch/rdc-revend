import { Check, ShoppingCart } from 'lucide-react'
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
}

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
    if (products.length === 0) return null

    return (
        <div className="mb-8 w-full">
            <div className="flex items-center justify-between px-4 mb-3 sm:mb-4 lg:mb-5">
                <h2 className="text-[15px] sm:text-lg md:text-xl lg:text-2xl font-black text-foreground">{title}</h2>
                <button className="text-[12px] sm:text-sm font-bold text-gold-text hover:text-gold transition-colors">Ver todos</button>
            </div>

            <div className="flex gap-3 sm:gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth px-4 sm:px-2 pb-4 sm:pb-6 scrollbar-hide w-full">
                {products.map((product) => {
                    const suggested = getSuggestedPrice(product.price, product.compare_at_price)

                    return (
                        <div
                            key={product.id}
                            className="flex-shrink-0 w-[140px] sm:w-[190px] md:w-[240px] lg:w-[280px] snap-start bg-white rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow flex flex-col relative overflow-hidden group"
                        >

                            <div
                                className="w-full h-[140px] sm:h-[190px] md:h-[240px] lg:h-[280px] bg-surface-alt flex items-center justify-center p-2 sm:p-4 cursor-pointer relative"
                                onClick={() => onSelect(product)}
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
                                    className="font-medium text-foreground text-[11px] sm:text-[13px] md:text-[15px] lg:text-base leading-tight line-clamp-2 mb-1.5 sm:mb-2 cursor-pointer group-hover:text-amber-600 transition-colors"
                                    onClick={() => onSelect(product)}
                                >
                                    {product.name}
                                </h3>

                                <div className="mt-auto">
                                    {product.is_professional ? (
                                        <div className="text-[10px] sm:text-xs md:text-sm lg:text-[15px] font-bold mb-0.5 sm:mb-1 opacity-0 pointer-events-none" aria-hidden="true">
                                            Revenda: -
                                        </div>
                                    ) : (
                                        <div className="text-[10px] sm:text-xs md:text-sm lg:text-[15px] text-green-700 font-bold mb-0.5 sm:mb-1">
                                            Revenda: R$ {suggested.toFixed(2)}
                                        </div>
                                    )}
                                    <div className="text-sm sm:text-base md:text-[17px] lg:text-[18px] font-bold text-foreground mb-2 sm:mb-3">
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
                                            className={`flex-1 h-6 sm:h-8 flex items-center justify-center gap-1 sm:gap-1.5 rounded text-[9px] sm:text-[11px] lg:text-xs font-bold transition-all uppercase tracking-wide ${cartAddedId === product.id
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
        </div>
    )
}
