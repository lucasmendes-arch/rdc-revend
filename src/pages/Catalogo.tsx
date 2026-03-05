import { useState, useEffect, useMemo } from "react";
import { ArrowRight, Check, Crown, Filter, LogOut, Search, ShoppingCart, Tag, Trash2, TrendingUp, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import PackageCards from "@/components/catalog/PackageCards";
import { toast } from "sonner";
import logo from "@/assets/logo-rei-dos-cachos.png";
import { supabase } from "@/lib/supabase";
import { useCatalogProducts } from "@/hooks/useCatalogProducts";
import { useCart } from "@/contexts/CartContext";
import { useTrackPageView, useTrackAddToCart } from "@/hooks/useSessionTracking";

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
  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-gold-light text-gold-text border border-gold-border whitespace-nowrap">
    {label}
    <button onClick={onRemove} className="ml-0.5 hover:text-red-500 transition-colors">
      <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
    </button>
  </span>
);

const Catalogo = () => {
  const navigate = useNavigate();
  const { data: products = [], isLoading, error } = useCatalogProducts();
  const { items: cart, addItem, updateQty, removeItem, clearCart, total: cartTotal, count: cartCount } = useCart();
  useTrackPageView('Catálogo');
  const trackAddToCart = useTrackAddToCart();

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
  const [filterProfessional, setFilterProfessional] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

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
    setFilterProfessional(false);
  };

  const activeFiltersCount = [
    debouncedSearch !== '',
    filterMinPrice !== '',
    filterMaxPrice !== '',
    filterOnlySuggested,
    filterCategories.length > 0,
    filterProfessional,
    sortBy !== 'name_asc',
  ].filter(Boolean).length;

  const filtered = useMemo(() => {
    let result = products.filter(p => {
      if (!p.name.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
      if (filterProfessional && !p.is_professional) return false;
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
  }, [products, debouncedSearch, sortBy, filterMinPrice, filterMaxPrice, filterOnlySuggested, filterCategories, filterProfessional]);

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

    // Track add to cart
    trackAddToCart(cartCount + qty);

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
    <div className="min-h-screen bg-surface-alt overflow-x-hidden">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          <Link to="/">
            <img src={logo} alt="Rei dos Cachos" className="h-10 sm:h-12 w-auto flex-shrink-0" />
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
        <div className="sm:hidden px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border bg-white text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </div>
        </div>

        {/* Category chips — mobile only */}
        <div className="sm:hidden overflow-x-auto flex gap-1.5 px-3 pb-2 scrollbar-none">
          <button
            onClick={() => setFilterCategories([])}
            aria-pressed={filterCategories.length === 0}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterCategories.length === 0
              ? 'bg-gold-light border-gold-border text-gold-text'
              : 'bg-white border-border text-muted-foreground'
              }`}
          >
            Todos
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              aria-pressed={filterCategories.includes(cat)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterCategories.includes(cat)
                ? 'bg-gold-light border-gold-border text-gold-text'
                : 'bg-white border-border text-muted-foreground'
                }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      <div className="flex lg:gap-6 w-full overflow-hidden max-w-[100vw]">
        {/* Sidebar Filters (Desktop) */}
        <aside className="hidden lg:block w-60 px-3 pt-6 pb-6">
          <div className="sticky top-24 bg-white rounded-2xl p-4 border border-border">
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

            {/* Uso Profissional */}
            <div className="mb-5 pb-5 border-b border-border">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterProfessional}
                  onChange={(e) => setFilterProfessional(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-gold focus:ring-gold"
                />
                <span className="text-sm text-foreground font-medium">Uso Profissional</span>
              </label>
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
        <div className="flex-1 min-w-0 px-3 sm:px-4 lg:px-6 py-4 sm:py-6 relative z-0">
          {/* Page Header */}
          <div className="mb-3">
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gold-border bg-gold-light mb-1">
              <Crown className="w-2.5 h-2.5 text-gold-text" />
              <span className="text-[9px] sm:text-xs font-semibold text-gold-text tracking-wide uppercase">B2B</span>
            </div>
            <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold text-foreground leading-tight">Catálogo</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0">{isLoading ? "Carregando..." : `${filtered.length} produtos`}</p>
          </div>

          {/* Package Cards */}
          {!isLoading && !error && products.length > 0 && (
            <PackageCards products={products} />
          )}

          {/* Active Filter Chips */}
          {activeFiltersCount > 0 && (
            <div className="flex flex-wrap gap-1 mb-2.5">
              {debouncedSearch && (
                <FilterChip label={`Busca: "${debouncedSearch.substring(0, 10)}${debouncedSearch.length > 10 ? '...' : ''}"`} onRemove={() => setSearch('')} />
              )}
              {filterMinPrice !== '' && (
                <FilterChip label={`≥ R$ ${filterMinPrice}`} onRemove={() => setFilterMinPrice('')} />
              )}
              {filterMaxPrice !== '' && (
                <FilterChip label={`≤ R$ ${filterMaxPrice}`} onRemove={() => setFilterMaxPrice('')} />
              )}
              {filterOnlySuggested && (
                <FilterChip label="C/ sugestão" onRemove={() => setFilterOnlySuggested(false)} />
              )}
              {filterProfessional && (
                <FilterChip label="Uso Profissional" onRemove={() => setFilterProfessional(false)} />
              )}
              {filterCategories.map(cat => (
                <FilterChip key={cat} label={cat} onRemove={() => toggleCategory(cat)} />
              ))}
              <button
                onClick={clearAllFilters}
                className="text-[10px] sm:text-xs text-muted-foreground hover:text-red-500 underline ml-0.5 transition-colors"
              >
                Limpar
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
              {/* Mobile: continuous list card | Desktop: grid */}
              <div className="bg-white rounded-xl border border-border sm:bg-transparent sm:border-0 sm:rounded-none">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-0 sm:gap-2.5">
                  {filtered.map((product, idx) => {
                    const suggested = getSuggestedPrice(product.price, product.compare_at_price);
                    const profit = product.price > 0
                      ? Math.round(((suggested - product.price) / product.price) * 100)
                      : null;

                    return (
                      <div
                        key={product.id}
                        className={`group bg-white overflow-hidden transition-all duration-300 flex
                          flex-row sm:flex-col
                          ${idx < filtered.length - 1 ? 'border-b border-border sm:border-b-0' : ''}
                          sm:rounded-xl sm:border sm:shadow-card sm:hover:shadow-card-hover sm:hover:border-gold-border sm:hover:-translate-y-0.5`}
                      >
                        {/* Image — thumbnail on mobile, full on desktop */}
                        <div
                          className="relative bg-surface-alt overflow-hidden flex-shrink-0 flex items-center justify-center cursor-pointer
                            w-20 h-20 m-2 rounded-lg
                            sm:w-full sm:h-44 lg:h-48 sm:m-0 sm:rounded-none"
                          onClick={() => setSelectedProduct(product)}
                        >
                          {product.main_image ? (
                            <img
                              src={product.main_image}
                              alt={product.name}
                              className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <ShoppingCart className="w-8 sm:w-9 h-8 sm:h-9 text-muted-foreground/25" />
                          )}
                        </div>

                        {/* Body */}
                        <div className="flex-1 p-2 sm:p-3 lg:p-4 flex flex-col min-w-0">
                          <h3 className="font-semibold text-foreground text-xs sm:text-sm mb-1 leading-tight line-clamp-2">
                            {product.name}
                          </h3>

                          {product.is_professional && (
                            <span className="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold bg-purple-100 text-purple-700 border border-purple-200 mb-1">
                              Uso Profissional
                            </span>
                          )}

                          {product.is_professional ? (
                            <div className="mb-1 text-[9px] sm:text-[10px]">
                              <div className="text-muted-foreground">Preço</div>
                              <div className="text-xs sm:text-sm font-bold text-foreground">R$ {product.price.toFixed(2)}</div>
                            </div>
                          ) : (
                            <>
                              {/* Desktop: 2 columns pricing */}
                              <div className="hidden sm:grid grid-cols-2 gap-2 mb-1.5 text-[10px]">
                                <div>
                                  <div className="text-muted-foreground">Custo</div>
                                  <div className="text-sm font-bold text-foreground">R$ {product.price.toFixed(2)}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">Preço de Venda (Sugerido)</div>
                                  <div className="text-sm font-bold gradient-gold-text">R$ {suggested.toFixed(2)}</div>
                                </div>
                              </div>

                              {/* Mobile: inline cost + profit badge */}
                              <div className="sm:hidden text-[10px] mb-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-muted-foreground">Custo</span>
                                  <span className="text-xs font-bold text-foreground">R$ {product.price.toFixed(2)}</span>
                                  {profit && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-50 border border-green-200 text-[9px] font-semibold text-green-700">
                                      +{profit}%
                                    </span>
                                  )}
                                </div>
                                <div className="text-muted-foreground mt-0.5">
                                  Preço de Venda (Sugerido) <span className="text-xs font-bold gradient-gold-text">R$ {suggested.toFixed(2)}</span>
                                </div>
                              </div>

                              {/* Desktop: profit line */}
                              {profit && (
                                <div className="hidden sm:flex items-center gap-0.5 mb-1.5 pb-1 border-b border-border">
                                  <TrendingUp className="w-2.5 h-2.5 text-green-600" />
                                  <span className="text-[9px] font-semibold text-green-600">Lucro +{profit}%</span>
                                </div>
                              )}
                            </>
                          )}

                          {/* Spacer — desktop only */}
                          <div className="hidden sm:block flex-1 min-h-1" />

                          <div className="mt-auto pt-2 sm:pt-1 flex flex-col gap-2.5 w-full overflow-hidden">
                            {/* Quantity Controls */}
                            <div className="flex items-center justify-start gap-2 w-full">
                              <span className="text-[11px] font-medium text-muted-foreground mr-1">Qtd:</span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setQty(product.id, getQty(product.id) - 1)}
                                  disabled={getQty(product.id) <= 1}
                                  className="w-8 h-8 flex items-center justify-center rounded border border-border bg-white text-muted-foreground hover:bg-surface-alt transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
                                  aria-label="Diminuir"
                                >
                                  −
                                </button>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  aria-label="Quantidade"
                                  value={getQty(product.id)}
                                  onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    if (!isNaN(v)) setQty(product.id, v);
                                  }}
                                  onBlur={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    if (isNaN(v) || v < 1) setQty(product.id, 1);
                                  }}
                                  className="w-10 h-8 text-center text-xs font-bold text-foreground border border-border rounded bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                                />
                                <button
                                  onClick={() => setQty(product.id, getQty(product.id) + 1)}
                                  className="w-8 h-8 flex items-center justify-center rounded border border-border bg-white text-muted-foreground hover:bg-surface-alt transition-colors text-sm font-medium"
                                  aria-label="Aumentar"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* Buy Button */}
                            <button
                              onClick={() => handleAddItem(product)}
                              className={`w-full flex items-center justify-center gap-1.5 h-9 sm:h-10 rounded-lg text-xs font-bold text-white transition-all uppercase tracking-wide ${addedId === product.id
                                ? 'bg-green-600'
                                : 'btn-gold'
                                }`}
                            >
                              {addedId === product.id ? (
                                <>
                                  <Check className="w-4 h-4" />
                                  <span>Adicionado</span>
                                </>
                              ) : (
                                <>
                                  <ShoppingCart className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                                  <span>Comprar</span>
                                </>
                              )}
                            </button>
                          </div>

                          <button
                            onClick={() => setSelectedProduct(product)}
                            className="hidden sm:block w-full px-2 py-1 rounded text-xs font-medium text-gold-text hover:underline transition-colors mt-1"
                          >
                            Ver detalhes →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
          <div className="relative bg-white w-full sm:max-w-sm h-full flex flex-col shadow-2xl overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border sticky top-0 bg-white">
              <h2 className="font-bold text-foreground text-base sm:text-lg">Filtros</h2>
              <button onClick={() => setFiltersOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 p-3 sm:p-4 space-y-3 sm:space-y-4">
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

              {/* Uso Profissional */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterProfessional}
                  onChange={(e) => setFilterProfessional(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-gold focus:ring-gold"
                />
                <span className="text-sm text-foreground font-medium">Uso Profissional</span>
              </label>

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
            <div className="p-3 sm:p-4 border-t border-border space-y-1.5 sm:space-y-2">
              {activeFiltersCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="w-full px-2 sm:px-3 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-medium text-foreground bg-surface-alt hover:bg-border transition-colors"
                >
                  Limpar
                </button>
              )}
              <button
                onClick={() => setFiltersOpen(false)}
                className="w-full px-2 sm:px-3 py-2 sm:py-2.5 rounded btn-gold text-white text-xs sm:text-sm font-semibold"
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
          <div className="relative bg-white rounded-lg sm:rounded-2xl shadow-lg w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            {/* Close button */}
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute top-3 sm:top-4 right-3 sm:right-4 z-10 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Image */}
            {selectedProduct.main_image && (
              <div className="w-full h-40 sm:h-48 bg-surface-alt overflow-hidden">
                <img
                  src={selectedProduct.main_image}
                  alt={selectedProduct.name}
                  className="w-full h-full object-contain"
                />
              </div>
            )}

            {/* Content */}
            <div className="p-3 sm:p-6">
              <h2 className="text-base sm:text-xl font-bold text-foreground mb-2 sm:mb-3">
                {selectedProduct.name}
              </h2>

              {/* Pricing */}
              {selectedProduct.description_html && (
                <div className="bg-surface-alt rounded-lg sm:rounded-xl p-3 sm:p-4 mb-3 sm:mb-4 text-xs sm:text-sm">
                  <div className="text-muted-foreground mb-0.5">Custo</div>
                  <div className="text-base sm:text-lg font-bold text-foreground mb-2">
                    R$ {selectedProduct.price.toFixed(2)}
                  </div>
                  <div className="border-t border-border pt-2">
                    <div className="text-muted-foreground mb-0.5">Preço de Venda (Sugerido)</div>
                    <div className="text-base sm:text-lg font-bold gradient-gold-text">
                      R$ {getSuggestedPrice(selectedProduct.price, selectedProduct.compare_at_price).toFixed(2)}
                    </div>
                  </div>
                </div>
              )}

              {/* Description */}
              {selectedProduct.description_html && (
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-xs sm:text-sm font-semibold text-foreground mb-1.5 sm:mb-2">
                    Descrição
                  </h3>
                  <div className="text-xs sm:text-sm text-muted-foreground prose prose-sm max-w-none">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: renderDescription(selectedProduct.description_html),
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Quantity Control */}
              <div className="flex items-center justify-center gap-2 mb-3 px-2 py-1.5 sm:py-2 bg-surface-alt rounded">
                <button
                  onClick={() => setQty(selectedProduct.id, getQty(selectedProduct.id) - 1)}
                  disabled={getQty(selectedProduct.id) <= 1}
                  className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                >
                  −
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={getQty(selectedProduct.id)}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) setQty(selectedProduct.id, v);
                  }}
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (isNaN(v) || v < 1) setQty(selectedProduct.id, 1);
                  }}
                  className="w-10 text-center text-sm font-semibold text-foreground border border-border rounded bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                />
                <button
                  onClick={() => setQty(selectedProduct.id, getQty(selectedProduct.id) + 1)}
                  className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white rounded transition-colors text-sm"
                >
                  +
                </button>
              </div>

              {/* Action buttons */}
              <div className="space-y-1.5 sm:space-y-2">
                <button
                  onClick={() => {
                    handleAddItem(selectedProduct);
                    setSelectedProduct(null);
                  }}
                  className={`w-full flex items-center justify-center gap-1.5 py-2 sm:py-3 rounded text-xs sm:text-sm font-semibold text-white transition-all ${addedId === selectedProduct.id
                    ? 'bg-green-600'
                    : 'btn-gold'
                    }`}
                >
                  {addedId === selectedProduct.id ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Adicionado!
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-3.5 h-3.5" />
                      ADICIONAR AO PEDIDO
                    </>
                  )}
                </button>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="w-full px-3 sm:px-4 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-medium border border-border bg-white text-foreground hover:bg-surface-alt transition-colors"
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
          <div className="relative bg-white w-full sm:max-w-sm h-full flex flex-col shadow-2xl">
            {/* Cart Header */}
            <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-gold-text" />
                <h2 className="font-bold text-foreground text-lg">Meu Pedido</h2>
                {cart.length > 0 && (
                  <span className="text-xs text-muted-foreground">({cartCount} itens)</span>
                )}
              </div>
              <button onClick={() => setCartOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-3">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <ShoppingCart className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">Nenhum item adicionado ainda.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 bg-surface-alt rounded-lg p-3">
                      {item.image && (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">{item.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">{item.quantity}x</span>
                          <span className="text-sm font-semibold text-foreground">R$ {(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                      </div>
                      <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0 p-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {cart.length > 0 && (
              <div className="p-4 border-t border-border flex-shrink-0 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground text-base">Total</span>
                  <span className="text-xl font-bold gradient-gold-text">R$ {cartTotal.toFixed(2)}</span>
                </div>

                {cartTotal < 500 && (
                  <p className="text-xs text-center text-amber-600 bg-amber-50 rounded-lg py-1.5 px-2">
                    Mínimo: R$ 500 (faltam R$ {(500 - cartTotal).toFixed(2)})
                  </p>
                )}

                <button
                  onClick={() => {
                    setCartOpen(false);
                    navigate('/checkout');
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl font-semibold text-sm btn-gold text-white"
                >
                  Finalizar Pedido
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    clearCart();
                    toast('Carrinho limpo');
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors border border-red-200"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Limpar Carrinho
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Catalogo;
