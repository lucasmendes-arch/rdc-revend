import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Loader, ShoppingCart, Sparkles, MapPin, Minus, Plus, Zap, Store } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveUpsell } from '@/hooks/useUpsell';
import { supabase } from '@/lib/supabase';
import { useTrackInitiateCheckout } from '@/hooks/useSessionTracking';
import { isValidDocument } from '@/utils/validateDocument';
import { toast } from 'sonner';

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
  const { items: cart, total: cartTotal, clearCart, addItem, count: cartCount, minOrderValue } = useCart();
  const trackInitiateCheckout = useTrackInitiateCheckout();
  const { data: upsellOffer } = useActiveUpsell();

  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponId, setCouponId] = useState<string | null>(null);
  const [couponType, setCouponType] = useState<'fixed' | 'percent' | 'free_shipping' | 'shipping_percent' | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [upsellAdded, setUpsellAdded] = useState(false);
  const [upsellSkipped, setUpsellSkipped] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [initialProfile, setInitialProfile] = useState<Partial<ProfileData>>({});

  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credit'>('pix');
  const [installments, setInstallments] = useState<number>(1);

  const [deliveryMethod, setDeliveryMethod] = useState<'shipping' | 'pickup'>('shipping');
  const [pickupUnitSlug, setPickupUnitSlug] = useState<string | null>(null);

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

  useEffect(() => {
    if (cartTotal > 0) {
      trackInitiateCheckout(cartTotal, cartCount);
    }
  }, [trackInitiateCheckout, cartTotal, cartCount]);

  // Pre-fill from profile
  useEffect(() => {
    if (!user?.id || profileLoaded) return;
    supabase.from('profiles').select('full_name, phone, document, document_type, address_cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state')
      .eq('id', user.id).single()
      .then(({ data }) => {
        if (data) {
          const p = data as ProfileData;
          setInitialProfile(p);
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

  // Shipping = 20% of subtotal (cartTotal already includes upsell if added via addItem)
  const shippingEstimate = Math.round(cartTotal * 0.20 * 100) / 100;
  const shippingValue = deliveryMethod === 'pickup' ? 0 : (couponType === 'free_shipping' ? 0 : shippingEstimate);
  const shippingDiscountAmount = couponType === 'shipping_percent'
    ? Math.round(shippingEstimate * couponDiscount / 100 * 100) / 100
    : 0;
  const effectiveDiscount = couponType === 'shipping_percent' ? shippingDiscountAmount : couponDiscount;
  const orderTotal = Math.round(Math.max(cartTotal + shippingValue - effectiveDiscount, 0) * 100) / 100;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value: rawValue } = e.target;
    let value = rawValue;
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

  const isAddressValid = !!(
    formData.cep && formData.cep.length >= 9 &&
    formData.street && formData.number &&
    formData.neighborhood && formData.city &&
    formData.state && formData.state.length === 2
  );

  const handleSkipUpsell = () => {
    setUpsellSkipped(true);
    setStep(3);
  };

  const handleNext = () => {
    setError('');
    if (step === 1) {
      if (cartTotal < minOrderValue) {
        setError(`Pedido minimo: R$ ${minOrderValue}. Seu total: R$ ${cartTotal.toFixed(2)}`);
        return;
      }
      if (showUpsellStep) {
        setStep(2);
      } else {
        setStep(3);
      }
    } else if (step === 3) {
      if (!formData.customer_name.trim() || !formData.customer_whatsapp.trim() || !formData.customer_email.trim() || !formData.customer_document.trim()) {
        setError('Preencha os dados do cliente (Nome, WhatsApp, E-mail, Documento).');
        return;
      }
      if (deliveryMethod === 'shipping' && (!formData.cep || !formData.street || !formData.number || !formData.neighborhood || !formData.city || !formData.state)) {
        setError('Preencha o endereco de entrega completo.');
        return;
      }
      if (deliveryMethod === 'pickup' && !pickupUnitSlug) {
        setError('Selecione uma unidade para retirar seu pedido.');
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
  
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setIsValidatingCoupon(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('validate_coupon', {
        p_code: couponCode.toUpperCase().trim(),
        p_cart_total: cartTotal
      });

      if (rpcError) throw rpcError;
      
      const res = data as { valid: boolean; id?: string; type?: 'fixed' | 'percent' | 'free_shipping' | 'shipping_percent'; value?: number; error?: string };

      if (!res.valid) {
        throw new Error(res.error || 'Cupom inválido ou expirado');
      }

      setCouponDiscount(res.value ?? 0);
      setCouponId(res.id || null);
      setCouponType(res.type || null);
      toast.success('Cupom aplicado com sucesso!');
    } catch (err: unknown) {
      setCouponDiscount(0);
      setCouponId(null);
      setCouponType(null);
      const message = err instanceof Error ? err.message : 'Erro ao validar cupom';
      setError(message);
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      if (!formData.customer_name.trim() || !formData.customer_whatsapp.trim() || !formData.customer_email.trim() || !formData.customer_document.trim()) {
        setError('Preencha todos os dados do cliente.');
        setLoading(false);
        return;
      }
      if (deliveryMethod === 'shipping' && (!formData.cep || !formData.street || !formData.number || !formData.neighborhood || !formData.city || !formData.state)) {
        setError('Preencha o endereco de entrega completo.');
        setLoading(false);
        return;
      }
      
      if (deliveryMethod === 'pickup' && !pickupUnitSlug) {
        setError('Selecione o local de retirada.');
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

      // Save address and basic data to profile for next time
      const profileUpdates: Partial<ProfileData> = {
        full_name: formData.customer_name,
        phone: formData.customer_whatsapp,
        document: formData.customer_document,
      };

      if (deliveryMethod === 'shipping') {
        profileUpdates.address_cep = formData.cep;
        profileUpdates.address_street = formData.street;
        profileUpdates.address_number = formData.number;
        profileUpdates.address_complement = formData.complement;
        profileUpdates.address_neighborhood = formData.neighborhood;
        profileUpdates.address_city = formData.city;
        profileUpdates.address_state = formData.state;
      }

      supabase.from('profiles').update(profileUpdates).eq('id', user.id).then(() => { });


      const paymentStr = paymentMethod === 'pix' ? 'PIX' : `Cartão de Crédito (${installments}x${installments > 3 ? ' com juros' : ' sem juros'})`;
      let addressString = '';
      if (deliveryMethod === 'shipping') {
        addressString = `Endereco de Entrega:\nCEP: ${formData.cep}\nLogradouro: ${formData.street}, ${formData.number} ${formData.complement ? `(${formData.complement})` : ''}\nBairro: ${formData.neighborhood}\nCidade/UF: ${formData.city}/${formData.state.toUpperCase()}\n\nForma de Pagamento Selecionada: ${paymentStr}`;
      } else {
        addressString = `Retirada na Loja:\nUnidade: ${pickupUnitSlug === 'linhares' ? 'Linhares' : pickupUnitSlug === 'serra' ? 'Serra' : 'Teixeira'}\n\nForma de Pagamento Selecionada: ${paymentStr}`;
      }
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
        shipping: shippingValue,
        delivery_method: deliveryMethod,
        pickup_unit_slug: pickupUnitSlug,
        notes: finalNotes,
        discount_amount: effectiveDiscount,
        coupon_id: couponId,
        coupon_code: couponCode
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

      // NOTE: 'comprou' status should only be set when payment is confirmed by the gateway
      // The order starts as 'aguardando_pagamento' and will be updated by the webhook
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
                  <span className="text-muted-foreground">Subtotal dos itens ({cartCount} itens)</span>
                  <span className="font-medium text-foreground">R$ {cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Frete</span>
                  <span className="text-muted-foreground italic text-xs">Calculado na próxima etapa</span>
                </div>
                {couponDiscount > 0 && couponType !== 'shipping_percent' && (
                  <div className="flex items-center justify-between text-sm text-green-600 font-bold">
                    <span>Desconto (Cupom)</span>
                    <span>- R$ {couponDiscount.toFixed(2)}</span>
                  </div>
                )}
                {shippingDiscountAmount > 0 && (
                  <div className="flex items-center justify-between text-sm text-green-600 font-bold">
                    <span>Desconto no Frete ({couponDiscount}%)</span>
                    <span>- R$ {shippingDiscountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-lg sm:text-xl font-black pt-3 border-t-2 border-amber-100">
                  <span className="uppercase tracking-tight text-foreground/80">Subtotal Geral</span>
                  <span className="gradient-gold-text">R$ {(cartTotal - effectiveDiscount).toFixed(2)}</span>
                </div>
              </div>

              {cartTotal < minOrderValue && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700">
                    Pedido minimo: R$ {minOrderValue}. Faltam: <strong>R$ {(minOrderValue - cartTotal).toFixed(2)}</strong>
                  </p>
                </div>
              )}
            </div>

            {/* Cupom movido para o Passo 3 */}

            <button
              onClick={handleNext}
              disabled={cartTotal < minOrderValue}
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
            {/* Progressive Profiling: Only show inputs for missing fields or if editing */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />
                  Dados do Cliente
                </h2>
                {profileLoaded && (
                  <button 
                    type="button"
                    onClick={() => setIsEditingProfile(!isEditingProfile)}
                    className="text-xs font-semibold text-amber-600 hover:text-amber-700 underline"
                  >
                    {isEditingProfile ? 'Salvar visualização' : 'Editar dados'}
                  </button>
                )}
              </div>

              {/* Missing data banner */}
              {!isEditingProfile && (!initialProfile.full_name || !initialProfile.document) && (
                <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
                  <Zap className="w-4 h-4 text-amber-600 mt-0.5" />
                  <p className="text-[12px] text-amber-800 leading-relaxed font-medium">
                    Precisamos de mais alguns dados para finalizar seu pedido com segurança.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(isEditingProfile || !initialProfile.full_name) && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Nome Completo</label>
                    <input
                      type="text" name="customer_name" value={formData.customer_name} onChange={handleChange} required
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold"
                      placeholder="Nome completo"
                    />
                  </div>
                )}
                
                {(isEditingProfile || !initialProfile.phone) && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">WhatsApp</label>
                    <input
                      type="tel" name="customer_whatsapp" value={formData.customer_whatsapp} onChange={handleChange} required
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold"
                      placeholder="11999999999"
                    />
                  </div>
                )}

                {(isEditingProfile || !user?.email) && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">E-mail</label>
                    <input
                      type="email" name="customer_email" value={formData.customer_email} onChange={handleChange} required
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold"
                    />
                  </div>
                )}

                {(isEditingProfile || !initialProfile.document) && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">CPF ou CNPJ</label>
                    <input
                      type="text" name="customer_document" value={formData.customer_document} onChange={handleChange} required
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold"
                      placeholder="000.000.000-00"
                      inputMode="numeric"
                    />
                  </div>
                )}

                {/* Summary View for pre-filled data */}
                {!isEditingProfile && (
                  <>
                    {initialProfile.full_name && (
                      <div className="p-3 bg-surface-alt rounded-lg border border-border/50">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">Nome</span>
                        <span className="text-sm font-medium text-foreground">{formData.customer_name}</span>
                      </div>
                    )}
                    {initialProfile.phone && (
                      <div className="p-3 bg-surface-alt rounded-lg border border-border/50">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">WhatsApp</span>
                        <span className="text-sm font-medium text-foreground">{formData.customer_whatsapp}</span>
                      </div>
                    )}
                    {user?.email && (
                      <div className="p-3 bg-surface-alt rounded-lg border border-border/50">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">E-mail</span>
                        <span className="text-sm font-medium text-foreground">{formData.customer_email}</span>
                      </div>
                    )}
                    {initialProfile.document && (
                      <div className="p-3 bg-surface-alt rounded-lg border border-border/50">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">Documento</span>
                        <span className="text-sm font-medium text-foreground">{formData.customer_document}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>


            {/* Delivery Method Selector */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-border">
              <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Store className="w-5 h-5 text-amber-500" />
                Entrega
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                <button
                  type="button"
                  onClick={() => setDeliveryMethod('shipping')}
                  className={`relative flex items-center p-4 rounded-xl border transition-all ${deliveryMethod === 'shipping' ? 'border-amber-500 bg-amber-50/50 ring-1 ring-amber-500 shadow-sm' : 'border-border bg-surface hover:border-amber-300'}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${deliveryMethod === 'shipping' ? 'bg-amber-100/80 text-amber-600' : 'bg-surface-alt text-muted-foreground'}`}>
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div className="flex-1 text-left">
                    <span className="block font-bold text-sm text-foreground">Receber em casa</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">Entrega via transportadora</span>
                  </div>
                  {deliveryMethod === 'shipping' && (
                    <div className="absolute top-4 right-4">
                      <div className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </div>
                    </div>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => { setDeliveryMethod('pickup'); setPickupUnitSlug('linhares'); }}
                  className={`relative flex items-center p-4 rounded-xl border transition-all ${deliveryMethod === 'pickup' ? 'border-amber-500 bg-amber-50/50 ring-1 ring-amber-500 shadow-sm' : 'border-border bg-surface hover:border-amber-300'}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${deliveryMethod === 'pickup' ? 'bg-amber-100/80 text-amber-600' : 'bg-surface-alt text-muted-foreground'}`}>
                    <Store className="w-5 h-5" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="block font-bold text-sm text-foreground">Retirar na Loja</span>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Grátis</span>
                    </div>
                    <span className="block text-xs text-muted-foreground mt-0.5">Unidades Rei dos Cachos</span>
                  </div>
                  {deliveryMethod === 'pickup' && (
                    <div className="absolute top-4 right-4">
                      <div className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </div>
                    </div>
                  )}
                </button>
              </div>

              {/* Conditional Form: Address OR Store Selection */}
              {deliveryMethod === 'shipping' ? (
                <>
                  <div className="flex items-center justify-between mb-3 mt-2 border-t border-border pt-4">
                    <h3 className="text-sm font-bold text-foreground">Endereço de Entrega</h3>
                  </div>

                  {/* Smart Address Form */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(isEditingProfile || !initialProfile.address_cep) && (
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">CEP *</label>
                        <input type="text" name="cep" required value={formData.cep} onChange={handleChange} placeholder="00000-000"
                          className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm focus:ring-2 focus:ring-gold" />
                      </div>
                    )}
                    {(isEditingProfile || !initialProfile.address_street) && (
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Rua *</label>
                        <input type="text" name="street" required value={formData.street} onChange={handleChange} placeholder="Av. Principal"
                          className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm focus:ring-2 focus:ring-gold" />
                      </div>
                    )}
                    {(isEditingProfile || !initialProfile.address_number) && (
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Numero *</label>
                        <input type="text" name="number" required value={formData.number} onChange={handleChange} placeholder="123"
                          className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm focus:ring-2 focus:ring-gold" />
                      </div>
                    )}
                    {(isEditingProfile || initialProfile.address_complement === undefined) && (
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Complemento</label>
                        <input type="text" name="complement" value={formData.complement} onChange={handleChange} placeholder="Apto 101"
                          className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm focus:ring-2 focus:ring-gold" />
                      </div>
                    )}
                    {(isEditingProfile || !initialProfile.address_neighborhood) && (
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Bairro *</label>
                        <input type="text" name="neighborhood" required value={formData.neighborhood} onChange={handleChange} placeholder="Centro"
                          className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm focus:ring-2 focus:ring-gold" />
                      </div>
                    )}
                    {(isEditingProfile || !initialProfile.address_city || !initialProfile.address_state) && (
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
                    )}

                    {/* Summary for filled address */}
                    {!isEditingProfile && (
                      <div className="sm:col-span-2">
                        <div className="p-4 bg-surface-alt rounded-xl border border-border/50 space-y-2">
                          {initialProfile.address_cep && (
                            <div className="flex items-center gap-2 overflow-hidden">
                              <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm text-foreground truncate">
                                {formData.street}, {formData.number} {formData.complement ? `(${formData.complement})` : ''} - {formData.neighborhood}, {formData.city}/{formData.state} (CEP: {formData.cep})
                              </span>
                            </div>
                          )}
                          {!initialProfile.address_cep && (
                            <span className="text-xs text-muted-foreground italic">Endereço será coletado nos campos acima</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>

              ) : (
                <div className="animate-in fade-in zoom-in-95 duration-200">
                  <h3 className="text-sm font-bold text-foreground mb-4 mt-2 border-t border-border pt-6">Selecione a unidade</h3>
                  <div className="space-y-3">
                    {/* Linhares */}
                    <label className={`relative block p-4 rounded-xl border cursor-pointer transition-all ${pickupUnitSlug === 'linhares' ? 'border-amber-500 bg-amber-50/30' : 'border-border bg-surface hover:border-amber-300'}`}>
                      <input type="radio" name="pickup_unit" className="sr-only" checked={pickupUnitSlug === 'linhares'} onChange={() => setPickupUnitSlug('linhares')} />
                      <div className="flex items-start gap-4">
                        <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${pickupUnitSlug === 'linhares' ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300'}`}>
                          {pickupUnitSlug === 'linhares' && <Check className="w-3 h-3" />}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-foreground text-sm">Rei dos Cachos (Linhares)</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Av. Gov. Carlos Lindemberg, 835<br/>Centro, Linhares - ES, 29900-203</p>
                        </div>
                      </div>
                    </label>

                    {/* Serra */}
                    <label className={`relative block p-4 rounded-xl border cursor-pointer transition-all ${pickupUnitSlug === 'serra' ? 'border-amber-500 bg-amber-50/30' : 'border-border bg-surface hover:border-amber-300'}`}>
                      <input type="radio" name="pickup_unit" className="sr-only" checked={pickupUnitSlug === 'serra'} onChange={() => setPickupUnitSlug('serra')} />
                      <div className="flex items-start gap-4">
                        <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${pickupUnitSlug === 'serra' ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300'}`}>
                          {pickupUnitSlug === 'serra' && <Check className="w-3 h-3" />}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-foreground text-sm">Rei dos Cachos (Serra)</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Av. Central, 1197 - Parque Res. Laranjeiras<br/>Serra - ES, 29165-130</p>
                        </div>
                      </div>
                    </label>

                    {/* Teixeira */}
                    <label className={`relative block p-4 rounded-xl border cursor-pointer transition-all ${pickupUnitSlug === 'teixeira' ? 'border-amber-500 bg-amber-50/30' : 'border-border bg-surface hover:border-amber-300'}`}>
                      <input type="radio" name="pickup_unit" className="sr-only" checked={pickupUnitSlug === 'teixeira'} onChange={() => setPickupUnitSlug('teixeira')} />
                      <div className="flex items-start gap-4">
                        <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${pickupUnitSlug === 'teixeira' ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300'}`}>
                          {pickupUnitSlug === 'teixeira' && <Check className="w-3 h-3" />}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-foreground text-sm">Rei dos Cachos (Teixeira de Freitas)</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Av. São Paulo, 151 - Bela Vista<br/>Teixeira de Freitas - BA, 45997-006</p>
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              )}
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

            {/* Cupom de Desconto - Movido para o Passo 3 */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-card">
              <label className="block text-xs font-bold text-muted-foreground uppercase mb-2">Cupom de Desconto</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Código do cupom"
                  disabled={couponDiscount > 0 || isValidatingCoupon}
                  className="flex-1 px-3 py-2 rounded-lg border border-border focus:ring-2 focus:ring-gold outline-none uppercase font-mono text-sm"
                />
                {couponDiscount > 0 ? (
                  <button
                    onClick={() => { setCouponDiscount(0); setCouponId(null); setCouponCode(''); setCouponType(null); }}
                    className="px-4 py-2 rounded-lg border border-red-200 text-red-500 text-sm font-bold hover:bg-red-50 transition-colors"
                  >
                    Remover
                  </button>
                ) : (
                  <button
                    onClick={handleApplyCoupon}
                    disabled={isValidatingCoupon || !couponCode.trim()}
                    className="px-4 py-2 rounded-lg bg-foreground text-white text-sm font-bold hover:bg-foreground/90 transition-colors disabled:opacity-50"
                  >
                    {isValidatingCoupon ? '...' : 'Aplicar'}
                  </button>
                )}
              </div>
              {couponDiscount > 0 && (
                <p className="mt-2 text-xs text-green-600 font-bold flex items-center gap-1">
                  <Check className="w-3 h-3" /> {couponType === 'free_shipping' ? 'Frete Grátis aplicado!' : couponType === 'shipping_percent' ? `${couponDiscount}% de desconto no frete aplicado!` : `Desconto de R$ ${couponDiscount.toFixed(2)} aplicado!`}
                </p>
              )}
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
                  {deliveryMethod === 'pickup' ? (
                    <div className="flex flex-col items-end">
                      <span className="text-emerald-600 font-bold">Retirada Grátis</span>
                    </div>
                  ) : !isAddressValid ? (
                     <span className="text-muted-foreground italic text-xs">A calcular</span>
                  ) : couponType === 'free_shipping' ? (
                    <div className="flex flex-col items-end">
                      <span className="text-muted-foreground line-through text-xs">R$ {shippingEstimate.toFixed(2)}</span>
                      <span className="text-emerald-600 font-bold">Grátis</span>
                    </div>
                  ) : couponType === 'shipping_percent' ? (
                    <div className="flex flex-col items-end">
                      <span className="text-muted-foreground line-through text-xs">R$ {shippingEstimate.toFixed(2)}</span>
                      <span className="text-emerald-600 font-bold">R$ {(shippingEstimate - shippingDiscountAmount).toFixed(2)}</span>
                    </div>
                  ) : (
                    <span>+ R$ {shippingEstimate.toFixed(2)}</span>
                  )}
                </div>
                {deliveryMethod === 'shipping' && isAddressValid && (
                  <p className="text-[10px] text-muted-foreground mt-1 text-left">
                    O valor é uma média de cotação com tranportadoras parceiras.
                  </p>
                )}
              </div>

              {couponDiscount > 0 && couponType !== 'free_shipping' && couponType !== 'shipping_percent' && (
                <div className="flex items-center justify-between text-sm text-green-600 font-bold">
                  <span>Desconto (Cupom)</span>
                  <span>- R$ {couponDiscount.toFixed(2)}</span>
                </div>
              )}
              {shippingDiscountAmount > 0 && (
                <div className="flex items-center justify-between text-sm text-green-600 font-bold">
                  <span>Desconto no Frete ({couponDiscount}%)</span>
                  <span>- R$ {shippingDiscountAmount.toFixed(2)}</span>
                </div>
              )}

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
