import { useState } from "react";
import { ArrowRight, Crown, LogOut, Search, ShoppingCart, Tag, TrendingUp, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import logo from "@/assets/logo-rei-dos-cachos.png";
import { supabase } from "@/lib/supabase";
import { useCatalogProducts } from "@/hooks/useCatalogProducts";

type CartItem = { id: string; name: string; quantity: number; price: number };

const Catalogo = () => {
  const navigate = useNavigate();
  const { data: products = [], isLoading, error } = useCatalogProducts();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<typeof products[0] | null>(null);

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = (product: typeof products[0]) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) return prev.map((i) => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { id: product.id, name: product.name, quantity: 1, price: product.price }];
    });
  };

  const removeFromCart = (id: string) => setCart((prev) => prev.filter((i) => i.id !== id));
  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  };

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

      <div className="container mx-auto px-4 sm:px-6 py-8">
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
                const margin = product.compare_at_price && product.price > 0
                  ? Math.round(((product.compare_at_price - product.price) / product.price) * 100)
                  : null;

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
                      <h3 className="font-semibold text-foreground text-sm mb-3 leading-snug">{product.name}</h3>

                      {/* Pricing */}
                      <div className="bg-surface-alt rounded-xl p-3 mb-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div>
                            <div className="text-[10px] text-muted-foreground">Você paga</div>
                            <div className="text-base font-bold text-foreground">R$ {product.price.toFixed(2)}</div>
                          </div>
                          {product.compare_at_price && (
                            <>
                              <ArrowRight className="w-3.5 h-3.5 text-gold-text" />
                              <div className="text-right">
                                <div className="text-[10px] text-muted-foreground">Vende por</div>
                                <div className="text-base font-bold gradient-gold-text">R$ {product.compare_at_price.toFixed(2)}</div>
                              </div>
                            </>
                          )}
                        </div>
                        {margin && (
                          <div className="flex items-center gap-1 pt-1.5 border-t border-border">
                            <TrendingUp className="w-3 h-3 text-green-600" />
                            <span className="text-[10px] font-semibold text-green-600">+{margin}% de lucro</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <button
                          onClick={() => addToCart(product)}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold btn-gold text-white"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          Adicionar ao Pedido
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
                <p className="text-muted-foreground text-sm">Tente outro termo de busca.</p>
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
                    <div className="text-xs text-muted-foreground">Você paga</div>
                    <div className="text-lg font-bold text-foreground">
                      R$ {selectedProduct.price.toFixed(2)}
                    </div>
                  </div>
                  {selectedProduct.compare_at_price && (
                    <>
                      <ArrowRight className="w-4 h-4 text-gold-text" />
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Vende por</div>
                        <div className="text-lg font-bold gradient-gold-text">
                          R$ {selectedProduct.compare_at_price.toFixed(2)}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {selectedProduct.compare_at_price && selectedProduct.price > 0 && (
                  <div className="flex items-center gap-1 pt-2 border-t border-border">
                    <TrendingUp className="w-3 h-3 text-green-600" />
                    <span className="text-xs font-semibold text-green-600">
                      +{Math.round(((selectedProduct.compare_at_price - selectedProduct.price) / selectedProduct.price) * 100)}% de lucro
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
                        __html: selectedProduct.description_html,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-2">
                <button
                  onClick={() => {
                    addToCart(selectedProduct);
                    setSelectedProduct(null);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold btn-gold text-white"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Adicionar ao Pedido
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
                    <div key={item.id} className="flex items-center justify-between gap-3 bg-surface-alt rounded-xl p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity}x · R$ {(item.price * item.quantity).toFixed(2)}
                        </p>
                      </div>
                      <button onClick={() => removeFromCart(item.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
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
                <a
                  href={`https://wa.me/5500000000000?text=Olá! Quero fazer um pedido no valor de R$ ${cartTotal.toFixed(2)}.%0A${cart.map(i => `- ${i.name} (${i.quantity}x)`).join('%0A')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-base btn-gold text-white"
                >
                  Finalizar via WhatsApp
                  <ArrowRight className="w-4 h-4" />
                </a>
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
