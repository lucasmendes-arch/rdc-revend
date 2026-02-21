import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Catalogo from "./pages/Catalogo";
import Checkout from "./pages/Checkout";
import PedidoSucesso from "./pages/PedidoSucesso";
import MeusPedidos from "./pages/MeusPedidos";
import AdminCatalogo from "./pages/admin/Catalogo";
import AdminPedidos from "./pages/admin/Pedidos";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/catalogo" element={<Catalogo />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/pedido/sucesso/:id" element={<PedidoSucesso />} />
                <Route path="/meus-pedidos" element={<MeusPedidos />} />
                <Route element={<AdminRoute />}>
                  <Route path="/admin/catalogo" element={<AdminCatalogo />} />
                  <Route path="/admin/pedidos" element={<AdminPedidos />} />
                </Route>
              </Route>
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

