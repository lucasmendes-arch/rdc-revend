import { useState } from "react";
import { ArrowRight, Lock, CheckCircle2, User, Phone, Mail, CreditCard, ChevronDown } from "lucide-react";

const LeadForm = () => {
  const [form, setForm] = useState({ nome: "", whatsapp: "", email: "", cpfCnpj: "" });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showCpf, setShowCpf] = useState(false);

  const formatWhatsApp = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "whatsapp") {
      setForm((prev) => ({ ...prev, whatsapp: formatWhatsApp(value) }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome || !form.whatsapp || !form.email) return;
    setLoading(true);

    const token = `rdc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const userData = { ...form, token, registeredAt: new Date().toISOString() };
    localStorage.setItem("rdc_user", JSON.stringify(userData));
    localStorage.setItem("rdc_token", token);
    localStorage.setItem("rdc_authenticated", "true");

    setTimeout(() => {
      setSubmitted(true);
      setLoading(false);
    }, 800);
  };

  const benefits = [
    "Tabela de preços exclusiva para revendedores",
    "Catálogo completo de produtos",
    "Suporte via WhatsApp dedicado",
  ];

  if (submitted) {
    return (
      <section id="cadastro" className="py-14 sm:py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-md mx-auto text-center">
            <div className="w-20 h-20 rounded-full bg-green-50 border-4 border-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-2">Cadastro Recebido!</h3>
            <p className="text-muted-foreground">
              Em instantes você será contatado no WhatsApp.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="cadastro" className="py-14 sm:py-20 lg:py-28 bg-white">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-start">
            {/* Left: Info (hidden on mobile, shown on desktop) */}
            <div className="hidden lg:block lg:sticky lg:top-24">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gold-border bg-gold-light mb-5">
                <Lock className="w-3.5 h-3.5 text-gold-text" />
                <span className="text-xs font-semibold text-gold-text tracking-widest uppercase">
                  Acesso Exclusivo
                </span>
              </div>

              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 leading-tight">
                Libere Seu Acesso{" "}
                <span className="gradient-gold-text">ao Atacado Agora</span>
              </h2>
              <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
                Preencha o formulário e acesse imediatamente os preços de revendedor e o catálogo completo.
              </p>

              <div className="flex flex-col gap-3">
                {benefits.map((b, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full gradient-gold flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-sm font-medium text-foreground">{b}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Form */}
            <div className="bg-white rounded-2xl border border-border shadow-card p-5 sm:p-8">
              <h3 className="text-xl font-bold text-foreground mb-2">Criar conta gratuita</h3>

              {/* Mobile benefits */}
              <div className="flex flex-col gap-2 mb-5 lg:hidden">
                {benefits.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-gold-text flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">{b}</span>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* Nome */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Nome completo *</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      name="nome"
                      required
                      value={form.nome}
                      onChange={handleChange}
                      placeholder="Seu nome ou nome do salão"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold-border transition-all min-h-[48px]"
                    />
                  </div>
                </div>

                {/* WhatsApp */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">WhatsApp *</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="tel"
                      name="whatsapp"
                      required
                      value={form.whatsapp}
                      onChange={handleChange}
                      placeholder="(11) 99999-9999"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold-border transition-all min-h-[48px]"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">E-mail *</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      name="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      placeholder="seu@email.com"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold-border transition-all min-h-[48px]"
                    />
                  </div>
                </div>

                {/* CPF/CNPJ - collapsible */}
                {!showCpf ? (
                  <button
                    type="button"
                    onClick={() => setShowCpf(true)}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronDown className="w-4 h-4" />
                    Adicionar CPF/CNPJ (opcional)
                  </button>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      CNPJ / CPF <span className="text-muted-foreground font-normal">(opcional)</span>
                    </label>
                    <div className="relative">
                      <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="text"
                        name="cpfCnpj"
                        value={form.cpfCnpj}
                        onChange={handleChange}
                        placeholder="Para emissão de nota fiscal"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold-border transition-all min-h-[48px]"
                      />
                    </div>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-semibold text-base btn-gold text-white disabled:opacity-70 disabled:cursor-not-allowed mt-2 min-h-[52px]"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Liberando acesso...
                    </>
                  ) : (
                    <>
                      Acessar Meus Preços de Atacado
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <p className="text-xs text-muted-foreground text-center">
                  🔒 Seus dados estão seguros. Não enviamos spam.
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LeadForm;
