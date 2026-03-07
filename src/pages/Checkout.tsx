import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Loader, ShoppingCart, Sparkles, MapPin, Minus, Plus, Zap, X } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveUpsell } from '@/hooks/useUpsell';
import { supabase } from '@/lib/supabase';
import { useTrackPurchase, useTrackInitiateCheckout } from '@/hooks/useSessionTracking';
import { isValidDocument } from '@/utils/validateDocument';

type Step = 1 | 2 | 3 | 4;

interface ProfileData {
  full_name: string | null
  phone: string | null
  document: string | null
  document_type: string | null
  address_cep: string | null
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_neighborhood: string | null
  address_city: string | null
  address_state: string | null
}

const Checkout = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items: cart, total: cartTotal, clearCart, addItem, count: cartCount } = useCart();
  const trackPurchase = useTrackPurchase();
  const trackInitiateCheckout = useTrackInitiateCheckout();
  const { data: upsellOffer } = useActiveUpsell();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [upsellAdded, setUpsellAdded] = useState(false);
  const [upsellSkipped, setUpsellSkipped] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credit'>('pix');
  const [installments, setInstallments] = useState<number>(1);

  const [formData, setFormData] = useState({
    customer_name: '',
    customer_whatsapp: '',
    customer_email: user?.email || '',
    customer_document: '',
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
    if (!user?.id || profileLoaded) return;
    supabase.from('profiles').select('full_name, phone, document, document_type, address_cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state')
      .eq('id', user.id).single()
      .then(({ data }) => {
        if (data) {
          const p = data as ProfileData;
          setFormData(prev => ({
            ...prev,
            customer_name: p.full_name || prev.customer_name,
            customer_whatsapp: p.phone?.replace(/\D/g, '') || prev.customer_whatsapp,
            customer_document: p.document || prev.customer_document,
            cep: p.address_cep || prev.cep,
            street: p.address_street || prev.street,
            number: p.address_number || prev.number,
            complement: p.address_complement || prev.complement,
            neighborhood: p.address_neighborhood || prev.neighborhood,
            city: p.address_city || prev.city,
            state: p.address_state || prev.state,
          }));
        }
        setProfileLoaded(true);
      });
  }, [user, profileLoaded]);

  // Track InitiateCheckout
  useEffect(() => {
    if (cart.length > 0) {
      trackInitiateCheckout(cartTotal, cartCount);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redirect if empty cart
  useEffect(() => {
    if (cart.length === 0 && !loading) {
      navigate('/catalogo', { replace: true });
    }
  }, [cart.length, navigate, loading]);

  if (cart.length === 0 && !loading) return null;

  // Check if upsell product is already in cart
  const upsellInCart = upsellOffer?.product ? cart.some(i => i.id === upsellOffer.product!.id) : false;
  const showUpsellStep = upsellOffer?.product && !upsellInCart && !upsellAdded && !upsellSkipped;

  // Shipping = 20% of subtotal (including upsell if added)
  const upsellAmount = upsellAdded && upsellOffer ? upsellOffer.discounted_price * (upsellOffer.quantity || 1) : 0;
  const shippingEstimate = Math.round((cartTotal + upsellAmount) * 0.20 * 100) / 100;
  const orderTotal = Math.round((cartTotal + upsellAmount + shippingEstimate) * 100) / 100;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let { name, value } = e.target;
    if (name === 'customer_whatsapp') value = value.replace(/\D/g, '');
    else if (name === 'cep') {
      value = value.replace(/\D/g, '');
      if (value.length > 5) value = value.replace(/^(\d{5})(\d)/, '$1-$2');
      if (value.length > 9) value = value.slice(0, 9);
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddUpsell = () => {
    if (!upsellOffer?.product) return;
    addItem({
      id: upsellOffer.product.id,
      name: upsellOffer.product.name,
      price: upsellOffer.discounted_price,
      image: upsellOffer.product.main_image,
    }, upsellOffer.quantity || 1);
    setUpsellAdded(true);
    setStep(3);
  };

  const handleSkipUpsell = () => {
    setUpsellSkipped(true);
    setStep(3);
  };

  const handleNext = () => {
    setError('');
    if (step === 1) {
      if (cartTotal < 500) {
        setError(`Pedido minimo: R$ 500. Seu total: R$ ${cartTotal.toFixed(2)}`);
        return;
      }
      if (showUpsellStep) {
        setStep(2);
      } else {
        setStep(3);
      }
    } else if (step === 3) {
      if (!formData.customer_name.trim() || !formData.customer_whatsapp.trim() || !formData.customer_email.trim() || !formData.customer_document.trim() || !formData.cep || !formData.street || !formData.number || !formData.neighborhood || !formData.city || !formData.state) {
        setError('Preencha todos os campos obrigatorios, incluindo CPF/CNPJ e endereco.');
        return;
      }
      const docResult = isValidDocument(formData.customer_document);
      if (!docResult.valid) {
        setError(docResult.error || 'Documento inválido.');
        return;
      }
      if (formData.customer_whatsapp.length < 11) {
        setError('WhatsApp precisa ter no minimo 11 digitos (com DDD).');
        return;
      }
      setStep(4);
    }
  };

  const handleBack = () => {
    if (step === 4) setStep(3);
    else if (step === 3) setStep(showUpsellStep && !upsellAdded && !upsellSkipped ? 2 : 1);
    else if (step === 2) setStep(1);
  };

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      if (!formData.customer_name.trim() || !formData.customer_whatsapp.trim() || !formData.customer_email.trim() || !formData.customer_document.trim() || !formData.cep || !formData.street || !formData.number || !formData.neighborhood || !formData.city || !formData.state) {
        setError('Preencha todos os campos obrigatorios, incluindo o endereco e CPF/CNPJ.');
        setLoading(false);
        return;
      }

      const docDigits = formData.customer_document.replace(/\D/g, '');
      if (docDigits.length !== 11 && docDigits.length !== 14) {
        setError('CPF deve ter 11 digitos ou CNPJ 14 digitos.');
        setLoading(false);
        return;
      }

      if (formData.customer_whatsapp.length < 11) {
        setError('WhatsApp precisa ter no minimo 11 digitos (com DDD).');
        setLoading(false);
        return;
      }

      if (!user?.id) {
        setError('Usuario nao autenticado');
        setLoading(false);
        return;
      }

      // Ensure we have a valid session before calling the edge function
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Sessao expirada. Faca login novamente.');
        setLoading(false);
        return;
      }

      // Save address to profile for next time
      supabase.from('profiles').update({
        address_cep: formData.cep,
        address_street: formData.street,
        address_number: formData.number,
        address_complement: formData.complement,
        address_neighborhood: formData.neighborhood,
        address_city: formData.city,
        address_state: formData.state,
      }).eq('id', user.id).then(() => { });

      const paymentStr = paymentMethod === 'pix' ? 'PIX' : `Cartão de Crédito (${installments}x${installments > 3 ? ' com juros' : ' sem juros'})`;
      const addressString = `Endereco de Entrega:\nCEP: ${formData.cep}\nLogradouro: ${formData.street}, ${formData.number} ${formData.complement ? `(${formData.complement})` : ''}\nBairro: ${formData.neighborhood}\nCidade/UF: ${formData.city}/${formData.state.toUpperCase()}\n\nForma de Pagamento Selecionada: ${paymentStr}`;
      const finalNotes = formData.notes ? `${formData.notes}\n\n${addressString}` : addressString;

      // Call edge function — use fetch with both apikey and user token
      const orderBody = {
        items: cart.map(item => ({ product_id: item.id, qty: item.quantity })),
        customer_name: formData.customer_name,
        customer_whatsapp: formData.customer_whatsapp,
        customer_email: formData.customer_email,
        customer_document: formData.customer_document,
        payment_method: paymentMethod,
        installments: paymentMethod === 'credit' ? installments : 1,
        shipping: shippingEstimate,
        notes: finalNotes,
      };

      // Try supabase.functions.invoke first (sends auth automatically)
      const { data: fnData, error: fnError } = await supabase.functions.invoke('create-order', {
        body: orderBody,
      });

      if (fnError) {
        // If 401, the edge function might need re-deploy or JWT config change
        let msg = fnError.message || 'Erro ao criar pedido';
        if (msg.includes('Invalid JWT') || msg.includes('401')) {
          msg = 'Erro de autenticacao com o servidor. Tente fazer logout e login novamente.';
        }
        throw new Error(msg);
      }

      if (fnData?.error) {
        const details = fnData.details as string[] | undefined;
        throw new Error(details ? `${fnData.error}:\n${details.join('\n')}` : fnData.error);
      }

      trackPurchase(fnData.total || cartTotal);
      clearCart();

      // If AbacatePay returned a payment URL, redirect to it
      if (fnData.payment_url) {
        window.location.href = fnData.payment_url;
        return;
      } else {
        navigate(`/pedido/sucesso/${fnData.order_id}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar pedido');
      setLoading(false);
    }
  };

  // ========================================================================
  // STEP INDICATOR
  // ========================================================================
  const steps = [
    { num: 1, label: 'Resumo' },
    { num: 2, label: 'Oferta' },
    { num: 3, label: 'Entrega' },
    { num: 4, label: 'Pagamento' },
  ];

  return (
    <div className="min-h-screen bg-surface-alt">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            onClick={() => step === 1 ? navigate('/catalogo') : handleBack()}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline text-sm font-medium">{step === 1 ? 'Voltar' : 'Anterior'}</span>
          </button>
          <h1 className="text-lg font-bold text-foreground">Finalizar Pedido</h1>
          <div className="w-8" />
        </div>
      </header>

      {/* Step Indicator */}
      <div className="bg-white border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-center gap-2 sm:gap-4">
            {steps.map((s, i) => (
              <div key={s.num} className="flex items-center gap-2 sm:gap-4">
                {i > 0 && <div className={`w-8 sm:w-12 h-0.5 ${step >= s.num ? 'bg-amber-400' : 'bg-border'} transition-colors`} />}
                <div className="flex items-center gap-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step > s.num ? 'bg-green-500 text-white' :
                    step === s.num ? 'gradient-gold text-white shadow-sm' :
                      'bg-surface-alt text-muted-foreground border border-border'
                    }`}>
                    {step > s.num ? <Check className="w-3.5 h-3.5" /> : s.num}
                  </div>
                  <span className={`text-xs font-medium hidden sm:inline ${step === s.num ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {s.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-xl">
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 1: ORDER SUMMARY */}
        {/* ================================================================ */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-card">
              <div className="flex items-center gap-2 mb-5">
                <ShoppingCart className="w-5 h-5 text-gold-text" />
                <h2 className="text-lg font-bold text-foreground">Confirme seu Pedido</h2>
              </div>

              <div className="space-y-3 mb-6">
                {cart.map(item => (
                  <div key={item.id} className="flex items-center gap-3 py-2">
                    {item.image && (
                      <img src={item.image} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.quantity}x R$ {item.price.toFixed(2)}</p>
                    </div>
                    <p className="text-sm font-bold text-foreground whitespace-nowrap">
                      R$ {(item.price * item.quantity).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal ({cartCount} itens)</span>
                  <span className="font-medium">R$ {cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-lg font-bold pt-3 border-t border-border">
                  <span>Total</span>
                  <span className="gradient-gold-text">R$ {cartTotal.toFixed(2)}</span>
                </div>
              </div>

              {cartTotal < 500 && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700">
                    Pedido minimo: R$ 500. Faltam: <strong>R$ {(500 - cartTotal).toFixed(2)}</strong>
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={handleNext}
              disabled={cartTotal < 500}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-base btn-gold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Continuar para Entrega
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 2: UPSELL OFFER */}
        {/* ================================================================ */}
        {step === 2 && upsellOffer?.product && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="relative bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] overflow-hidden border border-amber-100">

              {/* Premium Top Strip */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-300 via-gold to-amber-500"></div>

              <div className="p-6 sm:p-8">
                <div className="flex items-center justify-center gap-2 mb-6 text-amber-500">
                  <Zap className="w-5 h-5 fill-amber-500" />
                  <span className="font-bold tracking-widest uppercase text-xs sm:text-sm">Oferta Especial Desbloqueada</span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8 mb-8">
                  {/* Product Image Focus */}
                  <div className="relative w-40 h-40 sm:w-48 sm:h-48 flex-shrink-0">
                    <div className="absolute inset-0 bg-gold/5 rounded-2xl -rotate-3 transform origin-bottom-left"></div>
                    {upsellOffer.product.main_image ? (
                      <img
                        src={upsellOffer.product.main_image}
                        alt={upsellOffer.product.name}
                        className="relative w-full h-full object-cover rounded-2xl shadow-lg border-2 border-white z-10"
                      />
                    ) : (
                      <div className="relative w-full h-full bg-surface-alt rounded-2xl shadow-lg border-2 border-white z-10 flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-gold/30" />
                      </div>
                    )}

                    {/* Discount Badge Floating */}
                    <div className="absolute -top-3 -right-3 z-20 bg-green-500 text-white font-black text-sm px-3 py-1.5 rounded-full shadow-md transform rotate-6">
                      -{Math.round((1 - upsellOffer.discounted_price / upsellOffer.product.price) * 100)}%
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 text-center sm:text-left">
                    <h3 className="text-xl sm:text-2xl font-black text-foreground mb-2 leading-tight">
                      {upsellOffer.title}
                    </h3>
                    <p className="text-base font-medium text-foreground/80 mb-3">
                      {upsellOffer.product.name}
                    </p>

                    {upsellOffer.description && (
                      <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                        {upsellOffer.description}
                      </p>
                    )}

                    <div className="flex flex-row flex-wrap items-baseline gap-2 sm:gap-4 justify-center sm:justify-start">
                      <span className="text-sm font-medium text-muted-foreground line-through decoration-red-500/50 whitespace-nowrap">
                        De R$ {upsellOffer.product.price.toFixed(2)} {upsellOffer.quantity > 1 ? 'cada' : ''}
                      </span>
                      <div className="flex flex-row items-baseline gap-1 whitespace-nowrap">
                        <span className="text-xl sm:text-2xl font-bold text-foreground">{upsellOffer.quantity > 1 ? `${upsellOffer.quantity}x` : 'Por'}</span>
                        <span className="text-3xl sm:text-4xl font-black gradient-gold-text">
                          R$ {upsellOffer.discounted_price.toFixed(2)}
                        </span>
                        {upsellOffer.quantity > 1 && <span className="text-sm font-medium text-foreground ml-1">cada</span>}
                      </div>
                    </div>
                    {upsellOffer.quantity > 1 && (
                      <p className="text-center sm:text-left text-sm font-bold text-foreground mt-2">
                        Total: R$ {(upsellOffer.discounted_price * upsellOffer.quantity).toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col items-center gap-4">
                  <button
                    onClick={handleAddUpsell}
                    className="w-full sm:w-auto min-w-[280px] flex items-center justify-center gap-2 py-4 px-8 rounded-full font-bold text-base bg-amber-500 hover:bg-amber-600 outline-none focus:ring-4 focus:ring-amber-500/30 text-white shadow-[0_4px_20px_rgba(245,158,11,0.4)] transition-all hover:-translate-y-0.5"
                  >
                    <ShoppingCart className="w-5 h-5" />
                    Sim, Adicionar ao Pedido
                  </button>

                  <button
                    onClick={handleSkipUpsell}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground underline decoration-transparent hover:decoration-border transition-all"
                  >
                    Nao, obrigado. Quero apenas finalizar o que já escolhi.
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 3: DELIVERY & SUBMIT */}
        {/* ================================================================ */}
        {step === 3 && (
          <div className="space-y-6">
            {/* Pre-filled Client Info (read-only summary) */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-card">
              <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Check className="w-5 h-5 text-green-500" />
                Dados do Cliente
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Nome</label>
                  <input
                    type="text" name="customer_name" value={formData.customer_name} onChange={handleChange} required
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold"
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">WhatsApp</label>
                  <input
                    type="tel" name="customer_whatsapp" value={formData.customer_whatsapp} onChange={handleChange} required
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold"
                    placeholder="11999999999"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">E-mail</label>
                  <input
                    type="email" name="customer_email" value={formData.customer_email} onChange={handleChange} required
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">CPF ou CNPJ</label>
                  <input
                    type="text" name="customer_document" value={formData.customer_document} onChange={handleChange} required
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold"
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                  />
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-card">
              <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-gold-text" />
                Endereco de Entrega
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">CEP *</label>
                  <input type="text" name="cep" required value={formData.cep} onChange={handleChange} placeholder="00000-000"
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm focus:ring-2 focus:ring-gold" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Rua *</label>
                  <input type="text" name="street" required value={formData.street} onChange={handleChange} placeholder="Av. Principal"
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm focus:ring-2 focus:ring-gold" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Numero *</label>
                  <input type="text" name="number" required value={formData.number} onChange={handleChange} placeholder="123"
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm focus:ring-2 focus:ring-gold" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Complemento</label>
                  <input type="text" name="complement" value={formData.complement} onChange={handleChange} placeholder="Apto 101"
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm focus:ring-2 focus:ring-gold" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Bairro *</label>
                  <input type="text" name="neighborhood" required value={formData.neighborhood} onChange={handleChange} placeholder="Centro"
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm focus:ring-2 focus:ring-gold" />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Cidade *</label>
                    <input type="text" name="city" required value={formData.city} onChange={handleChange} placeholder="Sao Paulo"
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm focus:ring-2 focus:ring-gold" />
                  </div>
                  <div className="w-20">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">UF *</label>
                    <input type="text" name="state" required maxLength={2} value={formData.state} onChange={handleChange} placeholder="SP"
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm focus:ring-2 focus:ring-gold uppercase" />
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-card">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Observacoes</label>
              <textarea
                name="notes" value={formData.notes} onChange={handleChange} rows={3}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm focus:ring-2 focus:ring-gold"
                placeholder="Alguma observacao para o pedido..."
              />
            </div>

            {/* Order Total Summary */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-card space-y-3">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Subtotal ({cartCount} itens)</span>
                <span>R$ {cartTotal.toFixed(2)}</span>
              </div>

              {upsellAdded && upsellOffer?.product && (
                <div className="flex items-center justify-between text-sm text-green-600 font-medium">
                  <span>{upsellOffer.quantity > 1 ? `${upsellOffer.quantity}x ` : ''}{upsellOffer.title}</span>
                  <span>+ R$ {(upsellOffer.discounted_price * (upsellOffer.quantity || 1)).toFixed(2)}</span>
                </div>
              )}

              <div className="flex flex-col text-slate-600 bg-slate-50 p-2 rounded">
                <div className="flex items-center justify-between text-sm">
                  <span>Frete estimado</span>
                  <span>+ R$ {shippingEstimate.toFixed(2)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 text-left">
                  O valor é uma média de cotação com tranportadoras parceiras.
                </p>
              </div>

              <div className="flex items-center justify-between text-lg font-bold pt-3 border-t border-border">
                <span className="text-foreground">Total do Pedido</span>
                <span className="gradient-gold-text">
                  R$ {orderTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Proceed to Payment Button (instead of submit) */}
            <button
              onClick={handleNext}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-base btn-gold text-white transition-all"
            >
              Continuar para Pagamento
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 4: PAYMENT */}
        {/* ================================================================ */}
        {step === 4 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-card">
              <h2 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
                <Check className="w-5 h-5 text-green-500" />
                Forma de Pagamento
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <button
                  type="button"
                  onClick={() => { setPaymentMethod('pix'); setInstallments(1); }}
                  className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${paymentMethod === 'pix' ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-border text-foreground hover:bg-surface-alt'}`}
                >
                  <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-teal-600" />
                  </div>
                  <span className="font-bold text-sm">PIX</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('credit')}
                  className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${paymentMethod === 'credit' ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-border text-foreground hover:bg-surface-alt'}`}
                >
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <Check className="w-4 h-4 text-blue-600" />
                  </div>
                  <span className="font-bold text-sm">Cartão de Crédito</span>
                </button>
              </div>

              {/* Installment selection removed as per user request */}
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-semibold text-lg btn-gold text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(245,158,11,0.3)] transition-all hover:-translate-y-0.5"
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Processando Pagamento...
                </>
              ) : (
                <>
                  <Check className="w-6 h-6" />
                  Finalizar Compra
                </>
              )}
            </button>
            <p className="text-xs text-center text-muted-foreground">
              Você será redirecionado para concluir o pagamento em seguida.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Checkout;
