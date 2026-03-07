import { useState, useEffect } from 'react';

const WhatsAppButton = () => {
  const [showPopup, setShowPopup] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowPopup(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed z-50 bottom-32 right-6 md:bottom-10 md:right-12 flex items-end gap-3 pointer-events-none">

      {/* Helper Popup */}
      <div
        className={`flex flex-col items-end mb-2 transition-all duration-500 ${showPopup
          ? 'animate-in slide-in-from-right-8 fade-in delay-500 fill-mode-both'
          : 'opacity-0 translate-y-3 scale-95 pointer-events-none'
          }`}
      >
        <div className="bg-white px-4 py-3 rounded-2xl rounded-br-none shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-green-100 flex items-center gap-3 pointer-events-auto">
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground leading-tight mb-0.5">Precisa de ajuda?</p>
            <p className="text-xs text-muted-foreground leading-tight">Clique e tenha suporte imediatamente</p>
          </div>
        </div>
        {/* Little triangle pointing to the button */}
        <div className="w-3 h-3 bg-white border-r border-b border-green-100 transform rotate-45 mr-4 -mt-1.5 shadow-[2px_2px_5px_rgb(0,0,0,0.05)]"></div>
      </div>

      {/* FAB Button */}
      <a
        href="https://wa.me/5527996865366?text=Ol%C3%A1%2C%20vim%20do%20site%20e%20preciso%20de%20ajuda%2C%20pode%20me%20ajudar%3F"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Fale conosco pelo WhatsApp"
        className="flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full shadow-lg transition-transform hover:scale-110 pointer-events-auto bg-[#25D366]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 32 32"
          className="w-7 h-7 md:w-8 md:h-8"
          fill="white"
        >
          <path d="M16.004 0h-.008C7.174 0 .002 7.174.002 16.002c0 3.5 1.128 6.744 3.046 9.378L1.06 31.29l6.196-1.964A15.89 15.89 0 0 0 16.004 32C24.83 32 32 24.826 32 15.998S24.83 0 16.004 0zm9.32 22.598c-.39 1.1-2.282 2.108-3.14 2.168-.858.062-1.664.384-5.608-1.168-4.736-1.864-7.74-6.736-7.974-7.048-.234-.31-1.91-2.542-1.91-4.85 0-2.308 1.21-3.442 1.638-3.912.428-.47.934-.588 1.246-.588.312 0 .624.002.898.016.288.014.674-.11 1.054.804.39.936 1.326 3.244 1.442 3.478.116.234.194.508.038.818-.156.312-.234.506-.468.78-.234.272-.49.608-.702.816-.234.234-.478.488-.206.958.272.47 1.214 2.002 2.606 3.244 1.788 1.596 3.296 2.09 3.766 2.324.47.234.744.196 1.016-.118.272-.312 1.17-1.364 1.482-1.834.312-.47.624-.39 1.054-.234.43.156 2.736 1.29 3.206 1.524.47.234.78.352.898.546.116.194.116 1.13-.274 2.228z" />
        </svg>
      </a>
    </div>
  );
};

export default WhatsAppButton;
