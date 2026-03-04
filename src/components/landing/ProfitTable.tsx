import { DollarSign } from "lucide-react";

const bancadaData = [
  { label: "Custo por aplicação", value: "R$ 8,50" },
  { label: "Preço sugerido ao cliente", value: "R$ 45,00" },
  { label: "Lucro por serviço", value: "R$ 36,50", highlight: true },
  { label: "Margem de lucro", value: "~430%", highlight: true },
];

const revendaData = [
  { label: "Preço de Atacado", value: "R$ 29,90" },
  { label: "Preço de Venda sugerido", value: "R$ 59,90" },
  { label: "Lucro por unidade", value: "R$ 30,00", highlight: true },
  { label: "Margem de lucro", value: "~100%", highlight: true },
];

const ProfitTable = () => {
  return (
    <section className="py-14 sm:py-20 lg:py-28" style={{ background: "#F9F9F9" }}>
      <div className="container mx-auto px-4">
        <div className="text-center mb-10 sm:mb-14 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gold-border bg-gold-light mb-4">
            <DollarSign className="w-3.5 h-3.5 text-gold-text" />
            <span className="text-xs font-semibold text-gold-text tracking-widest uppercase">
              Lucratividade Real
            </span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold text-foreground mb-3">
            Quanto Você{" "}
            <span className="gradient-gold-text">Lucra de Verdade</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg">
            Veja a margem real nos dois modelos de negócio: uso em bancada e revenda direta.
          </p>
        </div>

        {/* Desktop: side by side */}
        <div className="hidden sm:grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <TableCard
            title="Uso em Bancada"
            subtitle="Lucro por serviço no salão"
            data={bancadaData}
          />
          <TableCard
            title="Revenda Direta"
            subtitle="Lucro por unidade vendida"
            data={revendaData}
          />
        </div>

        {/* Mobile: stacked cards */}
        <div className="sm:hidden flex flex-col gap-4 max-w-md mx-auto">
          <TableCard
            title="Uso em Bancada"
            subtitle="Lucro por serviço no salão"
            data={bancadaData}
          />
          <TableCard
            title="Revenda Direta"
            subtitle="Lucro por unidade vendida"
            data={revendaData}
          />
        </div>

        <p className="text-center text-xs sm:text-sm text-muted-foreground mt-6">
          * Valores ilustrativos com base nos preços sugeridos. Resultados podem variar.
        </p>
      </div>
    </section>
  );
};

const TableCard = ({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle: string;
  data: { label: string; value: string; highlight?: boolean }[];
}) => {
  return (
    <div
      className="bg-white rounded-2xl border border-border p-6 sm:p-7"
      style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.05)" }}
    >
      <h3 className="text-lg font-bold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-5">{subtitle}</p>

      <div className="space-y-3">
        {data.map((row, i) => (
          <div
            key={i}
            className={`flex items-center justify-between py-2 ${
              i < data.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <span
              className={`text-sm font-bold ${
                row.highlight ? "gradient-gold-text text-base" : "text-foreground"
              }`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProfitTable;
