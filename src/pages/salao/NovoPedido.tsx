import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader, Search, Plus, Minus, Trash2, UserCheck, LogOut, Clock, MapPin, Tag, Truck, LayoutGrid, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

import logo from '@/assets/logo-rei-dos-cachos.png';
import StyledSelect from '@/components/ui/styled-select';
import { AdminThemeProvider } from '@/contexts/AdminThemeContext';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Panel, PageLoading } from '@/components/admin/ui/AdminPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DateField } from '@/components/ui/date-field';
import { formatBRL } from '@/lib/format'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  is_partner?: boolean;
  price_list_id?: string | null;
}

interface Product {
  id: string;
  name: string;
  price: number;
  partner_price?: number | null;
  main_image: string | null;
  category_id: string | null;
}

interface Category {
  id: string;
  name: string;
}

interface CartItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  main_image: string | null;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: 'PIX',               label: 'PIX' },
  { value: 'Cartão de Crédito', label: 'Cartão de Crédito' },
  { value: 'Cartão de Débito',  label: 'Cartão de Débito' },
  { value: 'Dinheiro',          label: 'Dinheiro' },
];

interface PaymentSplit {
  method: string;
  amount: string; // string para input controlado
}

// ─── Hook: useDebounce ────────────────────────────────────────────────────────

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ─── Componente ───────────────────────────────────────────────────────────────

function SalaoNovoPedidoInner() {
  // ── Estado ──────────────────────────────────────────────────────────────────
  const [customerSearch, setCustomerSearch]       = useState('');
  const [selectedCustomer, setSelectedCustomer]   = useState<CustomerProfile | null>(null);
  const [productSearch, setProductSearch]         = useState('');
  const [cartItems, setCartItems]                 = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod]         = useState('PIX');
  const [notes, setNotes]                         = useState('');
  const [orderDate, setOrderDate]                 = useState('');
  const [selectedSellerId, setSelectedSellerId]   = useState('');
  const [selectedUnitSlug, setSelectedUnitSlug]   = useState('');
  const [isSaving, setIsSaving]                   = useState(false);
  const [lastOrderId, setLastOrderId]             = useState<string | null>(null);

  // ── Price list overrides — product_id → resolved_price
  const [priceListOverrides, setPriceListOverrides] = useState<Record<string, number>>({});
  const [loadingPriceList, setLoadingPriceList]     = useState(false);

  // ── Split payment states
  const [splitMode, setSplitMode]                 = useState(false);
  const [paymentSplits, setPaymentSplits]         = useState<PaymentSplit[]>([
    { method: 'PIX',      amount: '' },
    { method: 'Dinheiro', amount: '' },
  ]);

  // ── Client Express States
  const [isCreatingClient, setIsCreatingClient]   = useState(false);
  const [newClientName, setNewClientName]         = useState('');
  const [newClientPhone, setNewClientPhone]       = useState('');
  const [newClientEmail, setNewClientEmail]       = useState('');

  const debouncedCustomerSearch = useDebounce(customerSearch, 300);

  // ── Queries ─────────────────────────────────────────────────────────────────

  // Busca de clientes sob demanda — só executa com >= 2 chars
  const { data: searchedCustomers = [], isLoading: loadingCustomers, isFetching: fetchingCustomers } = useQuery<CustomerProfile[]>({
    queryKey: ['salao-customers-search', debouncedCustomerSearch],
    queryFn: async () => {
      const search = debouncedCustomerSearch.trim();
      if (search.length < 2) return [];

      try {
        const { data, error } = await supabase.rpc('search_customers_for_salao', {
          p_search: search,
          p_limit: 20,
        });
        if (error) throw error;
        return (data || []) as CustomerProfile[];
      } catch (err) {
        console.warn('[Salao] search_customers_for_salao RPC failed, trying fallback:', err);
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, phone')
            .eq('role', 'user')
            .or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`)
            .order('full_name')
            .limit(20);
          if (error) {
            console.error('[Salao] Fallback also failed:', error.message);
            return [];
          }
          return (data || []).map(p => ({ ...p, email: null })) as CustomerProfile[];
        } catch {
          return [];
        }
      }
    },
    enabled: debouncedCustomerSearch.trim().length >= 2,
    staleTime: 30 * 1000,
  });

  const { data: allProducts = [], isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ['salao-catalog-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_products')
        .select('id, name, price, partner_price, main_image, category_id')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data || []) as Product[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['salao-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('id, name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60 * 60 * 1000,
  });

  const { data: sellers = [], isLoading: loadingSellers } = useQuery<{ id: string; name: string; code?: string | null }[]>({
    queryKey: ['salao-sellers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_active_sellers_for_dropdown');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60 * 60 * 1000,
  });



  // ── Buscar preços da tabela vinculada ao cliente selecionado ──────────────

  useEffect(() => {
    if (!selectedCustomer?.price_list_id || allProducts.length === 0) {
      setPriceListOverrides({});
      return;
    }

    setLoadingPriceList(true);
    supabase
      .rpc('resolve_product_prices', {
        p_user_id:     selectedCustomer.id,
        p_product_ids: allProducts.map(p => p.id),
      })
      .then(({ data, error }) => {
        if (!error && data) {
          const overrides: Record<string, number> = {};
          for (const row of data as { product_id: string; resolved_price: number }[]) {
            overrides[row.product_id] = Number(row.resolved_price);
          }
          setPriceListOverrides(overrides);
        } else {
          setPriceListOverrides({});
        }
        setLoadingPriceList(false);
      });
  }, [selectedCustomer?.id, selectedCustomer?.price_list_id, allProducts]);

  // ── Filtros locais ─────────────────────────────────────────────────────────

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    if (!q) return allProducts;
    return allProducts.filter(p => p.name.toLowerCase().includes(q));
  }, [allProducts, productSearch]);

  // ── Totais — calculados a partir dos preços editáveis ──────────────────────

  const subtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity * item.price, 0),
    [cartItems]
  );

  const total = subtotal;

  const splitsTotal = paymentSplits.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const splitsDiff  = total - splitsTotal;

  // ── Handlers ───────────────────────────────────────────────────────────────

  function getDisplayPrice(product: Product): number {
    if (priceListOverrides[product.id] !== undefined) return priceListOverrides[product.id];
    if (selectedCustomer?.is_partner && product.partner_price) return product.partner_price;
    return product.price;
  }

  function addToCart(product: Product, isBulk = false) {
    const finalPrice = getDisplayPrice(product);

    setCartItems(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product_id === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, {
        product_id:   product.id,
        product_name: product.name,
        quantity:     1,
        price:        finalPrice,
        main_image:   product.main_image,
      }];
    });
    if (!isBulk) toast.success(`${product.name} adicionado por ${formatBRL(finalPrice)}`);
  }



  function toggleProductSelection(productId: string) {
    const product = allProducts.find(p => p.id === productId);
    if (product) addToCart(product);
  }

  function updateQty(productId: string, delta: number) {
    setCartItems(prev =>
      prev
        .map(i => i.product_id === productId ? { ...i, quantity: i.quantity + delta } : i)
        .filter(i => i.quantity > 0)
    );
  }

  // Preço editável — espelha NewOrder.tsx L299-305
  function updatePrice(productId: string, value: string) {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0) return;
    setCartItems(prev =>
      prev.map(i => i.product_id === productId ? { ...i, price: parsed } : i)
    );
  }

  function removeFromCart(productId: string) {
    setCartItems(prev => prev.filter(i => i.product_id !== productId));
  }

  async function handleSubmit() {
    if (!selectedCustomer) {
      toast.error('Selecione um cliente');
      return;
    }
    if (cartItems.length === 0) {
      toast.error('Adicione ao menos um produto');
      return;
    }
    if (!selectedUnitSlug) {
      toast.error('A Unidade do salão é obrigatória');
      return;
    }
    if (!selectedSellerId) {
      toast.error('Selecione um vendedor');
      return;
    }

    if (splitMode) {
      const allFilled = paymentSplits.every(s => parseFloat(s.amount) > 0);
      if (!allFilled) {
        toast.error('Preencha o valor de todas as formas de pagamento');
        return;
      }
      if (Math.abs(splitsDiff) > 0.01) {
        toast.error(`A soma dos pagamentos (${formatBRL(splitsTotal)}) não bate com o total (${formatBRL(total)})`);
        return;
      }
    }

    setIsSaving(true);

    try {
      const { data, error } = await supabase.rpc('create_salao_order', {
        p_user_id:          selectedCustomer.id,
        p_items:            cartItems.map(i => ({
          product_id:   i.product_id,
          product_name: i.product_name,
          quantity:     i.quantity,
          price:        i.price,
        })),
        p_notes:            notes || null,
        p_payment_method:   splitMode ? null : paymentMethod,
        p_order_date:       orderDate ? new Date(orderDate).toISOString() : null,
        p_seller_id:        selectedSellerId || null,
        p_pickup_unit_slug: selectedUnitSlug,
        p_payment_splits:   splitMode
          ? paymentSplits.map(s => ({ method: s.method, amount: parseFloat(s.amount) }))
          : null,
      });

      if (error) throw error;

      const orderId = data as string;
      setLastOrderId(orderId);
      toast.success('Pedido criado com sucesso!');

      // Reset form
      setSelectedCustomer(null);
      setCartItems([]);
      setNotes('');
      setPaymentMethod('PIX');
      setProductSearch('');
      setCustomerSearch('');
      setOrderDate('');
      setSelectedSellerId('');
      setSelectedUnitSlug('');
      setSplitMode(false);
      setPaymentSplits([{ method: 'PIX', amount: '' }, { method: 'Dinheiro', amount: '' }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar pedido';
      toast.error(`Erro: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    if (!newClientName || !newClientPhone) {
      toast.error('Nome e telefone são obrigatórios para novo cadastro');
      return;
    }
    const digitsOnly = newClientPhone.replace(/\D/g, '');
    if (digitsOnly.length < 10 || digitsOnly.length > 11) {
      toast.error('Telefone deve ter 10 ou 11 dígitos (DDD + número)');
      return;
    }
    
    // Simulate a reliable email if not provided since Supabase Auth requires one
    const timestamp = Date.now().toString(36);
    const safeEmail = newClientEmail.trim() || `${newClientPhone.replace(/\D/g, '')}.${timestamp}@cliente.reidoscachos.com.br`;
    const randomPassword = Math.random().toString(36).slice(-8) + 'A1!';

    setIsSaving(true);
    try {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError || !refreshData.session) {
        toast.error('Sessão expirada. Faça login novamente.');
        return;
      }
      const token = refreshData.session.access_token;

      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: safeEmail,
          password: randomPassword,
          role: 'user',
          full_name: newClientName,
          phone: newClientPhone
        },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (error) {
        const errorBody = typeof error === 'object' && error !== null && 'message' in error ? (error as Record<string, string>).message : String(error);
        throw new Error(errorBody || 'Erro na Edge Function');
      }
      if (data?.error) throw new Error(data.error);

      // Clientes criados pelo salão são sempre Comprador Atacado
      if (data.user?.id) {
        await supabase.from('profiles').update({ customer_segment: 'wholesale_buyer' }).eq('id', data.user.id);
      }

      toast.success('Cliente cadastrado com sucesso!');
      
      const newProfile: CustomerProfile = {
        id: data.user.id,
        full_name: newClientName,
        phone: newClientPhone,
        email: newClientEmail || safeEmail,
        is_partner: false
      };
      
      setSelectedCustomer(newProfile);
      setIsCreatingClient(false);
      
      // Reset express form
      setNewClientName('');
      setNewClientPhone('');
      setNewClientEmail('');
      setCustomerSearch('');

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error(`Falha ao criar cliente: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  // Data da venda: DateField (dia) + hora. O estado continua sendo a string
  // `YYYY-MM-DDTHH:mm` do antigo datetime-local; vazio = data atual.
  const orderDay = orderDate ? orderDate.slice(0, 10) : null;
  const orderTime = orderDate ? orderDate.slice(11, 16) : '';

  // ── Tela de sucesso ─────────────────────────────────────────────────────────

  if (lastOrderId) {
    return (
      <div className="min-h-screen bg-background">
        <SalaoHeader onLogout={handleLogout} />
        <main className="px-4 sm:px-6 py-12 sm:py-16 max-w-md mx-auto">
          <Panel className="text-center">
            <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
            <h1 className="text-[22px] leading-[1.15] text-foreground">Pedido criado</h1>
            <p className="mt-1 text-[13.5px] text-muted-foreground">Pedido registrado com sucesso.</p>
            <p className="mt-1 text-[12px] text-muted-foreground font-mono">#{lastOrderId.slice(0, 8)}</p>
            <Button size="lg" onClick={() => setLastOrderId(null)} className="w-full mt-6">
              <Plus /> Criar novo pedido
            </Button>
          </Panel>
        </main>
      </div>
    );
  }

  // ─── Render principal ──────────────────────────────────────────────────────

  const sectionTitle = 'text-[15px] font-semibold text-foreground tracking-tight';

  return (
    <div className="min-h-screen bg-background">
      <SalaoHeader onLogout={handleLogout} />

      <main className="px-4 sm:px-6 pt-6 sm:pt-7 max-w-5xl mx-auto">
        <div className="pb-5">
          <h1 className="text-[22px] sm:text-[26px] leading-[1.15] text-foreground">Novo pedido</h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">Lançamento de venda feita no salão</p>
        </div>

        <div className="space-y-4">

        {/* ── 1. Seleção de Cliente ────────────────────────────────────────── */}
        <Panel>
          <div className="space-y-3">
          <h2 className={sectionTitle}>1. Cliente</h2>

          {selectedCustomer ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-surface border border-border">
              <div className="flex items-center gap-3 min-w-0">
                <UserCheck className="w-5 h-5 text-success shrink-0" />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-foreground flex items-center flex-wrap gap-1.5">
                    {selectedCustomer.full_name || 'Sem nome'}
                    {selectedCustomer.is_partner && <Badge variant="brand">Parceiro</Badge>}
                    {selectedCustomer.price_list_id && (
                      <Badge variant="info"><Tag className="w-3 h-3" /> Tabela especial</Badge>
                    )}
                  </p>
                  <p className="text-[12.5px] text-muted-foreground">
                    {selectedCustomer.phone || 'Sem telefone'}
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }}
              >
                Trocar
              </Button>
            </div>
          ) : isCreatingClient ? (
            <form onSubmit={handleCreateClient} className="space-y-4 border border-border rounded-md p-4 bg-surface">
              <div className="flex items-center justify-between">
                 <h3 className="text-[14px] font-semibold text-foreground">Cadastro express</h3>
                 <Button type="button" variant="ghost" size="sm" onClick={() => setIsCreatingClient(false)}>Cancelar</Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                 <div>
                    <label htmlFor="np-client-name" className="field-label">Nome do cliente *</label>
                    <Input id="np-client-name" type="text" required value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="Nome completo" />
                 </div>
                 <div>
                    <label htmlFor="np-client-phone" className="field-label">WhatsApp *</label>
                     <Input
                       id="np-client-phone"
                       type="tel"
                       required
                       inputMode="numeric"
                       maxLength={11}
                       value={newClientPhone}
                       onChange={e => setNewClientPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                       placeholder="DDD + número (10 ou 11 dígitos)"
                     />
                 </div>
                 <div className="sm:col-span-2">
                    <label htmlFor="np-client-email" className="field-label">E-mail (opcional)</label>
                    <Input id="np-client-email" type="email" value={newClientEmail} onChange={e => setNewClientEmail(e.target.value)} placeholder="cliente@email.com" />
                 </div>
              </div>
              <Button disabled={isSaving} type="submit" size="lg" className="w-full">
                 {isSaving ? 'Salvando…' : 'Cadastrar e selecionar'}
              </Button>
            </form>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
                <Input
                  type="search"
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  placeholder="Buscar cliente por nome ou telefone…"
                  aria-label="Buscar cliente"
                  className="h-10 pl-9"
                />
              </div>

              {customerSearch.trim().length === 0 ? (
                <div className="py-2 text-center">
                  <p className="text-[12.5px] text-muted-foreground mb-3">Digite ao menos 2 caracteres para buscar</p>
                  <Button variant="secondary" size="sm" onClick={() => setIsCreatingClient(true)}>
                     <Plus /> Cadastrar cliente express
                  </Button>
                </div>
              ) : customerSearch.trim().length < 2 ? (
                <p className="text-[12.5px] text-muted-foreground py-3 text-center">
                  Digite ao menos 2 caracteres para buscar
                </p>
              ) : loadingCustomers || fetchingCustomers ? (
                <PageLoading label="Buscando clientes…" className="py-4" />
              ) : (
                <div className="divide-y divide-border border border-border rounded-md overflow-hidden max-h-52 overflow-y-auto">
                  {searchedCustomers.length === 0 && (
                    <div className="py-4 text-center">
                       <p className="text-[12.5px] text-muted-foreground mb-3">Nenhum cliente encontrado</p>
                       <Button variant="secondary" size="sm" onClick={() => setIsCreatingClient(true)}>
                         <Plus /> Cadastrar novo
                       </Button>
                    </div>
                  )}
                  {searchedCustomers.map(profile => (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => { setSelectedCustomer(profile); setCustomerSearch(''); }}
                      className="w-full text-left px-4 py-3 hover:bg-muted/60 transition-colors"
                    >
                      <p className="text-[13.5px] font-medium text-foreground flex items-center flex-wrap gap-1.5">
                        {profile.full_name || 'Sem nome'}
                        {profile.is_partner && <Badge variant="brand">Parceiro</Badge>}
                      </p>
                      <p className="text-[12.5px] text-muted-foreground">
                        {profile.phone || 'Sem telefone'}
                      </p>
                    </button>
                  ))}
                  {searchedCustomers.length > 0 && (
                     <div className="p-2 bg-surface text-center">
                        <Button variant="link" size="sm" onClick={() => setIsCreatingClient(true)}>
                           Ou cadastre um cliente novo
                        </Button>
                     </div>
                  )}
                </div>
              )}
            </div>
          )}
          </div>
        </Panel>


        {/* ── 3. Itens Individuais ────────────────────────────────────────── */}
        <Panel>
          <div className="space-y-3">
          <h2 className={sectionTitle}>2. Itens</h2>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
            <Input
              type="search"
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder="Buscar produto por nome…"
              aria-label="Buscar produto"
              className="h-10 pl-9"
            />
          </div>

          {/* Contagem de produtos + indicador de tabela de preço ativa */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] text-muted-foreground tabular-nums">
              {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''} encontrado{filteredProducts.length !== 1 ? 's' : ''}
            </p>
            {loadingPriceList && (
              <span className="flex items-center gap-1 text-[12px] text-info">
                <Loader className="w-3 h-3 animate-spin" /> Carregando preços…
              </span>
            )}
            {!loadingPriceList && Object.keys(priceListOverrides).length > 0 && (
              <span className="flex items-center gap-1 text-[12px] text-info font-medium">
                <Tag className="w-3 h-3" /> Tabela de preço aplicada
              </span>
            )}
          </div>

          {loadingProducts ? (
            <PageLoading label="Carregando produtos…" className="py-6" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[420px] overflow-y-auto pr-1">
              {filteredProducts.map(product => {
                const inCart        = cartItems.find(i => i.product_id === product.id);
                const displayPrice  = getDisplayPrice(product);
                const hasPriceOverride = displayPrice !== product.price;

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => toggleProductSelection(product.id)}
                    aria-pressed={!!inCart}
                    className={`flex items-center gap-3 p-2.5 rounded-md border text-left transition-colors ${
                      inCart
                        ? 'border-success-border bg-success-subtle'
                        : 'border-border hover:border-ink-300 hover:bg-muted/50'
                    }`}
                  >
                    <div className="relative w-10 h-10 rounded-md overflow-hidden shrink-0 bg-muted border border-border">
                      {product.main_image ? (
                        <img src={product.main_image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-ink-400 text-[12px] font-semibold">
                          {product.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground truncate">{product.name}</p>
                      {hasPriceOverride ? (
                        <div className="flex items-center gap-1.5 mt-0.5 tabular-nums">
                          <span className="text-[12px] line-through text-ink-400">{formatBRL(product.price)}</span>
                          <span className="text-[12px] font-semibold text-foreground">{formatBRL(displayPrice)}</span>
                        </div>
                      ) : (
                        <p className="text-[12px] text-muted-foreground tabular-nums">{formatBRL(displayPrice)}</p>
                      )}
                    </div>
                    {inCart && (
                      <span className="text-[12px] font-semibold text-success tabular-nums shrink-0">
                        {inCart.quantity}x
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          </div>
        </Panel>

        {/* ── 4. Resumo do Pedido (Carrinho) — espelha NewOrder.tsx L638-810 ──── */}
        {cartItems.length > 0 && (
          <Panel>
            <div className="space-y-3">
            <h2 className={sectionTitle}>3. Resumo do pedido</h2>

            <div className="divide-y divide-border">
              {cartItems.map(item => (
                <div key={item.product_id} className="py-3 flex flex-wrap sm:flex-nowrap items-center gap-3">
                  {/* Thumb */}
                  <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 bg-muted border border-border">
                    {item.main_image ? (
                      <img src={item.main_image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[12px] font-semibold text-ink-400">
                        {item.product_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Nome + preço editável — espelha NewOrder.tsx L662-678 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-medium text-foreground truncate">{item.product_name}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[12px] text-muted-foreground">R$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        aria-label={`Preço de ${item.product_name}`}
                        value={item.price}
                        onChange={e => updatePrice(item.product_id, e.target.value)}
                        className="w-24 h-8 text-[13px] tabular-nums border border-input rounded-md px-2 bg-card text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                  </div>

                  {/* Controle de qty */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="secondary" size="icon" onClick={() => updateQty(item.product_id, -1)} aria-label="Diminuir quantidade">
                      <Minus />
                    </Button>
                    <span className="w-8 text-center text-[14px] font-semibold tabular-nums">{item.quantity}</span>
                    <Button variant="secondary" size="icon" onClick={() => updateQty(item.product_id, 1)} aria-label="Aumentar quantidade">
                      <Plus />
                    </Button>
                  </div>

                  {/* Subtotal do item */}
                  <p className="w-24 ml-auto text-right text-[13.5px] font-semibold text-foreground tabular-nums shrink-0">
                    {formatBRL((item.quantity * item.price))}
                  </p>

                  {/* Remover */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFromCart(item.product_id)}
                    className="hover:text-danger hover:bg-danger-subtle"
                    aria-label={`Remover ${item.product_name}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>

            {/* Totais — espelha NewOrder.tsx L750-772 (sem desconto/cupom nesta fase) */}
            <div className="pt-3 border-t border-border space-y-1.5 tabular-nums">
              <div className="flex justify-between items-center text-[13px] text-muted-foreground">
                <span>Subtotal ({cartItems.reduce((sum, i) => sum + i.quantity, 0)} itens)</span>
                <span>{formatBRL(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center pt-1.5 border-t border-border">
                <span className="text-[14px] font-semibold text-foreground">Total</span>
                <span className="font-title text-[22px] font-semibold text-foreground">{formatBRL(total)}</span>
              </div>
            </div>
            </div>
          </Panel>
        )}

        {/* ── 5. Detalhes do Pedido ────────────────────────────────────────── */}
        <Panel>
          <div className="space-y-4">
          <h2 className={sectionTitle}>{cartItems.length > 0 ? '4' : '3'}. Detalhes do pedido</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Status */}
            <div>
              <p className="field-label">Status do pagamento</p>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted">
                <span className="text-[13px] font-medium text-muted-foreground">Recebido</span>
                <Badge variant="neutral" className="ml-auto">Fixo</Badge>
              </div>
            </div>

            {/* Origem */}
            <div>
              <p className="field-label">Origem do pedido</p>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted">
                <span className="text-[13px] font-medium text-muted-foreground">Salão</span>
                <Badge variant="neutral" className="ml-auto">Fixo</Badge>
              </div>
            </div>

            {/* Vendedor */}
            <div>
              <p className="field-label">Vendedor</p>
              <StyledSelect
                value={selectedSellerId}
                onChange={setSelectedSellerId}
                disabled={loadingSellers}
                icon={<UserCheck className="w-3.5 h-3.5 text-ink-400 shrink-0" />}
                options={sellers.map((s) => ({ value: s.id, label: `${s.name}${s.code ? ` (${s.code})` : ''}` }))}
                placeholder="Selecione um vendedor…"
              />
            </div>

            {/* Unidade */}
            <div>
              <p className="field-label">Unidade do salão *</p>
              <StyledSelect
                value={selectedUnitSlug}
                onChange={setSelectedUnitSlug}
                icon={<MapPin className="w-3.5 h-3.5 text-ink-400 shrink-0" />}
                options={[
                  { value: 'linhares', label: 'Linhares' },
                  { value: 'teixeira', label: 'Teixeira de Freitas' },
                  { value: 'serra', label: 'Serra' },
                  { value: 'colatina', label: 'Colatina' },
                  { value: 'sao-gabriel', label: 'São Gabriel da Palha' },
                ]}
                placeholder="Selecione a unidade…"
                searchable={false}
              />
            </div>

            {/* Data */}
            <div>
              <p className="field-label">Data da venda</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <DateField
                    value={orderDay}
                    onChange={(day) => setOrderDate(day ? `${day}T${orderTime || '12:00'}` : '')}
                    placeholder="Hoje"
                    className="w-full h-9 flex items-center gap-2 px-3 rounded-md border border-input bg-background text-foreground text-sm hover:border-ink-300 transition-colors"
                  />
                </div>
                <Input
                  type="time"
                  aria-label="Hora da venda"
                  value={orderTime}
                  disabled={!orderDay}
                  onChange={(e) => { if (orderDay) setOrderDate(`${orderDay}T${e.target.value || '12:00'}`) }}
                  className="w-28 tabular-nums"
                />
              </div>
              <p className="text-[12px] text-muted-foreground mt-1">Deixe em branco para usar a data atual</p>
            </div>

            {/* Pagamento */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <p className="field-label !mb-0">Método de pagamento</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-pressed={splitMode}
                  onClick={() => {
                    setSplitMode(v => !v);
                    if (splitMode) setPaymentSplits([{ method: 'PIX', amount: '' }, { method: 'Dinheiro', amount: '' }]);
                  }}
                >
                  {splitMode ? 'Pagamento único' : 'Dividir pagamento'}
                </Button>
              </div>

              {!splitMode ? (
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_METHODS.map(pm => (
                    <button
                      key={pm.value}
                      type="button"
                      aria-pressed={paymentMethod === pm.value}
                      onClick={() => setPaymentMethod(pm.value)}
                      className={`h-10 px-4 rounded-md border text-[13px] font-medium transition-colors ${
                        paymentMethod === pm.value
                          ? 'bg-brand-subtle border-brand-border text-brand-strong'
                          : 'border-border bg-card text-ink-600 hover:border-ink-300 hover:text-foreground'
                      }`}
                    >
                      {pm.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {paymentSplits.map((split, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <StyledSelect
                          value={split.method}
                          onChange={(v) => setPaymentSplits(prev => prev.map((s, i) => i === idx ? { ...s, method: v } : s))}
                          options={PAYMENT_METHODS}
                          searchable={false}
                        />
                      </div>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground font-medium pointer-events-none">R$</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0,00"
                          aria-label="Valor"
                          value={split.amount}
                          onChange={e => setPaymentSplits(prev => prev.map((s, i) => i === idx ? { ...s, amount: e.target.value } : s))}
                          className="w-28 pl-8 tabular-nums"
                        />
                      </div>
                      {paymentSplits.length > 2 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setPaymentSplits(prev => prev.filter((_, i) => i !== idx))}
                          className="hover:text-danger hover:bg-danger-subtle"
                          aria-label="Remover forma de pagamento"
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPaymentSplits(prev => [...prev, { method: 'PIX', amount: '' }])}
                  >
                    <Plus /> Adicionar forma
                  </Button>

                  <div className={`flex items-center justify-between text-[12.5px] font-medium px-3 py-2 rounded-md border tabular-nums ${
                    Math.abs(splitsDiff) < 0.01
                      ? 'border-success-border bg-success-subtle text-success'
                      : 'border-warning-border bg-warning-subtle text-warning'
                  }`}>
                    <span>Total a distribuir: {formatBRL(total)}</span>
                    <span>
                      {Math.abs(splitsDiff) < 0.01
                        ? '✓ Conferido'
                        : splitsDiff > 0
                          ? `Faltam ${formatBRL(splitsDiff)}`
                          : `Excesso ${formatBRL(Math.abs(splitsDiff))}`}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Observações */}
            <div className="sm:col-span-2">
              <label htmlFor="np-notes" className="field-label">Observações (opcional)</label>
              <Textarea
                id="np-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Ex: cliente pediu embalagem especial, entregar no endereço comercial…"
                className="resize-none"
              />
            </div>
          </div>
          </div>
        </Panel>

        {/* ── Ação (sticky no rodapé) ─────────────────────────────────────── */}
        <div className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background/95 backdrop-blur-sm border-t border-border">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={isSaving || !selectedCustomer || cartItems.length === 0}
            className="w-full h-12"
          >
            {isSaving ? (
              <><Loader className="animate-spin" /> Criando pedido…</>
            ) : (
              <span className="tabular-nums">Criar pedido · {formatBRL(total)}</span>
            )}
          </Button>
        </div>

        </div>
      </main>
    </div>
  );
}

// ─── Header do Salão ──────────────────────────────────────────────────────────

const HEADER_ACTION =
  'h-10 min-w-[2.5rem] px-2.5 inline-flex items-center justify-center gap-1.5 rounded-md text-[13px] font-medium text-ink-500 hover:bg-muted hover:text-foreground transition-colors';

function SalaoHeader({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="h-14 px-4 sm:px-6 max-w-5xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={logo} alt="Rei dos Cachos" className="h-8 w-auto shrink-0" />
          <span className="w-px h-5 bg-border shrink-0" aria-hidden />
          <div className="min-w-0 leading-tight">
            <p className="text-[13px] font-semibold text-foreground tracking-tight">Novo pedido</p>
            <p className="text-[12px] text-muted-foreground truncate">Área do salão</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Link to="/salao" className={HEADER_ACTION} title="Trocar de módulo" aria-label="Trocar de módulo">
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline">Módulos</span>
          </Link>
          <ThemeToggle className={HEADER_ACTION} />
          <button type="button" onClick={onLogout} className={HEADER_ACTION} title="Sair" aria-label="Sair">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>
    </header>
  );
}

// Tema claro/escuro compartilhado (chave `rdc-admin-theme`) via
// AdminThemeProvider — substitui o efeito de tema duplicado desta página.
export default function SalaoNovoPedido() {
  return (
    <AdminThemeProvider>
      <SalaoNovoPedidoInner />
    </AdminThemeProvider>
  );
}
