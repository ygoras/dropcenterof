import { Loader2, Shield, RefreshCw, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { useAuditLog } from "@/hooks/useAuditLog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { describeAuditEntry, getEntityLabel, getActionLabel } from "@/lib/auditDescriptions";

const actionColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  create: "default",
  seller_created: "default",
  operator_created: "default",
  tenant_created: "default",
  update: "secondary",
  seller_updated: "secondary",
  tenant_updated: "secondary",
  operator_updated: "secondary",
  delete: "destructive",
  login: "outline",
  payment_action: "default",
  webhook_received: "outline",
  webhook_asaas: "outline",
};

const AuditLog = () => {
  const {
    entries, loading, total, page, setPage, totalPages,
    entityTypeFilter, setEntityTypeFilter,
    actionFilter, setActionFilter,
    refetch,
  } = useAuditLog(20);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Logs de Auditoria
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {total} registro(s) encontrado(s)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={entityTypeFilter || "all"} onValueChange={(v) => setEntityTypeFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Entidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas entidades</SelectItem>
            <SelectItem value="seller">Vendedor</SelectItem>
            <SelectItem value="operator">Operador</SelectItem>
            <SelectItem value="payment">Pagamento</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
            <SelectItem value="tenant">Empresa</SelectItem>
          </SelectContent>
        </Select>

        <Select value={actionFilter || "all"} onValueChange={(v) => setActionFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Acao" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas acoes</SelectItem>
            <SelectItem value="seller_created">Criacao vendedor</SelectItem>
            <SelectItem value="seller_updated">Atualizacao vendedor</SelectItem>
            <SelectItem value="operator_created">Criacao operador</SelectItem>
            <SelectItem value="payment_action">Pagamento</SelectItem>
            <SelectItem value="webhook_received">Webhook recebido</SelectItem>
            <SelectItem value="tenant_updated">Atualizacao empresa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Acao</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead>Descricao</TableHead>
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
                      <p className="text-sm font-medium">{entry.user_name || '—'}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={actionColors[entry.action] ?? "secondary"} className="text-xs">
                        {getActionLabel(entry.action)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {getEntityLabel(entry.entity_type)}
                      {entry.entity_id && (
                        <span className="text-xs text-muted-foreground ml-1">#{entry.entity_id.slice(0, 8)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1.5">
                        <span>{describeAuditEntry(entry.action, entry.entity_type, entry.details)}</span>
                        {Object.keys(entry.details).length > 0 && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="w-3.5 h-3.5 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-[400px]">
                                <pre className="text-xs whitespace-pre-wrap">
                                  {JSON.stringify(entry.details, null, 2)}
                                </pre>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Pagina {page} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="gap-1"
            >
              Proxima <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
