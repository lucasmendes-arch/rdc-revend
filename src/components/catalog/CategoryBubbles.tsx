import { Sparkles, Package, Droplets, Feather, Palette, Bath } from 'lucide-react'
import type { Category } from '@/hooks/useCategories'

interface CategoryBubblesProps {
    categories: Category[]
    activeCategories: string[]
    onToggleCategory: (catId: string) => void
}

const getCategoryIcon = (name: string) => {
    const n = name.toLowerCase()
    if (n.includes('kit')) return Package
    if (n.includes('ativador') || n.includes('shampoo')) return Droplets
    if (n.includes('máscara') || n.includes('mascara')) return Bath
    if (n.includes('finalizador') || n.includes('leave')) return Feather
    if (n.includes('tonalizante')) return Palette
    return Sparkles
}

export default function CategoryBubbles({ categories, activeCategories, onToggleCategory }: CategoryBubblesProps) {
    if (categories.length === 0) return null

    return (
        <div className="w-full sm:hidden mb-6">
            <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth px-4 pb-2 scrollbar-hide">
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
        </div>
    )
}
