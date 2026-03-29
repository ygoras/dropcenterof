import { useState } from "react";
import {
  Users,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  UserX,
  UserCheck,
  Filter,
  CreditCard,
  Trash2,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { useSellers, SellerWithDetails } from "@/hooks/useSellers";
import { usePlans } from "@/hooks/usePlans";
import { SellerFormDialog } from "@/components/sellers/SellerFormDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const subStatusLabels: Record<string, { label: string; status: "active" | "pending" | "error" | "completed" }> = {
  active: { label: "Ativo", status: "active" },
  overdue: { label: "Inadimplente", status: "pending" },
  blocked: { label: "Bloqueado", status: "error" },
  cancelled: { label: "Cancelado", status: "error" },
};

const Vendedores = () => {
  const { sellers, loading, createSeller, updateSeller, toggleActive, softDeleteSeller, sendPasswordReset } = useSellers();
  const { plans } = usePlans();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSeller, setEditingSeller] = useState<SellerWithDetails | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SellerWithDetails | null>(null);

  const filtered = sellers.filter((s) => {
    const matchSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      (s.tenant_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && s.is_active) ||
      (statusFilter === "inactive" && !s.is_active);
    return matchSearch && matchStatus;
  });

  const handleEdit = (seller: SellerWithDetails) => {
    setEditingSeller(seller);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingSeller(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Gestão de Vendedores
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {sellers.length} vendedor{sellers.length !== 1 ? "es" : ""} cadastrado{sellers.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="h-10 px-4 gradient-primary text-primary-foreground rounded-lg font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Novo Vendedor
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou empresa..."
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Users className="w-10 h-10 mb-3 opacity-40" />
            <p className="font-medium">Nenhum vendedor encontrado</p>
            <p className="text-sm mt-1">
              {search ? "Tente outra busca" : "Crie o primeiro vendedor"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Nome</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Empresa</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Plano</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Assinatura</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Vencimento</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Cadastro</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((seller) => {
                  const subInfo = seller.subscription_status
                    ? subStatusLabels[seller.subscription_status] ?? { label: seller.subscription_status, status: "pending" as const }
                    : null;

                  return (
                    <tr
                      key={seller.id}
                      className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0">
                            {seller.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-medium text-foreground block">{seller.name}</span>
                            <span className="text-xs text-muted-foreground">{seller.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{seller.tenant_name || "—"}</td>
                      <td className="py-3 px-4">
                        {seller.plan_name ? (
                          <div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
                              {seller.plan_name}
                            </span>
                            <span className="text-xs text-muted-foreground block mt-0.5">
                              R$ {seller.plan_price?.toFixed(2).replace(".", ",")}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {subInfo ? (
                          <StatusBadge status={subInfo.status} label={subInfo.label} />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {seller.billing_day ? `Dia ${seller.billing_day}` : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge
                          status={seller.is_active ? "active" : "error"}
                          label={seller.is_active ? "Ativo" : "Inativo"}
                        />
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {new Date(seller.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(seller)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleActive(seller.id, seller.is_active)}>
                              {seller.is_active ? (
                                <>
                                  <UserX className="w-4 h-4 mr-2" />
                                  Desativar
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-4 h-4 mr-2" />
                                  Ativar
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(seller)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog */}
      <SellerFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        seller={editingSeller}
        plans={plans}
        onSubmitCreate={createSeller}
        onSubmitUpdate={updateSeller}
        onSendPasswordReset={sendPasswordReset}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir vendedor?</AlertDialogTitle>
            <AlertDialogDescription>
              O vendedor <strong>{deleteTarget?.name}</strong> será desativado. Seus dados serão preservados para relatórios e histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) softDeleteSeller(deleteTarget.id);
                setDeleteTarget(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Vendedores;
