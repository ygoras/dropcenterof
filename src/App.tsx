import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";

// Login loaded eagerly (first screen users see)
import Login from "./pages/Login";

// All other pages lazy-loaded for code splitting
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Vendedores = lazy(() => import("./pages/Vendedores"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const Catalogo = lazy(() => import("./pages/Catalogo"));
const Estoque = lazy(() => import("./pages/Estoque"));
const Pedidos = lazy(() => import("./pages/Pedidos"));
const SellerCatalogo = lazy(() => import("./pages/SellerCatalogo"));
const SellerDashboard = lazy(() => import("./pages/SellerDashboard"));
const SellerConfiguracoes = lazy(() => import("./pages/SellerConfiguracoes"));
const SellerCredito = lazy(() => import("./pages/SellerCredito"));
const SellerPlano = lazy(() => import("./pages/SellerPlano"));
const SellerPedidos = lazy(() => import("./pages/SellerPedidos"));
const SellerIntegracao = lazy(() => import("./pages/SellerIntegracao"));
const SellerAnuncios = lazy(() => import("./pages/SellerAnuncios"));
const PlaceholderPage = lazy(() => import("./pages/PlaceholderPage"));
const AdminMercadoLivre = lazy(() => import("./pages/AdminMercadoLivre"));
const AlertasML = lazy(() => import("./pages/AlertasML"));
const Logistica = lazy(() => import("./pages/Logistica"));
const OperacaoDashboard = lazy(() => import("./pages/OperacaoDashboard"));
const OperacaoSeparacao = lazy(() => import("./pages/OperacaoSeparacao"));
const OperacaoEmbalagem = lazy(() => import("./pages/OperacaoEmbalagem"));
const Operadores = lazy(() => import("./pages/Operadores"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const SellerEnvio = lazy(() => import("./pages/SellerEnvio"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const SellerRelatorios = lazy(() => import("./pages/SellerRelatorios"));
const Atendimento = lazy(() => import("./pages/Atendimento"));
const SellerAtendimento = lazy(() => import("./pages/SellerAtendimento"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const Planos = lazy(() => import("./pages/Planos"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PageSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<PageSpinner />}>
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
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;