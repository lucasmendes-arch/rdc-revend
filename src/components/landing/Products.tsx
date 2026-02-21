import { useEffect, useRef } from "react";
import { ArrowRight, Tag, TrendingUp } from "lucide-react";
import ativadorImg from "@/assets/product-ativador.jpg";
import gelatinhaImg from "@/assets/product-gelatina.jpg";
import kitImg from "@/assets/product-kit.jpg";

const products = [
  {
    image: ativadorImg,
    resultAlt: "resultado-ativador-cachos.jpg — cabelo com definição intensa após uso do Ativador de Cachos",
    name: "Ativador de Cachos",
    weight: "1kg — Uso Profissional",
    costPrice: "R$ 38",
    sellPrice: "R$ 79",
    margin: "+108%",
    tag: "🔥 Mais Vendido",
    tagColor: "bg-red-50 text-red-600 border-red-100",
    micro: "Alto giro",
  },
  {
    image: gelatinhaImg,
    resultAlt: "resultado-gelatina-cachos.jpg — cacho definido e sem frizz após uso da Gelatina Definidora",
    name: "Gelatina Definidora",
    weight: "1kg — Extra Forte",
    costPrice: "R$ 32",
    sellPrice: "R$ 65",
    margin: "+103%",
    tag: "⭐ Top Favorita",
    tagColor: "bg-gold-light text-gold-text border-gold-border",
    micro: "Recompra alta",
  },
  {
    image: kitImg,
    resultAlt: "resultado-kit-lavatório-pro.jpg — cabelo brilhante e hidratado após uso do Kit Lavatório Pro",
    name: "Kit Lavatório Pro",
    weight: "Shampoo + Condicionador + Máscara",
    costPrice: "R$ 85",
    sellPrice: "R$ 179",
    margin: "+111%",
    tag: "🎁 Kit Premium",
    tagColor: "bg-surface-alt text-foreground border-border",
    micro: "Alto giro",
  },
];

const Products = () => {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

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
          {products.map((product, idx) => (
            <div
              key={idx}
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
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <img
                  src={product.image}
                  alt={product.resultAlt}
                  className="absolute inset-0 w-full h-full object-cover object-center opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                />
                <div className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold border ${product.tagColor}`}>
                  {product.tag}
                </div>
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/90 text-foreground border border-border">
                  {product.micro}
                </div>
              </div>

              {/* Product Info */}
              <div className="p-5">
                <h3 className="font-bold text-foreground text-base mb-0.5">{product.name}</h3>
                <p className="text-xs text-muted-foreground mb-4">{product.weight}</p>

                <div className="bg-surface-alt rounded-xl p-3.5 mb-2">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Você paga</div>
                      <div className="text-lg font-bold text-foreground">{product.costPrice}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gold-text" />
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground mb-0.5">Vende por</div>
                      <div className="text-lg font-bold gradient-gold-text">{product.sellPrice}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 pt-2 border-t border-border">
                    <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                    <span className="text-xs font-semibold text-green-600">Margem: {product.margin} de lucro</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Products;
