import { useState, useEffect, useMemo } from "react";
import { ArrowRight, Check, Crown, Filter, LogOut, Search, ShoppingCart, Tag, TrendingUp, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { toast } from "sonner";
import logo from "@/assets/logo-rei-dos-cachos.png";
import { supabase } from "@/lib/supabase";
import { useCatalogProducts } from "@/hooks/useCatalogProducts";
import { useCart } from "@/contexts/CartContext";

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type SortOption = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'profit_desc';

const CATEGORIES = ['Kits', 'Ativador', 'Máscara', 'Shampoo', 'Finalizador', 'Tonalizante'] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  'Kits': ['kit'],
  'Ativador': ['ativador', 'ativa'],
  'Máscara': ['máscara', 'mascara', 'mask', 'hidratação', 'hidratacao'],
  'Shampoo': ['shampoo', 'xampu'],
  'Finalizador': ['finalizador', 'leave-in', 'leave in', 'sérum', 'serum', 'óleo', 'oleo'],
  'Tonalizante': ['tonalizante', 'tônico', 'tonico', 'matiz'],
};

const PROMO_SLIDES = [
  { id: 1, bg: 'from-amber-500 to-yellow-400', icon: '🚚', title: 'Frete grátis', sub: 'em pedidos acima de R$ 5.000' },
  { id: 2, bg: 'from-gold-start to-gold-end', icon: '🛒', title: 'Pedido mínimo', sub: 'R$ 500 para revendedores' },
  { id: 3, bg: 'from-emerald-500 to-green-400', icon: '💰', title: '10% Cashback', sub: 'em pedidos acima de R$ 3.000' },
];

// ============================================================================
// HELPERS
// ============================================================================

const getCategory = (name: string): Category | null => {
  const lower = name.toLowerCase();
  for (const cat of CATEGORIES) {
    if (CATEGORY_KEYWORDS[cat].some(kw => lower.includes(kw))) return cat;
  }
  return null;
};

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
  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gold-light text-gold-text border border-gold-border">
    {label}
    <button onClick={onRemove} className="ml-0.5 hover:text-red-500 transition-colors">
      <X className="w-3 h-3" />
    </button>
  </span>
);

const Catalogo = () => {
  const navigate = useNavigate();
  const { data: products = [], isLoading, error } = useCatalogProducts();
  const { items: cart, addItem, updateQty, removeItem, total: cartTotal, count: cartCount } = useCart();

  // ========================================================================
  // STATE
  // ========================================================================

  // Search and filters state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>('name_asc');
  const [filterMinPrice, setFilterMinPrice] = useState<number | ''>('');
  const [filterMaxPrice, setFilterMaxPrice] = useState<number | ''>('');
  const [filterOnlySuggested, setFilterOnlySuggested] = useState(false);
  const [filterCategories, setFilterCategories] = useState<Category[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Carousel state
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [carouselIndex, setCarouselIndex] = useState(0);

  // UI state
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<typeof products[0] | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [cartBounce, setCartBounce] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // ========================================================================
  // EFFECTS
  // ========================================================================

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Carousel autoplay
  useEffect(() => {
    if (!carouselApi) return;
    carouselApi.on('select', () => setCarouselIndex(carouselApi.selectedScrollSnap()));
    const interval = setInterval(() => carouselApi.scrollNext(), 5000);
    return () => clearInterval(interval);
  }, [carouselApi]);

  // ========================================================================
  // FILTERS & SORT
  // ========================================================================

  const toggleCategory = (cat: Category) =>
    setFilterCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );

  const clearAllFilters = () => {
    setSearch('');
    setSortBy('name_asc');
    setFilterMinPrice('');
    setFilterMaxPrice('');
    setFilterOnlySuggested(false);
    setFilterCategories([]);
  };

  const activeFiltersCount = [
    debouncedSearch !== '',
    filterMinPrice !== '',
    filterMaxPrice !== '',
    filterOnlySuggested,
    filterCategories.length > 0,
    sortBy !== 'name_asc',
  ].filter(Boolean).length;

  const filtered = useMemo(() => {
    let result = products.filter(p => {
      if (!p.name.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
      if (filterOnlySuggested && !p.compare_at_price) return false;
      if (filterMinPrice !== '' && p.price < filterMinPrice) return false;
      if (filterMaxPrice !== '' && p.price > filterMaxPrice) return false;
      if (filterCategories.length > 0) {
        const cat = getCategory(p.name);
        if (cat === null || !filterCategories.includes(cat)) return false;
      }
      return true;
    });

    switch (sortBy) {
      case 'name_asc':
        return result.sort((a, b) => a.name.localeCompare(b.name));
      case 'name_desc':
        return result.sort((a, b) => b.name.localeCompare(a.name));
      case 'price_asc':
        return result.sort((a, b) => a.price - b.price);
      case 'price_desc':
        return result.sort((a, b) => b.price - a.price);
      case 'profit_desc':
        return result.sort((a, b) => {
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
  }, [products, debouncedSearch, sortBy, filterMinPrice, filterMaxPrice, filterOnlySuggested, filterCategories]);

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
    const qty = getQty(product.id);
    const existing = cart.find(i => i.id === product.id);

    if (existing) {
      updateQty(product.id, existing.quantity + qty);
    } else {
      addItem({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.main_image,
      });
      if (qty > 1) {
        updateQty(product.id, qty);
      }
    }

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
    navigate("/", { replace: true });
  };

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div className="min-h-screen bg-surface-alt">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/">
            <img src={logo} alt="Rei dos Cachos" className="h-12 w-auto" />
          </Link>

          {/* Search */}
          <div className="flex-1 max-w-md hidden sm:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produtos..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-surface-alt text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold-border transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Filters Button (Mobile) */}
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="lg:hidden relative flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-white hover:border-gold-border transition-all text-sm"
              title="Filtros"
            >
              <Filter className="w-4 h-4" />
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Cart */}
            <button
              onClick={() => setCartOpen(true)}
              className={`relative flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-white hover:border-gold-border transition-all text-sm font-medium ${cartBounce ? 'animate-bounce' : ''}`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Pedido</span>
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full gradient-gold text-white text-[10px] font-bold flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-alt transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>

        {/* Mobile search */}
        <div className="sm:hidden px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produtos..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-white text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </div>
        </div>
      </header>

      <div className="flex lg:gap-6">
        {/* Sidebar Filters (Desktop) */}
        <aside className="hidden lg:block w-64 px-4 pt-8 pb-8">
          <div className="sticky top-24 bg-white rounded-2xl p-5 border border-border">
            <h3 className="font-bold text-foreground mb-4">Filtros</h3>

            {/* Sort */}
            <div className="mb-5 pb-5 border-b border-border">
              <label className="text-xs font-semibold text-muted-foreground mb-2 block">Ordenar por</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold"
              >
                <option value="name_asc">Nome (A-Z)</option>
                <option value="name_desc">Nome (Z-A)</option>
                <option value="price_asc">Menor custo</option>
                <option value="price_desc">Maior custo</option>
                <option value="profit_desc">Maior lucro</option>
              </select>
            </div>

            {/* Price Range */}
            <div className="mb-5 pb-5 border-b border-border">
              <label className="text-xs font-semibold text-muted-foreground mb-2 block">Faixa de custo</label>
              <div className="space-y-2">
                <input
                  type="number"
                  placeholder="Mín"
                  value={filterMinPrice}
                  onChange={(e) => setFilterMinPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold"
                />
                <input
                  type="number"
                  placeholder="Máx"
                  value={filterMaxPrice}
                  onChange={(e) => setFilterMaxPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold"
                />
              </div>
            </div>

            {/* Categories */}
            <div className="mb-5 pb-5 border-b border-border">
              <label className="text-xs font-semibold text-muted-foreground mb-2 block">Categorias</label>
              <div className="space-y-1.5">
                {CATEGORIES.map(cat => (
                  <label key={cat} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterCategories.includes(cat)}
                      onChange={() => toggleCategory(cat)}
                      className="w-4 h-4 rounded border-border text-gold focus:ring-gold"
                    />
                    <span className="text-sm text-foreground">{cat}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Suggested Price Only */}
            <div className="mb-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterOnlySuggested}
                  onChange={(e) => setFilterOnlySuggested(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-gold focus:ring-gold"
                />
                <span className="text-sm text-foreground font-medium">Somente com preço sugerido</span>
              </label>
            </div>

            {/* Clear filters */}
            {activeFiltersCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="w-full px-3 py-2 rounded-lg bg-surface-alt text-sm font-medium text-foreground hover:bg-border transition-colors"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 px-4 sm:px-6 py-8">
          {/* Page Header */}
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gold-border bg-gold-light mb-3">
              <Crown className="w-3.5 h-3.5 text-gold-text" />
              <span className="text-xs font-semibold text-gold-text tracking-widest uppercase">Preços Exclusivos para Revendedores</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Catálogo Completo</h1>
            <p className="text-muted-foreground mt-1">{isLoading ? "Carregando..." : `${filtered.length} produtos disponíveis`}</p>
          </div>

          {/* Promo Banner */}
          {!isLoading && !error && (
            <div className="mb-6 rounded-2xl overflow-hidden">
              <Carousel setApi={setCarouselApi} opts={{ loop: true }}>
                <CarouselContent>
                  {PROMO_SLIDES.map(slide => (
                    <CarouselItem key={slide.id}>
                      <div className={`bg-gradient-to-r ${slide.bg} h-28 sm:h-32 flex items-center justify-center gap-4 px-6 rounded-2xl`}>
                        <span className="text-4xl">{slide.icon}</span>
                        <div className="text-white">
                          <div className="font-bold text-lg sm:text-xl">{slide.title}</div>
                          <div className="text-sm opacity-90">{slide.sub}</div>
                        </div>
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </Carousel>
              {/* Dots */}
              <div className="flex justify-center gap-1.5 mt-2">
                {PROMO_SLIDES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => carouselApi?.scrollTo(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${carouselIndex === i ? 'bg-gold w-3' : 'bg-border'}`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Active Filter Chips */}
          {activeFiltersCount > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {debouncedSearch && (
                <FilterChip label={`Busca: "${debouncedSearch}"`} onRemove={() => setSearch('')} />
              )}
              {filterMinPrice !== '' && (
                <FilterChip label={`Custo ≥ R$ ${filterMinPrice}`} onRemove={() => setFilterMinPrice('')} />
              )}
              {filterMaxPrice !== '' && (
                <FilterChip label={`Custo ≤ R$ ${filterMaxPrice}`} onRemove={() => setFilterMaxPrice('')} />
              )}
              {filterOnlySuggested && (
                <FilterChip label="Com preço sugerido" onRemove={() => setFilterOnlySuggested(false)} />
              )}
              {filterCategories.map(cat => (
                <FilterChip key={cat} label={cat} onRemove={() => toggleCategory(cat)} />
              ))}
              <button
                onClick={clearAllFilters}
                className="text-xs text-muted-foreground hover:text-red-500 underline ml-1 transition-colors"
              >
                Limpar tudo
              </button>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Carregando catálogo...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
              <p className="font-medium">Erro ao carregar catálogo</p>
              <p className="text-sm">{error instanceof Error ? error.message : 'Desconhecido'}</p>
            </div>
          )}

          {/* Products Grid */}
          {!isLoading && !error && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {filtered.map((product) => {
                  const suggested = getSuggestedPrice(product.price, product.compare_at_price);
                  const profit = product.price > 0
                    ? Math.round(((suggested - product.price) / product.price) * 100)
                    : null;

                  return (
                    <div
                      key={product.id}
                      className="group bg-white rounded-2xl overflow-hidden border border-border hover:border-gold-border shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1 flex flex-col"
                    >
                      {/* Image */}
                      <div className="relative bg-surface-alt h-44 overflow-hidden flex-shrink-0">
                        {product.main_image ? (
                          <img
                            src={product.main_image}
                            alt={product.name}
                            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-surface-alt to-border">
                            <ShoppingCart className="w-12 h-12 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>

                      {/* Body */}
                      <div className="p-4 flex flex-col flex-1">
                        <h3 className="font-semibold text-foreground text-sm mb-3 leading-snug line-clamp-2 min-h-[2.5rem]">
                          {product.name}
                        </h3>

                        {/* Pricing */}
                        <div className="bg-surface-alt rounded-xl p-3 mb-3">
                          <div className="text-[10px] text-muted-foreground mb-1.5">Custo</div>
                          <div className="text-base font-bold text-foreground mb-2">R$ {product.price.toFixed(2)}</div>
                          <div className="border-t border-border pt-2">
                            <div className="text-[10px] text-muted-foreground mb-0.5">Venda sugerida</div>
                            <div className="text-base font-bold gradient-gold-text mb-1.5">R$ {suggested.toFixed(2)}</div>
                            {profit && (
                              <div className="flex items-center gap-1 pt-1.5 border-t border-border">
                                <TrendingUp className="w-3 h-3 text-green-600" />
                                <span className="text-[10px] font-semibold text-green-600">Lucro s/ custo +{profit}%</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Spacer */}
                        <div className="flex-1" />

                        {/* Quantity Control */}
                        <div className="flex items-center gap-2 mb-3">
                          <button
                            onClick={() => setQty(product.id, getQty(product.id) - 1)}
                            disabled={getQty(product.id) <= 1}
                            className="w-11 h-11 flex items-center justify-center rounded-lg border border-border bg-white text-muted-foreground hover:bg-surface-alt transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Diminuir quantidade"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-sm font-semibold text-foreground">
                            {getQty(product.id)}
                          </span>
                          <button
                            onClick={() => setQty(product.id, getQty(product.id) + 1)}
                            className="w-11 h-11 flex items-center justify-center rounded-lg border border-border bg-white text-muted-foreground hover:bg-surface-alt transition-colors"
                            aria-label="Aumentar quantidade"
                          >
                            +
                          </button>
                        </div>

                        <div className="space-y-2">
                          <button
                            onClick={() => handleAddItem(product)}
                            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-all ${
                              addedId === product.id
                                ? 'bg-green-600'
                                : 'btn-gold'
                            }`}
                          >
                            {addedId === product.id ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                Adicionado!
                              </>
                            ) : (
                              <>
                                <ShoppingCart className="w-3.5 h-3.5" />
                                Adicionar
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => setSelectedProduct(product)}
                            className="w-full px-4 py-2 rounded-lg text-sm font-medium border border-border bg-white text-foreground hover:bg-surface-alt transition-colors"
                          >
                            Ver detalhes
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filtered.length === 0 && products.length > 0 && (
                <div className="text-center py-16">
                  <Tag className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum produto encontrado</h3>
                  <p className="text-muted-foreground text-sm">Tente outro termo de busca ou ajuste os filtros.</p>
                </div>
              )}

              {products.length === 0 && (
                <div className="text-center py-16">
                  <ShoppingCart className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">Catálogo vazio</h3>
                  <p className="text-muted-foreground text-sm">Volte mais tarde para ver os produtos.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile Filters Drawer */}
      {filtersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex justify-end">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setFiltersOpen(false)} />
          <div className="relative bg-white w-full max-w-sm h-full flex flex-col shadow-2xl overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-white">
              <h2 className="font-bold text-foreground text-lg">Filtros</h2>
              <button onClick={() => setFiltersOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 p-5 space-y-5">
              {/* Sort */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">Ordenar por</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold"
                >
                  <option value="name_asc">Nome (A-Z)</option>
                  <option value="name_desc">Nome (Z-A)</option>
                  <option value="price_asc">Menor custo</option>
                  <option value="price_desc">Maior custo</option>
                  <option value="profit_desc">Maior lucro</option>
                </select>
              </div>

              {/* Price Range */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">Faixa de custo</label>
                <div className="space-y-2">
                  <input
                    type="number"
                    placeholder="Mín"
                    value={filterMinPrice}
                    onChange={(e) => setFilterMinPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold"
                  />
                  <input
                    type="number"
                    placeholder="Máx"
                    value={filterMaxPrice}
                    onChange={(e) => setFilterMaxPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold"
                  />
                </div>
              </div>

              {/* Categories */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">Categorias</label>
                <div className="space-y-1.5">
                  {CATEGORIES.map(cat => (
                    <label key={cat} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterCategories.includes(cat)}
                        onChange={() => toggleCategory(cat)}
                        className="w-4 h-4 rounded border-border text-gold focus:ring-gold"
                      />
                      <span className="text-sm text-foreground">{cat}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Suggested Price Only */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterOnlySuggested}
                  onChange={(e) => setFilterOnlySuggested(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-gold focus:ring-gold"
                />
                <span className="text-sm text-foreground font-medium">Somente com preço sugerido</span>
              </label>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-border space-y-2">
              {activeFiltersCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="w-full px-3 py-2 rounded-lg bg-surface-alt text-sm font-medium text-foreground hover:bg-border transition-colors"
                >
                  Limpar filtros
                </button>
              )}
              <button
                onClick={() => setFiltersOpen(false)}
                className="w-full px-3 py-2.5 rounded-lg btn-gold text-white text-sm font-semibold"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setSelectedProduct(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            {/* Close button */}
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute top-4 right-4 z-10 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Image */}
            {selectedProduct.main_image && (
              <div className="w-full h-48 bg-surface-alt overflow-hidden">
                <img
                  src={selectedProduct.main_image}
                  alt={selectedProduct.name}
                  className="w-full h-full object-contain"
                />
              </div>
            )}

            {/* Content */}
            <div className="p-6">
              <h2 className="text-xl font-bold text-foreground mb-3">
                {selectedProduct.name}
              </h2>

              {/* Pricing */}
              {selectedProduct.description_html && (
                <div className="bg-surface-alt rounded-xl p-4 mb-4">
                  <div className="text-xs text-muted-foreground mb-1">Custo</div>
                  <div className="text-lg font-bold text-foreground mb-3">
                    R$ {selectedProduct.price.toFixed(2)}
                  </div>
                  <div className="border-t border-border pt-3">
                    <div className="text-xs text-muted-foreground mb-1">Venda sugerida</div>
                    <div className="text-lg font-bold gradient-gold-text">
                      R$ {getSuggestedPrice(selectedProduct.price, selectedProduct.compare_at_price).toFixed(2)}
                    </div>
                  </div>
                </div>
              )}

              {/* Description */}
              {selectedProduct.description_html && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-foreground mb-2">
                    Descrição
                  </h3>
                  <div className="text-sm text-muted-foreground prose prose-sm max-w-none">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: renderDescription(selectedProduct.description_html),
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Quantity Control */}
              <div className="flex items-center justify-center gap-3 mb-4 px-3 py-2 bg-surface-alt rounded-lg">
                <button
                  onClick={() => setQty(selectedProduct.id, getQty(selectedProduct.id) - 1)}
                  disabled={getQty(selectedProduct.id) <= 1}
                  className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-lg"
                >
                  −
                </button>
                <span className="text-lg font-semibold text-foreground min-w-[2rem] text-center">{getQty(selectedProduct.id)}</span>
                <button
                  onClick={() => setQty(selectedProduct.id, getQty(selectedProduct.id) + 1)}
                  className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white rounded transition-colors text-lg"
                >
                  +
                </button>
              </div>

              {/* Action buttons */}
              <div className="space-y-2">
                <button
                  onClick={() => {
                    handleAddItem(selectedProduct);
                    setSelectedProduct(null);
                  }}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold text-white transition-all ${
                    addedId === selectedProduct.id
                      ? 'bg-green-600'
                      : 'btn-gold'
                  }`}
                >
                  {addedId === selectedProduct.id ? (
                    <>
                      <Check className="w-4 h-4" />
                      Adicionado!
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-4 h-4" />
                      Adicionar ao Pedido
                    </>
                  )}
                </button>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="w-full px-4 py-2 rounded-lg text-sm font-medium border border-border bg-white text-foreground hover:bg-surface-alt transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <div className="relative bg-white w-full max-w-sm h-full flex flex-col shadow-2xl">
            {/* Cart Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-gold-text" />
                <h2 className="font-bold text-foreground text-lg">Meu Pedido</h2>
              </div>
              <button onClick={() => setCartOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-5">
              {cart.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Nenhum item adicionado ainda.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {cart.map((item) => (
                    <div key={item.id} className="flex gap-3 bg-surface-alt rounded-xl p-3">
                      {/* Thumbnail */}
                      {item.image && (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-10 h-10 rounded object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity}x · R$ {(item.price * item.quantity).toFixed(2)}
                        </p>
                      </div>
                      <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {cart.length > 0 && (
              <div className="p-5 border-t border-border">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-semibold text-foreground">Total do Pedido</span>
                  <span className="text-xl font-bold gradient-gold-text">R$ {cartTotal.toFixed(2)}</span>
                </div>
                <button
                  onClick={() => {
                    setCartOpen(false);
                    navigate('/checkout');
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-base btn-gold text-white"
                >
                  Finalizar Pedido
                  <ArrowRight className="w-4 h-4" />
                </button>
                {cartTotal < 300 && (
                  <p className="text-xs text-center text-muted-foreground mt-2">
                    ⚠️ Pedido mínimo: R$ 300 (faltam R$ {(300 - cartTotal).toFixed(2)})
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Catalogo;
