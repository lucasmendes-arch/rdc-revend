import { useEffect, useState } from "react";

const items = [
  { icon: "🛡️", text: "Compra 100% Segura" },
  { icon: "📋", text: "Registro ANVISA" },
  { icon: "🏆", text: "Marca Certificada" },
  { icon: "💬", text: "Suporte WhatsApp" },
];

const TrustBar = () => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY < 300);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className="w-full border-b z-40 transition-all duration-500"
      style={{
        borderBottomColor: "#e8d5a0",
        backgroundColor: "#ffffff",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        height: "40px",
      }}
    >
      <div className="container mx-auto px-4 sm:px-6 h-full flex items-center justify-center gap-4 sm:gap-8 overflow-hidden">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-sm">{item.icon}</span>
            <span className="text-xs font-medium text-muted-foreground hidden sm:inline">{item.text}</span>
            <span className="text-xs font-medium text-muted-foreground sm:hidden">{item.text.split(" ")[0]}</span>
            {i < items.length - 1 && (
              <span className="text-muted-foreground/30 ml-3 sm:ml-6 hidden xs:inline">|</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TrustBar;
