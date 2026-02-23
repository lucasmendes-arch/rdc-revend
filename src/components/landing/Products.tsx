import { useEffect, useRef } from "react";
import { ArrowRight, Tag, TrendingUp } from "lucide-react";
import { useCatalogProducts } from "@/hooks/useCatalogProducts";

const categoryTags = {
  alto_giro: { tag: "🔥 Mais Vendido", tagColor: "bg-red-50 text-red-600 border-red-100" },
  maior_margem: { tag: "💎 Maior Lucro", tagColor: "bg-gold-light text-gold-text border-gold-border" },
  recompra_alta: { tag: "⭐ Top Favorita", tagColor: "bg-surface-alt text-foreground border-border" },
};

const categoryLabels = {
  alto_giro: "Alto giro",
  maior_margem: "Maior margem",
  recompra_alta: "Recompra alta",
};

const Products = () => {
  const { data: allProducts = [] } = useCatalogProducts();
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Get top 3 products (one from each category)
  const featuredProducts = [
    allProducts.find((p) => p.category_type === "alto_giro" && p.is_active),
    allProducts.find((p) => p.category_type === "maior_margem" && p.is_active),
    allProducts.find((p) => p.category_type === "recompra_alta" && p.is_active),
  ].filter(Boolean);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            el.style.opacity = "1";
            el.style.transform = "translateY(0)";
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.15 }
    );
    cardRefs.current.forEach((ref) => ref && observer.observe(ref));
    return () => observer.disconnect();
  }, []);

  // Calculate margin percentage
  const getMargin = (price: number, costPrice: number | null) => {
    if (!costPrice || costPrice === 0) return "+0%";
    const margin = ((price - costPrice) / costPrice) * 100;
    return `+${Math.round(margin)}%`;
  };

  // Format price
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(price);
  };

  if (featuredProducts.length === 0) {
    return null; // Don't render if no featured products
  }

  return (
    <section className="py-14 sm:py-20 lg:py-28" style={{ background: "#ffffff" }}>
      <div className="container mx-auto px-4">
        <div className="text-center mb-10 sm:mb-14 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gold-border bg-gold-light mb-4">
            <Tag className="w-3.5 h-3.5 text-gold-text" />
            <span className="text-xs font-semibold text-gold-text tracking-widest uppercase">
              Best-Sellers
            </span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold text-foreground mb-3">
            Os{" "}
            <span className="gradient-gold-text">Queridinhos</span>{" "}
            das Cacheadas
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg">
            Exemplos de itens com alto giro que aparecem nos pacotes.
          </p>
        </div>

        {/* Mobile: horizontal scroll | Desktop: grid */}
        <div className="flex sm:grid sm:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 mb-10 overflow-x-auto sm:overflow-visible snap-x snap-mandatory pb-4 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0">
          {featuredProducts.map((product, idx) => {
            if (!product) return null;
            const categoryType = product.category_type as keyof typeof categoryTags;
            const { tag, tagColor } = categoryTags[categoryType] || categoryTags.alto_giro;
            const micro = categoryLabels[categoryType] || "Destaque";
            const margin = getMargin(product.price, product.compare_at_price);

            return (
              <div
                key={product.id}
                ref={(el) => (cardRefs.current[idx] = el)}
                className="min-w-[280px] sm:min-w-0 snap-center group bg-white rounded-2xl overflow-hidden border border-border shadow-card flex-shrink-0 sm:flex-shrink-1 transition-all duration-250 hover:scale-[1.02] hover:shadow-card-hover hover:border-gold-border"
                style={{
                  opacity: 0,
                  transform: "translateY(20px)",
                  transition: `opacity 0.5s ease ${idx * 100}ms, transform 0.5s ease ${idx * 100}ms, box-shadow 0.25s ease, border-color 0.25s ease`,
                }}
              >
                {/* Product Image */}
                <div className="relative bg-surface-alt h-48 sm:h-52 overflow-hidden">
                  {product.main_image ? (
                    <img
                      src={product.main_image}
                      alt={product.name}
                      className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-surface-alt flex items-center justify-center text-muted-foreground">
                      Sem imagem
                    </div>
                  )}
                  <div className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold border ${tagColor}`}>
                    {tag}
                  </div>
                  <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/90 text-foreground border border-border">
                    {micro}
                  </div>
                </div>

                {/* Product Info */}
                <div className="p-5">
                  <h3 className="font-bold text-foreground text-base mb-0.5">{product.name}</h3>

                  <div className="bg-surface-alt rounded-xl p-3.5 mb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Você paga</div>
                        <div className="text-lg font-bold text-foreground">
                          {product.compare_at_price ? formatPrice(product.compare_at_price) : "N/A"}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gold-text" />
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground mb-0.5">Vende por</div>
                        <div className="text-lg font-bold gradient-gold-text">{formatPrice(product.price)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 pt-3 border-t border-border mt-3">
                      <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                      <span className="text-xs font-semibold text-green-600">Margem: {margin} de lucro</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Products;
