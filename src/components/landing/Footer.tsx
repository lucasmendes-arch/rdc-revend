import { Crown, MessageCircle, Shield, Award, FileCheck, Instagram, Facebook } from "lucide-react";

const trustItems = [
  { icon: Shield, label: "Compra 100% Segura" },
  { icon: FileCheck, label: "Produtos com Registro ANVISA" },
  { icon: Award, label: "Marca Certificada" },
];

const quickLinks = [
  { label: "Catálogo de Produtos", href: "/catalogo" },
  { label: "Quero Revender", href: "#cadastro" },
  { label: "Programa de Revendedores", href: "#cadastro" },
  { label: "Política de Troca", href: "#" },
  { label: "FAQ — Perguntas Frequentes", href: "#" },
];

const Footer = () => {
  return (
    <footer style={{ background: "#1a1a1a" }} className="text-white">
      {/* Trust Strip */}
      <div className="border-b border-white/10 py-6">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
            {trustItems.map(({ icon: Icon, label }, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <Icon className="w-5 h-5" style={{ color: "#f5c842" }} />
                <span className="text-sm font-medium" style={{ color: "#ffffff" }}>{label}</span>
              </div>
            ))}
            <a
              href="https://wa.me/5511999999999"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-4 py-2 rounded-lg transition-opacity hover:opacity-90"
              style={{ background: "#25D366" }}
            >
              <MessageCircle className="w-4 h-4 text-white" />
              <span className="text-sm text-white" style={{ fontWeight: 600 }}>Suporte WhatsApp</span>
            </a>
          </div>
        </div>
      </div>

      {/* Footer Content */}
      <div className="py-12">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-full gradient-gold flex items-center justify-center shadow-gold">
                  <Crown className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="font-bold text-white">Rei dos Cachos</div>
                  <div className="text-xs font-medium tracking-widest uppercase" style={{ color: "#f5c842" }}>Pro · Atacado</div>
                </div>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "#d4d4d4" }}>
                A marca especialista em cabelos cacheados, ondulados e crespos. Produtos profissionais para revendedores e salões em todo o Brasil.
              </p>
              <div className="flex items-center gap-3 mt-5">
                <a href="#" className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                  <Instagram className="w-4 h-4" style={{ color: "#d4d4d4" }} />
                </a>
                <a href="#" className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                  <Facebook className="w-4 h-4" style={{ color: "#d4d4d4" }} />
                </a>
                <a
                  href="https://wa.me/5511999999999"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:opacity-90"
                  style={{ background: "#25D366" }}
                >
                  <MessageCircle className="w-4 h-4 text-white" />
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#d4d4d4" }}>Links Rápidos</div>
              <div className="flex flex-col gap-2.5">
                {quickLinks.map((link, i) => (
                  <a key={i} href={link.href} className="text-sm transition-colors hover:text-white" style={{ color: "#d4d4d4" }}>
                    {link.label}
                  </a>
                ))}
              </div>
            </div>

            {/* Contact */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#d4d4d4" }}>Contato & Suporte</div>
              <div className="flex flex-col gap-3">
                <a
                  href="https://wa.me/5511999999999"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 text-sm transition-colors hover:text-green-300"
                  style={{ color: "#d4d4d4" }}
                >
                  <MessageCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                  (11) 99999-9999 — WhatsApp
                </a>
                <div className="text-sm" style={{ color: "#d4d4d4" }}>✉️ contato@reidos cachos.com.br</div>
                <div className="text-sm" style={{ color: "#d4d4d4" }}>🕐 Atendimento: Seg–Sex 8h–18h</div>
                <div className="mt-2 p-3 rounded-lg border border-white/10">
                  <div className="text-xs mb-1" style={{ color: "#d4d4d4" }}>Pedidos Mínimos</div>
                  <div className="text-sm font-semibold text-white">A partir de R$ 500</div>
                  <div className="text-xs mt-0.5" style={{ color: "#f5c842" }}>Frete grátis acima de R$ 3.000</div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-white/10 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs" style={{ color: "#d4d4d4" }}>
              © 2024 Rei dos Cachos. Todos os direitos reservados.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-xs transition-colors hover:text-white" style={{ color: "#d4d4d4" }}>Privacidade</a>
              <a href="#" className="text-xs transition-colors hover:text-white" style={{ color: "#d4d4d4" }}>Termos de Uso</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
