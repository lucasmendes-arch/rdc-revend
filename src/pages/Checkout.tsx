import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, ShoppingCart } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTrackPurchase } from '@/hooks/useSessionTracking';

const Checkout = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items: cart, total: cartTotal, clearCart } = useCart();
  const trackPurchase = useTrackPurchase();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_whatsapp: '',
    customer_email: user?.email || '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    notes: '',
  });

  // Pre-fill from profile
  useEffect(() => {
    if (user?.id) {
      supabase.from('profiles').select('*').eq('id', user.id).single()
        .then(({ data }) => {
          if (data) {
            setFormData(prev => ({
              ...prev,
              customer_name: data.full_name || prev.customer_name,
              customer_whatsapp: data.phone?.replace(/\D/g, '') || prev.customer_whatsapp,
            }));
          }
        });
    }
  }, [user]);

  // Redirect if cart is empty
  useEffect(() => {
    if (cart.length === 0) {
      navigate('/catalogo', { replace: true });
    }
  }, [cart.length, navigate]);

  if (cart.length === 0) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let { name, value } = e.target;

    if (name === 'customer_whatsapp') {
      value = value.replace(/\D/g, ''); // numbers only
    } else if (name === 'cep') {
      value = value.replace(/\D/g, '');
      if (value.length > 5) value = value.replace(/^(\d{5})(\d)/, '$1-$2');
      if (value.length > 9) value = value.slice(0, 9);
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validate minimum order value
      if (cartTotal < 500) {
        setError(`Pedido mínimo: R$ 500. Você tem R$ ${cartTotal.toFixed(2)}`);
        setLoading(false);
        return;
      }

      // Validate required fields
      if (!formData.customer_name.trim() || !formData.customer_whatsapp.trim() || !formData.customer_email.trim() || !formData.cep || !formData.street || !formData.number || !formData.neighborhood || !formData.city || !formData.state) {
        setError('Por favor, preencha todos os campos obrigatórios, incluindo o endereço completo.');
        setLoading(false);
        return;
      }

      if (formData.customer_whatsapp.length < 11) {
        setError('O WhatsApp precisa ter no mínimo 11 números (com DDD).');
        setLoading(false);
        return;
      }

      if (!user?.id) {
        setError('Usuário não autenticado');
        setLoading(false);
        return;
      }

      const addressString = `Endereço de Entrega:
CEP: ${formData.cep}
Logradouro: ${formData.street}, ${formData.number} ${formData.complement ? `(${formData.complement})` : ''}
Bairro: ${formData.neighborhood}
Cidade/UF: ${formData.city}/${formData.state.toUpperCase()}`;

      const finalNotes = formData.notes ? `${formData.notes}\n\n${addressString}` : addressString;

      // Create order via edge function (validates prices server-side)
      const { data: fnData, error: fnError } = await supabase.functions.invoke('create-order', {
        body: {
          items: cart.map(item => ({
            product_id: item.id,
            qty: item.quantity,
          })),
          customer_name: formData.customer_name,
          customer_whatsapp: formData.customer_whatsapp,
          customer_email: formData.customer_email,
          notes: finalNotes,
        },
      });

      if (fnError) {
        let msg = fnError.message || 'Erro ao criar pedido';
        try {
          // Attempt to parse context if Supabase returned the response body in the error
          if (fnError.context && fnError.context.status) {
            msg += ` (Status ${fnError.context.status})`;
          }
        } catch (e) {
          // ignore
        }
        console.error('Edge Function Error:', fnError);
        throw new Error(msg);
      }

      const result = fnData;

      // Edge function returned an error payload (e.g. stock insufficient)
      if (result?.error) {
        const details = result.details as string[] | undefined;
        const msg = details
          ? `${result.error}:\n${details.join('\n')}`
          : result.error;
        throw new Error(msg);
      }

      // Track purchase event
      trackPurchase(result.total || cartTotal);

      // Clear cart and navigate to success page
      clearCart();
      navigate(`/pedido/sucesso/${result.order_id}`, { replace: true });
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

                <h3 className="text-lg font-bold text-foreground mt-8 mb-4 pt-4 border-t border-border">Endereço de Entrega</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">CEP *</label>
                    <input type="text" name="cep" required value={formData.cep} onChange={handleChange} placeholder="00000-000" className="w-full px-4 py-2.5 rounded-lg border border-border bg-white focus:ring-2 focus:ring-gold focus:border-gold-border" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Rua / Logradouro *</label>
                    <input type="text" name="street" required value={formData.street} onChange={handleChange} placeholder="Av. Principal" className="w-full px-4 py-2.5 rounded-lg border border-border bg-white focus:ring-2 focus:ring-gold" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Número *</label>
                    <input type="text" name="number" required value={formData.number} onChange={handleChange} placeholder="123" className="w-full px-4 py-2.5 rounded-lg border border-border bg-white focus:ring-2 focus:ring-gold" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Complemento</label>
                    <input type="text" name="complement" value={formData.complement} onChange={handleChange} placeholder="Apto 101, Bloco B" className="w-full px-4 py-2.5 rounded-lg border border-border bg-white focus:ring-2 focus:ring-gold" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Bairro *</label>
                    <input type="text" name="neighborhood" required value={formData.neighborhood} onChange={handleChange} placeholder="Centro" className="w-full px-4 py-2.5 rounded-lg border border-border bg-white focus:ring-2 focus:ring-gold" />
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-foreground mb-2">Cidade *</label>
                      <input type="text" name="city" required value={formData.city} onChange={handleChange} placeholder="São Paulo" className="w-full px-4 py-2.5 rounded-lg border border-border bg-white focus:ring-2 focus:ring-gold" />
                    </div>
                    <div className="w-24">
                      <label className="block text-sm font-medium text-foreground mb-2">UF *</label>
                      <input type="text" name="state" required maxLength={2} value={formData.state} onChange={handleChange} placeholder="SP" className="w-full px-4 py-2.5 rounded-lg border border-border bg-white focus:ring-2 focus:ring-gold uppercase" />
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-2 border-t border-border">
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

              <div className="space-y-3 pb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal dos Produtos</span>
                  <span className="font-medium text-foreground">R$ {cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Estimativa de Frete (20%)</span>
                  <span className="font-medium text-amber-600">~ R$ {(cartTotal * 0.20).toFixed(2)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight text-right mt-1">
                  * O frete exato será cotado com a transportadora. Este valor estimado <strong className="text-foreground">NÃO</strong> está sendo cobrado/somado no total final deste checkout.
                </p>
                <div className="flex items-center justify-between text-lg font-bold pt-4 border-t border-border">
                  <span className="text-foreground">Total do Pedido</span>
                  <span className="gradient-gold-text">R$ {cartTotal.toFixed(2)}</span>
                </div>
              </div>

              {cartTotal < 500 && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700">
                    ⚠️ Pedido mínimo: R$ 500<br />
                    Faltam: <strong>R$ {(500 - cartTotal).toFixed(2)}</strong>
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
