import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CartProvider } from "@/contexts/CartContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { SalaoRoute } from "@/components/SalaoRoute";
import { EstoqueRoute } from "@/components/EstoqueRoute";
import { RhRoute } from "@/components/RhRoute";
import { PortalRoute } from "@/components/portal/PortalRoute";
import Portal from "./pages/portal/Portal";
import Login from "./pages/Login";
import Lookbook from "./pages/Lookbook";
import Cadastro from "./pages/Cadastro";
import PedidoSucesso from "./pages/PedidoSucesso";
import MeusPedidos from "./pages/MeusPedidos";
import RedefinirSenha from "./pages/RedefinirSenha";
import SalaoNovoPedido from "./pages/salao/NovoPedido";
import SalaoInicio from "./pages/salao/Inicio";
import NotFound from "./pages/NotFound";
import WhatsAppButton from "./components/landing/WhatsAppButton";
import PixelTracker from "./components/PixelTracker";
import { useLocation } from "react-router-dom";

// módulo comercial-atacado (lazy — inclui vendors pesados: html2canvas, @dnd-kit)
const Catalogo = lazy(() => import("./pages/comercial-atacado/Catalogo"));
const Checkout = lazy(() => import("./pages/comercial-atacado/Checkout"));
const AdminCatalogo = lazy(() => import("./pages/comercial-atacado/admin/Catalogo"));
const AdminPedidos = lazy(() => import("./pages/comercial-atacado/admin/Pedidos"));
const AdminClientes = lazy(() => import("./pages/comercial-atacado/admin/Clientes"));
const AdminEstoque = lazy(() => import("./pages/comercial-atacado/admin/DisponibilidadeCatalogo"));
const AdminCategorias = lazy(() => import("./pages/comercial-atacado/admin/Categorias"));
const AdminUpsell = lazy(() => import("./pages/comercial-atacado/admin/Upsell"));
const AdminNewOrder = lazy(() => import("./pages/comercial-atacado/admin/NewOrder"));
const AdminEditOrder = lazy(() => import("./pages/comercial-atacado/admin/EditOrder"));
const AdminVendedores = lazy(() => import("./pages/comercial-atacado/admin/Vendedores"));
const AdminTabelasPreco = lazy(() => import("./pages/comercial-atacado/admin/TabelasPreco"));

// módulo financeiro (lazy — inclui recharts)
const AdminFinanceiro = lazy(() => import("./pages/financeiro/Financeiro"));

// módulo marketing (lazy)
const AdminMarketing = lazy(() => import("./pages/marketing/Marketing"));

// módulo sistema (lazy)
const AdminUsuarios = lazy(() => import("./pages/sistema/Usuarios"));

// módulo RH (lazy)
const RhVagas = lazy(() => import("./pages/rh/Vagas"));
const RhCargos = lazy(() => import("./pages/rh/Cargos"));
const RhCandidatos = lazy(() => import("./pages/rh/Candidatos"));
const RhFormulario = lazy(() => import("./pages/rh/Formulario"));
const CandidaturaPublica = lazy(() => import("./pages/rh/CandidaturaPublica"));

// módulo estoque (lazy)
const EstoqueContagem = lazy(() => import("./pages/estoque/Contagem"));
const EstoqueContagemDetalhe = lazy(() => import("./pages/estoque/ContagemDetalhe"));
const EstoqueConfirmacao = lazy(() => import("./pages/estoque/Confirmacao"));
const EstoquePedidos = lazy(() => import("./pages/estoque/Pedidos"));
const EstoqueConfig = lazy(() => import("./pages/estoque/Config"));
const EstoqueHistorico = lazy(() => import("./pages/estoque/Historico"));
const EstoqueRelatorio = lazy(() => import("./pages/estoque/Relatorio"));
const EstoqueAtual = lazy(() => import("./pages/estoque/Atual"));

function ConditionalWhatsApp() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin') || pathname.startsWith('/salao') || pathname.startsWith('/portal') || pathname.startsWith('/estoque') || pathname.startsWith('/candidatura') || pathname === '/cadastro' || pathname === '/login' || pathname === '/redefinir-senha') return null;
  return <WhatsAppButton />;
}

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <ThemeProvider attribute="class" storageKey="rdc-theme" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <PixelTracker />
          <AuthProvider>
            <CartProvider>
              <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="/login" element={<Login />} />
                <Route path="/cadastro" element={<Cadastro />} />
                <Route path="/redefinir-senha" element={<RedefinirSenha />} />
                <Route path="/catalogo" element={<Catalogo />} />
                <Route path="/lookbook" element={<Lookbook />} />
                <Route path="/candidatura/:storeSlug" element={<CandidaturaPublica />} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/pedido/sucesso/:id" element={<PedidoSucesso />} />
                  <Route path="/meus-pedidos" element={<MeusPedidos />} />
                  <Route element={<AdminRoute />}>
                    <Route path="/admin" element={<Navigate to="/admin/catalogo" replace />} />
                    <Route path="/admin/catalogo" element={<AdminCatalogo />} />
                    <Route path="/admin/pedidos" element={<AdminPedidos />} />
                    <Route path="/admin/pedidos/novo" element={<AdminNewOrder />} />
                    <Route path="/admin/pedidos/:id/editar" element={<AdminEditOrder />} />
                    <Route path="/admin/clientes" element={<AdminClientes />} />
                    <Route path="/admin/estoque" element={<AdminEstoque />} />
                    <Route path="/admin/usuarios" element={<AdminUsuarios />} />
                    <Route path="/admin/categorias" element={<AdminCategorias />} />
                    <Route path="/admin/upsell" element={<AdminUpsell />} />
                    <Route path="/admin/financeiro" element={<AdminFinanceiro />} />
                    <Route path="/admin/marketing" element={<AdminMarketing />} />
                    <Route path="/admin/vendedores" element={<AdminVendedores />} />
                    <Route path="/admin/tabelas-preco" element={<AdminTabelasPreco />} />
                  </Route>
                  <Route element={<PortalRoute />}>
                    <Route path="/portal" element={<Portal />} />
                    <Route path="/portal/comprar" element={<Navigate to="/portal" replace />} />
                  </Route>
                  <Route element={<SalaoRoute />}>
                    <Route path="/salao" element={<SalaoInicio />} />
                    <Route path="/salao/pedido" element={<SalaoNovoPedido />} />
                  </Route>
                  <Route element={<EstoqueRoute />}>
                    <Route path="/estoque" element={<Navigate to="/estoque/contagem" replace />} />
                    <Route path="/estoque/contagem" element={<EstoqueContagem />} />
                    <Route path="/estoque/contagem/:id" element={<EstoqueContagemDetalhe />} />
                    <Route path="/estoque/contagem/:id/confirmar" element={<EstoqueConfirmacao />} />
                    <Route path="/estoque/pedidos" element={<EstoquePedidos />} />
                    <Route path="/estoque/config" element={<EstoqueConfig />} />
                    <Route path="/estoque/historico" element={<EstoqueHistorico />} />
                    <Route path="/estoque/relatorio" element={<EstoqueRelatorio />} />
                    <Route path="/estoque/atual" element={<EstoqueAtual />} />
                  </Route>
                  <Route element={<RhRoute />}>
                    <Route path="/admin/rh/vagas" element={<RhVagas />} />
                    <Route path="/admin/rh/cargos" element={<RhCargos />} />
                    <Route path="/admin/rh/candidatos" element={<RhCandidatos />} />
                    <Route path="/admin/rh/formulario" element={<RhFormulario />} />
                  </Route>
                </Route>
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
              <ConditionalWhatsApp />
            </CartProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
  </ThemeProvider>
);

export default App;
