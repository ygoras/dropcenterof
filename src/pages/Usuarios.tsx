import { useState } from "react";
import {
  Shield,
  Plus,
  Search,
  UserCheck,
  UserX,
  MoreHorizontal,
  Pencil,
  KeyRound,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { useInternalUsers, InternalUser } from "@/hooks/useInternalUsers";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
};

const Usuarios = () => {
  const { users, loading, createUser, toggleActive, updateUser, sendPasswordReset } = useInternalUsers();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<InternalUser | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", role: "manager" as "admin" | "manager" });
  const [editForm, setEditForm] = useState({ name: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) return;
    setSubmitting(true);
    const ok = await createUser(form);
    if (ok) {
      setDialogOpen(false);
      setForm({ name: "", email: "", password: "", phone: "", role: "manager" });
    }
    setSubmitting(false);
  };

  const handleEdit = (user: InternalUser) => {
    setSelectedUser(user);
    setEditForm({ name: user.name, phone: user.phone || "" });
    setEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedUser || !editForm.name) return;
    setSubmitting(true);
    const ok = await updateUser(selectedUser.id, editForm);
    if (ok) {
      setEditDialogOpen(false);
      setSelectedUser(null);
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Usuários Internos
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {users.length} usuário{users.length !== 1 ? "s" : ""} da plataforma
          </p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="h-10 px-4 gradient-primary text-primary-foreground rounded-lg font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Novo Usuário
        </button>
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
            <Shield className="w-10 h-10 mb-3 opacity-40" />
            <p className="font-medium">Nenhum usuário encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Nome</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Perfil</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Cadastro</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-medium text-foreground block">{user.name}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1.5">
                        {user.roles.map((role) => (
                          <span
                            key={role}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary"
                          >
                            {roleLabels[role] || role}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge
                        status={user.is_active ? "active" : "error"}
                        label={user.is_active ? "Ativo" : "Inativo"}
                      />
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-xs">
                      {new Date(user.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(user)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => sendPasswordReset(user.email)}>
                            <KeyRound className="w-4 h-4 mr-2" />
                            Resetar Senha
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => toggleActive(user.id, user.is_active)}>
                            {user.is_active ? (
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Usuário Interno</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium text-foreground">Nome *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full h-10 px-3 mt-1 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Nome completo"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">E-mail *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full h-10 px-3 mt-1 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="email@exemplo.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Senha *</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full h-10 px-3 mt-1 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Telefone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full h-10 px-3 mt-1 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="(00) 00000-0000"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Perfil *</label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "admin" | "manager" })}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Gerente</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button
              onClick={handleCreate}
              disabled={submitting || !form.name || !form.email || !form.password}
              className="w-full h-10 gradient-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? "Criando..." : "Criar Usuário"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium text-foreground">Nome</label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full h-10 px-3 mt-1 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Telefone</label>
              <input
                type="text"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="w-full h-10 px-3 mt-1 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={handleUpdate}
              disabled={submitting || !editForm.name}
              className="w-full h-10 gradient-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Usuarios;
