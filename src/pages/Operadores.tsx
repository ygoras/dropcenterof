import { useState } from "react";
import {
  HardHat,
  Plus,
  Search,
  UserCheck,
  UserX,
  MoreHorizontal,
  RefreshCw,
  Pencil,
  Trash2,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { useOperators, Operator } from "@/hooks/useOperators";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const Operadores = () => {
  const { operators, loading, createOperator, toggleActive, updateOperator, deleteOperator, refetch } = useOperators();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [editForm, setEditForm] = useState({ name: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);

  const filtered = operators.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) return;
    setSubmitting(true);
    await createOperator(form);
    setForm({ name: "", email: "", password: "", phone: "" });
    setDialogOpen(false);
    setSubmitting(false);
  };

  const handleEdit = (op: Operator) => {
    setSelectedOperator(op);
    setEditForm({ name: op.name, phone: op.phone || "" });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOperator || !editForm.name) return;
    setSubmitting(true);
    await updateOperator(selectedOperator.id, editForm);
    setEditDialogOpen(false);
    setSelectedOperator(null);
    setSubmitting(false);
  };

  const handleDelete = (op: Operator) => {
    setSelectedOperator(op);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedOperator) return;
    setSubmitting(true);
    await deleteOperator(selectedOperator.id);
    setDeleteDialogOpen(false);
    setSelectedOperator(null);
    setSubmitting(false);
  };

  return (
    <div className="space-y-6 max-w-[1200px] animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <HardHat className="w-6 h-6 text-primary" />
            Gestão de Operadores
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {operators.length} operador{operators.length !== 1 ? "es" : ""} cadastrado{operators.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 self-start">
          <button
            onClick={refetch}
            className="h-10 px-4 rounded-lg border border-border bg-card text-foreground text-sm font-medium flex items-center gap-2 hover:bg-secondary/50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDialogOpen(true)}
            className="h-10 px-4 gradient-primary text-primary-foreground rounded-lg font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Novo Operador
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou e-mail..."
          className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
        />
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <HardHat className="w-10 h-10 mb-3 opacity-40" />
            <p className="font-medium">Nenhum operador encontrado</p>
            <p className="text-sm mt-1">
              {search ? "Tente outra busca" : "Cadastre o primeiro operador para o galpão"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Nome</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">E-mail</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Telefone</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground">Cadastro</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((op) => (
                  <tr key={op.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">
                          {op.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-foreground">{op.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{op.email}</td>
                    <td className="py-3 px-4 text-muted-foreground">{op.phone || "—"}</td>
                    <td className="py-3 px-4 text-center">
                      <StatusBadge
                        status={op.is_active ? "active" : "cancelled"}
                        label={op.is_active ? "Ativo" : "Inativo"}
                      />
                    </td>
                    <td className="py-3 px-4 text-center text-xs text-muted-foreground">
                      {new Date(op.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(op)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleActive(op.id, op.is_active)}>
                            {op.is_active ? (
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
                            onClick={() => handleDelete(op)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardHat className="w-5 h-5 text-primary" />
              Novo Operador
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Nome <span className="text-destructive">*</span>
              </label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome completo" className="w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                E-mail <span className="text-destructive">*</span>
              </label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="operador@email.com" className="w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Senha <span className="text-destructive">*</span>
              </label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" className="w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm" required minLength={6} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Telefone</label>
              <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-9999" className="w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setDialogOpen(false)} className="h-10 px-4 rounded-lg border border-border bg-card text-foreground text-sm font-medium hover:bg-secondary/50 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={submitting} className="h-10 px-6 gradient-primary text-primary-foreground rounded-lg font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50">
                {submitting ? "Criando..." : "Criar Operador"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              Editar Operador
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Nome <span className="text-destructive">*</span>
              </label>
              <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">E-mail</label>
              <input type="email" value={selectedOperator?.email || ""} disabled className="w-full h-10 px-3 rounded-lg border border-input bg-muted text-muted-foreground text-sm cursor-not-allowed" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Telefone</label>
              <input type="tel" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="(11) 99999-9999" className="w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setEditDialogOpen(false)} className="h-10 px-4 rounded-lg border border-border bg-card text-foreground text-sm font-medium hover:bg-secondary/50 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={submitting} className="h-10 px-6 gradient-primary text-primary-foreground rounded-lg font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50">
                {submitting ? "Salvando..." : "Salvar Alterações"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover operador?</AlertDialogTitle>
            <AlertDialogDescription>
              O operador <strong>{selectedOperator?.name}</strong> será desativado e perderá acesso ao portal de operação. Esta ação pode ser revertida reativando o usuário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Operadores;
