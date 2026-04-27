import { ArrowRight, ShoppingCart, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useCart } from '@/contexts/CartContext'

export default function CartDrawer() {
  const { items, removeItem, clearCart, total, count, minOrderValue, cartOpen, setCartOpen } = useCart()
  const navigate = useNavigate()

  if (!cartOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
      <div className="relative bg-white w-full sm:max-w-sm h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-gold-text" />
            <h2 className="font-bold text-foreground text-lg">Meu Pedido</h2>
            {items.length > 0 && (
              <span className="text-xs text-muted-foreground">({count} itens)</span>
            )}
          </div>
          <button onClick={() => setCartOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <ShoppingCart className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">Nenhum item adicionado ainda.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 bg-surface-alt rounded-lg p-3">
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">{item.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{item.quantity}x</span>
                      <span className="text-sm font-semibold text-foreground">R$ {(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  </div>
                  <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0 p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="p-4 border-t border-border flex-shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground text-base">Total</span>
              <span className="text-xl font-bold gradient-gold-text">R$ {total.toFixed(2)}</span>
            </div>

            {total < minOrderValue && (
              <p className="text-xs text-center text-amber-600 bg-amber-50 rounded-lg py-1.5 px-2">
                Mínimo: R$ {minOrderValue} (faltam R$ {(minOrderValue - total).toFixed(2)})
              </p>
            )}

            <button
              onClick={() => {
                setCartOpen(false)
                navigate('/checkout')
              }}
              className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl font-semibold text-sm btn-gold text-white"
            >
              Finalizar Pedido
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                clearCart()
                toast('Carrinho limpo')
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors border border-red-200"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar Carrinho
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
