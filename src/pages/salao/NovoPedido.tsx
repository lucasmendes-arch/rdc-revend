import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader, Search, Plus, Minus, Trash2, ShoppingCart, UserCheck, LogOut, Clock, MapPin, Tag, Truck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

import logo from '@/assets/logo-rei-dos-cachos.png';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  is_partner?: boolean;
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
  { value: 'Dinheiro',          label: 'Dinheiro' },
];

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

export default function SalaoNovoPedido() {
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

  // ── Client Express States
  const [isCreatingClient, setIsCreatingClient]   = useState(false);
  const [newClientName, setNewClientName]         = useState('');
  const [newClientPhone, setNewClientPhone]       = useState('');
  const [newClientEmail, setNewClientEmail]       = useState('');
  const [newClientPartner, setNewClientPartner]   = useState(false);

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

  // ── Handlers ───────────────────────────────────────────────────────────────

  function addToCart(product: Product, isBulk = false) {
    const finalPrice = selectedCustomer?.is_partner && product.partner_price ? product.partner_price : product.price;

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
    if (!isBulk) toast.success(`${product.name} adicionado por R$ ${finalPrice.toFixed(2)}`);
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

    setIsSaving(true);

    try {
      const { data, error } = await supabase.rpc('create_salao_order', {
        p_user_id: selectedCustomer.id,
        p_items: cartItems.map(i => ({
          product_id:   i.product_id,
          product_name: i.product_name,
          quantity:     i.quantity,
          price:        i.price,
        })),
        p_notes: notes || null,
        p_payment_method: paymentMethod,
        p_order_date: orderDate ? new Date(orderDate).toISOString() : null,
        p_seller_id: selectedSellerId || null,
        p_pickup_unit_slug: selectedUnitSlug,
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
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: safeEmail,
          password: randomPassword,
          role: 'user',
          full_name: newClientName,
          phone: newClientPhone
        }
      });

      if (error) {
        const errorBody = typeof error === 'object' && error !== null && 'message' in error ? (error as Record<string, string>).message : String(error);
        throw new Error(errorBody || 'Erro na Edge Function');
      }
      if (data?.error) throw new Error(data.error);

      // Update is_partner flag
      if (newClientPartner && data.user?.id) {
        await supabase.from('profiles').update({ is_partner: true }).eq('id', data.user.id);
      }

      toast.success('Cliente cadastrado com sucesso!');
      
      const newProfile: CustomerProfile = {
        id: data.user.id,
        full_name: newClientName,
        phone: newClientPhone,
        email: newClientEmail || safeEmail,
        is_partner: newClientPartner
      };
      
      setSelectedCustomer(newProfile);
      setIsCreatingClient(false);
      
      // Reset express form
      setNewClientName('');
      setNewClientPhone('');
      setNewClientEmail('');
      setNewClientPartner(false);
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

  // ── Tela de sucesso ─────────────────────────────────────────────────────────

  if (lastOrderId) {
    return (
      <div className="min-h-screen bg-surface-alt">
        <SalaoHeader onLogout={handleLogout} />
        <div className="flex items-center justify-center px-4 py-16">
          <div className="bg-white rounded-2xl border border-border shadow-card p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <ShoppingCart className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Pedido Criado!</h2>
            <p className="text-muted-foreground text-sm mb-1">
              Pedido registrado com sucesso.
            </p>
            <p className="text-xs text-muted-foreground mb-6 font-mono">
              #{lastOrderId.slice(0, 8)}
            </p>
            <button
              onClick={() => setLastOrderId(null)}
              className="w-full py-3 rounded-xl font-semibold btn-gold text-white"
            >
              Criar Novo Pedido
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render principal ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface-alt">
      <SalaoHeader onLogout={handleLogout} />

      <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-6">

        {/* ── 1. Seleção de Cliente ────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-border shadow-card p-5 space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            1. Cliente
          </h2>

          {selectedCustomer ? (
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border">
              <div className="flex items-center gap-3">
                <UserCheck className="w-5 h-5 text-green-600 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">
                    {selectedCustomer.full_name || 'Sem nome'}
                    {selectedCustomer.is_partner && (
                       <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold uppercase">Parceiro</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedCustomer.phone || 'Sem telefone'}
                    {selectedCustomer.email ? ` · ${selectedCustomer.email}` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Trocar
              </button>
            </div>
          ) : isCreatingClient ? (
            <form onSubmit={handleCreateClient} className="space-y-4 pt-2 border border-border rounded-xl p-4 bg-surface-alt">
              <div className="flex items-center justify-between mb-2">
                 <h3 className="text-sm font-semibold text-foreground">Novo Cadastro Express</h3>
                 <button type="button" onClick={() => setIsCreatingClient(false)} className="text-xs text-muted-foreground underline">Cancelar</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                 <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase">Nome do Cliente *</label>
                    <input type="text" required value={newClientName} onChange={e => setNewClientName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none" placeholder="Nome Completo" />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase">WhatsApp *</label>
                     <input type="tel" required maxLength={15} value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none" placeholder="(27) 99900-0000" />
                 </div>
                 <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase">E-mail (opcional)</label>
                    <input type="email" value={newClientEmail} onChange={e => setNewClientEmail(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none" placeholder="cliente@email.com" />
                 </div>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-border mt-3">
                 <input type="checkbox" id="client_partner" checked={newClientPartner} onChange={e => setNewClientPartner(e.target.checked)} className="rounded border-input text-amber-400 focus:ring-amber-400" />
                 <label htmlFor="client_partner" className="text-xs text-foreground cursor-pointer font-medium">Conta Perfil Parceiro/Atacado</label>
              </div>
              <button disabled={isSaving} type="submit" className="w-full py-2.5 rounded-lg font-semibold btn-gold text-white text-sm mt-4">
                 {isSaving ? 'Salvando...' : 'Cadastrar e Selecionar'}
              </button>
            </form>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  placeholder="Buscar cliente por nome ou telefone…"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
                />
              </div>

              {customerSearch.trim().length === 0 ? (
                <div className="py-2 text-center">
                  <p className="text-xs text-muted-foreground mb-3">Digite ao menos 2 caracteres para buscar</p>
                  <button onClick={() => setIsCreatingClient(true)} className="text-xs flex items-center gap-1 mx-auto text-amber-600 font-medium bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 hover:bg-amber-100 transition-colors">
                     <Plus className="w-3 h-3" /> Cadastrar Cliente Express
                  </button>
                </div>
              ) : customerSearch.trim().length < 2 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">
                  Digite ao menos 2 caracteres para buscar
                </p>
              ) : loadingCustomers || fetchingCustomers ? (
                <div className="flex items-center justify-center gap-2 py-3">
                  <Loader className="w-4 h-4 animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Buscando clientes…</p>
                </div>
              ) : (
                <div className="divide-y divide-border border border-border rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  {searchedCustomers.length === 0 && (
                    <div className="py-4 text-center">
                       <p className="text-xs text-muted-foreground mb-3">Nenhum cliente encontrado</p>
                       <button onClick={() => setIsCreatingClient(true)} className="text-xs flex items-center gap-1 mx-auto text-amber-600 font-medium bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 hover:bg-amber-100 transition-colors">
                         <Plus className="w-3 h-3" /> Cadastrar Novo
                       </button>
                    </div>
                  )}
                  {searchedCustomers.map(profile => (
                    <button
                      key={profile.id}
                      onClick={() => { setSelectedCustomer(profile); setCustomerSearch(''); }}
                      className="w-full text-left px-4 py-3 hover:bg-surface-alt transition-colors"
                    >
                      <p className="text-sm font-medium text-foreground">
                        {profile.full_name || 'Sem nome'}
                        {profile.is_partner && (
                           <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold uppercase">Parceiro</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {profile.phone || 'Sem telefone'}
                        {profile.email ? ` · ${profile.email}` : ''}
                      </p>
                    </button>
                  ))}
                  {searchedCustomers.length > 0 && (
                     <div className="p-2 bg-surface-alt text-center">
                        <button onClick={() => setIsCreatingClient(true)} className="text-xs text-amber-600 font-medium hover:underline">
                           + Ou cadastre um cliente novo
                        </button>
                     </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>


        {/* ── 3. Itens Individuais ────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-border shadow-card p-5 space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            3. Itens Individuais
          </h2>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder="Buscar produto por nome…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
            />
          </div>

          {/* Contagem de produtos */}
          <p className="text-[10px] text-muted-foreground font-medium">
            {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''} encontrado{filteredProducts.length !== 1 ? 's' : ''}
          </p>

          {loadingProducts ? (
            <p className="text-xs text-muted-foreground py-2 text-center">Carregando produtos…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[420px] overflow-y-auto scrollbar-thin pr-1">
              {filteredProducts.map(product => {
                const inCart = cartItems.find(i => i.product_id === product.id);

                return (
                  <div
                    key={product.id}
                    onClick={() => toggleProductSelection(product.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      inCart
                        ? 'border-green-200 bg-green-50'
                        : 'border-border hover:border-amber-300 hover:bg-surface-alt'
                    }`}
                  >
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-surface-alt border border-border">
                      {product.main_image ? (
                        <img src={product.main_image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px] font-bold">
                          {product.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-foreground truncate">{product.name}</p>
                      {selectedCustomer?.is_partner && product.partner_price ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] line-through text-muted-foreground/50">R$ {product.price.toFixed(2)}</span>
                          <span className="text-[10px] font-bold text-amber-600">R$ {product.partner_price.toFixed(2)}</span>
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">R$ {product.price.toFixed(2)}</p>
                      )}
                    </div>
                    {inCart && (
                      <span className="text-[10px] font-bold text-green-600 shrink-0">
                        {inCart.quantity}x
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── 4. Resumo do Pedido (Carrinho) — espelha NewOrder.tsx L638-810 ──── */}
        {cartItems.length > 0 && (
          <section className="bg-white rounded-2xl border border-border shadow-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                4. Resumo do Pedido
              </h2>
            </div>

            <div className="divide-y divide-border">
              {cartItems.map(item => (
                <div key={item.product_id} className="py-3 flex items-center gap-3">
                  {/* Thumb */}
                  <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-surface-alt border border-border">
                    {item.main_image ? (
                      <img src={item.main_image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                        {item.product_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Nome + preço editável — espelha NewOrder.tsx L662-678 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.product_name}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-muted-foreground">R$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.price}
                        onChange={e => updatePrice(item.product_id, e.target.value)}
                        className="w-20 text-xs border border-input rounded-lg px-2 py-1 focus:ring-2 focus:ring-amber-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Controle de qty */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => updateQty(item.product_id, -1)}
                      className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-surface-alt transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-7 text-center text-sm font-semibold">{item.quantity}</span>
                    <button
                      onClick={() => updateQty(item.product_id, 1)}
                      className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-surface-alt transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Subtotal do item */}
                  <p className="w-20 text-right text-sm font-semibold text-foreground shrink-0">
                    R$ {(item.quantity * item.price).toFixed(2)}
                  </p>

                  {/* Remover */}
                  <button
                    onClick={() => removeFromCart(item.product_id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Totais — espelha NewOrder.tsx L750-772 (sem desconto/cupom nesta fase) */}
            <div className="pt-3 border-t border-border space-y-1.5">
              <div className="flex justify-between items-center text-sm text-muted-foreground">
                <span>Subtotal ({cartItems.reduce((sum, i) => sum + i.quantity, 0)} itens)</span>
                <span>R$ {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-border">
                <span className="font-semibold text-foreground">Total</span>
                <span className="text-xl font-black text-foreground">R$ {total.toFixed(2)}</span>
              </div>
            </div>
          </section>
        )}

        {/* ── 5. Detalhes do Pedido ────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-border shadow-card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              5. Detalhes do Pedido
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Status do Pagamento</label>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-surface-alt">
                <Tag className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-sm font-medium text-muted-foreground">Recebido</span>
                <span className="ml-auto text-[10px] text-muted-foreground bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">fixo</span>
              </div>
            </div>

            {/* Origem */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Origem do Pedido</label>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-surface-alt">
                <Tag className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-sm font-medium text-muted-foreground">Salão</span>
                <span className="ml-auto text-[10px] text-muted-foreground bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">fixo</span>
              </div>
            </div>

            {/* Vendedor */}
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                Vendedor
              </label>
              <select
                value={selectedSellerId}
                onChange={e => setSelectedSellerId(e.target.value)}
                disabled={loadingSellers}
                className="w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none bg-white font-medium"
              >
                <option value="" disabled>Selecione um vendedor...</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} {s.code ? `(${s.code})` : ''}</option>
                ))}
              </select>
            </div>

            {/* Unidade */}
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-amber-600" />
                Unidade do Salão *
              </label>
              <select
                value={selectedUnitSlug}
                onChange={e => setSelectedUnitSlug(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none bg-white font-medium"
              >
                <option value="" disabled>Selecione a unidade...</option>
                <option value="linhares">Linhares</option>
                <option value="teixeira">Teixeira de Freitas</option>
                <option value="serra">Serra</option>
                <option value="colatina">Colatina</option>
                <option value="sao-gabriel">São Gabriel da Palha</option>
              </select>
            </div>

            {/* Data */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Data da Venda</label>
              <div
                className="relative cursor-pointer"
                onClick={() => {
                  const input = document.getElementById('orderDateInput') as HTMLInputElement;
                  if (input && typeof input.showPicker === 'function') {
                    input.showPicker();
                  }
                }}
              >
                <input
                  id="orderDateInput"
                  type="datetime-local"
                  value={orderDate}
                  onChange={e => setOrderDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none bg-white cursor-pointer"
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Deixe em branco para usar a data atual</p>
            </div>

            {/* Pagamento */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Método de Pagamento</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {PAYMENT_METHODS.map(pm => (
                  <button
                    key={pm.value}
                    onClick={() => setPaymentMethod(pm.value)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors border ${
                      paymentMethod === pm.value
                        ? 'border-amber-400 bg-amber-50 text-amber-900'
                        : 'border-border bg-white text-muted-foreground hover:bg-surface-alt'
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Observações */}
            <div className="sm:col-span-2 mt-2">
              <label className="block text-xs font-semibold text-foreground mb-1.5">Observações (opcional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Ex: cliente pediu embalagem especial, entregar no endereço comercial…"
                className="w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none resize-none"
              />
            </div>
          </div>
        </section>

        {/* ── Ação ─────────────────────────────────────────────────────────── */}
        <div className="pb-8">
          <button
            onClick={handleSubmit}
            disabled={isSaving || !selectedCustomer || cartItems.length === 0}
            className="w-full px-6 py-3.5 rounded-xl btn-gold text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <><Loader className="w-4 h-4 animate-spin" /> Criando pedido…</>
            ) : (
              <>Criar Pedido · R$ {total.toFixed(2)}</>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Header do Salão ──────────────────────────────────────────────────────────

function SalaoHeader({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="bg-gold border-b border-amber-600 px-4 sm:px-6 h-14 flex items-center sticky top-0 z-40">
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="Rei dos Cachos" className="h-8 w-auto brightness-0 invert" />
          <div className="flex flex-col">
            <span className="text-white font-bold text-sm leading-tight">Novo Pedido</span>
            <span className="text-white/70 text-[10px] leading-tight">Área do Salão</span>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white flex items-center gap-1.5 text-sm"
          title="Sair"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  );
}
