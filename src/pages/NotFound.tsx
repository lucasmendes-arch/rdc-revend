import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import logo from "@/assets/logo-rei-dos-cachos.png";
import { Button } from "@/components/ui/button";

/**
 * 404 no mesmo shell das telas de entrada (Login): logo em cima, título em
 * Bricolage, uma frase que diz o que fazer e duas saídas — voltar ou ir ao
 * catálogo.
 */
const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  const canGoBack = typeof window !== "undefined" && window.history.length > 1;

  return (
    <div className="min-h-screen bg-background bg-ambient flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px] text-center">
          <Link to="/" aria-label="Rei dos Cachos — início">
            <img src={logo} alt="Rei dos Cachos" className="h-14 w-auto mx-auto mb-10" />
          </Link>

          <p className="text-[13px] font-medium text-brand-strong tabular-nums mb-2">Erro 404</p>
          <h1 className="text-[26px] leading-tight text-foreground">Página não encontrada</h1>
          <p className="text-[14px] text-muted-foreground mt-2">
            O endereço <span className="mono text-[13px] text-foreground break-all">{location.pathname}</span> não
            existe ou foi movido. Confira o link ou siga para o catálogo.
          </p>

          <div className="mt-8 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-center gap-2">
            {canGoBack && (
              <Button variant="secondary" size="lg" onClick={() => navigate(-1)}>
                <ArrowLeft />
                Voltar
              </Button>
            )}
            <Button size="lg" asChild>
              <Link to="/catalogo">Ir para o catálogo</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
