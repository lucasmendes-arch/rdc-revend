import { Check, ShoppingCart } from 'lucide-react'
import type { PublicProduct } from '@/hooks/useCatalogProducts'

interface CompactProductCarouselProps {
    title: string
    products: PublicProduct[]
    cartAddedId: string | null
    getQty: (id: string) => number
    onAdd: (product: PublicProduct) => void
    onSelect: (product: PublicProduct) => void
    getSuggestedPrice: (price: number, compareTo: number | null) => number
}

export default function CompactProductCarousel({
    title,
    products,
    cartAddedId,
    getQty,
    onAdd,
    onSelect,
    getSuggestedPrice
}: CompactProductCarouselProps) {
    if (products.length === 0) return null

    return (
        <div className="mb-8 w-full sm:hidden">
            <div className="flex items-center justify-between px-4 mb-3">
                <h2 className="text-[14px] font-bold text-foreground">{title}</h2>
                <button className="text-[11px] font-semibold text-gold-text">Ver todos</button>
            </div>

            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth px-4 pb-4 scrollbar-hide w-full">
                {products.map((product) => {
                    const suggested = getSuggestedPrice(product.price, product.compare_at_price)
                    const profit = product.price > 0
                        ? Math.round(((suggested - product.price) / product.price) * 100)
                        : null

                    return (
                        <div
                            key={product.id}
                            className="flex-shrink-0 w-[140px] snap-start bg-white rounded-xl border border-border shadow-sm flex flex-col relative overflow-hidden"
                        >
                            {profit && (
                                <div className="absolute top-0 left-0 bg-green-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-br-lg z-10">
                                    +{profit}% LUCRO
                                </div>
                            )}

                            <div
                                className="w-full h-[140px] bg-surface-alt flex items-center justify-center p-2 cursor-pointer relative"
                                onClick={() => onSelect(product)}
                            >
                                {product.main_image ? (
                                    <img
                                        src={product.main_image}
                                        alt={product.name}
                                        className="w-full h-full object-contain mix-blend-multiply"
                                    />
                                ) : (
                                    <ShoppingCart className="w-8 h-8 text-muted-foreground/25" />
                                )}
                            </div>

                            <div className="p-2.5 flex flex-col flex-1">
                                <h3
                                    className="font-medium text-foreground text-[11px] leading-tight line-clamp-2 mb-1.5 cursor-pointer"
                                    onClick={() => onSelect(product)}
                                >
                                    {product.name}
                                </h3>

                                <div className="mt-auto">
                                    <div className="text-[10px] text-muted-foreground line-through decoration-muted-foreground/50">
                                        Sugerido: R$ {suggested.toFixed(2)}
                                    </div>
                                    <div className="text-sm font-bold text-foreground mb-2">
                                        R$ {product.price.toFixed(2)}
                                    </div>

                                    <button
                                        onClick={() => onAdd(product)}
                                        className={`w-full h-8 flex items-center justify-center gap-1 rounded bg-gold-light text-gold-text text-[10px] font-bold transition-all ${cartAddedId === product.id
                                                ? 'bg-green-100 text-green-700 border border-green-200'
                                                : 'border border-gold-border'
                                            }`}
                                    >
                                        {cartAddedId === product.id ? (
                                            <>
                                                <Check className="w-3 h-3" /> Adicionado
                                            </>
                                        ) : (
                                            'Comprar'
                                        )}
                                    </button>
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
