import { useState, useEffect } from "react";
import { FolderTree, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProductCategory } from "@/types/catalog";

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ProductCategory[];
  onSubmit: (data: { name: string; slug: string; parent_id?: string; ml_category_id?: string }) => Promise<boolean>;
}

export function CategoryFormDialog({ open, onOpenChange, categories, onSubmit }: CategoryFormDialogProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [parentId, setParentId] = useState("");
  const [mlCategoryId, setMlCategoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setSlug("");
      setParentId("");
      setMlCategoryId("");
    }
  }, [open]);

  const generateSlug = (value: string) =>
    value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    const ok = await onSubmit({
      name: name.trim(),
      slug: slug.trim() || generateSlug(name),
      parent_id: parentId || undefined,
      ml_category_id: mlCategoryId.trim() || undefined,
    });
    setSubmitting(false);
    if (ok) onOpenChange(false);
  };

  const inputClass = "w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-primary" />
            Nova Categoria
          </DialogTitle>
          <DialogDescription>
            Crie uma categoria para organizar os produtos do catálogo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Nome *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); if (!slug) setSlug(generateSlug(e.target.value)); }}
              placeholder="Ex: Eletrônicos"
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Slug</label>
            <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="eletronicos" className={inputClass} />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Categoria Pai</label>
            <Select value={parentId || "none"} onValueChange={(v) => setParentId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Nenhuma (raiz)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma (raiz)</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">ID Categoria ML</label>
            <input type="text" value={mlCategoryId} onChange={(e) => setMlCategoryId(e.target.value)} placeholder="MLB1234" className={inputClass} />
            <p className="text-[11px] text-muted-foreground mt-1">ID da categoria no Mercado Livre para mapeamento automático.</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => onOpenChange(false)} className="flex-1 h-10 rounded-lg border border-input text-foreground text-sm font-medium hover:bg-secondary transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !name.trim()}
              className="flex-1 h-10 rounded-lg gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <><Save className="w-4 h-4" /> Criar Categoria</>}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
