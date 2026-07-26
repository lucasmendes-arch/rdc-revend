import { ArrowRight } from 'lucide-react'

interface PromoBannerProps {
    onClick?: () => void;
}

/**
 * Atalho mobile para a seção de kits.
 *
 * Era um bloco de 128px em gradiente âmbar com dois blobs desfocados
 * (`blur-xl` + `animate-pulse`) e `font-black`. Blob decorativo animado é o
 * vocabulário de promoção de varejo, não de painel de compra B2B.
 *
 * Agora é um card comum com hierarquia clara — e passou a ser um `button` de
 * verdade, em vez de uma `div` com `role="button"` que não respondia a teclado.
 */
export default function PromoBanner({ onClick }: PromoBannerProps) {
    return (
        <div className="w-full px-4 sm:hidden mb-6">
            <button
                type="button"
                onClick={onClick}
                className="w-full text-left flex items-center gap-3 p-3.5 surface-card surface-card-interactive group"
            >
                <div className="min-w-0 flex-1">
                    <span className="eyebrow">Oferta especial</span>
                    <p className="text-[14px] font-medium text-foreground leading-snug tracking-tight mt-1.5">
                        Kits fechados com desconto
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                        Margem maior por item no fechamento do kit.
                    </p>
                </div>
                <ArrowRight className="w-4 h-4 text-ink-300 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </button>
        </div>
    )
}
