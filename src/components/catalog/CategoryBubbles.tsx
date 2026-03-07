import {
    Sparkles, Palette,
    Crown, Cylinder, Waves, Droplet, Droplets, Leaf, Wand2, Gift, Brush
} from 'lucide-react'
import type { Category } from '@/hooks/useCategories'

interface CategoryBubblesProps {
    categories: Category[]
    activeCategories: string[]
    onToggleCategory: (catId: string) => void
}

const getCategoryIcon = (name: string) => {
    const n = name.toLowerCase()
    if (n.includes('kit')) return Gift
    if (n.includes('profissional')) return Crown
    if (n.includes('potão') || n.includes('creme')) return Cylinder
    if (n.includes('ativador')) return Waves
    if (n.includes('shampoo')) return Droplets
    if (n.includes('máscara') || n.includes('mascara')) return Droplet
    if (n.includes('crescimento') || n.includes('nature')) return Leaf
    if (n.includes('finalizador') || n.includes('leave')) return Wand2
    if (n.includes('tonalizante')) return Palette
    if (n.includes('acessório')) return Brush
    return Sparkles
}

import { useState, useRef, useCallback } from 'react'

export default function CategoryBubbles({ categories, activeCategories, onToggleCategory }: CategoryBubblesProps) {
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
                setActiveIndex(Math.min(index, categories.length - 1))
            }
            rafRef.current = null
        })
    }, [categories.length])

    if (categories.length === 0) return null

    return (
        <div className="w-full sm:hidden mb-6">
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth px-4 pb-2 scrollbar-none"
            >
                {categories.map((cat) => {
                    const isActive = activeCategories.includes(cat.id)
                    const Icon = getCategoryIcon(cat.name)
                    return (
                        <button
                            key={cat.id}
                            onClick={() => onToggleCategory(cat.id)}
                            className="flex-shrink-0 flex flex-col items-center gap-2 w-[72px] snap-start group"
                        >
                            <div
                                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isActive
                                    ? 'bg-amber-500 shadow-md shadow-amber-500/30 text-white'
                                    : 'bg-white border border-border text-gold hover:border-gold-border hover:shadow-sm'
                                    }`}
                            >
                                <Icon className="w-6 h-6" />
                            </div>
                            <span
                                className={`text-[11px] text-center leading-tight ${isActive ? 'font-bold text-foreground' : 'font-medium text-muted-foreground'
                                    }`}
                            >
                                {cat.name}
                            </span>
                        </button>
                    )
                })}
                <div className="flex-shrink-0 w-2" aria-hidden="true" />
            </div>

            {/* Dots */}
            <div className="flex items-center justify-center gap-1.5 mt-2" aria-hidden="true">
                {categories.map((_, i) => (
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
