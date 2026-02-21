import { useState } from "react";
import { ArrowRight, Crown, LogOut, Search, ShoppingCart, Tag, TrendingUp, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import logo from "@/assets/logo-rei-dos-cachos.png";
import { supabase } from "@/lib/supabase";
import ativadorImg from "@/assets/product-ativador.jpg";
import gelatinhaImg from "@/assets/product-gelatina.jpg";
import kitImg from "@/assets/product-kit.jpg";

const categories = ["Todos", "Ativadores", "Finalizadores", "Kits", "Shampoo & Condicionador", "Máscaras"];

const allProducts = [
  { id: 1, image: ativadorImg, name: "Ativador de Cachos Premium", category: "Ativadores", weight: "1kg", costPrice: 38, sellPrice: 79, margin: 108, tag: "🔥 Mais Vendido", stock: "Em estoque" },
  { id: 2, image: gelatinhaImg, name: "Gelatina Definidora Extra Forte", category: "Finalizadores", weight: "1kg", costPrice: 32, sellPrice: 65, margin: 103, tag: "⭐ Top Favorita", stock: "Em estoque" },
  { id: 3, image: kitImg, name: "Kit Lavatório Pro", category: "Kits", weight: "3 itens", costPrice: 85, sellPrice: 179, margin: 111, tag: "🎁 Kit Premium", stock: "Em estoque" },
  { id: 4, image: ativadorImg, name: "Ativador de Cachos Leve", category: "Ativadores", weight: "500g", costPrice: 22, sellPrice: 45, margin: 104, tag: "", stock: "Em estoque" },
  { id: 5, image: gelatinhaImg, name: "Gelatina Coco e Manteiga", category: "Finalizadores", weight: "1kg", costPrice: 35, sellPrice: 72, margin: 106, tag: "🆕 Novidade", stock: "Em estoque" },
  { id: 6, image: kitImg, name: "Kit Hidratação Intensiva", category: "Kits", weight: "2 itens", costPrice: 55, sellPrice: 115, margin: 109, tag: "", stock: "Em estoque" },
  { id: 7, image: ativadorImg, name: "Shampoo Sem Sulfato", category: "Shampoo & Condicionador", weight: "1L", costPrice: 28, sellPrice: 58, margin: 107, tag: "", stock: "Em estoque" },
  { id: 8, image: gelatinhaImg, name: "Condicionador Nutritivo", category: "Shampoo & Condicionador", weight: "1L", costPrice: 26, sellPrice: 54, margin: 108, tag: "", stock: "Em estoque" },
  { id: 9, image: kitImg, name: "Máscara de Hidratação Profunda", category: "Máscaras", weight: "1kg", costPrice: 42, sellPrice: 88, margin: 110, tag: "⭐ Top Favorita", stock: "Em estoque" },
];

type CartItem = { id: number; name: string; quantity: number; costPrice: number };

const Catalogo = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  const filtered = allProducts.filter((p) => {
    const matchCat = activeCategory === "Todos" || p.category === activeCategory;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const addToCart = (product: typeof allProducts[0]) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) return prev.map((i) => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { id: product.id, name: product.name, quantity: 1, costPrice: product.costPrice }];
    });
  };

  const removeFromCart = (id: number) => setCart((prev) => prev.filter((i) => i.id !== id));
  const cartTotal = cart.reduce((sum, i) => sum + i.costPrice * i.quantity, 0);
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
          <p className="text-muted-foreground mt-1">{filtered.length} produtos disponíveis</p>
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                activeCategory === cat
                  ? "btn-gold text-white border-transparent"
                  : "bg-white border-border text-foreground hover:border-gold-border"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((product) => (
            <div
              key={product.id}
              className="group bg-white rounded-2xl overflow-hidden border border-border hover:border-gold-border shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1"
            >
              {/* Image */}
              <div className="relative bg-surface-alt h-44 overflow-hidden">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {product.tag && (
                  <div className="absolute top-2 left-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/90 border border-gold-border text-gold-text">
                    {product.tag}
                  </div>
                )}
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-100">
                  {product.stock}
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <p className="text-[11px] text-muted-foreground mb-0.5">{product.category} · {product.weight}</p>
                <h3 className="font-semibold text-foreground text-sm mb-3 leading-snug">{product.name}</h3>

                {/* Pricing */}
                <div className="bg-surface-alt rounded-xl p-3 mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <div className="text-[10px] text-muted-foreground">Você paga</div>
                      <div className="text-base font-bold text-foreground">R$ {product.costPrice}</div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-gold-text" />
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground">Vende por</div>
                      <div className="text-base font-bold gradient-gold-text">R$ {product.sellPrice}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 pt-1.5 border-t border-border">
                    <TrendingUp className="w-3 h-3 text-green-600" />
                    <span className="text-[10px] font-semibold text-green-600">+{product.margin}% de lucro</span>
                  </div>
                </div>

                <button
                  onClick={() => addToCart(product)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold btn-gold text-white"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Adicionar ao Pedido
                </button>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Tag className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum produto encontrado</h3>
            <p className="text-muted-foreground text-sm">Tente outra categoria ou palavra-chave.</p>
          </div>
        )}
      </div>

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
                          {item.quantity}x · R$ {(item.costPrice * item.quantity).toFixed(0)}
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
                  <span className="text-xl font-bold gradient-gold-text">R$ {cartTotal.toFixed(0)}</span>
                </div>
                <a
                  href={`https://wa.me/5500000000000?text=Olá! Quero fazer um pedido no valor de R$ ${cartTotal.toFixed(0)}.%0A${cart.map(i => `- ${i.name} (${i.quantity}x)`).join('%0A')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-base btn-gold text-white"
                >
                  Finalizar via WhatsApp
                  <ArrowRight className="w-4 h-4" />
                </a>
                {cartTotal < 300 && (
                  <p className="text-xs text-center text-muted-foreground mt-2">
                    ⚠️ Pedido mínimo: R$ 300 (faltam R$ {(300 - cartTotal).toFixed(0)})
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
