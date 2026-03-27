import { Construction } from "lucide-react";
import { useLocation } from "react-router-dom";

const pageTitles: Record<string, string> = {
  "/vendedores": "Gestão de Vendedores",
  "/catalogo": "Catálogo Master",
  "/estoque": "Estoque / WMS",
  "/pedidos": "Pedidos & Fulfillment",
  "/logistica": "Logística & Expedição",
  "/atendimento": "Atendimento & Mensagens",
  "/financeiro": "Financeiro",
  "/relatorios": "Relatórios & BI",
  "/configuracoes": "Configurações",
  "/seller/dashboard": "Dashboard do Vendedor",
  "/seller/integracao": "Integração Mercado Livre",
  "/seller/catalogo": "Catálogo Disponível",
  "/seller/anuncios": "Meus Anúncios",
  "/seller/pedidos": "Meus Pedidos",
  "/seller/credito": "Crédito & Carteira",
  "/seller/relatorios": "Meus Relatórios",
  "/seller/configuracoes": "Configurações",
};

const PlaceholderPage = () => {
  const location = useLocation();
  const title = pageTitles[location.pathname] || "Página";

  return (
    <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Construction className="w-8 h-8 text-primary" />
      </div>
      <h1 className="font-display text-2xl font-bold text-foreground mb-2">{title}</h1>
      <p className="text-muted-foreground text-sm max-w-md text-center">
        Esta seção está em desenvolvimento. Em breve teremos funcionalidades completas aqui.
      </p>
    </div>
  );
};

export default PlaceholderPage;
