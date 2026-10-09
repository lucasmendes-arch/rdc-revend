import { useState, useEffect, useMemo } from "react";
import DOMPurify from "dompurify";
import { ArrowRight, Check, Crown, Filter, Lock, LogOut, MessageCircle, Minus, Plus, Search, ShoppingCart, Tag, Trash2, TrendingUp, X, ShieldCheck, Truck, Leaf } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PackageCards from "@/components/catalog/PackageCards";
import CategoryBubbles from "@/components/catalog/CategoryBubbles";
import CompactProductCarousel from "@/components/catalog/CompactProductCarousel";
import { toast } from "sonner";
import logo from "@/assets/logo-rei-dos-cachos.png";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useCatalogProducts } from "@/hooks/useCatalogProducts";
import { useCategories } from "@/hooks/useCategories";
import { useCart } from "@/contexts/CartContext";
import { useTrackPageView, useTrackAddToCart, useTrackProductView } from "@/hooks/useSessionTracking";
import { ProfileCompletionModal } from "@/components/ProfileCompletionModal";
import { isProfileIncomplete } from "@/utils/profile";
import { extractVolume } from "@/utils/product";
import B2BHero from "@/components/catalog/B2BHero";
import HowItWorks from "@/components/catalog/HowItWorks";
import WhatsAppCTA from "@/components/catalog/WhatsAppCTA";
import CartDrawer from "@/components/CartDrawer";
import StyledSelect from '@/components/ui/styled-select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState, PageLoading } from '@/components/admin/ui/AdminPage';
import ProductCard from '@/components/catalog/ProductCard';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type SortOption = 'default' | 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'profit_desc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'default', label: 'Padrão' },
  { value: 'name_asc', label: 'Nome (A-Z)' },
  { value: 'name_desc', label: 'Nome (Z-A)' },
  { value: 'price_asc', label: 'Menor custo' },
  { value: 'price_desc', label: 'Maior custo' },
  { value: 'profit_desc', label: 'Maior lucro' },
]

// ============================================================================
// HELPERS
// ============================================================================

// TODO: Remove fallback when all products have compare_at_price populated in DB
const getSuggestedPrice = (price: number, compareTo: number | null): number => {
  if (compareTo && compareTo > 0) return compareTo;
  return Math.round(price * 2 * 100) / 100; // fallback: 2x cost
};

// ============================================================================
// COMPONENTS
// ============================================================================

interface FilterChipProps {
  label: string;
  onRemove: () => void;
}

const FilterChip = ({ label, onRemove }: FilterChipProps) => (
  <span className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-md text-[12px] font-medium bg-brand-subtle text-brand-strong border border-brand-border whitespace-nowrap">
    {label}
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remover filtro ${label}`}
      className="h-5 w-5 flex items-center justify-center rounded-sm hover:bg-brand-border/60 transition-colors"
    >
      <X className="w-3 h-3" />
    </button>
  </span>
);

/**
 * Faixa de confiança sob o cabeçalho. Era uma pílula flutuante de 80px com
 * `shadow-lg`, `hover:scale`, caixa-alta e um rótulo de 9px — e ficava presa
 * no topo, comendo um quarto da tela do celular. Virou uma linha fina que
 * rola junto com a página.
 */
const RotatingTrustBanner = () => {
  const items = [
    { icon: Leaf, tone: 'text-success', label: 'Fórmula limpa', sub: '100% vegano, liberado e sem petrolatos' },
    { icon: Truck, tone: 'text-ink-500', label: 'Envio rápido para ES e BA', sub: 'Logística própria e transportadoras' },
    { icon: ShieldCheck, tone: 'text-success', label: 'Compra 100% segura', sub: 'Ambiente seguro e dados protegidos' },
    { icon: TrendingUp, tone: 'text-info', label: 'Alto giro', sub: 'Fazem sucesso com as cacheadas' },
    { icon: MessageCircle, tone: 'text-success', label: 'Suporte no WhatsApp', sub: 'Seg. a sex., 8h às 18h' },
  ];

  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(prev => (prev + 1) % items.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [items.length]);

  const item = items[index];
  const Icon = item.icon;

  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto max-w-7xl h-10 px-4 sm:px-6 flex items-center justify-center gap-4">
        <div key={index} className="flex items-center gap-2 min-w-0 animate-in fade-in duration-500" aria-live="polite">
          <Icon className={`w-4 h-4 shrink-0 ${item.tone}`} />
          <span className="text-[13px] font-medium text-foreground whitespace-nowrap">{item.label}</span>
          <span className="hidden sm:inline text-[13px] text-muted-foreground truncate">· {item.sub}</span>
        </div>
        <div className="hidden md:flex gap-1 shrink-0" aria-hidden>
          {items.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${i === index ? 'w-4 bg-ink-500' : 'w-1.5 bg-ink-200'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const Catalogo = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewAll = searchParams.get('view') === 'todos';
  const setViewAll = (v: boolean) => setSearchParams(v ? { view: 'todos' } : {}, { replace: true });
  const { user, role, isPartner, loading: isLoadingAuth } = useAuth();
  const { data: products = [], isLoading, error, priceListError } = useCatalogProducts({ includePartnerPrice: isPartner, fetchPriceList: isPartner });
  const { data: dbCategories = [] } = useCategories();
  const { items: cart, addItem, updateQty, total: cartTotal, count: cartCount, minOrderValue, cartOpen, setCartOpen } = useCart();
  const isGuest = !isLoadingAuth && !user;
  useTrackPageView('Catálogo');
  const trackAddToCart = useTrackAddToCart();
  const trackProductView = useTrackProductView();

  const scrollToKits = () => {
    document.getElementById('kits-section')?.scrollIntoView({ behavior: 'smooth' });
  };
  const scrollToProducts = () => {
    const target = document.getElementById('categoria-uso-profissional') || document.getElementById('produtos-section');
    target?.scrollIntoView({ behavior: 'smooth' });
  };

  // ========================================================================
  // STATE
  // ========================================================================

  // Search and filters state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [filterMinPrice, setFilterMinPrice] = useState<number | ''>('');
  const [filterMaxPrice, setFilterMaxPrice] = useState<number | ''>('');
  const [filterOnlySuggested, setFilterOnlySuggested] = useState(false);
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterProfessional, setFilterProfessional] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // UI state
  const [selectedProduct, setSelectedProduct] = useState<typeof products[0] | null>(null);
  const handleSelectProduct = (product: typeof products[0] | null) => {
    setSelectedProduct(product);
    if (product) trackProductView(product.name);
  };
  const [addedId, setAddedId] = useState<string | null>(null);
  const [cartBounce, setCartBounce] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Accordion state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    sort: true,
    price: true,
    categories: true,
    extra: true
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // ---- Progressive Profiling Popup ----
  const [showProfilePopup, setShowProfilePopup] = useState(false)

  useEffect(() => {
    // Only for logged-in, non-admin, non-partner users
    if (!user?.id || role === 'admin' || isPartner) return

    const USER_VISITS_KEY = `rdc_profile_visits_${user.id}`
    const SESSION_DISMISSED_KEY = `rdc_popup_dismissed_${user.id}`

    const visits = parseInt(localStorage.getItem(USER_VISITS_KEY) || '0', 10)
    const dismissedThisSession = sessionStorage.getItem(SESSION_DISMISSED_KEY) === '1'

    // Max 2 popup appearances totals; don't show again if dismissed this session
    if (visits >= 2 || dismissedThisSession) return

    let timer: NodeJS.Timeout;

    // Check if profile needs completion
    supabase
      .from('profiles')
      .select('document, document_type, address_city, address_state')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (!isProfileIncomplete(data)) return

        timer = setTimeout(() => {
          setShowProfilePopup(true)
          // Increment visit counter ONLY when it actually shows
          localStorage.setItem(USER_VISITS_KEY, String(visits + 1))
        }, 15000)
      })

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [user?.id, role, isPartner])

  // ========================================================================
  // EFFECTS
  // ========================================================================

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ========================================================================
  // FILTERS & SORT
  // ========================================================================

  const toggleCategory = (catId: string) =>
    setFilterCategories(prev =>
      prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId]
    );

  const clearAllFilters = () => {
    setSearch('');
    setSortBy('default');
    setFilterMinPrice('');
    setFilterMaxPrice('');
    setFilterOnlySuggested(false);
    setFilterCategories([]);
    setFilterProfessional(false);
  };

  const activeFiltersCount = [
    debouncedSearch !== '',
    filterMinPrice !== '',
    filterMaxPrice !== '',
    filterOnlySuggested,
    filterCategories.length > 0,
    filterProfessional,
    sortBy !== 'default',
  ].filter(Boolean).length;

  const filtered = useMemo(() => {
    const result = products.filter(p => {
      if (!p.name.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
      if (filterProfessional && !p.is_professional) return false;
      if (filterOnlySuggested && !p.compare_at_price) return false;
      if (filterMinPrice !== '' && p.price < filterMinPrice) return false;
      if (filterMaxPrice !== '' && p.price > filterMaxPrice) return false;
      if (filterCategories.length > 0) {
        if (!p.category_id || !filterCategories.includes(p.category_id)) return false;
      }
      return true;
    });

    switch (sortBy) {
      case 'default':
        return result; // preserves sort_order from DB
      case 'name_asc':
        return [...result].sort((a, b) => a.name.localeCompare(b.name));
      case 'name_desc':
        return [...result].sort((a, b) => b.name.localeCompare(a.name));
      case 'price_asc':
        return [...result].sort((a, b) => a.price - b.price);
      case 'price_desc':
        return [...result].sort((a, b) => b.price - a.price);
      case 'profit_desc':
        return [...result].sort((a, b) => {
          const pa = a.price > 0
            ? ((getSuggestedPrice(a.price, a.compare_at_price) - a.price) / a.price) * 100
            : -1;
          const pb = b.price > 0
            ? ((getSuggestedPrice(b.price, b.compare_at_price) - b.price) / b.price) * 100
            : -1;
          return pb - pa;
        });
      default:
        return result;
    }
  }, [products, debouncedSearch, sortBy, filterMinPrice, filterMaxPrice, filterOnlySuggested, filterCategories, filterProfessional]);

  // Derivation of `filtered` sorted by category for "Ver todos" mode
  const categoryOrder = useMemo(
    () => new Map(dbCategories.map((c, i) => [c.id, i])),
    [dbCategories]
  );

  const filteredSortedByCategory = useMemo(() => {
    if (!viewAll) return filtered;
    return [...filtered].sort((a, b) => {
      const ai = a.category_id ? (categoryOrder.get(a.category_id) ?? 999) : 999;
      const bi = b.category_id ? (categoryOrder.get(b.category_id) ?? 999) : 999;
      return ai - bi;
    });
  }, [filtered, categoryOrder, viewAll]);

  // Derive categories from products if dbCategories is empty (to handle anonymous RLS)
  const categoriesToDisplay = useMemo(() => {
    let source = dbCategories;
    if (source.length === 0) {
      const uniqueCats: Record<string, { id: string; name: string; slug: string; sort_order: number }> = {};
      products.forEach(p => {
        if (p.category) {
          uniqueCats[p.category.id] = p.category;
        }
      });
      source = Object.values(uniqueCats).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }

    // Only show categories that have products after general search filtering
    // but before category filtering itself (to keep sidebar stable)
    const baseFilteredIds = new Set(products.filter(p =>
      p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) &&
      (!filterProfessional || p.is_professional) &&
      (!filterOnlySuggested || p.compare_at_price)
    ).map(p => p.category_id));

    return source.filter(cat => baseFilteredIds.has(cat.id));
  }, [dbCategories, products, debouncedSearch, filterProfessional, filterOnlySuggested]);

  // ========================================================================
  // HELPERS
  // ========================================================================

  const getQty = (id: string) => quantities[id] ?? 1;
  const setQty = (id: string, qty: number) =>
    setQuantities(prev => ({ ...prev, [id]: Math.max(1, qty) }));

  const cleanDescription = (raw: string): string => {
    let text = raw.trim();

    // 1. Se vier como JSON {"pt":"..."} — extrair campo pt
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && 'pt' in parsed) {
        text = String(parsed.pt);
      }
    } catch { /* não é JSON, segue */ }

    // 2. Strip {pt:...} Nuvemshop locale wrapping
    text = text.replace(/\{[a-z]{2}:([\s\S]*?)\}/g, '$1');

    // 3. Converter literal \n para quebra real
    text = text.replace(/\\n/g, '\n');

    // 4. Remover linhas vazias excessivas (3+ → 1)
    text = text.replace(/(\n\s*){3,}/g, '\n\n');

    // 5. Remover espaços/tabs no início de cada linha
    text = text.split('\n').map(l => l.trimStart()).join('\n');

    return text.trim();
  };

  const renderDescription = (raw: string): string => {
    const cleaned = cleanDescription(raw);
    // Se não contiver tags HTML, formatar como parágrafos
    if (!/<[a-z][\s\S]*>/i.test(cleaned)) {
      return cleaned.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');
    }
    return cleaned;
  };

  // Handle add to cart with quantity
  const handleAddItem = (product: typeof products[0]) => {
    if (isGuest) {
      toast('Cadastre-se para fazer pedidos', {
        action: { label: 'Criar conta', onClick: () => navigate('/cadastro') },
        duration: 4000,
      });
      return;
    }
    const qty = getQty(product.id);
    const existing = cart.find(i => i.id === product.id);

    if (existing) {
      updateQty(product.id, existing.quantity + qty);
    } else {
      addItem({
        id: product.id,
        name: product.name,
        price: isPartner && product.partner_price ? product.partner_price : product.price,
        image: product.main_image,
      });
      if (qty > 1) {
        updateQty(product.id, qty);
      }
    }

    // Track add to cart
    const finalPrice = isPartner && product.partner_price ? product.partner_price : product.price;
    trackAddToCart(cartCount + qty, product.name, finalPrice * qty);

    // Visual feedback
    setAddedId(product.id);
    setTimeout(() => setAddedId(null), 800);

    setCartBounce(true);
    setTimeout(() => setCartBounce(false), 600);

    toast('Adicionado ao pedido!', {
      action: {
        label: 'Ver pedido',
        onClick: () => setCartOpen(true),
      },
      duration: 3000,
    });

    setQty(product.id, 1);
  };

  // Handle logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  // ========================================================================
  // RENDER
  // ========================================================================

  const showBrowse = !debouncedSearch && !viewAll;
  const countBadge = 'absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold flex items-center justify-center leading-none numeric border-2 border-background';

  const renderProductCard = (product: typeof products[0]) => (
    <ProductCard
      key={product.id}
      product={product}
      isGuest={isGuest}
      isPartner={isPartner}
      suggested={getSuggestedPrice(product.price, product.compare_at_price)}
      showSuggested={!product.is_professional}
      reserveSuggested
      qty={getQty(product.id)}
      setQty={(q) => setQty(product.id, q)}
      added={addedId === product.id}
      onAdd={() => handleAddItem(product)}
      onSelect={() => handleSelectProduct(product)}
    />
  );

  const emptyResults = (
    <div className="surface-card shadow-xs mb-8">
      <EmptyState
        icon={Tag}
        title="Nenhum produto encontrado"
        description="Tente outro termo de busca ou ajuste os filtros."
        action={activeFiltersCount > 0 ? (
          <Button variant="secondary" onClick={clearAllFilters}>Limpar filtros</Button>
        ) : undefined}
      />
    </div>
  );

  // Filtros: o mesmo conteúdo serve à barra lateral (desktop) e à gaveta (mobile).
  const filterFields = (idPrefix: string) => (
    <div className="space-y-5">
      <div>
        <label className="field-label">Ordenar por</label>
        <StyledSelect
          value={sortBy}
          onChange={(v) => setSortBy(v as SortOption)}
          options={SORT_OPTIONS}
          searchable={false}
        />
      </div>

      <div>
        <span className="field-label">Faixa de custo</span>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            inputMode="decimal"
            aria-label="Custo mínimo"
            placeholder="Mín."
            value={filterMinPrice}
            onChange={(e) => setFilterMinPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
          />
          <Input
            type="number"
            inputMode="decimal"
            aria-label="Custo máximo"
            placeholder="Máx."
            value={filterMaxPrice}
            onChange={(e) => setFilterMaxPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
          />
        </div>
      </div>

      {categoriesToDisplay.length > 0 && (
        <fieldset>
          <legend className="field-label">Categorias</legend>
          <div className="space-y-1 max-h-[260px] overflow-y-auto scrollbar-thin -mx-1 px-1">
            {categoriesToDisplay.map(cat => (
              <label key={cat.id} htmlFor={`${idPrefix}-cat-${cat.id}`} className="flex items-center gap-2.5 h-8 cursor-pointer text-[13px] text-foreground">
                <input
                  id={`${idPrefix}-cat-${cat.id}`}
                  type="checkbox"
                  checked={filterCategories.includes(cat.id)}
                  onChange={() => toggleCategory(cat.id)}
                  className="w-4 h-4 rounded border-border accent-primary"
                />
                {cat.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="space-y-1">
        <legend className="field-label">Mais filtros</legend>
        <label className="flex items-center gap-2.5 h-8 cursor-pointer text-[13px] text-foreground">
          <input
            type="checkbox"
            checked={filterProfessional}
            onChange={(e) => setFilterProfessional(e.target.checked)}
            className="w-4 h-4 rounded border-border accent-primary"
          />
          Uso profissional
        </label>
        {!isGuest && (
          <label className="flex items-center gap-2.5 h-8 cursor-pointer text-[13px] text-foreground">
            <input
              type="checkbox"
              checked={filterOnlySuggested}
              onChange={(e) => setFilterOnlySuggested(e.target.checked)}
              className="w-4 h-4 rounded border-border accent-primary"
            />
            Com preço sugerido
          </label>
        )}
      </fieldset>
    </div>
  );

  return (
    <>
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Cabeçalho fixo. No mobile leva junto as categorias, para não
          depender de um `top-36` mágico que quebrava quando a altura mudava. */}
      <div className="sticky top-0 z-40 w-full bg-background/95 backdrop-blur border-b border-border">
        <header className="mx-auto max-w-7xl px-4 sm:px-6 py-2 sm:py-0 sm:h-16 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div className="flex items-center justify-between gap-2 sm:shrink-0">
            <div className="flex items-center gap-2.5 select-none">
              <img src={logo} alt="Rei dos Cachos" className="h-9 sm:h-10 w-auto flex-shrink-0" />
              <Badge variant="brand" className="hidden sm:inline-flex">Atacado</Badge>
            </div>

            {/* Ações no mobile */}
            <div className="flex items-center gap-0.5 sm:hidden">
              {isGuest ? (
                <>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/login">Entrar</Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link to="/cadastro">Criar conta</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCartOpen(true)}
                    aria-label={cartCount > 0 ? `Ver pedido (${cartCount} itens)` : 'Ver pedido'}
                    className={`relative ${cartBounce ? 'animate-bounce' : ''}`}
                  >
                    <ShoppingCart />
                    {cartCount > 0 && (
                      <span className={`${countBadge} bg-primary text-primary-foreground`}>{cartCount > 99 ? '99+' : cartCount}</span>
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setFiltersOpen(!filtersOpen)}
                    aria-label="Filtros"
                    className="relative"
                  >
                    <Filter />
                    {activeFiltersCount > 0 && (
                      <span className={`${countBadge} bg-foreground text-background`}>{activeFiltersCount}</span>
                    )}
                  </Button>

                  {role === 'admin' && (
                    <Button asChild variant="ghost" size="icon" aria-label="Painel admin">
                      <Link to="/admin/catalogo"><ShieldCheck /></Link>
                    </Button>
                  )}

                  {role === 'salao' && (
                    <Button asChild variant="ghost" size="icon" aria-label="Área do salão">
                      <Link to="/salao/pedido"><Crown /></Link>
                    </Button>
                  )}

                  <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Sair">
                    <LogOut />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Busca */}
          <div className="relative flex-1 w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto"
              aria-label="Buscar produto"
              className="pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Limpar busca"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-sm text-ink-400 hover:text-foreground hover:bg-muted"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Ações no desktop */}
          <div className="hidden sm:flex items-center gap-1.5 ml-auto shrink-0">
            {isGuest ? (
              <>
                <Button asChild variant="secondary">
                  <Link to="/login">Entrar</Link>
                </Button>
                <Button asChild>
                  <Link to="/cadastro">Criar conta</Link>
                </Button>
              </>
            ) : (
              <>
                {/* A gaveta de filtros só existe abaixo de lg; acima, a barra lateral. */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setFiltersOpen(!filtersOpen)}
                  aria-label="Filtros"
                  className="relative lg:hidden"
                >
                  <Filter />
                  {activeFiltersCount > 0 && (
                    <span className={`${countBadge} bg-foreground text-background`}>{activeFiltersCount}</span>
                  )}
                </Button>

                {role === 'admin' && (
                  <Button asChild variant="ghost">
                    <Link to="/admin/catalogo"><ShieldCheck />Admin</Link>
                  </Button>
                )}

                {role === 'salao' && (
                  <Button asChild variant="ghost">
                    <Link to="/salao/pedido"><Crown />Salão</Link>
                  </Button>
                )}

                <Button variant="ghost" onClick={handleLogout}>
                  <LogOut />
                  Sair
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => setCartOpen(true)}
                  className={`relative ${cartBounce ? 'animate-bounce' : ''}`}
                  aria-label={cartCount > 0 ? `Ver pedido (${cartCount} itens)` : 'Ver pedido'}
                >
                  <ShoppingCart />
                  Pedido
                  {cartCount > 0 && (
                    <span className="ml-0.5 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center leading-none numeric">
                      {cartCount > 99 ? '99+' : cartCount}
                    </span>
                  )}
                </Button>
              </>
            )}
          </div>
        </header>

        {/* Categorias no mobile, presas junto com o cabeçalho */}
        {showBrowse && categoriesToDisplay.length > 0 && (
          <div className="sm:hidden border-t border-border pt-2.5 pb-1">
            <CategoryBubbles
              categories={categoriesToDisplay}
              activeCategories={filterCategories}
              onToggleCategory={toggleCategory}
            />
          </div>
        )}
      </div>

      <RotatingTrustBanner />

      {/* Hero B2B — só no modo navegação */}
      {showBrowse && (
        <B2BHero
          onScrollToKits={scrollToKits}
          onScrollToProducts={scrollToProducts}
        />
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col lg:flex-row lg:gap-8">
        {/* Filtros (desktop) */}
        <aside className="hidden lg:block w-60 shrink-0 pt-8 pb-6" aria-label="Filtros">
          <div className="sticky top-24 rounded-lg border border-border bg-card shadow-xs">
            <div className="flex items-center justify-between gap-2 px-4 h-12 border-b border-border">
              <h2 className="text-[14px] font-semibold text-foreground tracking-tight">Filtros</h2>
              {activeFiltersCount > 0 && (
                <Button variant="ghost" size="xs" onClick={clearAllFilters} className="text-ink-500">
                  <Trash2 />
                  Limpar
                </Button>
              )}
            </div>
            <div className="p-4">{filterFields('side')}</div>
          </div>
        </aside>

        {/* Conteúdo */}
        <main className="flex-1 min-w-0 pt-6 sm:pt-8 pb-28 sm:pb-10">
          {/* Cabeçalho do modo busca / ver todos (no modo navegação o hero faz esse papel) */}
          {!showBrowse && (
            <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
              <div className="min-w-0">
                <h1 className="text-[26px] leading-tight text-foreground truncate">
                  {debouncedSearch ? `Resultados para “${debouncedSearch}”` : 'Todos os produtos'}
                </h1>
                <p className="text-[14px] text-muted-foreground mt-1 numeric">
                  {isLoading ? 'Carregando…' : `${filteredSortedByCategory.length} ${filteredSortedByCategory.length === 1 ? 'produto' : 'produtos'}`}
                </p>
              </div>
              {viewAll && !debouncedSearch && (
                <Button variant="secondary" onClick={() => setViewAll(false)}>
                  <X />
                  Voltar ao catálogo
                </Button>
              )}
            </div>
          )}

          {activeFiltersCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-5">
              {debouncedSearch && (
                <FilterChip label={`Busca: "${debouncedSearch.substring(0, 14)}${debouncedSearch.length > 14 ? '…' : ''}"`} onRemove={() => setSearch('')} />
              )}
              {filterMinPrice !== '' && (
                <FilterChip label={`≥ R$ ${filterMinPrice}`} onRemove={() => setFilterMinPrice('')} />
              )}
              {filterMaxPrice !== '' && (
                <FilterChip label={`≤ R$ ${filterMaxPrice}`} onRemove={() => setFilterMaxPrice('')} />
              )}
              {!isGuest && filterOnlySuggested && (
                <FilterChip label="Com sugestão" onRemove={() => setFilterOnlySuggested(false)} />
              )}
              {filterProfessional && (
                <FilterChip label="Uso profissional" onRemove={() => setFilterProfessional(false)} />
              )}
              {sortBy !== 'default' && (
                <FilterChip label={SORT_OPTIONS.find(o => o.value === sortBy)?.label ?? 'Ordenação'} onRemove={() => setSortBy('default')} />
              )}
              {filterCategories.map(catId => {
                const cat = categoriesToDisplay.find(c => c.id === catId);
                return cat ? <FilterChip key={catId} label={cat.name} onRemove={() => toggleCategory(catId)} /> : null;
              })}
              <Button variant="ghost" size="xs" onClick={clearAllFilters} className="text-ink-500">
                Limpar tudo
              </Button>
            </div>
          )}

          {/* Kits — uma seção só para todos os tamanhos (antes eram duas com o
              mesmo id, e no desktop o "Ver kits" rolava para a cópia oculta). */}
          {showBrowse && !isLoading && !error && products.length > 0 && !isPartner && (
            <section id="kits-section" className="mb-10 scroll-mt-40 sm:scroll-mt-24">
              <h2 className="text-[15px] font-semibold text-foreground tracking-tight mb-1">Kits mais vendidos</h2>
              <p className="text-[13px] text-muted-foreground mb-1">Pedido montado em um clique, com margem estimada.</p>
              <div className="-mx-4 sm:mx-0">
                <PackageCards products={products} isGuest={isGuest} isPartner={isPartner} />
              </div>
            </section>
          )}

          {/* Destaques (mobile) */}
          {showBrowse && !isLoading && !error && filtered.length > 0 && (
            <div className="sm:hidden -mx-4">
              <CompactProductCarousel
                title="Destaques para você"
                products={products.filter(p => p.is_highlight)}
                cartAddedId={addedId}
                getQty={getQty}
                setQty={setQty}
                onAdd={handleAddItem}
                onSelect={handleSelectProduct}
                getSuggestedPrice={getSuggestedPrice}
                isGuest={isGuest}
                isPartner={isPartner}
                onViewAll={() => setViewAll(true)}
              />
            </div>
          )}

          {showBrowse && <HowItWorks />}

          {/* Carregando */}
          {isLoading && <PageLoading label="Carregando catálogo…" />}

          {/* Erro */}
          {error && (
            <div role="alert" className="mb-6 p-4 rounded-lg bg-danger-subtle border border-danger-border text-danger">
              <p className="text-[13px] font-medium">Não foi possível carregar o catálogo</p>
              <p className="text-[12px] mt-0.5 opacity-80">
                {error instanceof Error ? error.message : 'Erro desconhecido'}. Recarregue a página; se persistir, fale com o vendedor pelo WhatsApp.
              </p>
            </div>
          )}

          {priceListError && !error && (
            <div role="status" className="mb-5 px-3.5 py-2.5 rounded-md bg-warning-subtle border border-warning-border text-warning text-[13px]">
              Não foi possível carregar sua tabela de preços. Os valores exibidos podem não refletir as suas condições.
            </div>
          )}

          {/* Produtos */}
          {!isLoading && !error && (
            <>
              {!showBrowse ? (
                /* MODO BUSCA / VER TODOS: grade plana, ordenada por categoria */
                filteredSortedByCategory.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 mb-8">
                    {filteredSortedByCategory.map(renderProductCard)}
                  </div>
                ) : emptyResults
              ) : (
                /* MODO NAVEGAÇÃO: carrosséis por categoria */
                <div id="produtos-section" className="scroll-mt-40 sm:scroll-mt-24">
                  {filtered.length > 0 && (
                    <h2 className="text-[15px] font-semibold text-foreground tracking-tight mb-1 mt-2">Produtos por categoria</h2>
                  )}
                  {filtered.length > 0 && (
                    <p className="text-[13px] text-muted-foreground mb-4">Monte o pedido com produtos avulsos.</p>
                  )}

                  <div className="flex flex-col mb-2 -mx-4 sm:mx-0">
                    {categoriesToDisplay.map(category => {
                      const categoryProducts = filtered.filter(p => p.category_id === category.id);
                      if (categoryProducts.length === 0) return null;
                      return (
                        <div
                          key={category.id}
                          id={`categoria-${category.name.toLowerCase().replace(/\s+/g, '-')}`}
                          className="w-full scroll-mt-40 sm:scroll-mt-24"
                        >
                          <CompactProductCarousel
                            title={category.name}
                            products={categoryProducts}
                            cartAddedId={addedId}
                            getQty={getQty}
                            setQty={setQty}
                            onAdd={handleAddItem}
                            onSelect={handleSelectProduct}
                            getSuggestedPrice={getSuggestedPrice}
                            isGuest={isGuest}
                            isPartner={isPartner}
                            onViewAll={() => setViewAll(true)}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {filtered.length === 0 && products.length > 0 && emptyResults}

                  {products.length === 0 && (
                    <div className="surface-card shadow-xs mb-8">
                      <EmptyState
                        icon={ShoppingCart}
                        title="Catálogo em atualização"
                        description="Nenhum produto disponível agora. Volte mais tarde ou fale com o vendedor pelo WhatsApp."
                      />
                    </div>
                  )}
                </div>
              )}

              <WhatsAppCTA />
            </>
          )}
        </main>

        {/* Gaveta de filtros (abaixo de lg) */}
        {filtersOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex justify-end" role="dialog" aria-modal="true" aria-label="Filtros">
            <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={() => setFiltersOpen(false)} />
            <div className="relative bg-background w-full sm:max-w-sm h-full flex flex-col border-l border-border shadow-xl">
              <div className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
                <h2 className="text-[15px] font-semibold text-foreground tracking-tight">Filtros</h2>
                <Button variant="ghost" size="icon-sm" onClick={() => setFiltersOpen(false)} aria-label="Fechar filtros">
                  <X />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">{filterFields('drawer')}</div>

              <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border flex gap-2 shrink-0">
                {activeFiltersCount > 0 && (
                  <Button variant="secondary" className="flex-1" onClick={clearAllFilters}>
                    Limpar
                  </Button>
                )}
                <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
                  Ver {filtered.length} {filtered.length === 1 ? 'produto' : 'produtos'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Detalhe do produto */}
        {selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={selectedProduct.name}>
            <div
              className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]"
              onClick={() => setSelectedProduct(null)}
            />
            <div className="relative bg-card rounded-t-xl sm:rounded-xl border border-border shadow-xl w-full sm:max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-[0.98] duration-150">
              <Button
                variant="secondary"
                size="icon-sm"
                onClick={() => setSelectedProduct(null)}
                aria-label="Fechar"
                className="absolute top-3 right-3 z-10 rounded-full"
              >
                <X />
              </Button>

              <div className="overflow-y-auto">
                {selectedProduct.main_image && (
                  <div className="w-full h-56 sm:h-64 bg-surface flex items-center justify-center">
                    <img
                      src={selectedProduct.main_image}
                      alt={selectedProduct.name}
                      loading="lazy"
                      className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal"
                    />
                  </div>
                )}

                <div className="p-4 sm:p-6">
                  <h2 className="text-[16px] font-semibold text-foreground tracking-tight leading-snug pr-8 mb-4">
                    {selectedProduct.name}
                  </h2>

                  {/* Preços: custo é o número principal; revenda, a referência */}
                  <div className="rounded-lg border border-border bg-surface p-3.5 mb-5">
                    {isGuest ? (
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-ink-400 flex-shrink-0" />
                        <span className="text-[13px] text-muted-foreground">
                          Preços visíveis após o cadastro gratuito.
                        </span>
                      </div>
                    ) : (
                      <dl className="grid grid-cols-2 gap-4">
                        <div>
                          <dt className="text-[12px] font-medium text-muted-foreground">Seu custo</dt>
                          <dd className="font-title text-[24px] font-semibold text-foreground numeric leading-tight mt-0.5">
                            R$ {(isPartner && selectedProduct.partner_price ? selectedProduct.partner_price : selectedProduct.price).toFixed(2)}
                          </dd>
                        </div>
                        {!selectedProduct.is_professional && (
                          <div className="border-l border-border pl-4">
                            <dt className="text-[12px] font-medium text-muted-foreground">Revenda sugerida</dt>
                            <dd className="text-[18px] font-semibold text-success numeric leading-tight mt-1">
                              R$ {getSuggestedPrice(isPartner && selectedProduct.partner_price ? selectedProduct.partner_price : selectedProduct.price, selectedProduct.compare_at_price).toFixed(2)}
                            </dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </div>

                  {selectedProduct.description_html && (
                    <div className="mb-5">
                      <h3 className="text-[13px] font-semibold text-foreground mb-1.5">Descrição</h3>
                      <div className="text-[13px] text-muted-foreground leading-relaxed prose prose-sm max-w-none dark:prose-invert">
                        <div
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(renderDescription(selectedProduct.description_html)),
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {!isGuest && (
                    <div className="mb-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[13px] font-semibold text-foreground">Quantidade</span>
                        <div className="flex gap-1">
                          {[6, 12, 24].map(n => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setQty(selectedProduct.id, n)}
                              aria-pressed={getQty(selectedProduct.id) === n}
                              className={`h-7 px-2.5 rounded-md border text-[12px] font-medium numeric transition-colors ${
                                getQty(selectedProduct.id) === n
                                  ? 'bg-brand-subtle border-brand-border text-brand-strong'
                                  : 'bg-card border-border text-ink-500 hover:border-ink-300 hover:text-foreground'
                              }`}
                            >
                              {n} un.
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          onClick={() => setQty(selectedProduct.id, getQty(selectedProduct.id) - 1)}
                          disabled={getQty(selectedProduct.id) <= 1}
                          aria-label="Diminuir quantidade"
                        >
                          <Minus />
                        </Button>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label="Quantidade"
                          value={getQty(selectedProduct.id)}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v)) setQty(selectedProduct.id, v);
                          }}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (isNaN(v) || v < 1) setQty(selectedProduct.id, 1);
                          }}
                          className="flex-1 min-w-0 h-10 text-center text-[16px] font-semibold text-foreground numeric border border-input rounded-md bg-background hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent transition-colors"
                        />
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          onClick={() => setQty(selectedProduct.id, getQty(selectedProduct.id) + 1)}
                          aria-label="Aumentar quantidade"
                        >
                          <Plus />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Ação fixa no rodapé do modal */}
              <div className="px-4 sm:px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border bg-card flex flex-col-reverse sm:flex-row gap-2 shrink-0">
                <Button variant="secondary" size="lg" className="sm:flex-1" onClick={() => setSelectedProduct(null)}>
                  Fechar
                </Button>
                {isGuest ? (
                  <Button asChild size="lg" className="sm:flex-[2]">
                    <Link to="/cadastro">
                      Cadastre-se para comprar
                      <ArrowRight />
                    </Link>
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    className={`sm:flex-[2] ${addedId === selectedProduct.id ? 'bg-success-subtle text-success border-success-border hover:bg-success-subtle' : ''}`}
                    onClick={() => {
                      handleAddItem(selectedProduct);
                      setSelectedProduct(null);
                    }}
                  >
                    {addedId === selectedProduct.id ? (
                      <><Check /> Adicionado</>
                    ) : (
                      <><ShoppingCart /> Adicionar ao pedido</>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <CartDrawer />
      </div>

      {/* Barra do pedido no mobile — mesmo padrão da barra de ação do
          checkout: total sempre visível + uma ação. */}
      {!isGuest && cartCount > 0 && !cartOpen && !selectedProduct && !filtersOpen && (
        <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background/95 backdrop-blur border-t border-border">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-muted-foreground numeric">
                {cartCount} {cartCount === 1 ? 'item' : 'itens'}
                {cartTotal < minOrderValue && ` · faltam R$ ${(minOrderValue - cartTotal).toFixed(2)}`}
              </p>
              <p className="text-[17px] font-semibold text-foreground numeric leading-tight">R$ {cartTotal.toFixed(2)}</p>
            </div>
            <Button size="lg" onClick={() => setCartOpen(true)} className="shrink-0">
              Ver pedido
              <ArrowRight />
            </Button>
          </div>
        </div>
      )}
    </div>

      {/* Progressive Profiling Popup */}
      {showProfilePopup && user?.id && (
        <ProfileCompletionModal
          userId={user.id}
          onClose={() => {
            setShowProfilePopup(false)
            sessionStorage.setItem(`rdc_popup_dismissed_${user.id}`, '1')
          }}
          onComplete={() => {
            setShowProfilePopup(false)
            // Mark all visits exhausted so it never shows again
            localStorage.setItem(`rdc_profile_visits_${user.id}`, '99')
          }}
        />
      )}
    </>
  );
};

export default Catalogo;
