import { useState, useEffect, useMemo } from "react";
import DOMPurify from "dompurify";
import { ArrowRight, Check, Crown, Filter, LogOut, Search, ShoppingCart, Tag, Trash2, TrendingUp, X, PackageSearch, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import PackageCards from "@/components/catalog/PackageCards";
import PromoBanner from "@/components/catalog/PromoBanner";
import CategoryBubbles from "@/components/catalog/CategoryBubbles";
import CompactProductCarousel from "@/components/catalog/CompactProductCarousel";
import { toast } from "sonner";
import logo from "@/assets/logo-rei-dos-cachos.png";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useCatalogProducts } from "@/hooks/useCatalogProducts";
import { useCategories, Category } from "@/hooks/useCategories";
import { useCart } from "@/contexts/CartContext";
import { useTrackPageView, useTrackAddToCart, useTrackProductView } from "@/hooks/useSessionTracking";
import { img } from "@/lib/imageOptimizer";

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type SortOption = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'profit_desc';

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
  const { data: dbCategories = [] } = useCategories();
  const { items: cart, addItem, updateQty, removeItem, clearCart, total: cartTotal, count: cartCount } = useCart();
  const { role } = useAuth();
  useTrackPageView('Catálogo');
  const trackAddToCart = useTrackAddToCart();
  const trackProductView = useTrackProductView();

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
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterProfessional, setFilterProfessional] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // UI state
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<typeof products[0] | null>(null);
  const handleSelectProduct = (product: typeof products[0] | null) => {
    setSelectedProduct(product);
    if (product) trackProductView(product.name);
  };
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

  const toggleCategory = (catId: string) =>
    setFilterCategories(prev =>
      prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId]
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
        if (!p.category_id || !filterCategories.includes(p.category_id)) return false;
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
    trackAddToCart(cartCount + qty, product.name, product.price * qty);

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

  return (
    <div className="min-h-screen bg-surface-alt overflow-x-hidden">
      {/* Header */}
      <header className="bg-gold border-b border-amber-600 sticky top-0 z-40">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-2 sm:h-16 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">

          <div className="flex items-center justify-between w-full sm:w-auto">
            <div className="select-none pointer-events-none">
              <img src={logo} alt="Rei dos Cachos" className="h-8 sm:h-12 w-auto flex-shrink-0 brightness-0 invert" />
            </div>

            {/* Mobile Actions in Header Row */}
            <div className="flex items-center gap-1.5 sm:hidden text-white">
              <button
                onClick={() => setCartOpen(true)}
                className="relative p-1.5 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
                title="Carrinho"
              >
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border-2 border-gold shadow-sm">
                    {cartCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setFiltersOpen(!filtersOpen)}
                className="relative p-1.5 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
              >
                <Filter className="w-5 h-5" />
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border-2 border-gold shadow-sm">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              {role === 'admin' && (
                <Link
                  to="/admin/catalogo"
                  className="p-1.5 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
                  title="Painel Admin"
                >
                  <ShieldCheck className="w-5 h-5" />
                </Link>
              )}

              <button
                onClick={handleLogout}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
                title="Sair"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Search App Form */}
          <div className="flex-1 w-full sm:max-w-md pb-1 sm:pb-0">
            <div className="relative w-full">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Estou buscando por..."
                className="w-full pl-9 pr-4 py-2 sm:py-2.5 rounded-full border border-gold-light bg-white text-sm text-foreground placeholder:text-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-3">
            {/* Desktop Actions */}
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="relative p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Filtros"
            >
              <Filter className="w-5 h-5" />
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Cart */}
            <button
              onClick={() => setCartOpen(true)}
              className={`relative flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gold-light text-gold-text bg-white hover:border-gold-border transition-all text-sm font-medium ${cartBounce ? 'animate-bounce' : ''}`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Pedido</span>
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full gradient-gold text-white text-[10px] font-bold flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>

            {role === 'admin' && (
              <Link
                to="/admin/catalogo"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-transparent text-sm font-medium text-white hover:bg-white/10 transition-all bg-white/5"
                title="Painel Admin"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Admin</span>
              </Link>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-amber-100 hover:text-white hover:bg-white/10 transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header >

      <div className="flex flex-col lg:flex-row lg:gap-6 w-full max-w-full">
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
                {dbCategories.map(cat => (
                  <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterCategories.includes(cat.id)}
                      onChange={() => toggleCategory(cat.id)}
                      className="w-4 h-4 rounded border-border text-gold focus:ring-gold"
                    />
                    <span className="text-sm text-foreground">{cat.name}</span>
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
        <div className="flex-1 min-w-0 pb-20 sm:pb-6 w-full max-w-full">
          {/* Mobile Only: Promo Banner */}
          <div className="pt-4 sm:hidden">
            <PromoBanner onClick={() => document.getElementById('kits-section')?.scrollIntoView({ behavior: 'smooth' })} />
          </div>

          {/* Mobile Only: Seleção dos Mais Vendidos */}
          {!isLoading && !error && products.length > 0 && (
            <div className="pt-2 px-3 sm:hidden">
              <div id="kits-section" className="flex items-center justify-between mb-4 mt-2">
                <div className="flex items-center gap-1.5">
                  <div className="bg-amber-100 p-1 rounded">
                    <PackageSearch className="w-4 h-4 text-amber-600" />
                  </div>
                  <h2 className="text-[14px] font-bold text-foreground">Seleção dos Mais Vendidos</h2>
                </div>
              </div>

              <div className="mb-4">
                <PackageCards products={products} />
              </div>
            </div>
          )}

          {/* Mobile Only: Destaques & Rest */}
          <div className="pt-0 sm:hidden">

            {/* Mobile Only: Compact Product Carousel for Featured Items */}
            {!isLoading && !error && filtered.length > 0 && (
              <CompactProductCarousel
                title="Destaques para você"
                products={products.filter(p => p.is_highlight)}
                cartAddedId={addedId}
                getQty={getQty}
                setQty={setQty}
                onAdd={handleAddItem}
                onSelect={handleSelectProduct}
                getSuggestedPrice={getSuggestedPrice}
              />
            )}
          </div>

          <div className="px-3 sm:px-4 lg:px-6 pt-2 sm:pt-6">
            {/* Page Header (Desktop) */}
            <div className="hidden sm:block mb-3">
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gold-border bg-gold-light mb-1">
                <Crown className="w-2.5 h-2.5 text-gold-text" />
                <span className="text-[9px] sm:text-xs font-semibold text-gold-text tracking-wide uppercase">B2B</span>
              </div>
              <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold text-foreground leading-tight">Catálogo</h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0">{isLoading ? "Carregando..." : `${filtered.length} produtos disponíveis`}</p>
            </div>

            {/* Package Cards Header (Desktop Only, since Mobile was moved to top) */}
            {!isLoading && !error && products.length > 0 && (
              <div className="hidden sm:block">
                <div className="mb-8">
                  <PackageCards products={products} />
                </div>
              </div>
            )}

            {/* Category Bubbles - Moved right above 'Aproveite e leve também' */}
            <div className="sm:hidden mb-2 mt-4 -mx-3">
              <CategoryBubbles
                categories={dbCategories}
                activeCategories={filterCategories}
                onToggleCategory={toggleCategory}
              />
            </div>

            {/* All Products Title Mobile */}
            {!isLoading && !error && filtered.length > 0 && (
              <div className="flex items-center gap-1.5 mb-4 mt-4 sm:mt-8">
                <div className="w-1 h-5 bg-amber-500 rounded-full"></div>
                <h2 className="text-[16px] sm:text-lg font-bold text-foreground">Aproveite e leve também</h2>
              </div>
            )}
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
                {filterCategories.map(catId => {
                  const cat = dbCategories.find(c => c.id === catId);
                  return cat ? <FilterChip key={catId} label={cat.name} onRemove={() => toggleCategory(catId)} /> : null;
                })}
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
                {/* Category Carousels */}
                <div className="flex flex-col gap-6 sm:gap-8 mb-8">
                  {dbCategories.map(category => {
                    const categoryProducts = filtered.filter(p => p.category_id === category.id);

                    if (categoryProducts.length === 0) return null;

                    return (
                      <div key={category.id} className="w-full">
                        <CompactProductCarousel
                          title={category.name}
                          products={categoryProducts}
                          cartAddedId={addedId}
                          getQty={getQty}
                          setQty={setQty}
                          onAdd={handleAddItem}
                          onSelect={handleSelectProduct}
                          getSuggestedPrice={getSuggestedPrice}
                        />
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
                    {dbCategories.map(cat => (
                      <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filterCategories.includes(cat.id)}
                          onChange={() => toggleCategory(cat.id)}
                          className="w-4 h-4 rounded border-border text-gold focus:ring-gold"
                        />
                        <span className="text-sm text-foreground">{cat.name}</span>
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
                    src={img.detail(selectedProduct.main_image)}
                    alt={selectedProduct.name}
                    loading="lazy"
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
                          __html: DOMPurify.sanitize(renderDescription(selectedProduct.description_html)),
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
    </div >
  );
};

export default Catalogo;
