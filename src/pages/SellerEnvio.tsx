import { useState, useEffect } from "react";
import { Truck, MapPin, CheckCircle2, AlertTriangle, ExternalLink, Loader2, Copy } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

interface WarehouseAddress {
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
  reference: string;
}

const SellerEnvio = () => {
  const { profile } = useProfile();
  const [address, setAddress] = useState<WarehouseAddress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWarehouse = async () => {
      try {
        const data = await api.get<WarehouseAddress>("/api/warehouse/address");
        if (data) {
          setAddress(data);
        }
      } catch {}
      setLoading(false);
    };
    fetchWarehouse();
  }, []);

  const copyAddress = () => {
    if (!address) return;
    const text = `${address.street}, ${address.number}${address.complement ? ` - ${address.complement}` : ""}\n${address.neighborhood} — ${address.city}/${address.state}\nCEP: ${address.zip_code}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Endereço copiado!" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Truck className="w-6 h-6 text-primary" />
          Configuração de Envio
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure o endereço de envio na sua conta do Mercado Livre
        </p>
      </div>

      {/* Info Card */}
      <div className="bg-info/5 rounded-xl border border-info/20 p-5">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-foreground text-sm">Por que preciso configurar o endereço?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Como operamos com um <strong>galpão centralizado</strong>, todos os produtos são enviados de um único endereço. 
              O Mercado Livre calcula o frete automaticamente com base no endereço de envio configurado na sua conta. 
              Para que o cálculo seja correto e a coleta aconteça no local certo, você <strong>deve configurar o endereço do nosso armazém</strong> como seu endereço de envio.
            </p>
          </div>
        </div>
      </div>

      {/* Warehouse Address */}
      {address ? (
        <div className="bg-card rounded-xl border border-border p-6 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Endereço do Armazém Central
            </h3>
            <Button variant="outline" size="sm" onClick={copyAddress} className="gap-1.5 text-xs">
              <Copy className="w-3.5 h-3.5" />
              Copiar
            </Button>
          </div>
          <div className="p-4 rounded-lg bg-secondary/30 border border-border">
            <p className="text-sm font-medium text-foreground">
              {address.street}, {address.number}
              {address.complement && ` - ${address.complement}`}
            </p>
            <p className="text-sm text-foreground">
              {address.neighborhood} — {address.city}/{address.state}
            </p>
            <p className="text-sm text-foreground font-mono">CEP: {address.zip_code}</p>
            {address.reference && (
              <p className="text-xs text-muted-foreground mt-2">📍 {address.reference}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-warning/5 rounded-xl border border-warning/20 p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-warning mx-auto mb-2" />
          <h3 className="font-semibold text-foreground">Endereço não configurado</h3>
          <p className="text-sm text-muted-foreground mt-1">
            O administrador ainda não configurou o endereço do armazém. Entre em contato com o suporte.
          </p>
        </div>
      )}

      {/* Step by Step Guide */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card">
        <h3 className="font-display font-semibold text-foreground mb-4">
          Passo a passo para configurar no Mercado Livre
        </h3>
        <div className="space-y-4">
          {[
            {
              step: 1,
              title: "Acesse sua conta do Mercado Livre",
              description: "Faça login na sua conta em mercadolivre.com.br",
            },
            {
              step: 2,
              title: "Vá para Configurações de Envio",
              description: "Acesse: Minha conta → Vendas → Configurações de envio → Endereços",
            },
            {
              step: 3,
              title: "Edite ou adicione o endereço de envio",
              description: "Clique em 'Modificar' no endereço de envio atual ou adicione um novo endereço",
            },
            {
              step: 4,
              title: "Preencha com o endereço do armazém",
              description: "Copie os dados do endereço acima e preencha todos os campos obrigatórios",
            },
            {
              step: 5,
              title: "Salve e confirme",
              description: "Confirme as alterações. O Mercado Livre passará a calcular o frete a partir desse endereço",
            },
          ].map((item) => (
            <div key={item.step} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary">{item.step}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-border">
          <a
            href="https://www.mercadolivre.com.br/my-account"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium"
          >
            <ExternalLink className="w-4 h-4" />
            Ir para Mercado Livre
          </a>
        </div>
      </div>

      {/* Confirmation checklist */}
      <div className="bg-success/5 rounded-xl border border-success/20 p-5">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <CheckCircle2 className="w-4 h-4 text-success" />
          Checklist de Verificação
        </h4>
        <ul className="space-y-2">
          {[
            "O endereço de envio na minha conta ML é o endereço do armazém",
            "O CEP no ML corresponde ao CEP do armazém",
            "Estou usando Mercado Envios como modalidade de frete",
          ].map((text, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 rounded border border-border flex-shrink-0 mt-0.5" />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default SellerEnvio;
