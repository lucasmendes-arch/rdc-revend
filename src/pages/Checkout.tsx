import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, ShoppingCart } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const Checkout = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items: cart, total: cartTotal, clearCart } = useCart();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_whatsapp: '',
    customer_email: user?.email || '',
    notes: '',
  });

  // Redirect if cart is empty
  useEffect(() => {
    if (cart.length === 0) {
      navigate('/catalogo', { replace: true });
    }
  }, [cart.length, navigate]);

  if (cart.length === 0) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validate minimum order value
      if (cartTotal < 300) {
        setError(`Pedido mínimo: R$ 300. Você tem R$ ${cartTotal.toFixed(2)}`);
        setLoading(false);
        return;
      }

      // Validate required fields
      if (!formData.customer_name.trim() || !formData.customer_whatsapp.trim() || !formData.customer_email.trim()) {
        setError('Por favor, preencha todos os campos obrigatórios');
        setLoading(false);
        return;
      }

      if (!user?.id) {
        setError('Usuário não autenticado');
        setLoading(false);
        return;
      }

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: user.id,
          subtotal: cartTotal,
          shipping: 0,
          total: cartTotal,
          customer_name: formData.customer_name,
          customer_whatsapp: formData.customer_whatsapp,
          customer_email: formData.customer_email,
          notes: formData.notes || null,
          status: 'recebido',
        })
        .select('id')
        .single();

      if (orderError || !order) {
        throw new Error(orderError?.message || 'Erro ao criar pedido');
      }

      // Create order items
      const orderItems = cart.map((item) => ({
        order_id: order.id,
        product_name_snapshot: item.name,
        unit_price_snapshot: item.price,
        qty: item.quantity,
        line_total: item.price * item.quantity,
        product_id: item.id,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) {
        throw new Error(itemsError.message);
      }

      // Call edge function to send WhatsApp notification (fire-and-forget)
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (supabaseUrl && supabaseAnonKey && user.id) {
          fetch(`${supabaseUrl}/functions/v1/send-order-whatsapp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({ order_id: order.id }),
          }).catch((err) => {
            console.warn('Failed to send WhatsApp notification:', err);
          });
        }
      } catch (err) {
        console.warn('WhatsApp notification error:', err);
      }

      // Clear cart and navigate to success page
      clearCart();
      navigate(`/pedido/sucesso/${order.id}`, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao processar pedido';
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-alt">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            onClick={() => navigate('/catalogo')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline text-sm font-medium">Voltar</span>
          </button>
          <h1 className="text-lg font-bold text-foreground">Finalizar Pedido</h1>
          <div className="w-8" />
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl p-6 shadow-card">
              <h2 className="text-xl font-bold text-foreground mb-6">Dados do Cliente</h2>

              {error && (
                <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    name="customer_name"
                    value={formData.customer_name}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2.5 rounded-lg border border-border bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold-border transition-all"
                    placeholder="João da Silva"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    WhatsApp *
                  </label>
                  <input
                    type="tel"
                    name="customer_whatsapp"
                    value={formData.customer_whatsapp}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2.5 rounded-lg border border-border bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold-border transition-all"
                    placeholder="11999999999"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    E-mail *
                  </label>
                  <input
                    type="email"
                    name="customer_email"
                    value={formData.customer_email}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2.5 rounded-lg border border-border bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold-border transition-all"
                    placeholder="joao@email.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Observações
                  </label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-lg border border-border bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold-border transition-all"
                    placeholder="Adicione observações para o seu pedido..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-base btn-gold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    'Confirmar Pedido'
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Cart Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl p-6 shadow-card sticky top-24">
              <div className="flex items-center gap-2 mb-6">
                <ShoppingCart className="w-5 h-5 text-gold-text" />
                <h2 className="font-bold text-foreground">Resumo do Pedido</h2>
              </div>

              <div className="space-y-3 mb-6 pb-6 border-b border-border">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.quantity}x</p>
                    </div>
                    <p className="text-sm font-semibold text-foreground ml-2">
                      R$ {(item.price * item.quantity).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground">R$ {cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Frete</span>
                  <span className="font-medium text-foreground">Grátis</span>
                </div>
                <div className="flex items-center justify-between text-lg font-bold pt-3 border-t border-border">
                  <span className="text-foreground">Total</span>
                  <span className="gradient-gold-text">R$ {cartTotal.toFixed(2)}</span>
                </div>
              </div>

              {cartTotal < 300 && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700">
                    ⚠️ Pedido mínimo: R$ 300<br />
                    Faltam: <strong>R$ {(300 - cartTotal).toFixed(2)}</strong>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
