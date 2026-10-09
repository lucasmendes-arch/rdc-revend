import { useState, useMemo } from 'react';
import { formatBRL } from '@/lib/format';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader, Search, Plus, Minus, Trash2, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import AdminLayout from '@/components/admin/AdminLayout';
import { PACKAGES, selectProductsForPackage } from '@/config/packages';
import type { PublicProduct } from '@/hooks/useCatalogProducts';
import SalesOrderModal from '@/components/admin/SalesOrderModal';
import type { SalesOrderData } from '@/components/admin/SalesOrderModal';
import StyledSelect from '@/components/ui/styled-select';
import { AdminPage, Panel, EmptyState, PageLoading, Segmented } from '@/components/admin/ui/AdminPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DateField } from '@/components/ui/date-field';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { getOrderStatus, toneClasses } from '@/lib/design/orderStatus';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  business_type: string | null;
  email?: string;
  is_partner?: boolean;
  price_list_id?: string | null;
  price_list_name?: string | null;
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
  { value: 'aguardando_pagamento', label: 'Aguardando pagamento' },
  { value: 'pago',                 label: 'Pago' },
];

const ORIGIN_OPTIONS = [
  { value: 'whatsapp',    label: 'WhatsApp' },
  { value: 'loja_fisica', label: 'Loja física' },
  { value: 'site',        label: 'Site' },
  { value: 'outro',       label: 'Outro' },
];

const PAYMENT_METHODS = [
  { value: 'PIX',               label: 'PIX' },
  { value: 'Cartão de Crédito', label: 'Cartão de crédito' },
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
  const [shippingValue, setShippingValue]         = useState('');

  // -- Modal Criar Cliente --
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [newClientName, setNewClientName]       = useState('');
  const [newClientPhone, setNewClientPhone]     = useState('');
  const [isCreating, setIsCreating]             = useState(false);

  // -- Sales Order Modal --
  const [showSalesOrder, setShowSalesOrder] = useState(false);

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

  const { data: priceListItems = [] } = useQuery<{ product_id: string; price: number }[]>({
    queryKey: ['price-list-items', selectedCustomer?.price_list_id],
    enabled: !!selectedCustomer?.price_list_id,
    queryFn: async () => {
      const { data: list } = await supabase
        .from('price_lists')
        .select('is_active')
        .eq('id', selectedCustomer!.price_list_id!)
        .single();
      if (!list?.is_active) return [];
      const { data, error } = await supabase
        .from('price_list_items')
        .select('product_id, price')
        .eq('price_list_id', selectedCustomer!.price_list_id!);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const priceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of priceListItems) map.set(item.product_id, item.price);
    return map;
  }, [priceListItems]);

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

  const shippingAmount = useMemo(
    () => deliveryMethod === 'shipping' ? (parseFloat(shippingValue) || 0) : 0,
    [deliveryMethod, shippingValue]
  );

  const total = useMemo(() => {
    const couponDisc = appliedCoupon?.discount_amount || 0;
    return Math.max(subtotal + shippingAmount - discountAmount - couponDisc, 0);
  }, [subtotal, shippingAmount, discountAmount, appliedCoupon]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function resolvePrice(product: { id: string; price: number; partner_price: number | null }): number {
    if (priceMap.has(product.id)) return priceMap.get(product.id)!;
    if (selectedCustomer?.is_partner && product.partner_price != null) return product.partner_price;
    return product.price;
  }

  async function addToCartOrExplode(product: Product, isBulk = false) {
    const finalPrice = resolvePrice(product);

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
          
          const finalPPrice = resolvePrice(item.product);

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

  function setQtyAbsolute(productId: string, value: string) {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 1) return;
    setCartItems(prev =>
      prev.map(i => i.product_id === productId ? { ...i, quantity: parsed } : i)
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
      p_shipping:       shippingAmount,
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

  const brl = formatBRL;
  const createdDate = createdAt ? createdAt.slice(0, 10) : '';
  const createdTime = createdAt ? createdAt.slice(11, 16) : '';
  const optionCard = (active: boolean) =>
    `flex items-center gap-2.5 px-3 h-10 rounded-md border text-[13px] font-medium text-left transition-colors ${
      active ? 'border-brand-border bg-brand-subtle text-foreground' : 'border-border bg-card text-ink-600 hover:border-ink-300 hover:text-foreground'
    }`;
  const radioDot = (active: boolean) =>
    `w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${active ? 'border-brand-strong' : 'border-ink-300'}`;
  const PICKUP_UNITS = [
    { slug: 'linhares', label: 'Rei dos Cachos (Linhares)' },
    { slug: 'serra', label: 'Rei dos Cachos (Serra)' },
    { slug: 'teixeira', label: 'Rei dos Cachos (Teixeira de Freitas)' },
  ];

  return (
    <AdminLayout>
      <AdminPage
        title="Novo pedido manual"
        back={{ to: '/admin/pedidos', label: 'Pedidos' }}
        width="default"
      >
        <div className="space-y-6">

          {/* ── 1. Cliente ───────────────────────────────────────────────────── */}
          <Panel title="1. Cliente">
            {selectedCustomer ? (
              <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-surface border border-border">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-foreground truncate">{selectedCustomer.full_name || 'Sem nome'}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {selectedCustomer.phone || 'Sem telefone'} · {selectedCustomer.business_type || '—'}
                    {selectedCustomer.price_list_name && (
                      <span className="ml-1 text-foreground font-medium">· Tabela: {selectedCustomer.price_list_name}</span>
                    )}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }}
                >
                  Trocar
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
                  <Input
                    type="text"
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    placeholder="Buscar cliente por nome ou telefone…"
                    className="pl-8"
                  />
                </div>

                {loadingProfiles ? (
                  <PageLoading label="Carregando clientes…" className="py-6" />
                ) : (
                  <div className="divide-y divide-border border border-border rounded-md overflow-hidden max-h-60 overflow-y-auto">
                    {filteredCustomers.length === 0 && (
                      <EmptyState
                        title="Nenhum cliente encontrado"
                        description="Confira a busca ou cadastre um cliente novo."
                        action={
                          <Button variant="secondary" size="sm" onClick={() => setIsCreatingClient(true)}>
                            <Plus />
                            Cadastrar cliente
                          </Button>
                        }
                        className="py-6"
                      />
                    )}
                    {filteredCustomers.map(profile => (
                      <button
                        key={profile.id}
                        type="button"
                        onClick={() => { setSelectedCustomer(profile); setCustomerSearch(''); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors"
                      >
                        <p className="text-[13.5px] font-medium text-foreground flex items-center gap-2">
                          <span className="truncate">{profile.full_name || 'Sem nome'}</span>
                          {profile.is_partner && <Badge variant="brand" className="shrink-0">Parceiro</Badge>}
                        </p>
                        <p className="text-[12px] text-muted-foreground">{profile.phone || 'Sem telefone'} · {profile.business_type || '—'}</p>
                      </button>
                    ))}
                    {filteredCustomers.length > 0 && (
                      <div className="p-2 bg-surface text-center">
                        <Button variant="ghost" size="sm" onClick={() => setIsCreatingClient(true)}>
                          <Plus />
                          Cadastrar cliente novo
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Panel>

          {/* ── 2. Pacotes virtuais ──────────────────────────────────────────── */}
          <Panel
            title="2. Pacotes virtuais do catálogo"
            actions={<Badge variant="neutral">Explosão automática</Badge>}
          >
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
              {packageSelections.map(({ pkg, selected }) => {
                const pkgTotal = selected.reduce((sum, item) => {
                   if (item.product.id === 'not_found') return sum;
                   return sum + resolvePrice(item.product) * item.qty;
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
                    className="shrink-0 w-60 sm:w-64 p-4 rounded-lg border border-border bg-card hover:border-ink-300 transition-colors flex flex-col gap-3"
                  >
                    <div className="flex flex-col min-w-0">
                      <h3 className="text-[14px] font-semibold text-foreground truncate">{pkg.name}</h3>
                      <p className="text-[12px] text-muted-foreground line-clamp-1">{pkg.description}</p>
                      <span className="text-[12px] text-muted-foreground mt-0.5 tabular-nums">
                        {pkg.displayProductCount} produtos inclusos
                      </span>
                    </div>

                    <div className="flex -space-x-2.5">
                      {displayImages.map((imgUrl, i) => (
                        <div key={i} className="w-8 h-8 rounded-full border-2 border-card bg-card overflow-hidden">
                          <img src={imgUrl as string} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {remaining > 0 && (
                        <div className="w-8 h-8 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[11px] font-medium text-ink-500 tabular-nums">
                          +{remaining}
                        </div>
                      )}
                    </div>

                    <div className="flex items-end justify-between gap-2 mt-auto">
                      <div className="flex flex-col">
                        <span className="text-[12px] text-muted-foreground">Total do pacote</span>
                        <span className="text-[14px] font-semibold text-foreground tabular-nums">{brl(pkgTotal)}</span>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => handleSelectPackage(pkg.id)}>
                        <Plus />
                        Adicionar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* ── 3. Itens individuais ─────────────────────────────────────────── */}
          <Panel title="3. Itens individuais">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
                  <Input
                    type="text"
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    placeholder="Buscar produto por nome…"
                    className="pl-8"
                  />
                </div>
                {selectedProductIds.size > 0 && (
                  <Button onClick={addSelectedToCart} disabled={isExploding}>
                    {isExploding ? <Loader className="animate-spin" /> : <Plus />}
                    Adicionar ({selectedProductIds.size})
                  </Button>
                )}
              </div>

              {loadingProducts ? (
                <PageLoading label="Carregando produtos…" className="py-6" />
              ) : filteredProducts.length === 0 ? (
                <EmptyState title="Nenhum produto encontrado" description="Tente outro termo de busca." className="py-6" />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                  {filteredProducts.map(product => {
                    const isSelected = selectedProductIds.has(product.id);
                    const inCart = cartItems.find(i => i.product_id === product.id);

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => toggleProductSelection(product.id)}
                        className={`flex items-center gap-3 p-2.5 rounded-md border text-left transition-colors ${
                          isSelected
                            ? 'border-brand-border bg-brand-subtle'
                            : inCart
                              ? 'border-success-border bg-success-subtle'
                              : 'border-border hover:border-ink-300 hover:bg-muted'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 bg-muted border border-border">
                          {product.main_image ? (
                            <img src={product.main_image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[12px] font-medium">
                              {product.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-foreground truncate">{product.name}</p>
                          <p className="text-[12px] text-muted-foreground tabular-nums">{brl(product.price)}</p>
                        </div>
                        {inCart ? (
                          <span className="text-[12px] font-medium text-success tabular-nums shrink-0">×{inCart.quantity}</span>
                        ) : (
                          <Plus className="w-4 h-4 text-ink-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Panel>

          {/* ── 4. Resumo do pedido ──────────────────────────────────────────── */}
          {cartItems.length > 0 && (
            <Panel
              title="4. Resumo do pedido"
              actions={
                <Button variant="secondary" size="sm" onClick={() => setShowSalesOrder(true)}>
                  <FileText />
                  Pedido de venda
                </Button>
              }
            >
              <div className="space-y-4">
                <div className="divide-y divide-border -mt-2">
                  {cartItems.map(item => (
                    <div key={item.product_id} className="py-3 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2">
                      {/* Miniatura */}
                      <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 bg-muted border border-border">
                        {item.main_image ? (
                          <img src={item.main_image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[12px] font-medium text-muted-foreground">
                            {item.product_name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* Nome + preço editável */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-medium text-foreground truncate">{item.product_name}</p>
                        <div className="relative mt-1 w-28">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground pointer-events-none">R$</span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.price}
                            onChange={e => updatePrice(item.product_id, e.target.value)}
                            aria-label="Preço unitário"
                            className="h-7 pl-7 pr-2 text-[13px] md:text-[13px] tabular-nums"
                          />
                        </div>
                      </div>

                      {/* Quantidade */}
                      <div className="flex items-center gap-1 shrink-0 ml-[52px] sm:ml-0">
                        <Button
                          variant="secondary"
                          size="icon-sm"
                          className="h-7 w-7"
                          onClick={() => updateQty(item.product_id, -1)}
                          aria-label="Diminuir quantidade"
                        >
                          <Minus />
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={e => setQtyAbsolute(item.product_id, e.target.value)}
                          onBlur={e => { if (!e.target.value || parseInt(e.target.value) < 1) setQtyAbsolute(item.product_id, '1'); }}
                          aria-label="Quantidade"
                          className="w-12 h-7 px-1 text-center tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <Button
                          variant="secondary"
                          size="icon-sm"
                          className="h-7 w-7"
                          onClick={() => updateQty(item.product_id, 1)}
                          aria-label="Aumentar quantidade"
                        >
                          <Plus />
                        </Button>
                      </div>

                      {/* Subtotal da linha */}
                      <p className="ml-auto sm:ml-0 w-24 text-right text-[13.5px] font-semibold text-foreground shrink-0 tabular-nums">
                        {brl(item.quantity * item.price)}
                      </p>

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeFromCart(item.product_id)}
                        className="h-7 w-7 shrink-0 hover:text-danger hover:bg-danger-subtle"
                        aria-label="Remover item"
                        title="Remover item"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Desconto */}
                <div className="pt-4 border-t border-border">
                  <span className="field-label">Desconto</span>
                  <div className="flex items-center gap-2">
                    <Segmented
                      items={[{ key: 'fixed', label: 'R$' }, { key: 'percent', label: '%' }]}
                      value={discountType}
                      onChange={(k) => setDiscountType(k as 'fixed' | 'percent')}
                      className="shrink-0"
                    />
                    <Input
                      type="number"
                      min="0"
                      step={discountType === 'percent' ? '1' : '0.01'}
                      max={discountType === 'percent' ? '100' : undefined}
                      value={discountValue}
                      onChange={e => setDiscountValue(e.target.value)}
                      placeholder={discountType === 'percent' ? 'Ex: 10' : 'Ex: 50,00'}
                      aria-label="Valor do desconto"
                      className="flex-1 tabular-nums"
                    />
                    {discountAmount > 0 && (
                      <span className="text-[13px] text-success font-medium shrink-0 tabular-nums">
                        −{brl(discountAmount)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Cupom */}
                <div className="pt-4 border-t border-border">
                  <span className="field-label">Cupom de desconto</span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={couponCode}
                      onChange={e => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="Ex: BEMVINDO10"
                      disabled={!!appliedCoupon || isValidatingCoupon}
                      aria-label="Código do cupom"
                      className="flex-1 font-mono"
                    />
                    {appliedCoupon ? (
                      <Button
                        variant="secondary"
                        onClick={() => { setAppliedCoupon(null); setCouponCode(''); }}
                        className="text-danger hover:text-danger hover:bg-danger-subtle"
                      >
                        Remover
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={handleApplyCoupon}
                        disabled={isValidatingCoupon || !couponCode.trim()}
                      >
                        {isValidatingCoupon && <Loader className="animate-spin" />}
                        Validar
                      </Button>
                    )}
                  </div>
                  {appliedCoupon && (
                    <p className="text-[12px] text-success font-medium mt-1.5 tabular-nums">
                      Cupom {appliedCoupon.code} aplicado: −{brl(appliedCoupon.discount_amount)}
                    </p>
                  )}
                </div>

                {/* Totais */}
                <div className="pt-4 border-t border-border space-y-1.5 text-[13px] tabular-nums">
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{brl(subtotal)}</span>
                  </div>
                  {shippingAmount > 0 && (
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>Frete</span>
                      <span>+{brl(shippingAmount)}</span>
                    </div>
                  )}
                  {discountAmount > 0 && (
                    <div className="flex justify-between items-center text-success">
                      <span>Desconto manual</span>
                      <span>−{brl(discountAmount)}</span>
                    </div>
                  )}
                  {appliedCoupon && (
                    <div className="flex justify-between items-center text-success">
                      <span>Cupom ({appliedCoupon.code})</span>
                      <span>−{brl(appliedCoupon.discount_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="text-[14px] font-semibold text-foreground">Total</span>
                    <span className="font-title text-[20px] font-semibold text-foreground">{brl(total)}</span>
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {/* ── 5. Detalhes do pedido ────────────────────────────────────────── */}
          <Panel title="5. Detalhes do pedido">
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="field-label">Status do pagamento</span>
                  <StyledSelect
                    value={status}
                    onChange={setStatus}
                    options={STATUS_OPTIONS.map(opt => ({ ...opt, dotClassName: toneClasses(getOrderStatus(opt.value).tone).dot }))}
                    searchable={false}
                  />
                </div>

                <div>
                  <span className="field-label">Origem do pedido</span>
                  <StyledSelect
                    value={origin}
                    onChange={setOrigin}
                    options={ORIGIN_OPTIONS}
                    searchable={false}
                  />
                </div>

                <div>
                  <span className="field-label">Data do pedido</span>
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                      <DateField
                        value={createdDate || null}
                        onChange={d => setCreatedAt(d ? `${d}T${createdTime || '12:00'}` : '')}
                        placeholder="Agora"
                      />
                    </div>
                    <Input
                      type="time"
                      value={createdTime}
                      onChange={e => { if (createdDate) setCreatedAt(`${createdDate}T${e.target.value || '12:00'}`); }}
                      disabled={!createdDate}
                      aria-label="Horário do pedido"
                      className="w-28 shrink-0 tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <span className="field-label">Forma de pagamento</span>
                  <StyledSelect
                    value={paymentMethod}
                    onChange={setPaymentMethod}
                    options={PAYMENT_METHODS}
                    searchable={false}
                  />
                </div>

                {sellers.length > 0 && (
                  <div className="sm:col-span-2">
                    <span className="field-label">Vendedor</span>
                    <StyledSelect
                      value={selectedSellerId}
                      onChange={setSelectedSellerId}
                      options={sellers.map(s => ({ value: s.id, label: `${s.name}${s.code ? ` (${s.code})` : ''}${s.is_default ? ' — padrão' : ''}` }))}
                      emptyLabel="Usar vendedor padrão"
                      placeholder="Usar vendedor padrão"
                    />
                  </div>
                )}
              </div>

              {/* Entrega */}
              <div className="pt-5 border-t border-border">
                <span className="field-label">Método de entrega</span>
                <div className="grid grid-cols-2 gap-2 mb-3" role="radiogroup" aria-label="Método de entrega">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={deliveryMethod === 'shipping'}
                    onClick={() => setDeliveryMethod('shipping')}
                    className={optionCard(deliveryMethod === 'shipping')}
                  >
                    <span className={radioDot(deliveryMethod === 'shipping')}>
                      {deliveryMethod === 'shipping' && <span className="w-2 h-2 rounded-full bg-brand-strong" />}
                    </span>
                    Entrega normal
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={deliveryMethod === 'pickup'}
                    onClick={() => { setDeliveryMethod('pickup'); setPickupUnitSlug('linhares'); }}
                    className={optionCard(deliveryMethod === 'pickup')}
                  >
                    <span className={radioDot(deliveryMethod === 'pickup')}>
                      {deliveryMethod === 'pickup' && <span className="w-2 h-2 rounded-full bg-brand-strong" />}
                    </span>
                    Retirar na loja
                  </button>
                </div>

                {deliveryMethod === 'shipping' && (
                  <div className="flex items-center gap-2">
                    <label htmlFor="new-order-shipping" className="text-[13px] font-medium text-foreground shrink-0">Frete (R$)</label>
                    <Input
                      id="new-order-shipping"
                      type="number"
                      min="0"
                      step="0.01"
                      value={shippingValue}
                      onChange={e => setShippingValue(e.target.value)}
                      placeholder="0,00"
                      className="w-32 tabular-nums"
                    />
                  </div>
                )}

                {deliveryMethod === 'pickup' && (
                  <div className="p-3 bg-surface rounded-md border border-border space-y-2">
                    <p className="text-[12px] font-medium text-muted-foreground">Selecione a unidade</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Unidade de retirada">
                      {PICKUP_UNITS.map(u => (
                        <button
                          key={u.slug}
                          type="button"
                          role="radio"
                          aria-checked={pickupUnitSlug === u.slug}
                          onClick={() => setPickupUnitSlug(u.slug)}
                          className={optionCard(pickupUnitSlug === u.slug)}
                        >
                          <span className={radioDot(pickupUnitSlug === u.slug)}>
                            {pickupUnitSlug === u.slug && <span className="w-2 h-2 rounded-full bg-brand-strong" />}
                          </span>
                          <span className="truncate">{u.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="new-order-notes" className="field-label">Observações (opcional)</label>
                <Textarea
                  id="new-order-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Ex: Pagou via Pix, enviar para endereço comercial…"
                  className="resize-none"
                />
              </div>
            </div>
          </Panel>

          {/* ── Barra de ação ────────────────────────────────────────────────── */}
          <div className="sticky bottom-0 z-10 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-background/95 backdrop-blur-sm border-t border-border flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <Button variant="secondary" onClick={() => navigate('/admin/pedidos')}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSaving || !selectedCustomer || cartItems.length === 0}
            >
              {isSaving ? (
                <><Loader className="animate-spin" /> Salvando…</>
              ) : (
                <>Salvar pedido · <span className="tabular-nums">{brl(total)}</span></>
              )}
            </Button>
          </div>
        </div>
      </AdminPage>

      {/* Modal pedido de venda */}
      {showSalesOrder && (() => {
        const salesData: SalesOrderData = {
          customer_name: selectedCustomer?.full_name ?? undefined,
          customer_phone: selectedCustomer?.phone ?? undefined,
          items: cartItems.map(item => ({
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.price,
            line_total: item.quantity * item.price,
            main_image: item.main_image,
          })),
          subtotal,
          discount_amount: discountAmount + (appliedCoupon?.discount_amount ?? 0),
          total,
          notes: notes || undefined,
          date: new Date().toISOString(),
        };
        return <SalesOrderModal data={salesData} onClose={() => setShowSalesOrder(false)} />;
      })()}

      {/* Modal cadastro rápido de cliente */}
      <Dialog open={isCreatingClient} onOpenChange={(open) => { if (!open && !isCreating) setIsCreatingClient(false); }}>
        <DialogContent className="max-w-sm w-[calc(100%-2rem)]">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[16px]">Novo cliente</DialogTitle>
            <DialogDescription>O cadastro é criado na hora, sem precisar de e-mail.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label htmlFor="new-client-name" className="field-label">Nome completo</label>
              <Input
                id="new-client-name"
                type="text"
                value={newClientName}
                onChange={e => setNewClientName(e.target.value)}
                placeholder="Ex: João Silva"
                disabled={isCreating}
              />
            </div>
            <div>
              <label htmlFor="new-client-phone" className="field-label">WhatsApp (DDD + número)</label>
              <Input
                id="new-client-phone"
                type="text"
                inputMode="numeric"
                value={newClientPhone}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (val.length <= 11) setNewClientPhone(val);
                }}
                placeholder="27999999999"
                disabled={isCreating}
                maxLength={15}
                className="font-mono"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={() => setIsCreatingClient(false)} disabled={isCreating}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateClient}
              disabled={isCreating || !newClientName.trim() || !newClientPhone.trim() || newClientPhone.replace(/\D/g, '').length < 10}
            >
              {isCreating && <Loader className="animate-spin" />}
              Cadastrar cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default NewOrder;
