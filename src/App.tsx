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
import Login from "./pages/Login";
import Catalogo from "./pages/Catalogo";
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
import AdminMarketing from "./pages/admin/Marketing";
import AdminVendedores from "./pages/admin/Vendedores";
import AdminSyncHistory from "./pages/admin/SyncHistory";
import SalaoNovoPedido from "./pages/salao/NovoPedido";
import NotFound from "./pages/NotFound";
import WhatsAppButton from "./components/landing/WhatsAppButton";
import PixelTracker from "./components/PixelTracker";
import { useLocation } from "react-router-dom";

function ConditionalWhatsApp() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin') || pathname.startsWith('/salao') || pathname === '/cadastro' || pathname === '/login' || pathname === '/redefinir-senha') return null;
  return <WhatsAppButton />;
}

const queryClient = new QueryClient();

const App = () => (
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
                <Route element={<ProtectedRoute />}>
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/pedido/sucesso/:id" element={<PedidoSucesso />} />
                  <Route path="/meus-pedidos" element={<MeusPedidos />} />
                  <Route element={<AdminRoute />}>
                    <Route path="/admin" element={<Navigate to="/admin/catalogo" replace />} />
                    <Route path="/admin/catalogo" element={<AdminCatalogo />} />
                    <Route path="/admin/pedidos" element={<AdminPedidos />} />
                    <Route path="/admin/pedidos/novo" element={<AdminNewOrder />} />
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
                  </Route>
                  <Route element={<SalaoRoute />}>
                    <Route path="/salao" element={<Navigate to="/salao/pedido" replace />} />
                    <Route path="/salao/pedido" element={<SalaoNovoPedido />} />
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
);

export default App;
