import { useState, useEffect, useMemo } from "react";
import { ArrowRight, Check, ChevronDown, Crown, Filter, LogOut, Search, ShoppingCart, Tag, TrendingUp, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import logo from "@/assets/logo-rei-dos-cachos.png";
import { supabase } from "@/lib/supabase";
import { useCatalogProducts } from "@/hooks/useCatalogProducts";
import { useCart } from "@/contexts/CartContext";

type SortOption = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'profit_desc';

const Catalogo = () => {
  const navigate = useNavigate();
  const { data: products = [], isLoading, error } = useCatalogProducts();
  const { items: cart, addItem, updateQty, removeItem, total: cartTotal, count: cartCount } = useCart();

  // Search and filters state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>('name_asc');
  const [filterMinPrice, setFilterMinPrice] = useState<number | ''>('');
  const [filterMaxPrice, setFilterMaxPrice] = useState<number | ''>('');
  const [filterOnlySuggested, setFilterOnlySuggested] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // UI state
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<typeof products[0] | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Filter and sort logic
  const filtered = useMemo(() => {
    let result = products.filter(p => {
      if (!p.name.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
      if (filterOnlySuggested && !p.compare_at_price) return false;
      if (filterMinPrice !== '' && p.price < filterMinPrice) return false;
      if (filterMaxPrice !== '' && p.price > filterMaxPrice) return false;
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
          const pa = a.compare_at_price && a.price > 0
            ? ((a.compare_at_price - a.price) / a.price) * 100
            : -1;
          const pb = b.compare_at_price && b.price > 0
            ? ((b.compare_at_price - b.price) / b.price) * 100
            : -1;
          return pb - pa;
        });
      default:
        return result;
    }
  }, [products, debouncedSearch, sortBy, filterMinPrice, filterMaxPrice, filterOnlySuggested]);

  // Helper to clean HTML descriptions
  const cleanDescription = (html: string): string => {
    let clean = html.replace(/\{[a-z]{2}:([\s\S]*?)\}/g, '$1');
    clean = clean.replace(/\\n/g, '<br/>');
    return clean;
  };

  // Helper to get profit percentage
  const getProfit = (price: number, suggestedPrice: number | null): number | null => {
    return suggestedPrice && price > 0
      ? Math.round(((suggestedPrice - price) / price) * 100)
      : null;
  };

  // Helper to get quantity for a product
  const getQty = (id: string) => quantities[id] ?? 1;
  const setQty = (id: string, qty: number) =>
    setQuantities(prev => ({ ...prev, [id]: Math.max(1, qty) }));

  // Handle add to cart with quantity
  const handleAddItem = (product: typeof products[0]) => {
    const qty = getQty(product.id);
    const existingItem = cart.find(i => i.id === product.id);

    if (existingItem) {
      updateQty(product.id, existingItem.quantity + qty);
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
    setTimeout(() => setAddedId(null), 1500);

    // Reset quantity for this product
    setQty(product.id, 1);
  };

  // Handle logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  };

  // Count active filters
  const activeFiltersCount = [
    debouncedSearch !== '',
    filterMinPrice !== '',
    filterMaxPrice !== '',
    filterOnlySuggested,
    sortBy !== 'name_asc',
  ].filter(Boolean).length;

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
              className="relative flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-white hover:border-gold-border transition-all text-sm font-medium"
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
                onClick={() => {
                  setSearch('');
                  setSortBy('name_asc');
                  setFilterMinPrice('');
                  setFilterMaxPrice('');
                  setFilterOnlySuggested(false);
                }}
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
                  const profit = getProfit(product.price, product.compare_at_price);

                  return (
                    <div
                      key={product.id}
                      className="group bg-white rounded-2xl overflow-hidden border border-border hover:border-gold-border shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1"
                    >
                      {/* Image */}
                      <div className="relative bg-surface-alt h-44 overflow-hidden">
                        {product.main_image ? (
                          <img
                            src={product.main_image}
                            alt={product.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-surface-alt to-border">
                            <ShoppingCart className="w-12 h-12 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-4">
                        <h3 className="font-semibold text-foreground text-sm mb-3 leading-snug line-clamp-2">{product.name}</h3>

                        {/* Pricing */}
                        <div className="bg-surface-alt rounded-xl p-3 mb-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <div>
                              <div className="text-[10px] text-muted-foreground">Custo</div>
                              <div className="text-base font-bold text-foreground">R$ {product.price.toFixed(2)}</div>
                            </div>
                            {product.compare_at_price && (
                              <>
                                <ArrowRight className="w-3.5 h-3.5 text-gold-text flex-shrink-0" />
                                <div className="text-right">
                                  <div className="text-[10px] text-muted-foreground">Sugerido</div>
                                  <div className="text-base font-bold gradient-gold-text">R$ {product.compare_at_price.toFixed(2)}</div>
                                </div>
                              </>
                            )}
                          </div>
                          {profit && (
                            <div className="flex items-center gap-1 pt-1.5 border-t border-border">
                              <TrendingUp className="w-3 h-3 text-green-600" />
                              <span className="text-[10px] font-semibold text-green-600">Lucro s/ custo +{profit}%</span>
                            </div>
                          )}
                        </div>

                        {/* Quantity Control */}
                        <div className="flex items-center justify-between gap-2 mb-3 px-2 py-1.5 bg-surface-alt rounded-lg">
                          <button
                            onClick={() => setQty(product.id, getQty(product.id) - 1)}
                            className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white rounded transition-colors"
                          >
                            −
                          </button>
                          <span className="text-sm font-medium text-foreground min-w-[1.5rem] text-center">{getQty(product.id)}</span>
                          <button
                            onClick={() => setQty(product.id, getQty(product.id) + 1)}
                            className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white rounded transition-colors"
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
                  onClick={() => {
                    setSearch('');
                    setSortBy('name_asc');
                    setFilterMinPrice('');
                    setFilterMaxPrice('');
                    setFilterOnlySuggested(false);
                  }}
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
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Content */}
            <div className="p-6">
              <h2 className="text-xl font-bold text-foreground mb-3">
                {selectedProduct.name}
              </h2>

              {/* Pricing */}
              <div className="bg-surface-alt rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Custo</div>
                    <div className="text-lg font-bold text-foreground">
                      R$ {selectedProduct.price.toFixed(2)}
                    </div>
                  </div>
                  {selectedProduct.compare_at_price && (
                    <>
                      <ArrowRight className="w-4 h-4 text-gold-text" />
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Sugerido</div>
                        <div className="text-lg font-bold gradient-gold-text">
                          R$ {selectedProduct.compare_at_price.toFixed(2)}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {getProfit(selectedProduct.price, selectedProduct.compare_at_price) && (
                  <div className="flex items-center gap-1 pt-2 border-t border-border">
                    <TrendingUp className="w-3 h-3 text-green-600" />
                    <span className="text-xs font-semibold text-green-600">
                      Lucro s/ custo +{getProfit(selectedProduct.price, selectedProduct.compare_at_price)}%
                    </span>
                  </div>
                )}
              </div>

              {/* Description */}
              {selectedProduct.description_html && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-foreground mb-2">
                    Descrição
                  </h3>
                  <div className="text-sm text-muted-foreground prose prose-sm max-w-none">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: cleanDescription(selectedProduct.description_html),
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Quantity Control */}
              <div className="flex items-center justify-center gap-3 mb-4 px-3 py-2 bg-surface-alt rounded-lg">
                <button
                  onClick={() => setQty(selectedProduct.id, getQty(selectedProduct.id) - 1)}
                  className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white rounded transition-colors text-lg"
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
