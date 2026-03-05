import { ReactNode } from 'react'
import { Sparkles, PackageSearch, Droplets, ShowerHead, Droplet, Star } from 'lucide-react'

export type Category = 'Kits' | 'Ativador' | 'Máscara' | 'Shampoo' | 'Finalizador' | 'Tonalizante'

interface CategoryBubblesProps {
    categories: readonly Category[]
    activeCategories: Category[]
    onToggleCategory: (cat: Category) => void
}

const CategoryIcon = ({ cat, className }: { cat: Category, className?: string }) => {
    switch (cat) {
        case 'Kits': return <PackageSearch className={className} />
        case 'Ativador': return <Sparkles className={className} />
        case 'Máscara': return <Droplets className={className} />
        case 'Shampoo': return <ShowerHead className={className} />
        case 'Finalizador': return <Star className={className} />
        case 'Tonalizante': return <Droplet className={className} />
        default: return <Sparkles className={className} />
    }
}

export default function CategoryBubbles({ categories, activeCategories, onToggleCategory }: CategoryBubblesProps) {
    return (
        <div className="w-full sm:hidden mb-6">
            <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth px-4 pb-2 scrollbar-hide">
                {categories.map((cat) => {
                    const isActive = activeCategories.includes(cat)
                    return (
                        <button
                            key={cat}
                            onClick={() => onToggleCategory(cat)}
                            className="flex-shrink-0 flex flex-col items-center gap-2 w-[72px] snap-start group"
                        >
                            <div
                                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isActive
                                        ? 'bg-amber-500 shadow-md shadow-amber-500/30 text-white'
                                        : 'bg-white border border-border text-gold hover:border-gold-border hover:shadow-sm'
                                    }`}
                            >
                                <CategoryIcon cat={cat} className="w-6 h-6" />
                            </div>
                            <span
                                className={`text-[11px] text-center leading-tight ${isActive ? 'font-bold text-foreground' : 'font-medium text-muted-foreground'
                                    }`}
                            >
                                {cat}
                            </span>
                        </button>
                    )
                })}
                {/* Spacer */}
                <div className="flex-shrink-0 w-2" aria-hidden="true" />
            </div>
        </div>
    )
}
