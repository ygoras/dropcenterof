import { useState, useEffect } from "react";
import { Settings, MapPin, Save, Loader2, Building2, Users, Bell, Shield } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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

const emptyAddress: WarehouseAddress = {
  street: "", number: "", complement: "", neighborhood: "",
  city: "", state: "", zip_code: "", reference: "",
};

interface PlatformSettings {
  warehouse_address?: WarehouseAddress;
  notifications?: { email_new_order: boolean; email_new_seller: boolean; email_stock_low: boolean };
  company?: { name: string; document: string; logo_url: string };
}

const defaultNotifications = { email_new_order: true, email_new_seller: true, email_stock_low: true };

const Configuracoes = () => {
  const { profile } = useProfile();
  const [address, setAddress] = useState<WarehouseAddress>(emptyAddress);
  const [notifications, setNotifications] = useState(defaultNotifications);
  const [company, setCompany] = useState({ name: "", document: "", logo_url: "" });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    if (!profile?.tenant_id) { setLoading(false); return; }
    const load = async () => {
      try {
        const data = await api.get<{ settings: PlatformSettings; name: string; document: string }>(`/api/tenants/${profile.tenant_id}`);
        if (data) {
          const s = data.settings || {};
          if (s.warehouse_address) setAddress({ ...emptyAddress, ...s.warehouse_address });
          if (s.notifications) setNotifications({ ...defaultNotifications, ...s.notifications });
          setCompany({ name: data.name ?? "", document: data.document ?? "", logo_url: (s.company?.logo_url) ?? "" });
        }
      } catch (err) {
        console.error("Error loading tenant settings:", err);
      }

      // Load platform users
      try {
        const profiles = await api.get<any[]>("/api/users");
        if (profiles) {
          setUsers(profiles);
        }
      } catch (err) {
        console.error("Error loading users:", err);
      }
      setLoading(false);
    };
    load();
  }, [profile?.tenant_id]);

  const saveSettings = async (patch: Partial<PlatformSettings>) => {
    if (!profile?.tenant_id) return;
    setSaving(true);
    try {
      await api.patch(`/api/tenants/${profile.tenant_id}/settings`, patch);
      toast({ title: "Configurações salvas!" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof WarehouseAddress, value: string) => setAddress((p) => ({ ...p, [field]: value }));
  const isComplete = address.street && address.number && address.neighborhood && address.city && address.state && address.zip_code;

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-4xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" /> Configurações
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Configurações gerais da plataforma</p>
      </div>

      <Tabs defaultValue="company" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="company" className="gap-1"><Building2 className="w-3.5 h-3.5" /> Empresa</TabsTrigger>
          <TabsTrigger value="warehouse" className="gap-1"><MapPin className="w-3.5 h-3.5" /> Galpão</TabsTrigger>
          <TabsTrigger value="users" className="gap-1"><Users className="w-3.5 h-3.5" /> Usuários</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1"><Bell className="w-3.5 h-3.5" /> Notificações</TabsTrigger>
        </TabsList>

        {/* Company */}
        <TabsContent value="company">
          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> Dados da Plataforma</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Nome da empresa</Label><Input value={company.name} onChange={(e) => setCompany((p) => ({ ...p, name: e.target.value }))} /></div>
              <div><Label>CNPJ</Label><Input value={company.document} onChange={(e) => setCompany((p) => ({ ...p, document: e.target.value }))} placeholder="00.000.000/0001-00" /></div>
              <div className="sm:col-span-2"><Label>URL do Logo</Label><Input value={company.logo_url} onChange={(e) => setCompany((p) => ({ ...p, logo_url: e.target.value }))} placeholder="https://..." /></div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => { api.patch(`/api/tenants/${profile!.tenant_id!}`, { name: company.name, document: company.document }); saveSettings({ company }); }} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Warehouse */}
        <TabsContent value="warehouse">
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="font-semibold text-foreground mb-1 flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Endereço do Galpão</h3>
            <p className="text-xs text-muted-foreground mb-4">Endereço central de expedição. Vendedores devem configurar este endereço no ML.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><Label>Logradouro</Label><Input value={address.street} onChange={(e) => updateField("street", e.target.value)} /></div>
              <div><Label>Número</Label><Input value={address.number} onChange={(e) => updateField("number", e.target.value)} /></div>
              <div><Label>Complemento</Label><Input value={address.complement} onChange={(e) => updateField("complement", e.target.value)} /></div>
              <div><Label>Bairro</Label><Input value={address.neighborhood} onChange={(e) => updateField("neighborhood", e.target.value)} /></div>
              <div><Label>Cidade</Label><Input value={address.city} onChange={(e) => updateField("city", e.target.value)} /></div>
              <div><Label>Estado</Label><Input value={address.state} onChange={(e) => updateField("state", e.target.value)} maxLength={2} /></div>
              <div><Label>CEP</Label><Input value={address.zip_code} onChange={(e) => updateField("zip_code", e.target.value)} /></div>
              <div className="sm:col-span-2"><Label>Referência</Label><Textarea value={address.reference} onChange={(e) => updateField("reference", e.target.value)} rows={2} /></div>
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={() => saveSettings({ warehouse_address: address })} disabled={saving || !isComplete} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar Endereço
              </Button>
            </div>
            {isComplete && (
              <div className="bg-secondary/30 rounded-lg border border-border p-3 mt-4">
                <p className="text-sm text-foreground">{address.street}, {address.number}{address.complement && ` - ${address.complement}`}</p>
                <p className="text-sm text-foreground">{address.neighborhood} — {address.city}/{address.state} • CEP: {address.zip_code}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Users */}
        <TabsContent value="users">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Usuários da Plataforma</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Perfis</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {u.roles.map((r: string) => (
                          <Badge key={r} variant={r === "admin" ? "default" : "secondary"} className="text-xs">{r}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.is_active ? "default" : "destructive"} className="text-xs">
                        {u.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications">
          <div className="bg-card rounded-xl border border-border p-6 space-y-6">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> Preferências de Notificação</h3>
            {[
              { key: "email_new_order" as const, label: "Novo pedido recebido", desc: "Receber e-mail quando um pedido for aprovado" },
              { key: "email_new_seller" as const, label: "Novo vendedor cadastrado", desc: "Receber e-mail quando um vendedor se registrar" },
              { key: "email_stock_low" as const, label: "Estoque baixo", desc: "Receber alerta quando o estoque atingir o mínimo" },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch checked={notifications[item.key]} onCheckedChange={(v) => setNotifications((p) => ({ ...p, [item.key]: v }))} />
              </div>
            ))}
            <div className="flex justify-end">
              <Button onClick={() => saveSettings({ notifications })} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Configuracoes;
