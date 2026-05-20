import { useMemo } from "react";
import { Printer, MessageCircle } from "lucide-react";
import logo from "@/assets/logo-rei-dos-cachos.png";
import { useCatalogProducts, type PublicProduct } from "@/hooks/useCatalogProducts";

const WA_URL =
  "https://wa.me/5527996865366?text=" +
  encodeURIComponent("Olá! Vi o catálogo de revenda e quero fazer um pedido.");

function fmt(val: number | null | undefined): string {
  if (!val) return "—";
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const MONTH_YEAR = new Date().toLocaleDateString("pt-BR", {
  month: "long",
  year: "numeric",
});

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Produto em destaque por categoria: chave = nome normalizado da categoria, valor = keyword no nome do produto
const FEATURED_BY_CATEGORY: Record<string, string> = {
  "uso profissional":         "relax system",
  "kits":                     "cafe verde",
  "finalizador":              "argan 65",
  "finalizadores":            "argan 65",
  "potao/creme de pentear":   "girassol 1",
  "potoes":                   "girassol 1",
  "potes":                    "girassol 1",
  "shampoo":                  "mix de oleos",
  "shampoos":                 "mix de oleos",
  "mascara":                  "teen argan",
  "mascaras":                 "teen argan",
};

function getFeaturedFirst(
  categoryName: string,
  products: PublicProduct[]
): PublicProduct[] {
  const keyword = FEATURED_BY_CATEGORY[norm(categoryName)];
  if (!keyword) return products;
  const idx = products.findIndex((p) => norm(p.name).includes(keyword));
  if (idx <= 0) return products;
  const reordered = [...products];
  const [featured] = reordered.splice(idx, 1);
  reordered.unshift(featured);
  return reordered;
}

// ─── Product card ──────────────────────────────────────────────────────────────

interface CardProps {
  product: PublicProduct;
  large?: boolean;
}

function ProductCard({ product, large = false }: CardProps) {
  const img = product.main_image;
  const price = product.price;

  return (
    <div className="flex flex-col h-full">
      {/* Image */}
      <div
        className={`relative overflow-hidden bg-stone-100 ${
          large ? "aspect-[3/4]" : "aspect-square"
        }`}
      >
        {img ? (
          <img
            src={img}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-stone-300 text-xs">sem imagem</span>
          </div>
        )}
        {product.is_highlight && (
          <span className="absolute top-2 left-2 bg-stone-900 text-white text-[10px] uppercase tracking-widest px-2 py-0.5">
            Destaque
          </span>
        )}
      </div>

      {/* Info */}
      <div className="mt-2 flex flex-col gap-1">
        <p
          className={`font-sans text-stone-800 leading-snug ${
            large ? "text-sm" : "text-xs"
          }`}
        >
          {product.name}
        </p>
        <p
          className={`font-display font-semibold text-stone-900 ${
            large ? "text-lg" : "text-sm"
          }`}
        >
          {fmt(price)}
        </p>
      </div>
    </div>
  );
}

// ─── Category section ──────────────────────────────────────────────────────────

interface SectionProps {
  name: string;
  products: PublicProduct[];
}

function CategorySection({ name, products }: SectionProps) {
  const ordered = getFeaturedFirst(name, products);
  const hasMany = ordered.length >= 3;

  return (
    <section className="mt-14 print:mt-10">
      {/* Section header */}
      <div className="flex items-center gap-4 mb-6">
        <h2 className="font-display text-2xl print:text-xl font-light uppercase tracking-[0.2em] text-stone-900 whitespace-nowrap">
          {name}
        </h2>
        <div className="flex-1 h-px bg-stone-300" />
        <span className="font-sans text-[10px] uppercase tracking-widest text-stone-400">
          {products.length} {products.length === 1 ? "produto" : "produtos"}
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-4 print:gap-3 auto-rows-min">
        {ordered.map((p, idx) => {
          const featured = hasMany && idx === 0;
          return (
            <div
              key={p.id}
              className={featured ? "col-span-2 row-span-2" : "col-span-1"}
            >
              <ProductCard product={p} large={featured} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Lookbook() {
  const { data: products, isLoading, error } = useCatalogProducts();

  const grouped = useMemo(() => {
    if (!products?.length) return [];

    const map = new Map<
      string,
      { name: string; sortOrder: number; products: PublicProduct[] }
    >();

    for (const p of products) {
      const key = p.category_id ?? "__outros";
      if (!map.has(key)) {
        map.set(key, {
          name: p.category?.name ?? "Outros",
          sortOrder: p.category?.sort_order ?? 999,
          products: [],
        });
      }
      map.get(key)!.products.push(p);
    }

    return Array.from(map.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [products]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-stone-400 font-sans text-sm">
        Carregando catálogo…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-stone-500 font-sans text-sm gap-2">
        <p className="font-semibold text-red-500">Erro ao carregar produtos</p>
        <pre className="text-xs bg-stone-100 rounded p-3 max-w-lg overflow-auto">
          {String(error)}
        </pre>
      </div>
    );
  }

  return (
    <div className="bg-[#F7F4EF] min-h-screen print:bg-white">
      {/* Top bar — hidden on print */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-stone-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <span className="font-sans text-xs text-stone-400 uppercase tracking-widest">
          Catálogo de Revenda
        </span>
        <div className="flex gap-3">
          <a
            href={WA_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-xs font-sans rounded-full hover:bg-green-700 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Fazer pedido
          </a>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-stone-800 text-white text-xs font-sans rounded-full hover:bg-stone-700 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            Salvar PDF
          </button>
        </div>
      </div>

      {/* Cover */}
      <header className="max-w-4xl mx-auto px-8 pt-14 pb-8 print:pt-8 border-b-2 border-stone-900">
        <div className="flex items-end justify-between">
          <img src={logo} alt="Rei dos Cachos" className="h-10 print:h-9" />
          <div className="text-right">
            <p className="font-sans text-[10px] uppercase tracking-widest text-stone-400">
              Revenda B2B
            </p>
            <p className="font-sans text-xs text-stone-500 capitalize mt-0.5">
              {MONTH_YEAR}
            </p>
          </div>
        </div>

        <div className="mt-10">
          <p className="font-sans text-[10px] uppercase tracking-[0.3em] text-stone-400 mb-2">
            Tabela de preços para revendedores
          </p>
          <h1 className="font-display text-6xl print:text-5xl font-light text-stone-900 leading-none">
            Catálogo
          </h1>
          <p className="font-display italic text-2xl print:text-xl text-stone-400 mt-1">
            Rei dos Cachos
          </p>
        </div>
      </header>

      {/* Product sections */}
      <main className="max-w-4xl mx-auto px-8 pb-20">
        {grouped.length === 0 ? (
          <p className="font-sans text-stone-400 text-sm text-center mt-16">
            Nenhum produto ativo encontrado. ({products?.length ?? 0} retornados da query)
          </p>
        ) : (
          grouped.map((g) => (
            <CategorySection key={g.name} name={g.name} products={g.products} />
          ))
        )}
      </main>

      {/* Footer CTA — hidden on print */}
      <footer className="print:hidden bg-stone-900 text-white py-14 text-center">
        <p className="font-display italic text-2xl text-stone-300 mb-2">
          Pronto para revender?
        </p>
        <p className="font-sans text-xs text-stone-400 mb-6 uppercase tracking-widest">
          Fale com nosso time comercial e faça seu pedido
        </p>
        <a
          href={WA_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-8 py-3 bg-green-500 text-white rounded-full text-sm font-sans font-medium hover:bg-green-400 transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          Falar no WhatsApp
        </a>
        <p className="font-sans text-[10px] text-stone-600 uppercase tracking-widest mt-10">
          Rei dos Cachos · Cosméticos B2B para Cabelos Cacheados
        </p>
      </footer>
    </div>
  );
}
