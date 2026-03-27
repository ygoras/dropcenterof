import { useState, useRef } from "react";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { api } from "@/lib/apiClient";
import { toast } from "@/hooks/use-toast";

interface ProductImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
}

export function ProductImageUpload({ images, onChange, maxImages = 6 }: ProductImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadImage = async (file: File) => {
    // Validate: ML requires JPEG/PNG, max 10MB, square or 4:3 preferred
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Formato inválido", description: "Use JPG, PNG ou WebP.", variant: "destructive" });
      return null;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 10MB por imagem.", variant: "destructive" });
      return null;
    }

    try {
      const { url } = await api.upload("/api/upload/product-image", file);
      return url;
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
      return null;
    }
  };

  const handleFiles = async (files: FileList) => {
    const remaining = maxImages - images.length;
    if (remaining <= 0) {
      toast({ title: "Limite atingido", description: `Máximo de ${maxImages} imagens.`, variant: "destructive" });
      return;
    }

    setUploading(true);
    const filesToUpload = Array.from(files).slice(0, remaining);
    const urls: string[] = [];

    for (const file of filesToUpload) {
      const url = await uploadImage(file);
      if (url) urls.push(url);
    }

    if (urls.length > 0) {
      onChange([...images, ...urls]);
      toast({ title: `${urls.length} imagem(ns) enviada(s)!` });
    }
    setUploading(false);
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    const newImages = [...images];
    const [moved] = newImages.splice(from, 1);
    newImages.splice(to, 0, moved);
    onChange(newImages);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">
          Imagens ({images.length}/{maxImages})
        </label>
        <span className="text-[10px] text-muted-foreground">
          ML: JPG/PNG, 1200×1200px ideal, fundo branco
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {images.map((url, i) => (
          <div key={i} className="relative group aspect-square rounded-lg border border-border overflow-hidden bg-secondary/30">
            <img src={url} alt={`Produto ${i + 1}`} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
              {i > 0 && (
                <button onClick={() => moveImage(i, i - 1)} className="w-7 h-7 rounded-full bg-background/90 flex items-center justify-center text-xs font-bold text-foreground hover:bg-background">
                  ←
                </button>
              )}
              <button onClick={() => removeImage(i)} className="w-7 h-7 rounded-full bg-destructive flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-destructive-foreground" />
              </button>
              {i < images.length - 1 && (
                <button onClick={() => moveImage(i, i + 1)} className="w-7 h-7 rounded-full bg-background/90 flex items-center justify-center text-xs font-bold text-foreground hover:bg-background">
                  →
                </button>
              )}
            </div>
            {i === 0 && (
              <span className="absolute top-1 left-1 text-[9px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                PRINCIPAL
              </span>
            )}
          </div>
        ))}

        {images.length < maxImages && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <ImagePlus className="w-6 h-6 mb-1" />
                <span className="text-[10px] font-medium">Adicionar</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      <p className="text-[10px] text-muted-foreground">
        💡 Mercado Livre: use fundo branco, 1200×1200px, sem textos/marcas d'água. A 1ª imagem é a principal do anúncio.
      </p>
    </div>
  );
}
