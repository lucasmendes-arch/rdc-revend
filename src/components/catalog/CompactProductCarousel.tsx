import { ArrowRight } from 'lucide-react'
import type { PublicProduct } from '@/hooks/useCatalogProducts'
import { Button } from '@/components/ui/button'
import ProductCard from './ProductCard'

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
    isPartner?: boolean
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
    isPartner = false,
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

    const isProfessionalRow = title.toLowerCase().includes('profissional')

    return (
        <section className="mb-8 w-full">
            <div className="flex items-center justify-between gap-3 px-4 sm:px-0 mb-3">
                <h2 className="text-[15px] font-semibold text-foreground tracking-tight truncate">{title}</h2>
                {onViewAll && (
                    <Button variant="ghost" size="xs" onClick={onViewAll} className="text-ink-500 shrink-0">
                        Ver todos
                        <ArrowRight />
                    </Button>
                )}
            </div>

            <div
                ref={scrollRef}
                onScroll={handleScroll}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth px-4 sm:px-0 scroll-pl-4 sm:scroll-pl-0 pb-3 scrollbar-none w-full cursor-grab"
            >
                {products.map((product, index) => (
                    <ProductCard
                        key={product.id}
                        // Itens além do 4º ficam travados para visitante
                        locked={isGuest && index >= 4}
                        product={product}
                        isGuest={isGuest}
                        isPartner={isPartner}
                        suggested={getSuggestedPrice(product.price, product.compare_at_price)}
                        showSuggested={!product.is_professional && !isProfessionalRow}
                        reserveSuggested
                        qty={getQty(product.id)}
                        setQty={(q) => setQty(product.id, q)}
                        added={cartAddedId === product.id}
                        onAdd={() => onAdd(product)}
                        onSelect={() => onSelect(product)}
                        className="flex-shrink-0 w-[160px] sm:w-[180px] lg:w-[196px] snap-start"
                    />
                ))}
                {/* Spacer */}
                <div className="flex-shrink-0 w-1 sm:w-0" aria-hidden="true" />
            </div>

            {/* Dots — só no mobile, onde não há seta nem barra de rolagem */}
            <div className="flex sm:hidden items-center justify-center gap-1.5 mt-1" aria-hidden="true">
                {products.map((_, i) => (
                    <div
                        key={i}
                        className={`rounded-full transition-all ${i === activeIndex
                            ? 'w-4 h-1.5 bg-foreground'
                            : 'w-1.5 h-1.5 bg-border'
                            }`}
                    />
                ))}
            </div>
        </section>
    )
}
