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

    // Pills de filtro do sistema (h-8, rounded-md, ativo em brand-subtle).
    // Eram bolhas de 56px com rótulo embaixo: ~95px de altura presos no topo
    // da tela do celular.
    return (
        <div className="w-full sm:hidden">
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex gap-1.5 overflow-x-auto scroll-smooth px-4 scroll-pl-4 pb-1.5 scrollbar-none"
            >
                {categories.map((cat) => {
                    const isActive = activeCategories.includes(cat.id)
                    const Icon = getCategoryIcon(cat.name)
                    return (
                        <button
                            key={cat.id}
                            type="button"
                            onClick={() => onToggleCategory(cat.id)}
                            aria-pressed={isActive}
                            className={`flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[13px] font-medium whitespace-nowrap transition-colors ${isActive
                                ? 'bg-brand-subtle border-brand-border text-brand-strong'
                                : 'bg-card border-border text-ink-600 hover:border-ink-300 hover:text-foreground'
                                }`}
                        >
                            <Icon className={`w-3.5 h-3.5 ${isActive ? '' : 'text-ink-400'}`} />
                            {cat.name}
                        </button>
                    )
                })}
                <div className="flex-shrink-0 w-2" aria-hidden="true" />
            </div>
        </div>
    )
}
