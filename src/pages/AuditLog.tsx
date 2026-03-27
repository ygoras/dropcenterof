import { Loader2, Shield, RefreshCw } from "lucide-react";
import { useAuditLog } from "@/hooks/useAuditLog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const actionColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  create: "default",
  update: "secondary",
  delete: "destructive",
  login: "outline",
};

const AuditLog = () => {
  const { entries, loading, refetch } = useAuditLog(200);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Logs de Auditoria
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Registro de todas as ações críticas do sistema</p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead>Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhum registro encontrado
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {format(new Date(entry.created_at), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{entry.user_name}</p>
                      <p className="text-xs text-muted-foreground">{entry.user_email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={actionColors[entry.action] ?? "secondary"} className="text-xs">
                      {entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.entity_type}
                    {entry.entity_id && <span className="text-xs text-muted-foreground ml-1">#{entry.entity_id.slice(0, 8)}</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                    {Object.keys(entry.details).length > 0 ? JSON.stringify(entry.details) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AuditLog;
