import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, CreditCard, Loader, ShoppingCart, MapPin, Zap, Store, Truck } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTrackInitiateCheckout } from '@/hooks/useSessionTracking';
import { isValidDocument } from '@/utils/validateDocument';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PortalPage, PortalSection, PortalTopBar } from '@/components/portal/PortalPage';
import { formatBRL } from '@/lib/format'

type Step = 1 | 2 | 3;

// Unidades de retirada (mesmos textos de antes; só saiu a repetição do JSX).
const PICKUP_UNITS = [
  { slug: 'linhares', name: 'Rei dos Cachos (Linhares)', line1: 'Av. Gov. Carlos Lindemberg, 835', line2: 'Centro, Linhares - ES, 29900-203' },
  { slug: 'serra', name: 'Rei dos Cachos (Serra)', line1: 'Av. Central, 1197 - Parque Res. Laranjeiras', line2: 'Serra - ES, 29165-130' },
  { slug: 'teixeira', name: 'Rei dos Cachos (Teixeira de Freitas)', line1: 'Av. São Paulo, 151 - Bela Vista', line2: 'Teixeira de Freitas - BA, 45997-006' },
];

/**
 * Barra de ação do checkout: no mobile gruda no rodapé com o total sempre
 * visível — mesmo padrão nas três etapas. No desktop volta ao fluxo.
 */
function ActionBar({ total, totalLabel, children }: { total?: number; totalLabel?: string; children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-30 -mx-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background/95 backdrop-blur border-t border-border sm:static sm:mx-0 sm:px-0 sm:pt-0 sm:pb-0 sm:bg-transparent sm:backdrop-blur-none sm:border-0">
      {total !== undefined && (
        <div className="flex items-baseline justify-between mb-2.5 sm:hidden">
          <span className="text-[13px] text-muted-foreground">{totalLabel}</span>
          <span className="text-[17px] font-semibold text-foreground numeric">{formatBRL(total)}</span>
        </div>
      )}
      {children}
    </div>
  );
}

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
  const { items: cart, total: cartTotal, clearCart, count: cartCount, minOrderValue } = useCart();
  const trackInitiateCheckout = useTrackInitiateCheckout();

  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponId, setCouponId] = useState<string | null>(null);
  const [couponType, setCouponType] = useState<'fixed' | 'percent' | 'free_shipping' | 'shipping_percent' | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [initialProfile, setInitialProfile] = useState<Partial<ProfileData>>({});

  const [customerSegment, setCustomerSegment] = useState<string | null>(null);
  const isNetworkPartner = customerSegment === 'network_partner';

  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credit' | 'pay_on_delivery'>('pix');
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
    supabase.from('profiles').select('full_name, phone, document, document_type, address_cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, customer_segment')
      .eq('id', user.id).single()
      .then(({ data }) => {
        if (data) {
          const p = data as ProfileData & { customer_segment?: string | null };
          const segment = p.customer_segment ?? null;
          setCustomerSegment(segment);
          if (segment === 'network_partner') {
            setPaymentMethod('pay_on_delivery');
          }
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

  // Shipping = 20% of subtotal
  const shippingEstimate = Math.round(cartTotal * 0.20 * 100) / 100;
  // network_partner: frete sempre 0 (transporte próprio da rede)
  const shippingValue = (deliveryMethod === 'pickup' || isNetworkPartner) ? 0 : (couponType === 'free_shipping' ? 0 : shippingEstimate);
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

  const isAddressValid = !!(
    formData.cep && formData.cep.length >= 9 &&
    formData.street && formData.number &&
    formData.neighborhood && formData.city &&
    formData.state && formData.state.length === 2
  );

  const handleNext = () => {
    setError('');
    if (step === 1) {
      if (cartTotal < minOrderValue) {
        setError(`Pedido mínimo: ${formatBRL(minOrderValue)}. Seu total: ${formatBRL(cartTotal)}`);
        return;
      }
      setStep(2);
    } else if (step === 2) {
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
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 3) setStep(2);
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

      // Ensure we have a fresh, valid session before calling the edge function.
      // getSession() returns the cached session which may have an expired access_token.
      // refreshSession() forces renewal and returns the new access_token.
      const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
      if (sessionError || !session) {
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


      const paymentStr = paymentMethod === 'pix'
        ? 'PIX'
        : paymentMethod === 'pay_on_delivery'
          ? 'Pagar na Entrega'
          : `Cartão de Crédito (${installments}x${installments > 3 ? ' com juros' : ' sem juros'})`;
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

      // Use raw fetch to have full control over auth headers
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const fnRes = await fetch(`${supabaseUrl}/functions/v1/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify(orderBody),
      });

      const fnData = await fnRes.json().catch(() => ({}));

      if (!fnRes.ok) {
        throw new Error(fnData?.error || `Erro ${fnRes.status} ao criar pedido`);
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
    { num: 2, label: 'Entrega' },
    { num: 3, label: 'Pagamento' },
  ];

  const stepSubtitle =
    step === 1 ? 'Confira os itens antes de seguir.'
      : step === 2 ? 'Seus dados e como quer receber o pedido.'
        : 'Escolha como prefere pagar.';

  // Visual de seleção do sistema: ouro chapado no contorno, fundo brand-subtle.
  const choiceClass = (active: boolean) =>
    `relative flex items-center gap-3 p-3.5 rounded-lg border text-left transition-colors ${
      active
        ? 'border-brand bg-brand-subtle ring-1 ring-brand'
        : 'border-border bg-card hover:border-ink-300'
    }`;
  const choiceIconClass = (active: boolean) =>
    `w-9 h-9 rounded-md border flex items-center justify-center shrink-0 ${
      active ? 'border-brand-border bg-card text-brand-strong' : 'border-border bg-surface text-ink-500'
    }`;

  const CARD = 'surface-card shadow-xs p-4 sm:p-5';
  const CARD_TITLE = 'text-[14px] font-semibold text-foreground tracking-tight';


  return (
    <div className="min-h-screen bg-background">
      <PortalTopBar
        onBack={() => (step === 1 ? navigate('/catalogo') : handleBack())}
        backLabel={step === 1 ? 'Catálogo' : 'Etapa anterior'}
      />

      <PortalPage
        width="compact"
        ambient={false}
        title="Finalizar pedido"
        subtitle={stepSubtitle}
        headerExtra={
          <ol className="flex items-center gap-2" aria-label="Etapas do pedido">
            {steps.map((s, i) => (
              <li key={s.num} className="flex items-center gap-2 min-w-0">
                {i > 0 && <span className={`w-6 sm:w-10 h-px ${step >= s.num ? 'bg-foreground' : 'bg-border'} transition-colors`} aria-hidden />}
                {/* Concluído / atual / pendente — três estados, três pesos. */}
                <span
                  aria-current={step === s.num ? 'step' : undefined}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-medium numeric transition-colors shrink-0 ${
                    step > s.num ? 'bg-success-subtle text-success border border-success-border'
                      : step === s.num ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-ink-400 border border-border'
                  }`}
                >
                  {step > s.num ? <Check className="w-3.5 h-3.5" /> : s.num}
                </span>
                <span className={`text-[12px] font-medium truncate ${step === s.num ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {s.label}
                </span>
              </li>
            ))}
          </ol>
        }
      >
        <PortalSection className="space-y-4">
          {error && (
            <div role="alert" className="p-3.5 rounded-lg bg-danger-subtle border border-danger-border text-danger text-[13px]">
              {error}
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP 1: ORDER SUMMARY */}
          {/* ============================================================ */}
          {step === 1 && (
            <>
              <div className={CARD}>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className={CARD_TITLE}>Itens do pedido</h2>
                  <span className="text-[12px] text-muted-foreground numeric">{cartCount} {cartCount === 1 ? 'item' : 'itens'}</span>
                </div>

                <div className="divide-y divide-border">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center gap-3 py-2.5">
                      {item.image ? (
                        <img src={item.image} alt="" className="w-11 h-11 rounded-md object-cover border border-border flex-shrink-0" />
                      ) : (
                        <div className="w-11 h-11 rounded-md border border-border bg-surface flex items-center justify-center shrink-0">
                          <ShoppingCart className="w-4 h-4 text-ink-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-foreground line-clamp-2 leading-snug">{item.name}</p>
                        <p className="text-[12px] text-muted-foreground numeric mt-0.5">{item.quantity}x {formatBRL(item.price)}</p>
                      </div>
                      <p className="text-[13px] font-semibold text-foreground whitespace-nowrap numeric">
                        {formatBRL((item.price * item.quantity))}
                      </p>
                    </div>
                  ))}
                </div>

                <dl className="border-t border-border pt-3 mt-1 space-y-2 text-[13px]">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Subtotal dos itens</dt>
                    <dd className="text-foreground numeric">{formatBRL(cartTotal)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Frete</dt>
                    <dd className="text-muted-foreground text-[12px]">Calculado na próxima etapa</dd>
                  </div>
                  {couponDiscount > 0 && couponType !== 'shipping_percent' && (
                    <div className="flex items-center justify-between text-success font-medium">
                      <dt>Desconto (cupom)</dt>
                      <dd className="numeric">− {formatBRL(couponDiscount)}</dd>
                    </div>
                  )}
                  {shippingDiscountAmount > 0 && (
                    <div className="flex items-center justify-between text-success font-medium">
                      <dt>Desconto no frete ({couponDiscount}%)</dt>
                      <dd className="numeric">− {formatBRL(shippingDiscountAmount)}</dd>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between pt-3 border-t border-border">
                    <dt className="text-[14px] font-semibold text-foreground">Subtotal</dt>
                    <dd className="font-title text-[24px] font-semibold text-foreground numeric leading-none">
                      {formatBRL((cartTotal - effectiveDiscount))}
                    </dd>
                  </div>
                </dl>

                {cartTotal < minOrderValue && (
                  <p className="mt-4 text-[12px] text-warning bg-warning-subtle border border-warning-border rounded-md py-2 px-3 numeric">
                    Pedido mínimo de {formatBRL(minOrderValue)}. Faltam <strong className="font-semibold">{formatBRL((minOrderValue - cartTotal))}</strong> — volte ao catálogo para completar.
                  </p>
                )}
              </div>

              <ActionBar total={cartTotal - effectiveDiscount} totalLabel="Subtotal">
                <Button size="lg" className="w-full" onClick={handleNext} disabled={cartTotal < minOrderValue}>
                  Continuar para entrega
                  <ArrowRight />
                </Button>
              </ActionBar>
            </>
          )}

          {/* ============================================================ */}
          {/* STEP 2: DELIVERY */}
          {/* ============================================================ */}
          {step === 2 && (
            <>
              {/* Progressive profiling: só pede o que falta, ou tudo se editando */}
              <div className={CARD}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className={CARD_TITLE}>Seus dados</h2>
                  {profileLoaded && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setIsEditingProfile(!isEditingProfile)}
                    >
                      {isEditingProfile ? 'Concluir edição' : 'Editar dados'}
                    </Button>
                  )}
                </div>

                {!isEditingProfile && (!initialProfile.full_name || !initialProfile.document) && (
                  <div className="mb-4 p-3 bg-surface border border-border rounded-md flex items-start gap-2.5">
                    <Zap className="w-4 h-4 text-ink-500 mt-0.5 shrink-0" />
                    <p className="text-[12px] text-ink-600 leading-relaxed">
                      Precisamos de mais alguns dados para finalizar seu pedido com segurança.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {(isEditingProfile || !initialProfile.full_name) && (
                    <div>
                      <label htmlFor="co-name" className="field-label">Nome completo</label>
                      <Input id="co-name" type="text" name="customer_name" value={formData.customer_name} onChange={handleChange} required placeholder="Nome completo" autoComplete="name" />
                    </div>
                  )}

                  {(isEditingProfile || !initialProfile.phone) && (
                    <div>
                      <label htmlFor="co-phone" className="field-label">WhatsApp</label>
                      <Input id="co-phone" type="tel" name="customer_whatsapp" value={formData.customer_whatsapp} onChange={handleChange} required placeholder="11999999999" autoComplete="tel" inputMode="numeric" />
                    </div>
                  )}

                  {(isEditingProfile || !user?.email) && (
                    <div>
                      <label htmlFor="co-email" className="field-label">E-mail</label>
                      <Input id="co-email" type="email" name="customer_email" value={formData.customer_email} onChange={handleChange} required autoComplete="email" />
                    </div>
                  )}

                  {(isEditingProfile || !initialProfile.document) && (
                    <div>
                      <label htmlFor="co-doc" className="field-label">CPF ou CNPJ</label>
                      <Input id="co-doc" type="text" name="customer_document" value={formData.customer_document} onChange={handleChange} required placeholder="000.000.000-00" inputMode="numeric" />
                    </div>
                  )}

                  {/* Resumo dos dados já preenchidos */}
                  {!isEditingProfile && (
                    <>
                      {initialProfile.full_name && (
                        <div className="px-3 py-2.5 bg-surface rounded-md border border-border min-w-0">
                          <span className="block text-[12px] text-muted-foreground">Nome</span>
                          <span className="block text-[13px] font-medium text-foreground truncate">{formData.customer_name}</span>
                        </div>
                      )}
                      {initialProfile.phone && (
                        <div className="px-3 py-2.5 bg-surface rounded-md border border-border min-w-0">
                          <span className="block text-[12px] text-muted-foreground">WhatsApp</span>
                          <span className="block text-[13px] font-medium text-foreground numeric truncate">{formData.customer_whatsapp}</span>
                        </div>
                      )}
                      {user?.email && (
                        <div className="px-3 py-2.5 bg-surface rounded-md border border-border min-w-0">
                          <span className="block text-[12px] text-muted-foreground">E-mail</span>
                          <span className="block text-[13px] font-medium text-foreground truncate">{formData.customer_email}</span>
                        </div>
                      )}
                      {initialProfile.document && (
                        <div className="px-3 py-2.5 bg-surface rounded-md border border-border min-w-0">
                          <span className="block text-[12px] text-muted-foreground">Documento</span>
                          <span className="block text-[13px] font-medium text-foreground numeric truncate">{formData.customer_document}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Forma de entrega */}
              <div className={CARD}>
                <h2 className={`${CARD_TITLE} mb-3`}>Entrega</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="Forma de entrega">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={deliveryMethod === 'shipping'}
                    onClick={() => setDeliveryMethod('shipping')}
                    className={choiceClass(deliveryMethod === 'shipping')}
                  >
                    <span className={choiceIconClass(deliveryMethod === 'shipping')}>
                      <MapPin className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold text-foreground">Receber em casa</span>
                      <span className="block text-[12px] text-muted-foreground mt-0.5">
                        {isNetworkPartner ? 'Transporte próprio da rede' : 'Entrega via transportadora'}
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={deliveryMethod === 'pickup'}
                    onClick={() => { setDeliveryMethod('pickup'); setPickupUnitSlug('linhares'); }}
                    className={choiceClass(deliveryMethod === 'pickup')}
                  >
                    <span className={choiceIconClass(deliveryMethod === 'pickup')}>
                      <Store className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-foreground">Retirar na loja</span>
                        <Badge variant="success">Grátis</Badge>
                      </span>
                      <span className="block text-[12px] text-muted-foreground mt-0.5">Unidades Rei dos Cachos</span>
                    </span>
                  </button>
                </div>

                {deliveryMethod === 'shipping' ? (
                  <div className="mt-5 pt-4 border-t border-border">
                    <h3 className="text-[13px] font-semibold text-foreground mb-3">Endereço de entrega</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {(isEditingProfile || !initialProfile.address_cep) && (
                        <div>
                          <label htmlFor="co-cep" className="field-label">CEP</label>
                          <Input id="co-cep" type="text" name="cep" required value={formData.cep} onChange={handleChange} placeholder="00000-000" inputMode="numeric" autoComplete="postal-code" />
                        </div>
                      )}
                      {(isEditingProfile || !initialProfile.address_street) && (
                        <div>
                          <label htmlFor="co-street" className="field-label">Rua</label>
                          <Input id="co-street" type="text" name="street" required value={formData.street} onChange={handleChange} placeholder="Av. Principal" autoComplete="address-line1" />
                        </div>
                      )}
                      {(isEditingProfile || !initialProfile.address_number) && (
                        <div>
                          <label htmlFor="co-number" className="field-label">Número</label>
                          <Input id="co-number" type="text" name="number" required value={formData.number} onChange={handleChange} placeholder="123" />
                        </div>
                      )}
                      {(isEditingProfile || initialProfile.address_complement === undefined) && (
                        <div>
                          <label htmlFor="co-compl" className="field-label">
                            Complemento <span className="font-normal text-muted-foreground">(opcional)</span>
                          </label>
                          <Input id="co-compl" type="text" name="complement" value={formData.complement} onChange={handleChange} placeholder="Apto 101" autoComplete="address-line2" />
                        </div>
                      )}
                      {(isEditingProfile || !initialProfile.address_neighborhood) && (
                        <div>
                          <label htmlFor="co-neigh" className="field-label">Bairro</label>
                          <Input id="co-neigh" type="text" name="neighborhood" required value={formData.neighborhood} onChange={handleChange} placeholder="Centro" />
                        </div>
                      )}
                      {(isEditingProfile || !initialProfile.address_city || !initialProfile.address_state) && (
                        <div className="flex gap-3">
                          <div className="flex-1 min-w-0">
                            <label htmlFor="co-city" className="field-label">Cidade</label>
                            <Input id="co-city" type="text" name="city" required value={formData.city} onChange={handleChange} placeholder="São Paulo" autoComplete="address-level2" />
                          </div>
                          <div className="w-20">
                            <label htmlFor="co-uf" className="field-label">UF</label>
                            <Input id="co-uf" type="text" name="state" required maxLength={2} value={formData.state} onChange={handleChange} placeholder="SP" className="uppercase" autoComplete="address-level1" />
                          </div>
                        </div>
                      )}

                      {/* Resumo do endereço já preenchido */}
                      {!isEditingProfile && (
                        <div className="sm:col-span-2">
                          <div className="px-3 py-2.5 bg-surface rounded-md border border-border">
                            {initialProfile.address_cep ? (
                              <div className="flex items-start gap-2">
                                <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                                <span className="text-[13px] text-foreground">
                                  {formData.street}, {formData.number} {formData.complement ? `(${formData.complement})` : ''} – {formData.neighborhood}, {formData.city}/{formData.state} · CEP {formData.cep}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[12px] text-muted-foreground">Preencha o endereço nos campos acima.</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 pt-4 border-t border-border">
                    <h3 className="text-[13px] font-semibold text-foreground mb-3">Selecione a unidade</h3>
                    <div className="space-y-2" role="radiogroup" aria-label="Unidade de retirada">
                      {PICKUP_UNITS.map(unit => {
                        const active = pickupUnitSlug === unit.slug;
                        return (
                          <label
                            key={unit.slug}
                            className={`relative flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                              active ? 'border-brand bg-brand-subtle ring-1 ring-brand' : 'border-border bg-card hover:border-ink-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name="pickup_unit"
                              className="sr-only"
                              checked={active}
                              onChange={() => setPickupUnitSlug(unit.slug)}
                            />
                            <span
                              className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                                active ? 'border-brand-strong' : 'border-ink-300 bg-card'
                              }`}
                              aria-hidden
                            >
                              {active && <span className="w-2 h-2 rounded-full bg-brand-strong" />}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-[13px] font-semibold text-foreground">{unit.name}</span>
                              <span className="block text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
                                {unit.line1}<br />{unit.line2}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Observações */}
              <div className={CARD}>
                <label htmlFor="co-notes" className="field-label">
                  Observações <span className="font-normal text-muted-foreground">(opcional)</span>
                </label>
                <Textarea
                  id="co-notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Alguma observação para o pedido?"
                />
              </div>

              {/* Cupom — oculto para parceiro da rede */}
              {!isNetworkPartner && (
                <div className={CARD}>
                  <label htmlFor="co-coupon" className="field-label">Cupom de desconto</label>
                  <div className="flex gap-2">
                    <Input
                      id="co-coupon"
                      type="text"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="Código do cupom"
                      disabled={couponDiscount > 0 || isValidatingCoupon}
                      className="flex-1 uppercase mono"
                    />
                    {couponDiscount > 0 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="text-danger"
                        onClick={() => { setCouponDiscount(0); setCouponId(null); setCouponCode(''); setCouponType(null); }}
                      >
                        Remover
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleApplyCoupon}
                        disabled={isValidatingCoupon || !couponCode.trim()}
                      >
                        {isValidatingCoupon ? <Loader className="animate-spin" /> : 'Aplicar'}
                      </Button>
                    )}
                  </div>
                  {couponDiscount > 0 && (
                    <p className="mt-2 text-[12px] text-success font-medium flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> {couponType === 'free_shipping' ? 'Frete grátis aplicado.' : couponType === 'shipping_percent' ? `${couponDiscount}% de desconto no frete aplicado.` : `Desconto de ${formatBRL(couponDiscount)} aplicado.`}
                    </p>
                  )}
                </div>
              )}

              {/* Resumo do total */}
              <div className={CARD}>
                <h2 className={`${CARD_TITLE} mb-3`}>Resumo</h2>
                <dl className="space-y-2 text-[13px]">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Subtotal ({cartCount} {cartCount === 1 ? 'item' : 'itens'})</dt>
                    <dd className="text-foreground numeric">{formatBRL(cartTotal)}</dd>
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-muted-foreground">Frete</dt>
                    <dd className="text-right numeric">
                      {isNetworkPartner ? (
                        <span className="text-success font-medium">Transporte próprio da rede</span>
                      ) : deliveryMethod === 'pickup' ? (
                        <span className="text-success font-medium">Retirada grátis</span>
                      ) : !isAddressValid ? (
                        <span className="text-muted-foreground text-[12px]">Preencha o endereço</span>
                      ) : couponType === 'free_shipping' ? (
                        <span className="flex flex-col items-end">
                          <span className="text-muted-foreground line-through text-[12px]">{formatBRL(shippingEstimate)}</span>
                          <span className="text-success font-medium">Grátis</span>
                        </span>
                      ) : couponType === 'shipping_percent' ? (
                        <span className="flex flex-col items-end">
                          <span className="text-muted-foreground line-through text-[12px]">{formatBRL(shippingEstimate)}</span>
                          <span className="text-success font-medium">{formatBRL((shippingEstimate - shippingDiscountAmount))}</span>
                        </span>
                      ) : (
                        <span className="text-foreground">{formatBRL(shippingEstimate)}</span>
                      )}
                    </dd>
                  </div>
                  {deliveryMethod === 'shipping' && isAddressValid && !isNetworkPartner && (
                    <p className="text-[12px] text-muted-foreground">
                      Valor médio de cotação com as transportadoras parceiras.
                    </p>
                  )}

                  {couponDiscount > 0 && couponType !== 'free_shipping' && couponType !== 'shipping_percent' && (
                    <div className="flex items-center justify-between text-success font-medium">
                      <dt>Desconto (cupom)</dt>
                      <dd className="numeric">− {formatBRL(couponDiscount)}</dd>
                    </div>
                  )}
                  {shippingDiscountAmount > 0 && (
                    <div className="flex items-center justify-between text-success font-medium">
                      <dt>Desconto no frete ({couponDiscount}%)</dt>
                      <dd className="numeric">− {formatBRL(shippingDiscountAmount)}</dd>
                    </div>
                  )}

                  <div className="flex items-baseline justify-between pt-3 border-t border-border">
                    <dt className="text-[14px] font-semibold text-foreground">Total do pedido</dt>
                    <dd className="font-title text-[24px] font-semibold text-foreground numeric leading-none">
                      {formatBRL(orderTotal)}
                    </dd>
                  </div>
                </dl>
              </div>

              <ActionBar total={orderTotal} totalLabel="Total do pedido">
                <Button size="lg" className="w-full" onClick={handleNext}>
                  Continuar para pagamento
                  <ArrowRight />
                </Button>
              </ActionBar>
            </>
          )}

          {/* ============================================================ */}
          {/* STEP 3: PAYMENT */}
          {/* ============================================================ */}
          {step === 3 && (
            <>
              <div className={CARD}>
                <h2 className={`${CARD_TITLE} mb-3`}>Forma de pagamento</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="Forma de pagamento">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={paymentMethod === 'pix'}
                    onClick={() => { setPaymentMethod('pix'); setInstallments(1); }}
                    className={choiceClass(paymentMethod === 'pix')}
                  >
                    <span className={choiceIconClass(paymentMethod === 'pix')}>
                      <Zap className="w-4 h-4" />
                    </span>
                    <span className="text-[13px] font-semibold text-foreground">Pix</span>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={paymentMethod === 'credit'}
                    onClick={() => setPaymentMethod('credit')}
                    className={choiceClass(paymentMethod === 'credit')}
                  >
                    <span className={choiceIconClass(paymentMethod === 'credit')}>
                      <CreditCard className="w-4 h-4" />
                    </span>
                    <span className="text-[13px] font-semibold text-foreground">Cartão de crédito</span>
                  </button>

                  {isNetworkPartner && (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={paymentMethod === 'pay_on_delivery'}
                      onClick={() => { setPaymentMethod('pay_on_delivery'); setInstallments(1); }}
                      className={`sm:col-span-2 ${choiceClass(paymentMethod === 'pay_on_delivery')}`}
                    >
                      <span className={choiceIconClass(paymentMethod === 'pay_on_delivery')}>
                        <Truck className="w-4 h-4" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-semibold text-foreground">Pagar na entrega</span>
                        <span className="block text-[12px] text-muted-foreground mt-0.5">Pagamento acertado no ato da entrega</span>
                      </span>
                    </button>
                  )}
                </div>
              </div>

              <div className={`${CARD} hidden sm:block`}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[14px] font-semibold text-foreground">Total do pedido</span>
                  <span className="font-title text-[24px] font-semibold text-foreground numeric leading-none">
                    {formatBRL(orderTotal)}
                  </span>
                </div>
              </div>

              <ActionBar total={orderTotal} totalLabel="Total do pedido">
                <Button size="lg" className="w-full" onClick={handleSubmit} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader className="animate-spin" />
                      Processando…
                    </>
                  ) : (
                    <>
                      <Check />
                      Finalizar compra
                    </>
                  )}
                </Button>
                {paymentMethod !== 'pay_on_delivery' && (
                  <p className="text-[12px] text-center text-muted-foreground mt-2">
                    Você será redirecionado para concluir o pagamento em seguida.
                  </p>
                )}
              </ActionBar>
            </>
          )}
        </PortalSection>
      </PortalPage>
    </div>
  );
};

export default Checkout;
