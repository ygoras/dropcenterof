import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
// Registro removido — vendedores são criados pelo admin
import Dashboard from "./pages/Dashboard";
import Vendedores from "./pages/Vendedores";
import Financeiro from "./pages/Financeiro";
import Catalogo from "./pages/Catalogo";
import Estoque from "./pages/Estoque";
import Pedidos from "./pages/Pedidos";
import SellerCatalogo from "./pages/SellerCatalogo";
import SellerDashboard from "./pages/SellerDashboard";
import SellerConfiguracoes from "./pages/SellerConfiguracoes";
import SellerCredito from "./pages/SellerCredito";
import SellerPlano from "./pages/SellerPlano";
import SellerPedidos from "./pages/SellerPedidos";
import SellerIntegracao from "./pages/SellerIntegracao";
import SellerAnuncios from "./pages/SellerAnuncios";
import PlaceholderPage from "./pages/PlaceholderPage";
import AdminMercadoLivre from "./pages/AdminMercadoLivre";
import AlertasML from "./pages/AlertasML";
import Logistica from "./pages/Logistica";
import OperacaoDashboard from "./pages/OperacaoDashboard";
import OperacaoSeparacao from "./pages/OperacaoSeparacao";
import OperacaoEmbalagem from "./pages/OperacaoEmbalagem";
import Operadores from "./pages/Operadores";
import Configuracoes from "./pages/Configuracoes";
import Usuarios from "./pages/Usuarios";
import SellerEnvio from "./pages/SellerEnvio";
import Relatorios from "./pages/Relatorios";
import SellerRelatorios from "./pages/SellerRelatorios";
import Atendimento from "./pages/Atendimento";
import SellerAtendimento from "./pages/SellerAtendimento";
import AuditLog from "./pages/AuditLog";
import Planos from "./pages/Planos";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* Auth */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              {/* Registro removido — vendedores são criados pelo admin */}

              {/* Portal Interno (Plataforma) */}
              <Route element={<ProtectedRoute><AppLayout portal="platform" /></ProtectedRoute>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/vendedores" element={<Vendedores />} />
                <Route path="/catalogo" element={<Catalogo />} />
                <Route path="/estoque" element={<Estoque />} />
                <Route path="/pedidos" element={<Pedidos />} />
                <Route path="/mercadolivre" element={<AdminMercadoLivre />} />
                <Route path="/alertas-ml" element={<AlertasML />} />
                <Route path="/logistica" element={<Logistica />} />
                <Route path="/operadores" element={<Operadores />} />
                <Route path="/atendimento" element={<Atendimento />} />
                <Route path="/auditoria" element={<AuditLog />} />
                <Route path="/financeiro" element={<Financeiro />} />
                <Route path="/planos" element={<Planos />} />
                <Route path="/relatorios" element={<Relatorios />} />
                <Route path="/usuarios" element={<Usuarios />} />
                <Route path="/configuracoes" element={<Configuracoes />} />
              </Route>

              {/* Portal do Vendedor */}
              <Route element={<ProtectedRoute><AppLayout portal="seller" /></ProtectedRoute>}>
                <Route path="/seller/dashboard" element={<SellerDashboard />} />
                <Route path="/seller/integracao" element={<SellerIntegracao />} />
                <Route path="/seller/catalogo" element={<SellerCatalogo />} />
                <Route path="/seller/anuncios" element={<SellerAnuncios />} />
                <Route path="/seller/envio" element={<SellerEnvio />} />
                <Route path="/seller/pedidos" element={<SellerPedidos />} />
                <Route path="/seller/credito" element={<SellerCredito />} />
                <Route path="/seller/plano" element={<SellerPlano />} />
                <Route path="/seller/relatorios" element={<SellerRelatorios />} />
                <Route path="/seller/atendimento" element={<SellerAtendimento />} />
                <Route path="/seller/configuracoes" element={<SellerConfiguracoes />} />
              </Route>

              {/* Portal do Operador */}
              <Route element={<ProtectedRoute><AppLayout portal="operator" /></ProtectedRoute>}>
                <Route path="/operacao" element={<OperacaoDashboard />} />
                <Route path="/operacao/separacao" element={<OperacaoSeparacao />} />
                <Route path="/operacao/embalagem" element={<OperacaoEmbalagem />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;