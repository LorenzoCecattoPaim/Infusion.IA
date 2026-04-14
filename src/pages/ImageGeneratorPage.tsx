import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Loader2,
  Download,
  Copy,
  Zap,
  Crown,
  Image,
  ShoppingBag,
  Utensils,
  Building2,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import DashboardLayout from "@/components/DashboardLayout";
import { useCredits } from "@/hooks/useCredits";
import { useGeneratedImages, type GeneratedImage } from "@/hooks/useGeneratedImages";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CREDIT_COSTS } from "@/lib/credits";
import { generateImage, type GenerateImageItem } from "@/services/ai";
import { useDebouncedAction } from "@/hooks/useDebouncedAction";

const templates = [
  { id: "post-instagram", label: "Post Instagram", icon: Image },
  { id: "produto", label: "Produto", icon: ShoppingBag },
  { id: "gastronomia", label: "Gastronomia", icon: Utensils },
  { id: "corporativo", label: "Corporativo", icon: Building2 },
  { id: "criativo", label: "Criativo", icon: Palette },
];

export default function ImageGeneratorPage() {
  const [prompt, setPrompt] = useState("");
  const [quality, setQuality] = useState<"standard" | "premium">("standard");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [selectionResult, setSelectionResult] = useState<GenerateImageItem[] | null>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { credits } = useCredits();
  const { generatedImages, isLoading: imagesLoading } = useGeneratedImages();
  const imageCost = CREDIT_COSTS.image;
  const runDebounced = useDebouncedAction(500);

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast.error("Descreva a imagem que você quer criar.");
      return;
    }

    if (credits < imageCost) {
      toast.error(`Créditos insuficientes. Necessário: ${imageCost}, disponível: ${credits}`);
      return;
    }

    setSelectionResult(null);
    generateMutation.mutate();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        runDebounced(() => handleGenerate());
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [runDebounced, prompt, quality, credits, selectedTemplate]);

  const generateMutation = useMutation({
    mutationFn: async () =>
      generateImage({
        prompt,
        quality,
        template: selectedTemplate,
      }),
    onSuccess: async (data) => {
      if (data.images?.length) {
        setSelectionResult(data.images);
        galleryRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["generated_images"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard_stats"] }),
      ]);
      toast.success("Imagens geradas! Escolha sua favorita.");
    },
    onError: (err: Error) => {
      console.error("[AI] generate-image error", err);
      toast.error(err.message);
    },
  });

  const handleSelectImage = (img: GenerateImageItem) => {
    setSelectionResult(null);
    setSelectedImage({
      id: String(img.id || Date.now()),
      url: img.url,
      prompt: img.prompt || prompt,
      optimized_prompt: img.optimized_prompt || null,
      negative_prompt: img.negative_prompt || null,
      quality,
      created_at: new Date().toISOString(),
    });
  };

  const handleDownload = async (img: GeneratedImage) => {
    try {
      const res = await fetch(img.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `infusion-ia-${img.id}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[AI] Download error", err);
      toast.error("Erro ao baixar imagem.");
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col lg:flex-row h-[calc(100vh-3.5rem)] overflow-hidden">
        <div className="w-full lg:w-[420px] xl:w-[460px] border-r border-border flex flex-col shrink-0 bg-card/50">
          <div className="p-5 flex-1 overflow-y-auto space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-display text-lg font-bold text-foreground">
                  Gerador de imagens
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Crie imagens profissionais com IA
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  credits < imageCost
                    ? "border-destructive text-destructive"
                    : "border-border text-muted-foreground"
                }
              >
                <Zap className="h-3 w-3 mr-1" />
                {credits} créditos
              </Badge>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Descreva sua imagem
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ex.: foto de produto minimalista, fundo claro, estilo moderno..."
                className="w-full min-h-[120px] bg-secondary border border-border rounded-2xl p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/50 transition-colors"
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground text-right">
                {prompt.length}/2000
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Modelos</label>
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() =>
                      setSelectedTemplate(t.id === selectedTemplate ? null : t.id)
                    }
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 ${
                      selectedTemplate === t.id
                        ? "gradient-primary text-primary-foreground border-transparent"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    <t.icon className="h-3 w-3" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Qualidade</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    id: "standard",
                    label: "Padrão",
                    icon: Zap,
                    cost: imageCost,
                    desc: "Rápido e eficiente",
                  },
                  {
                    id: "premium",
                    label: "Premium",
                    icon: Crown,
                    cost: imageCost,
                    desc: "Alta resolução",
                  },
                ].map((q) => (
                  <button
                    key={q.id}
                    onClick={() => setQuality(q.id as "standard" | "premium")}
                    className={`p-3 rounded-xl border text-left transition-all duration-200 ${
                      quality === q.id
                        ? "border-primary/50 bg-primary/10 shadow-glow"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <q.icon
                      className={`h-4 w-4 mb-1 ${
                        quality === q.id ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <p className="text-xs font-semibold text-foreground">{q.label}</p>
                    <p className="text-xs text-muted-foreground">{q.desc}</p>
                    <p className="text-xs font-bold text-primary mt-1">
                      {q.cost} créditos
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-5 border-t border-border">
            <Button
              onClick={() => runDebounced(() => handleGenerate())}
              disabled={!prompt.trim() || generateMutation.isPending}
              className="w-full h-12 gradient-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Gerar imagens - {imageCost} créditos
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Ctrl+Enter para gerar rápido
            </p>
          </div>
        </div>

        <div ref={galleryRef} className="flex-1 overflow-y-auto p-5 bg-background">
          {selectionResult && selectionResult.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Escolha uma variação:
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {selectionResult.map((img, i) => (
                  <div
                    key={i}
                    className="rounded-2xl overflow-hidden shadow-card cursor-pointer hover:shadow-glow transition-shadow"
                    onClick={() => handleSelectImage(img)}
                  >
                    <img
                      src={img.url}
                      alt={`Variação ${i + 1}`}
                      className="w-full aspect-square object-cover"
                    />
                    <div className="p-2 bg-card text-center border-t border-border">
                      <span className="text-xs text-muted-foreground">
                        Variação {i + 1}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {generateMutation.isPending && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="w-full aspect-square rounded-2xl" />
              ))}
            </div>
          )}

          {!generateMutation.isPending &&
            (imagesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="w-full aspect-square rounded-2xl" />
                ))}
              </div>
            ) : generatedImages.length > 0 ? (
              <>
                {!selectionResult && (
                  <p className="text-xs text-muted-foreground mb-4 font-medium uppercase tracking-wider">
                    Histórico de imagens
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {generatedImages.map((img) => (
                    <div
                      key={img.id}
                      className="group relative rounded-2xl overflow-hidden shadow-card cursor-pointer"
                      onClick={() => setSelectedImage(img)}
                    >
                      <img
                        src={img.url}
                        alt={img.prompt}
                        className="w-full aspect-square object-cover"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(img);
                          }}
                        >
                          <Download className="h-4 w-4 text-white" />
                        </button>
                        <button
                          className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(img.prompt);
                            toast.success("Prompt copiado.");
                          }}
                        >
                          <Copy className="h-4 w-4 text-white" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-20">
                <div className="gradient-primary rounded-2xl p-4 mb-4 shadow-glow">
                  <Image className="h-8 w-8 text-primary-foreground" />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                  Nenhuma imagem ainda
                </h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Descreva a imagem que você quer criar e clique em Gerar imagens.
                </p>
              </div>
            ))}
        </div>

        <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
          <DialogContent className="max-w-3xl bg-card border-border rounded-2xl p-0 overflow-hidden">
            {selectedImage && (
              <>
                <img
                  src={selectedImage.url}
                  alt={selectedImage.prompt}
                  className="w-full max-h-96 object-cover"
                />
                <div className="p-5 space-y-4">
                  <DialogHeader>
                    <DialogTitle className="font-display text-foreground">
                      Detalhes da imagem
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Prompt original
                      </p>
                      <p className="text-sm text-foreground bg-secondary rounded-lg p-2">
                        {selectedImage.prompt}
                      </p>
                    </div>
                    {selectedImage.optimized_prompt && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                          Prompt otimizado
                        </p>
                        <p className="text-sm text-foreground bg-secondary rounded-lg p-2">
                          {selectedImage.optimized_prompt}
                        </p>
                      </div>
                    )}
                    {selectedImage.negative_prompt && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                          Prompt negativo
                        </p>
                        <p className="text-sm text-foreground bg-secondary rounded-lg p-2">
                          {selectedImage.negative_prompt}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleDownload(selectedImage)}
                      className="gradient-primary text-primary-foreground hover:opacity-90"
                    >
                      <Download className="h-4 w-4 mr-2" /> Baixar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedImage.prompt);
                        toast.success("Prompt copiado.");
                      }}
                    >
                      <Copy className="h-4 w-4 mr-2" /> Copiar prompt
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
