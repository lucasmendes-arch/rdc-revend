import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader, Search, Plus, Minus, Trash2, ArrowLeft, ShoppingCart, UserCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import AdminLayout from '@/components/admin/AdminLayout';
import { PACKAGES, selectProductsForPackage } from '@/config/packages';
import type { PublicProduct } from '@/hooks/useCatalogProducts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  business_type: string | null;
  email?: string;
  is_partner?: boolean;
}

interface Product {
  id: string;
  name: string;
  price: number;
  partner_price: number | null;
  main_image: string | null;
  category_id: string | null;
}

interface Category {
  id: string;
  name: string;
}

interface KitComponent {
  quantity: number;
  catalog_products: {
    id: string;
    name: string;
    price: number;
    main_image: string | null;
  };
}

interface CartItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  main_image: string | null;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'recebido',             label: 'Recebido' },
  { value: 'aguardando_pagamento', label: 'Aguardando Pagamento' },
  { value: 'pago',                 label: 'Pago' },
];

const ORIGIN_OPTIONS = [
  { value: 'whatsapp',    label: 'WhatsApp' },
  { value: 'loja_fisica', label: 'Loja Física' },
  { value: 'site',        label: 'Site' },
  { value: 'outro',       label: 'Outro' },
];

const PAYMENT_METHODS = [
  { value: 'PIX',               label: 'PIX' },
  { value: 'Cartão de Crédito', label: 'Cartão de Crédito' },
  { value: 'Boleto',            label: 'Boleto' },
  { value: 'Dinheiro',          label: 'Dinheiro' },
];

// ─── Componente ───────────────────────────────────────────────────────────────

const NewOrder = () => {
  const navigate = useNavigate();

  // ── Estado ──────────────────────────────────────────────────────────────────
  const [customerSearch, setCustomerSearch]       = useState('');
  const [selectedCustomer, setSelectedCustomer]   = useState<CustomerProfile | null>(null);
  const [productSearch, setProductSearch]         = useState('');
  const [cartItems, setCartItems]                 = useState<CartItem[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [status, setStatus]                       = useState('recebido');
  const [origin, setOrigin]                       = useState('whatsapp');
  const [paymentMethod, setPaymentMethod]         = useState('PIX');
  const [notes, setNotes]                         = useState('');
  const [discountType, setDiscountType]           = useState<'fixed' | 'percent'>('fixed');
  const [discountValue, setDiscountValue]         = useState('');
  const [isSaving, setIsSaving]                   = useState(false);
  const [isExploding, setIsExploding]             = useState(false);
  // Get time taking timezone into account
  const nowStr = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [createdAt, setCreatedAt]                 = useState(nowStr);
  
  const [deliveryMethod, setDeliveryMethod]       = useState<'shipping' | 'pickup'>('shipping');
  const [pickupUnitSlug, setPickupUnitSlug]       = useState<string | null>(null);
  const [selectedSellerId, setSelectedSellerId]   = useState<string>('');

  // -- Modal Criar Cliente --
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [newClientName, setNewClientName]       = useState('');
  const [newClientPhone, setNewClientPhone]     = useState('');
  const [isCreating, setIsCreating]             = useState(false);

  // -- Coupon States --
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{id: string, code: string, discount_amount: number, discount_type?: 'fixed' | 'percent' | 'free_shipping'} | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: sellers = [] } = useQuery<{ id: string; name: string; code: string | null; is_default: boolean }[]>({
    queryKey: ['admin-sellers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sellers')
        .select('id, name, code, is_default')
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60 * 1000,
  });

  const { data: allProfiles = [], isLoading: loadingProfiles, refetch: refetchProfiles } = useQuery<CustomerProfile[]>({
    queryKey: ['all-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_all_profiles');
      if (error) throw error;
      return (data || []) as CustomerProfile[];
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: allProducts = [], isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ['catalog-products-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_products')
        .select('id, name, price, partner_price, main_image, category_id')
        .eq('is_active', true)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Product[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['product-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('id, name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60 * 60 * 1000,
  });

  const kitCategoryIds = useMemo(() => 
    categories
      .filter(c => c.name.toLowerCase().includes('kit') || c.name.toLowerCase().includes('pacote'))
      .map(c => c.id),
    [categories]
  );

  const packageSelections = useMemo(() => {
    // Convert Product[] to PublicProduct[] for compatibility
    const publicProducts: PublicProduct[] = allProducts.map(p => ({
      ...p,
      compare_at_price: null,
      is_professional: false,
      is_highlight: false,
      category_type: 'alto_giro',
      description_html: null,
      is_active: true,
      category: null
    }));
    
    return PACKAGES.map(pkg => ({
      pkg,
      selected: selectProductsForPackage(pkg, publicProducts),
    }));
  }, [allProducts]);

  // ── Filtros locais ───────────────────────────────────────────────────────────

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.toLowerCase().trim();
    if (!q) return allProfiles.slice(0, 10);
    return allProfiles
      .filter(p =>
        p.full_name?.toLowerCase().includes(q) ||
        p.phone?.includes(q) ||
        p.id.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [allProfiles, customerSearch]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    if (!q) return allProducts.slice(0, 12);
    return allProducts
      .filter(p => p.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [allProducts, productSearch]);

  // ── Total calculado ──────────────────────────────────────────────────────────

  const subtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity * item.price, 0),
    [cartItems]
  );

  const discountAmount = useMemo(() => {
    const v = parseFloat(discountValue) || 0;
    if (v <= 0) return 0;
    if (discountType === 'percent') return Math.min((subtotal * v) / 100, subtotal);
    return Math.min(v, subtotal);
  }, [discountValue, discountType, subtotal]);

  const total = useMemo(() => {
    const baseTotal = Math.max(subtotal - discountAmount, 0);
    const couponDisc = appliedCoupon?.discount_amount || 0;
    // Note: Manual orders don't have a separate shipping field in this UI, 
    // but the total should still reflect the coupon discount.
    return Math.max(baseTotal - couponDisc, 0);
  }, [subtotal, discountAmount, appliedCoupon]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function addToCartOrExplode(product: Product, isBulk = false) {
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
    if (!isBulk) toast.success(`${product.name} adicionado`);
  }

  const handleSelectPackage = (pkgId: number) => {
    const entry = packageSelections.find(e => e.pkg.id === pkgId);
    if (!entry || entry.selected.length === 0) {
      toast.error('Nenhum produto disponível para este pacote');
      return;
    }

    const loadingToast = toast.loading(`Adicionando pacote ${entry.pkg.name}...`);
    let addedCount = 0;

    try {
      setCartItems(prev => {
        let currentCart = [...prev];
        for (const item of entry.selected) {
          if (item.product.id === 'not_found' ) continue;
          
          const finalPPrice = selectedCustomer?.is_partner && item.product.partner_price ? item.product.partner_price : item.product.price;

          const existing = currentCart.find(i => i.product_id === item.product.id);
          if (existing) {
            currentCart = currentCart.map(i => i.product_id === item.product.id 
              ? { ...i, quantity: i.quantity + item.qty } 
              : i
            );
          } else {
            currentCart.push({
              product_id: item.product.id,
              product_name: item.product.name,
              quantity: item.qty,
              price: finalPPrice, // dynamic
              main_image: item.product.main_image
            });
          }
          addedCount += item.qty;
        }
        return currentCart;
      });

      const totalAdded = entry.selected.reduce((sum, item) => sum + item.qty, 0);
      toast.success(`${totalAdded} produtos do pacote ${entry.pkg.name} adicionados!`, { id: loadingToast });
    } catch (err) {
      console.error("Error adding package:", err);
      toast.error("Erro ao adicionar pacote", { id: loadingToast });
    }
  };

  const handleCreateClient = async () => {
    if (!newClientName.trim() || !newClientPhone.trim()) {
      toast.error('Preencha nome e telefone (obrigatórios)');
      return;
    }
    
    // Simplest phone format allowed by default edge function payload validation
    const cleanPhone = newClientPhone.replace(/\D/g, ''); 
    if (cleanPhone.length < 10) {
      toast.error('Telefone inválido. Digite o DDD + número.');
      return;
    }

    setIsCreating(true);
    try {
      const mockEmail = `cliente.${Date.now()}.${cleanPhone.slice(-4)}@sememail.local`;
      const randomPassword = Math.random().toString(36).slice(-8) + 'A1!';

      // Make API call to our create-user Edge Function
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: mockEmail,
          password: randomPassword,
          role: 'user',
          full_name: newClientName,
          phone: newClientPhone,
        }
      });

      if (error) {
        console.error("Error creating user from Edge Function:", error);
        throw error;
      }
      
      const newUserId = data.user.id;
      
      // Wait a moment for trigger to create the profile
      await new Promise(r => setTimeout(r, 1000));
      
      // Get the newly created profile
      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', newUserId)
        .single();
        
      if (profileError && profileError.code !== 'PGRST116') {
         console.warn("Could not fetch new profile immediately, trying again later...");
      }

      const clientToSelect: CustomerProfile = newProfile || {
        id: newUserId,
        full_name: newClientName,
        phone: newClientPhone,
        business_type: null,
      };

      toast.success('Cliente cadastrado e selecionado!');
      
      // Setup the state to use this client immediately
      setSelectedCustomer(clientToSelect);
      setIsCreatingClient(false);
      setNewClientName('');
      setNewClientPhone('');
      setCustomerSearch('');
      
      // Invalidate the cache right away so it appears on next load
      refetchProfiles();
      
    } catch (err) {
      console.error('Error creating client:', err);
      toast.error('Erro ao cadastrar cliente. Verifique se o telefone ou e-mail já estão em uso.');
    } finally {
      setIsCreating(true); // Small hack: force loader visibility
      setTimeout(() => setIsCreating(false), 500); 
    }
  };

  function updateQty(productId: string, delta: number) {
    setCartItems(prev =>
      prev
        .map(i => i.product_id === productId ? { ...i, quantity: i.quantity + delta } : i)
        .filter(i => i.quantity > 0)
    );
  }

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

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setIsValidatingCoupon(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('validate_coupon', {
        p_code: couponCode.toUpperCase().trim(),
        p_cart_total: subtotal - discountAmount
      });

      if (rpcError) throw rpcError;
      
      const res = data as { valid: boolean; id?: string; type?: 'fixed' | 'percent' | 'free_shipping'; value?: number; error?: string };

      if (!res.valid) {
        throw new Error(res.error || 'Cupom inválido ou expirado');
      }

      setAppliedCoupon({
        id: res.id!,
        code: couponCode.toUpperCase().trim(),
        discount_amount: res.value ?? 0,
        discount_type: res.type
      });
      toast.success('Cupom aplicado!');
    } catch (err: unknown) {
      setAppliedCoupon(null);
      const message = err instanceof Error ? err.message : 'Erro ao validar cupom';
      toast.error(message);
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  function toggleProductSelection(productId: string) {
    const product = allProducts.find(p => p.id === productId);
    if (product) addToCartOrExplode(product);
  }

  async function addSelectedToCart() {
    const selected = allProducts.filter(p => selectedProductIds.has(p.id));
    setIsExploding(true);
    try {
      for (const product of selected) await addToCartOrExplode(product, true);
      setSelectedProductIds(new Set());
    } finally {
      setIsExploding(false);
    }
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
    
    if (deliveryMethod === 'pickup' && !pickupUnitSlug) {
      toast.error('Selecione uma unidade para retirada');
      return;
    }

    let parsedNotes = notes || '';
    if (deliveryMethod === 'pickup') {
      const unitName = pickupUnitSlug === 'linhares' ? 'Linhares' : pickupUnitSlug === 'serra' ? 'Serra' : pickupUnitSlug === 'teixeira' ? 'Teixeira de Freitas' : pickupUnitSlug;
      parsedNotes = `[RETIRADA NA LOJA: ${unitName}]\n${parsedNotes}`;
    }

    const payload = {
      p_user_id:        selectedCustomer.id,
      p_items:          cartItems.map(i => ({
        product_id:   i.product_id,
        product_name: i.product_name,
        quantity:     i.quantity,
        price:        i.price,
      })),
      p_total:          total,
      p_status:         status,
      p_origin:         origin,
      p_payment_method: paymentMethod,
      p_notes:          parsedNotes,
      p_discount:       discountAmount,
      p_coupon_id:      appliedCoupon?.id || null,
      p_created_at:     createdAt ? new Date(createdAt).toISOString() : null,
      p_seller_id:      selectedSellerId || null,
    };

    setIsSaving(true);

    try {
      const { data, error } = await supabase.rpc('create_manual_order', payload);

      if (error) throw error;

      toast.success('Pedido lançado com sucesso!');
      navigate('/admin/pedidos');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido ao salvar pedido';
      toast.error(`Erro: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      {/* Header */}
      <div className="bg-white border-b border-border sticky top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/pedidos')}
            className="p-2 rounded-lg hover:bg-surface-alt transition-colors text-muted-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Novo Pedido Manual</h1>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-6">

        {/* ── 1. Seleção de Cliente ────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-border shadow-card p-5 space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            1. Cliente
          </h2>

          {selectedCustomer ? (
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border">
              <div>
                <p className="font-semibold text-foreground">{selectedCustomer.full_name || 'Sem nome'}</p>
                <p className="text-xs text-muted-foreground">{selectedCustomer.phone || 'Sem telefone'} · {selectedCustomer.business_type || '—'}</p>
              </div>
              <button
                onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Trocar
              </button>
            </div>
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

              {loadingProfiles ? (
                <p className="text-xs text-muted-foreground py-2 text-center">Carregando clientes…</p>
              ) : (
                <div className="divide-y divide-border border border-border rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  {filteredCustomers.length === 0 && (
                    <div className="py-4 text-center">
                       <p className="text-xs text-muted-foreground mb-3">Nenhum cliente encontrado</p>
                       <button onClick={() => setIsCreatingClient(true)} className="text-xs flex items-center gap-1 mx-auto text-amber-600 font-medium bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 hover:bg-amber-100 transition-colors">
                         <Plus className="w-3 h-3" /> Cadastrar Novo
                       </button>
                    </div>
                  )}
                  {filteredCustomers.map(profile => (
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
                      <p className="text-xs text-muted-foreground">{profile.phone || 'Sem telefone'} · {profile.business_type || '—'}</p>
                    </button>
                  ))}
                  {filteredCustomers.length > 0 && (
                      <div className="p-3 bg-amber-50 border-t-2 border-amber-200 text-center">
                         <button onClick={() => setIsCreatingClient(true)} className="flex items-center gap-1.5 mx-auto text-sm text-amber-700 font-bold hover:text-amber-900 transition-colors">
                            <Plus className="w-4 h-4" /> Cadastrar Cliente Novo
                         </button>
                      </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── 2. Pacotes Virtuais ─────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-border shadow-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              2. Pacotes Virtuais do Catálogo
            </h2>
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
              Explosão Automática
            </span>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
            {packageSelections.map(({ pkg, selected }) => {
              const pkgTotal = selected.reduce((sum, item) => {
                 if (item.product.id === 'not_found') return sum;
                 const finalPPrice = selectedCustomer?.is_partner && item.product.partner_price ? item.product.partner_price : item.product.price;
                 return sum + finalPPrice * item.qty;
              }, 0);
              const allUniqueImages = Array.from(
                new Set(
                  selected
                    .filter(item => item.product.id !== 'not_found' && item.product.main_image)
                    .map(item => item.product.main_image)
                )
              );
              const displayImages = allUniqueImages.slice(0, 5);
              const remaining = pkg.displayProductCount - displayImages.length;

              return (
                <div 
                  key={pkg.id} 
                  className="flex-shrink-0 w-64 p-4 rounded-xl border border-border bg-white hover:border-amber-400 transition-all flex flex-col gap-3 group"
                >
                  <div className="flex flex-col">
                    <h3 className="font-bold text-sm text-foreground group-hover:text-amber-600 transition-colors">{pkg.name}</h3>
                    <p className="text-[10px] text-muted-foreground line-clamp-1">{pkg.description}</p>
                    <span className="text-[11px] font-bold text-amber-600 mt-0.5">
                      {pkg.displayProductCount} Produtos Inclusos
                    </span>
                  </div>

                  <div className="flex items-center">
                    <div className="flex -space-x-3">
                      {displayImages.map((imgUrl, i) => (
                        <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-white overflow-hidden shadow-sm">
                          <img src={imgUrl as string} className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {remaining > 0 && (
                        <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-50 flex items-center justify-center text-[10px] font-bold text-slate-400">
                          +{remaining}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Total Pacote</span>
                      <span className="text-sm font-black text-foreground">R$ {pkgTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <button
                      onClick={() => handleSelectPackage(pkg.id)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold transition-colors shadow-sm"
                    >
                      ADICIONAR
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 3. Seleção de Produtos ───────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-border shadow-card p-5 space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            3. Itens Individuais
          </h2>

          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder="Buscar produto por nome…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
              />
            </div>
            {selectedProductIds.size > 0 && (
              <button
                onClick={addSelectedToCart}
                disabled={isExploding}
                className="px-4 py-2.5 rounded-xl bg-green-600 text-white text-xs font-bold hover:bg-green-700 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isExploding ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                ADICIONAR ({selectedProductIds.size})
              </button>
            )}
          </div>

          {loadingProducts ? (
            <p className="text-xs text-muted-foreground py-2 text-center">Carregando produtos…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
              {filteredProducts.map(product => {
                const isSelected = selectedProductIds.has(product.id);
                const inCart = cartItems.find(i => i.product_id === product.id);
                
                return (
                  <div
                    key={product.id}
                    onClick={() => toggleProductSelection(product.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500'
                        : inCart 
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
                      {isSelected && (
                        <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
                          <Plus className="w-5 h-5 text-amber-600 font-bold" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-foreground truncate">{product.name}</p>
                      <p className="text-[10px] text-muted-foreground">R$ {product.price.toFixed(2)}</p>
                    </div>
                    
                    <input 
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // Controlled by div click
                      className="w-4 h-4 rounded border-border text-amber-500 focus:ring-amber-500"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── 4. Carrinho ──────────────────────────────────────────────────── */}
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

                  {/* Nome */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.product_name}</p>

                    {/* Preço editável */}
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

                  {/* Subtotal */}
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

            {/* Desconto */}
            <div className="pt-3 border-t border-border space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Desconto</p>
              <div className="flex items-center gap-2">
                {/* Toggle R$ / % */}
                <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
                  <button
                    onClick={() => setDiscountType('fixed')}
                    className={`px-3 py-1.5 text-xs font-bold transition-colors ${discountType === 'fixed' ? 'bg-foreground text-white' : 'bg-white text-muted-foreground hover:bg-surface-alt'}`}
                  >
                    R$
                  </button>
                  <button
                    onClick={() => setDiscountType('percent')}
                    className={`px-3 py-1.5 text-xs font-bold transition-colors ${discountType === 'percent' ? 'bg-foreground text-white' : 'bg-white text-muted-foreground hover:bg-surface-alt'}`}
                  >
                    %
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  step={discountType === 'percent' ? '1' : '0.01'}
                  max={discountType === 'percent' ? '100' : undefined}
                  value={discountValue}
                  onChange={e => setDiscountValue(e.target.value)}
                  placeholder={discountType === 'percent' ? 'Ex: 10' : 'Ex: 50,00'}
                  className="flex-1 text-sm border border-input rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-amber-400 focus:outline-none"
                />
                {discountAmount > 0 && (
                  <span className="text-xs text-emerald-600 font-semibold shrink-0">
                    − R$ {discountAmount.toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            {/* Totais */}
            <div className="pt-3 border-t border-border space-y-1.5">
              <div className="flex justify-between items-center text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>R$ {subtotal.toFixed(2)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between items-center text-sm text-emerald-600">
                  <span>Desconto Manual</span>
                  <span>− R$ {discountAmount.toFixed(2)}</span>
                </div>
              )}
              {appliedCoupon && (
                <div className="flex justify-between items-center text-sm text-emerald-600 font-bold">
                  <span>Cupom ({appliedCoupon.code})</span>
                  <span>− R$ {appliedCoupon.discount_amount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1 border-t border-border">
                <span className="font-semibold text-foreground">Total</span>
                <span className="text-xl font-black text-foreground">R$ {total.toFixed(2)}</span>
              </div>
            </div>

            {/* Cupom de Desconto */}
            <div className="pt-3 border-t border-border space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cupom de Desconto</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={couponCode}
                  onChange={e => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="EX: BEMVINDO10"
                  disabled={!!appliedCoupon || isValidatingCoupon}
                  className="flex-1 text-sm border border-input rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-amber-400 focus:outline-none uppercase font-mono"
                />
                {appliedCoupon ? (
                  <button
                    onClick={() => { setAppliedCoupon(null); setCouponCode(''); }}
                    className="px-4 py-1.5 rounded-lg border border-red-200 text-red-500 text-xs font-bold hover:bg-red-50 transition-colors"
                  >
                    Remover
                  </button>
                ) : (
                  <button
                    onClick={handleApplyCoupon}
                    disabled={isValidatingCoupon || !couponCode.trim()}
                    className="px-4 py-1.5 rounded-lg bg-foreground text-white text-xs font-bold hover:bg-foreground/90 transition-colors disabled:opacity-50"
                  >
                    {isValidatingCoupon ? <Loader className="w-3 h-3 animate-spin" /> : 'Validar'}
                  </button>
                )}
              </div>
              {appliedCoupon && (
                <p className="text-[10px] text-emerald-600 font-bold">
                  Cupom {appliedCoupon.code} aplicado: − R$ {appliedCoupon.discount_amount.toFixed(2)}
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── 5. Campos Adicionais ─────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-border shadow-card p-5 space-y-4">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            5. Detalhes do Pedido
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Status do Pagamento</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none bg-white"
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Origem */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Origem do Pedido</label>
              <select
                value={origin}
                onChange={e => setOrigin(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none bg-white"
              >
                {ORIGIN_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Data do Pedido */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Data do Pedido</label>
              <input
                type="datetime-local"
                value={createdAt}
                onChange={e => setCreatedAt(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none bg-white font-medium"
              />
            </div>

            {/* Forma de Pagamento */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Forma de Pagamento</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none bg-white font-medium"
              >
                {PAYMENT_METHODS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Vendedor */}
            {sellers.length > 0 && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                  Vendedor
                </label>
                <select
                  value={selectedSellerId}
                  onChange={e => setSelectedSellerId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none bg-white"
                >
                  <option value="">Usar vendedor padrão</option>
                  {sellers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.code ? ` (${s.code})` : ''}{s.is_default ? ' — padrão' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Método de Entrega */}
          <div className="pt-4 border-t border-border mt-4">
            <label className="block text-xs font-semibold text-foreground mb-1.5">Método de Entrega</label>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${deliveryMethod === 'shipping' ? 'border-amber-500 bg-amber-50' : 'border-border hover:bg-surface-alt'}`}>
                <input type="radio" checked={deliveryMethod === 'shipping'} onChange={() => setDeliveryMethod('shipping')} className="text-amber-600 focus:ring-amber-500" />
                <span className="font-semibold text-sm">Entrega Normal</span>
              </label>
              <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${deliveryMethod === 'pickup' ? 'border-amber-500 bg-amber-50' : 'border-border hover:bg-surface-alt'}`}>
                <input type="radio" checked={deliveryMethod === 'pickup'} onChange={() => { setDeliveryMethod('pickup'); setPickupUnitSlug('linhares'); }} className="text-amber-600 focus:ring-amber-500" />
                <span className="font-semibold text-sm">Retirar na Loja</span>
              </label>
            </div>

            {deliveryMethod === 'pickup' && (
              <div className="p-3 bg-surface-alt rounded-xl border border-border space-y-2">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Selecione a Unidade</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="admin_pickup_unit" checked={pickupUnitSlug === 'linhares'} onChange={() => setPickupUnitSlug('linhares')} className="text-amber-600 focus:ring-amber-500" />
                  <span className="text-sm font-medium text-foreground">Rei dos Cachos (Linhares)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="admin_pickup_unit" checked={pickupUnitSlug === 'serra'} onChange={() => setPickupUnitSlug('serra')} className="text-amber-600 focus:ring-amber-500" />
                  <span className="text-sm font-medium text-foreground">Rei dos Cachos (Serra)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="admin_pickup_unit" checked={pickupUnitSlug === 'teixeira'} onChange={() => setPickupUnitSlug('teixeira')} className="text-amber-600 focus:ring-amber-500" />
                  <span className="text-sm font-medium text-foreground">Rei dos Cachos (Teixeira de Freitas)</span>
                </label>
              </div>
            )}
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Observações (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Ex: Pagou via Pix, enviar para endereço comercial…"
              className="w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none resize-none"
            />
          </div>
        </section>

        {/* ── Ação ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 pb-8">
          <button
            onClick={() => navigate('/admin/pedidos')}
            className="flex-1 px-6 py-3 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-surface-alt transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving || !selectedCustomer || cartItems.length === 0}
            className="flex-1 px-6 py-3 rounded-xl btn-gold text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <><Loader className="w-4 h-4 animate-spin" /> Salvando…</>
            ) : (
              <>Salvar Pedido · R$ {total.toFixed(2)}</>
            )}
          </button>
        </div>

      </div>
      {/* Modal Criar Cliente Rápido */}
      {isCreatingClient && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isCreating && setIsCreatingClient(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-200">
            <div>
              <h3 className="font-bold text-lg text-foreground mb-1 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-amber-500" />
                Novo Cliente
              </h3>
              <p className="text-xs text-muted-foreground">O cadastro será criado rapidamente sem necessidade de e-mail.</p>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Nome Completo</label>
                <input
                  type="text"
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  placeholder="Ex: João Silva"
                  disabled={isCreating}
                  className="w-full px-3 py-2 rounded-xl border border-input focus:ring-2 focus:ring-amber-400 focus:outline-none disabled:opacity-50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">WhatsApp (DDD + Número)</label>
                <input
                  type="text"
                  value={newClientPhone}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '');
                    if (val.length <= 11) setNewClientPhone(val);
                  }}
                  placeholder="27999999999"
                  disabled={isCreating}
                  maxLength={15}
                  className="w-full px-3 py-2 rounded-xl border border-input focus:ring-2 focus:ring-amber-400 focus:outline-none disabled:opacity-50 font-mono"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setIsCreatingClient(false)}
                disabled={isCreating}
                className="flex-1 py-2.5 rounded-xl font-bold text-muted-foreground hover:bg-surface-alt transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateClient}
                disabled={isCreating || !newClientName.trim() || !newClientPhone.trim() || newClientPhone.replace(/\D/g, '').length < 10}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors disabled:opacity-50 flex justify-center items-center"
              >
                {isCreating ? <Loader className="w-4 h-4 animate-spin" /> : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default NewOrder;
