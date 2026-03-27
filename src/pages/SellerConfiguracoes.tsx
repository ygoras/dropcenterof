import { useState, useEffect } from "react";
import { User, Building2, Phone, Mail, Save, Loader2, Lock, Eye, EyeOff, FileText } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SellerConfiguracoes = () => {
  const { profile, loading: profileLoading } = useProfile();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyDocument, setCompanyDocument] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Fiscal data
  const [fiscal, setFiscal] = useState({
    razao_social: "", inscricao_estadual: "", inscricao_municipal: "",
    regime_tributario: "", endereco_fiscal: "", responsavel_fiscal: "",
  });

  // Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? "");
    setPhone(profile.phone ?? "");

    if (profile.tenant_id) {
      setTenantId(profile.tenant_id);
      api.get<any>(`/api/tenants/${profile.tenant_id}`).then((data) => {
        if (data) {
          setCompanyName(data.name ?? "");
          setCompanyDocument(data.document ?? "");
          const s = (data.settings as any) || {};
          if (s.fiscal) setFiscal((p) => ({ ...p, ...s.fiscal }));
        }
      }).catch(() => {});
    }
  }, [profile]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);

    await api.patch(`/api/profiles/${profile.id}`, { name, phone: phone || null });

    if (tenantId) {
      const t = await api.get<any>(`/api/tenants/${tenantId}`);
      const current = (t?.settings as Record<string, unknown>) || {};
      await api.patch(`/api/tenants/${tenantId}`, {
        name: companyName, document: companyDocument || null,
        settings: { ...current, fiscal },
      });
    }

    toast({ title: "Configurações salvas com sucesso!" });
    setSaving(false);
  };

  if (profileLoading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">Gerencie seus dados pessoais, empresa e dados fiscais</p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile" className="gap-1"><User className="w-3.5 h-3.5" /> Perfil</TabsTrigger>
          <TabsTrigger value="fiscal" className="gap-1"><FileText className="w-3.5 h-3.5" /> Dados Fiscais</TabsTrigger>
          <TabsTrigger value="security" className="gap-1"><Lock className="w-3.5 h-3.5" /> Segurança</TabsTrigger>
        </TabsList>

        {/* Profile + Company */}
        <TabsContent value="profile" className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><User className="w-4 h-4 text-primary" /> Dados Pessoais</h3>
            <div><Label>Nome completo</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div>
              <Label>E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={profile?.email ?? ""} disabled className="pl-10 opacity-60" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">O e-mail não pode ser alterado</p>
            </div>
            <div>
              <Label>Telefone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" className="pl-10" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> Dados da Empresa</h3>
            <div><Label>Nome da empresa</Label><Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></div>
            <div><Label>CNPJ / CPF</Label><Input value={companyDocument} onChange={(e) => setCompanyDocument(e.target.value)} placeholder="00.000.000/0001-00" /></div>
          </div>
        </TabsContent>

        {/* Fiscal */}
        <TabsContent value="fiscal">
          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Dados Fiscais</h3>
            <p className="text-xs text-muted-foreground">Dados necessários para emissão de notas fiscais e compliance</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><Label>Razão Social</Label><Input value={fiscal.razao_social} onChange={(e) => setFiscal((p) => ({ ...p, razao_social: e.target.value }))} /></div>
              <div><Label>Inscrição Estadual</Label><Input value={fiscal.inscricao_estadual} onChange={(e) => setFiscal((p) => ({ ...p, inscricao_estadual: e.target.value }))} placeholder="Isento ou número" /></div>
              <div><Label>Inscrição Municipal</Label><Input value={fiscal.inscricao_municipal} onChange={(e) => setFiscal((p) => ({ ...p, inscricao_municipal: e.target.value }))} /></div>
              <div><Label>Regime Tributário</Label><Input value={fiscal.regime_tributario} onChange={(e) => setFiscal((p) => ({ ...p, regime_tributario: e.target.value }))} placeholder="Simples Nacional, Lucro Presumido..." /></div>
              <div><Label>Responsável Fiscal</Label><Input value={fiscal.responsavel_fiscal} onChange={(e) => setFiscal((p) => ({ ...p, responsavel_fiscal: e.target.value }))} /></div>
              <div className="sm:col-span-2"><Label>Endereço Fiscal</Label><Input value={fiscal.endereco_fiscal} onChange={(e) => setFiscal((p) => ({ ...p, endereco_fiscal: e.target.value }))} placeholder="Endereço completo para NF" /></div>
            </div>
          </div>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security">
          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><Lock className="w-4 h-4 text-primary" /> Alterar Senha</h3>
            <div>
              <Label>Nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type={showNewPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="pl-10 pr-10" />
                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label>Confirmar nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repita a nova senha" className="pl-10" />
              </div>
            </div>
            <Button variant="outline" disabled={changingPassword} className="gap-2" onClick={async () => {
              if (newPassword.length < 6) { toast({ title: "Senha muito curta", description: "Mínimo 6 caracteres.", variant: "destructive" }); return; }
              if (newPassword !== confirmPassword) { toast({ title: "Senhas não coincidem", variant: "destructive" }); return; }
              setChangingPassword(true);
              try {
                await api.post("/api/auth/change-password", { password: newPassword });
                toast({ title: "Senha alterada!" }); setNewPassword(""); setConfirmPassword("");
              } catch (err: any) {
                toast({ title: "Erro", description: err.message, variant: "destructive" });
              }
              setChangingPassword(false);
            }}>
              {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Alterar Senha
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Save all */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar Alterações
        </Button>
      </div>
    </div>
  );
};

export default SellerConfiguracoes;
