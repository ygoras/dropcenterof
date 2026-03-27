import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import type { TicketPriority } from "@/hooks/useTickets";

interface Props {
  onSubmit: (subject: string, category: string, priority: TicketPriority, message: string) => Promise<any>;
}

const categories = ["Dúvida", "Problema técnico", "Financeiro", "Logística", "Integração ML", "Outro"];

export function NewTicketDialog({ onSubmit }: Props) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("Dúvida");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) return;
    setSaving(true);
    await onSubmit(subject, category, priority, message);
    setSaving(false);
    setSubject("");
    setMessage("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" /> Novo Ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Abrir Ticket de Suporte</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Assunto</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Resumo do problema" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Mensagem</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Descreva o problema em detalhes..." rows={4} />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={saving || !subject.trim() || !message.trim()} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Criar Ticket
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
