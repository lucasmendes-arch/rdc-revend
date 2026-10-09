import { Check, Lock, Minus, Plus, ShoppingCart } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PublicProduct } from '@/hooks/useCatalogProducts'
import { extractVolume } from '@/utils/product'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Card de produto da loja B2B — o mesmo na grade ("Ver todos"/busca) e nos
 * carrosséis por categoria. Antes eram duas cópias que divergiam (ADD/OK em
 * caixa-alta numa, "Comprar" na outra; preço em pesos diferentes).
 *
 * Hierarquia: foto → nome → CUSTO (o número que o revendedor paga, maior) →
 * revenda sugerida (secundária, verde) → quantidade → ação.
 */

const LOTS = [6, 12, 24]

interface ProductCardProps {
  product: PublicProduct
  isGuest: boolean
  isPartner: boolean
  /** Preço de revenda sugerido já calculado. */
  suggested: number
  /** Mostrar a linha de revenda (produto profissional não tem). */
  showSuggested: boolean
  /** Guarda o espaço da linha de revenda para alinhar cards vizinhos. */
  reserveSuggested?: boolean
  qty: number
  setQty: (qty: number) => void
  added: boolean
  onAdd: () => void
  onSelect: () => void
  /** Cadeado para visitante (itens além dos primeiros). */
  locked?: boolean
  className?: string
}

export default function ProductCard({
  product, isGuest, isPartner, suggested, showSuggested, reserveSuggested,
  qty, setQty, added, onAdd, onSelect, locked, className,
}: ProductCardProps) {
  const { baseName, volume } = extractVolume(product.name)
  const cost = isPartner && product.partner_price ? product.partner_price : product.price

  return (
    <div className={cn('relative bg-card rounded-xl border border-border shadow-xs flex flex-col overflow-hidden group', className)}>
      {locked && (
        <>
          <div className="absolute inset-0 z-10 bg-card/75 backdrop-blur-[6px] pointer-events-none" />
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 px-3 text-center">
            <Lock className="w-4 h-4 text-ink-400" />
            <p className="text-[12px] font-medium text-foreground leading-snug">Cadastre-se para ver todos</p>
            <Button asChild size="xs">
              <Link to="/cadastro">Criar conta</Link>
            </Button>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => !locked && onSelect()}
        className="relative w-full aspect-square bg-surface flex items-center justify-center overflow-hidden"
        aria-label={`Ver detalhes de ${product.name}`}
        tabIndex={locked ? -1 : undefined}
      >
        {product.main_image ? (
          <img
            src={product.main_image}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <ShoppingCart className="w-10 h-10 text-ink-300" />
        )}
        {volume && (
          <span className="absolute bottom-2 right-2 inline-flex items-center h-5 px-1.5 rounded-sm text-[11px] font-medium bg-card/90 backdrop-blur-sm text-ink-600 border border-border numeric">
            {volume}
          </span>
        )}
      </button>

      <div className="p-3 flex flex-col flex-1">
        <button
          type="button"
          onClick={() => !locked && onSelect()}
          className="text-left"
          tabIndex={locked ? -1 : undefined}
        >
          <h3 className="text-[13px] font-medium text-foreground leading-snug line-clamp-2 min-h-[2.6em]">
            {baseName}
          </h3>
        </button>

        <div className="mt-auto pt-2">
          {isGuest ? (
            <div className="flex items-center gap-1.5 mb-2.5 text-[12px] text-muted-foreground">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              Preço ao cadastrar
            </div>
          ) : (
            <div className="mb-2.5">
              <p className="text-[16px] font-semibold text-foreground numeric leading-tight">
                R$ {cost.toFixed(2)}
              </p>
              {showSuggested ? (
                <p className="text-[12px] text-success numeric mt-0.5 truncate">
                  Revenda R$ {suggested.toFixed(2)}
                </p>
              ) : reserveSuggested ? (
                <p className="text-[12px] mt-0.5 invisible" aria-hidden>—</p>
              ) : null}
            </div>
          )}

          {isGuest ? (
            <Button asChild variant="secondary" size="sm" className="w-full">
              <Link to="/cadastro">Criar conta</Link>
            </Button>
          ) : (
            <div className="flex flex-col gap-1.5">
              {/* Lote rápido: define a quantidade (não soma). */}
              <div className="grid grid-cols-3 gap-1">
                {LOTS.map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setQty(n) }}
                    aria-label={`Quantidade ${n}`}
                    aria-pressed={qty === n}
                    className={cn(
                      'h-6 rounded-sm border text-[12px] font-medium numeric transition-colors',
                      qty === n
                        ? 'bg-brand-subtle border-brand-border text-brand-strong'
                        : 'bg-card border-border text-ink-500 hover:border-ink-300 hover:text-foreground',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  onClick={(e) => { e.stopPropagation(); setQty(qty - 1) }}
                  disabled={qty <= 1}
                  aria-label="Diminuir quantidade"
                  className="shrink-0"
                >
                  <Minus />
                </Button>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Quantidade"
                  value={qty}
                  onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setQty(v) }}
                  onBlur={(e) => { const v = parseInt(e.target.value, 10); if (isNaN(v) || v < 1) setQty(1) }}
                  className="flex-1 min-w-0 h-8 text-center text-[14px] font-medium text-foreground numeric border border-input rounded-md bg-background hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent transition-colors"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  onClick={(e) => { e.stopPropagation(); setQty(qty + 1) }}
                  aria-label="Aumentar quantidade"
                  className="shrink-0"
                >
                  <Plus />
                </Button>
              </div>

              <Button
                type="button"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onAdd() }}
                className={cn(
                  'w-full',
                  added && 'bg-success-subtle text-success border-success-border hover:bg-success-subtle',
                )}
              >
                {added ? <><Check /> Adicionado</> : <><ShoppingCart /> Adicionar</>}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
