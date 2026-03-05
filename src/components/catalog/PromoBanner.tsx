import { ArrowRight } from 'lucide-react'

interface PromoBannerProps {
    onClick?: () => void;
}

export default function PromoBanner({ onClick }: PromoBannerProps) {
    return (
        <div className="w-full px-4 sm:hidden mb-6" onClick={onClick} role="button" tabIndex={0}>
            <div className="relative w-full h-32 rounded-2xl overflow-hidden bg-gradient-to-r from-amber-500 to-amber-600 shadow-lg flex items-center p-4">
                {/* Decorative elements */}
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-xl animate-pulse" />
                <div className="absolute right-12 -bottom-8 w-20 h-20 bg-gold/20 rounded-full blur-lg" />

                <div className="relative z-10 w-2/3">
                    <span className="inline-block px-2 py-0.5 bg-black/20 text-white rounded text-[10px] font-bold tracking-wider uppercase mb-1">
                        Oferta Especial
                    </span>
                    <h3 className="text-white font-black text-lg leading-tight mb-1">
                        Kits Fechados com <br />
                        <span className="text-amber-100">Super Desconto</span>
                    </h3>
                    <button className="flex items-center gap-1 text-[11px] font-bold text-white mt-1 hover:text-amber-100 transition-colors">
                        VER AGORA <ArrowRight className="w-3 h-3" />
                    </button>
                </div>
            </div>
        </div>
    )
}
