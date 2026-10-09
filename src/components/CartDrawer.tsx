import { ArrowRight, ShoppingCart, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useCart } from '@/contexts/CartContext'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/admin/ui/AdminPage'

export default function CartDrawer() {
  const { items, removeItem, clearCart, total, count, minOrderValue, cartOpen, setCartOpen } = useCart()
  const navigate = useNavigate()

  if (!cartOpen) return null

  const missing = minOrderValue - total
  const belowMinimum = total < minOrderValue

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]"
        onClick={() => setCartOpen(false)}
      />
      <div className="relative bg-background w-full sm:max-w-sm h-full flex flex-col border-l border-border shadow-xl">
        {/* Cabeçalho */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[15px] font-semibold text-foreground tracking-tight">Meu pedido</h2>
            {items.length > 0 && (
              <span className="text-[12px] text-muted-foreground numeric">
                {count} {count === 1 ? 'item' : 'itens'}
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => setCartOpen(false)} aria-label="Fechar carrinho">
            <X />
          </Button>
        </div>

        {/* Itens */}
        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
          {items.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Carrinho vazio"
              description="Adicione produtos do catálogo para montar o seu pedido."
              className="h-full"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCartOpen(false)
                    navigate('/catalogo')
                  }}
                >
                  Ver catálogo
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 surface-card p-2.5"
                >
                  {item.image && (
                    <img
                      src={item.image}
                      alt=""
                      className="w-11 h-11 rounded-md object-cover border border-border shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-foreground leading-tight line-clamp-2">{item.name}</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-[12px] text-muted-foreground numeric">{item.quantity}x</span>
                      <span className="text-[13px] font-semibold text-foreground numeric">
                        R$ {(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    aria-label={`Remover ${item.name}`}
                    className="h-7 w-7 flex items-center justify-center rounded-md text-ink-400 hover:text-danger hover:bg-danger-subtle transition-colors shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rodapé — mesma barra de ação do checkout: total em destaque, uma
            ação primária, a destrutiva recuada como terciária. */}
        {items.length > 0 && (
          <div className="px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border shrink-0 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-muted-foreground">Total</span>
              <span className="font-title text-[22px] font-semibold text-foreground numeric leading-none">
                R$ {total.toFixed(2)}
              </span>
            </div>

            {/* Estado de bloqueio: diz o que falta, não só que está errado. */}
            {belowMinimum && (
              <p className="text-[12px] text-warning bg-warning-subtle border border-warning-border rounded-md py-1.5 px-2.5 numeric">
                Faltam R$ {missing.toFixed(2)} para o pedido mínimo de R$ {minOrderValue.toFixed(2)}.
              </p>
            )}

            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                setCartOpen(false)
                navigate('/checkout')
              }}
            >
              Finalizar pedido
              <ArrowRight />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="w-full text-ink-500 hover:text-danger hover:bg-danger-subtle"
              onClick={() => {
                clearCart()
                toast('Carrinho limpo')
              }}
            >
              <Trash2 />
              Limpar carrinho
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
