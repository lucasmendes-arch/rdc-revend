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
import { PortalRoute } from "@/components/portal/PortalRoute";
import Portal from "./pages/portal/Portal";
import Login from "./pages/Login";
import Catalogo from "./pages/Catalogo";
import Lookbook from "./pages/Lookbook";
import Cadastro from "./pages/Cadastro";
import Checkout from "./pages/Checkout";
import PedidoSucesso from "./pages/PedidoSucesso";
import MeusPedidos from "./pages/MeusPedidos";
import AdminCatalogo from "./pages/admin/Catalogo";
import AdminPedidos from "./pages/admin/Pedidos";
import AdminClientes from "./pages/admin/Clientes";
import AdminEstoque from "./pages/admin/Estoque";
import AdminUsuarios from "./pages/admin/Usuarios";
import AdminCategorias from "./pages/admin/Categorias";
import AdminUpsell from "./pages/admin/Upsell";
import AdminFinanceiro from "./pages/admin/Financeiro";
import AdminCrmDebug from "./pages/admin/CrmDebug";
import RedefinirSenha from "./pages/RedefinirSenha";
import AdminNewOrder from "./pages/admin/NewOrder";
import AdminEditOrder from "./pages/admin/EditOrder";
import AdminMarketing from "./pages/admin/Marketing";
import AdminVendedores from "./pages/admin/Vendedores";
import AdminSyncHistory from "./pages/admin/SyncHistory";
import AdminTabelasPreco from "./pages/admin/TabelasPreco";
import AdminPortalBanners from "./pages/admin/PortalBanners";
import SalaoNovoPedido from "./pages/salao/NovoPedido";
import SalaoInicio from "./pages/salao/Inicio";
import EstoqueContagem from "./pages/estoque/Contagem";
import EstoqueContagemDetalhe from "./pages/estoque/ContagemDetalhe";
import EstoqueConfirmacao from "./pages/estoque/Confirmacao";
import EstoquePedidos from "./pages/estoque/Pedidos";
import EstoqueConfig from "./pages/estoque/Config";
import EstoqueHistorico from "./pages/estoque/Historico";
import EstoqueRelatorio from "./pages/estoque/Relatorio";
import NotFound from "./pages/NotFound";
import WhatsAppButton from "./components/landing/WhatsAppButton";
import PixelTracker from "./components/PixelTracker";
import { useLocation } from "react-router-dom";

function ConditionalWhatsApp() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin') || pathname.startsWith('/salao') || pathname.startsWith('/portal') || pathname.startsWith('/estoque') || pathname === '/cadastro' || pathname === '/login' || pathname === '/redefinir-senha') return null;
  return <WhatsAppButton />;
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
              <Routes>
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="/login" element={<Login />} />
                <Route path="/cadastro" element={<Cadastro />} />
                <Route path="/redefinir-senha" element={<RedefinirSenha />} />
                <Route path="/catalogo" element={<Catalogo />} />
                <Route path="/lookbook" element={<Lookbook />} />
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
                    <Route path="/admin/sync-history" element={<AdminSyncHistory />} />
                    <Route path="/admin/crm" element={<AdminCrmDebug />} />
                    <Route path="/admin/tabelas-preco" element={<AdminTabelasPreco />} />
                    <Route path="/admin/portal-banners" element={<AdminPortalBanners />} />
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
                  </Route>
                </Route>
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
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
