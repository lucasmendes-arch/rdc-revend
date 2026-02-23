import { MessageCircle, Shield, Award, FileCheck } from "lucide-react";
import logo from "@/assets/logo-rei-dos-cachos.png";

const trustItems = [
  { icon: Shield, label: "Compra 100% Segura" },
  { icon: FileCheck, label: "Registro ANVISA" },
  { icon: Award, label: "Marca Certificada" },
];

const Footer = () => {
  return (
    <footer style={{ background: "#1a1a1a" }} className="text-white">
      {/* Trust Strip */}
      <div className="border-b border-white/10 py-5">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8">
            {trustItems.map(({ icon: Icon, label }, i) => (
              <div key={i} className="flex items-center gap-2">
                <Icon className="w-4 h-4" style={{ color: "#f5c842" }} />
                <span className="text-xs sm:text-sm font-medium" style={{ color: "#ffffff" }}>{label}</span>
              </div>
            ))}
            <a
              href="https://wa.me/5511999999999"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90"
              style={{ background: "#25D366" }}
            >
              <MessageCircle className="w-4 h-4 text-white" />
              <span className="text-xs sm:text-sm text-white" style={{ fontWeight: 600 }}>Suporte WhatsApp</span>
            </a>
          </div>
        </div>
      </div>

      {/* Footer Content — compact */}
      <div className="py-8 sm:py-10">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            {/* Brand */}
            <div className="flex items-center gap-2.5">
              <img src={logo} alt="Rei dos Cachos" className="h-8 w-auto" />
            </div>

            {/* Contact */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6">
              <a
                href="https://wa.me/5511999999999"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm transition-colors hover:text-green-300"
                style={{ color: "#d4d4d4" }}
              >
                <MessageCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                (11) 99999-9999
              </a>
              <span className="text-xs" style={{ color: "#d4d4d4" }}>✉️ contato@reidoscachos.com.br</span>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-white/10 mt-6 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
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
