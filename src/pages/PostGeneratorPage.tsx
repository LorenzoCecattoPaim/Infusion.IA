import { useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Sparkles,
  Upload,
  Download,
  Copy,
  Loader2,
  Edit3,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import DashboardLayout from "@/components/DashboardLayout";
import {
  generateImage,
  generatePostPrompt,
  type GenerateImageItem,
} from "@/services/ai";
import { useCredits } from "@/hooks/useCredits";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CREDIT_COSTS } from "@/lib/credits";
import { useDebouncedAction } from "@/hooks/useDebouncedAction";

const TIPOS = ["Produto", "Promocional", "Institucional", "Datas comemorativas"];
const FORMATOS = [
  { value: "youtube_thumbnail", label: "Thumbnail YouTube", ratio: "16:9" },
  { value: "youtube_banner", label: "Banner YouTube", ratio: "16:9" },
  { value: "instagram_1x1", label: "Instagram 1:1", ratio: "1:1" },
  { value: "stories_16x9", label: "Post 16:9 Stories", ratio: "16:9" },
];
const ESTILOS = ["Clean", "Moderno", "Luxuoso", "Minimalista", "Colorido"];

interface HistoryImage {
  id: string;
  url: string;
  prompt: string;
  createdAt: string;
}

export default function PostGeneratorPage() {
  const { credits } = useCredits();
  const queryClient = useQueryClient();
  const imageCost = CREDIT_COSTS.image;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productFileInputRef = useRef<HTMLInputElement>(null);

  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [productImageDataUrl, setProductImageDataUrl] = useState<string | null>(null);
  const [tipoPost, setTipoPost] = useState(TIPOS[0]);
  const [descricao, setDescricao] = useState("");
  const [formato, setFormato] = useState(FORMATOS[2].value);
  const [estilo, setEstilo] = useState(ESTILOS[0]);
  const [incluirEspacoLogo, setIncluirEspacoLogo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<GenerateImageItem[]>([]);
  const [lastPrompt, setLastPrompt] = useState("");
  const [promptDraft, setPromptDraft] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryImage[]>([]);
  const [promptNotes, setPromptNotes] = useState<string | null>(null);
  const runDebounced = useDebouncedAction(500);

  // Logo persistence
  useEffect(() => {
    const savedLogo = localStorage.getItem("infusion_post_logo");
    if (savedLogo) setLogoDataUrl(savedLogo);
  }, []);

  useEffect(() => {
    if (logoDataUrl) {
      localStorage.setItem("infusion_post_logo", logoDataUrl);
    } else {
      localStorage.removeItem("infusion_post_logo");
    }
  }, [logoDataUrl]);

  // Product image persistence
  useEffect(() => {
    const savedProduct = localStorage.getItem("infusion_post_product");
    if (savedProduct) setProductImageDataUrl(savedProduct);
  }, []);

  useEffect(() => {
    if (productImageDataUrl) {
      localStorage.setItem("infusion_post_product", productImageDataUrl);
    } else {
      localStorage.removeItem("infusion_post_product");
    }
  }, [productImageDataUrl]);

  const handleFile = (file?: File | null, target: "logo" | "product" = "logo") => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (target === "logo") {
        setLogoDataUrl(reader.result as string);
      } else {
        setProductImageDataUrl(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async (overridePrompt?: string) => {
    if (!descricao.trim()) {
      toast.error("Descreva o post que você quer gerar.");
      return;
    }
    if (credits < imageCost) {
      toast.error(
        `Créditos insuficientes. Necessário: ${imageCost}, disponível: ${credits}`
      );
      return;
    }

    setLoading(true);
    setQuestions([]);

    try {
      let promptToUse = overridePrompt;
      let observacoes: string | null = null;

      if (!promptToUse) {
        const promptResponse = await generatePostPrompt({
          tipo_post: tipoPost,
          descricao,
          formato: FORMATOS.find((f) => f.value === formato)?.label || formato,
          estilo,
          incluir_espaco_logo: incluirEspacoLogo,
          logo_presente: !!logoDataUrl,
          product_image_presente: !!productImageDataUrl,
        });

        if (promptResponse.perguntas?.length) {
          setQuestions(promptResponse.perguntas);
          toast.message("Precisamos de mais detalhes para gerar o post.");
          setLoading(false);
          return;
        }

        promptToUse = promptResponse.prompt;
        observacoes = promptResponse.observacoes || null;
      }

      if (!promptToUse) {
        toast.error("Não foi possível gerar o prompt do post.");
        setLoading(false);
        return;
      }

      setLastPrompt(promptToUse);
      setPromptDraft(promptToUse);
      setPromptNotes(observacoes);

      const result = await generateImage({
        prompt: promptToUse,
        style: estilo,
        format: formato,
        incluir_espaco_logo: incluirEspacoLogo,
        product_image: productImageDataUrl ?? undefined,
      });

      setImages(result.images || []);
      setHistory((prev) => [
        ...(result.images || []).map((img: GenerateImageItem) => ({
          id: String(img.id || Date.now()),
          url: img.url,
          prompt: promptToUse || "",
          createdAt: new Date().toISOString(),
        })),
        ...prev,
      ].slice(0, 8));

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard_stats"] }),
      ]);
      toast.success("Post gerado com sucesso.");
    } catch (err) {
      console.error("[AI] Post generator error", err);
      toast.error(err instanceof Error ? err.message : "Erro ao gerar post.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (url: string, id?: string | number) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `post-${id || Date.now()}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error("[AI] Download error", err);
      toast.error("Erro ao baixar imagem.");
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado com 1 clique.");
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
              <ImageIcon className="h-6 w-6 text-primary" /> Gerador de Posts
            </h1>
            <p className="text-muted-foreground mt-1">
              Crie imagens para produtos, campanhas e redes sociais em poucos cliques.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {credits} créditos disponíveis
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card border-border shadow-card">
            <CardHeader className="border-b border-border">
              <CardTitle className="font-display text-foreground">Briefing do post</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">

              {/* Upload de logo */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Upload de logo</label>
                <div
                  className="border border-dashed border-border rounded-2xl p-4 bg-secondary/40 text-center cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFile(e.dataTransfer.files?.[0], "logo");
                  }}
                >
                  {logoDataUrl ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={logoDataUrl}
                        alt="Logo"
                        className="h-12 w-12 rounded-lg object-contain bg-background"
                      />
                      <div className="text-left">
                        <p className="text-sm text-foreground font-medium">Logo carregada</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLogoDataUrl(null);
                          }}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="h-5 w-5 text-muted-foreground mx-auto" />
                      <p className="text-sm text-muted-foreground">
                        Arraste e solte ou clique para enviar
                      </p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0], "logo")}
                  />
                </div>
              </div>

              {/* Upload de imagem do produto */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Imagem do produto</label>
                <div
                  className="border border-dashed border-border rounded-2xl p-4 bg-secondary/40 text-center cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => productFileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFile(e.dataTransfer.files?.[0], "product");
                  }}
                >
                  {productImageDataUrl ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={productImageDataUrl}
                        alt="Produto"
                        className="h-12 w-12 rounded-lg object-contain bg-background"
                      />
                      <div className="text-left">
                        <p className="text-sm text-foreground font-medium">Imagem carregada</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProductImageDataUrl(null);
                          }}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="h-5 w-5 text-muted-foreground mx-auto" />
                      <p className="text-sm text-muted-foreground">
                        Arraste e solte ou clique para enviar a imagem do produto
                      </p>
                    </div>
                  )}
                  <input
                    ref={productFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0], "product")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Tipo de post</label>
                <Select value={tipoPost} onValueChange={setTipoPost}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Descrição do post</label>
                <Textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex.: lançamento de produto com destaque para benefícios e chamada para compra"
                  className="min-h-[120px] bg-secondary border-border"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Formato da imagem</label>
                  <Select value={formato} onValueChange={setFormato}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMATOS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Estilo visual</label>
                  <Select value={estilo} onValueChange={setEstilo}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTILOS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Checkbox
                  id="espaco-logo"
                  checked={incluirEspacoLogo}
                  onCheckedChange={(val) => setIncluirEspacoLogo(Boolean(val))}
                />
                <label htmlFor="espaco-logo" className="text-sm text-foreground">
                  Incluir espaço para logotipo no canto inferior direito
                </label>
              </div>

              <Button
                onClick={() => runDebounced(() => void handleGenerate())}
                className="w-full gradient-primary text-primary-foreground hover:opacity-90"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" /> Gerar Post — {imageCost} créditos
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Custo por geração: {imageCost} créditos
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-card">
            <CardHeader className="border-b border-border flex flex-row items-center justify-between">
              <CardTitle className="font-display text-foreground">Preview do post</CardTitle>
              {lastPrompt && (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleCopy(lastPrompt)}>
                    <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      runDebounced(() => void handleGenerate(lastPrompt))
                    }
                    disabled={loading}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Gerar variação
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {questions.length > 0 && (
                <div className="border border-border rounded-xl p-4 bg-secondary/20">
                  <p className="text-xs text-muted-foreground mb-2">Precisamos de mais detalhes:</p>
                  <ul className="space-y-1 text-sm text-foreground">
                    {questions.map((q, idx) => (
                      <li key={`${q}-${idx}`}>- {q}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">
                    Responda ajustando a descrição e gere novamente.
                  </p>
                </div>
              )}

              {images.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Preencha o briefing para gerar a imagem do seu post.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {images.map((img, index) => (
                      <div key={img.id} className="rounded-2xl overflow-hidden border border-border">
                        <img
                          src={img.url}
                          alt="Post gerado"
                          className="w-full object-cover"
                        />
                        <div className="p-3 bg-card flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Variação</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDownload(img.url, img.id || index)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {lastPrompt && (
                    <div className="border border-border rounded-xl p-4 bg-secondary/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Prompt usado</p>
                        <Button size="sm" variant="outline" onClick={() => setPromptDraft(lastPrompt)}>
                          <Edit3 className="h-3.5 w-3.5 mr-1.5" /> Editar prompt
                        </Button>
                      </div>
                      <Textarea
                        value={promptDraft}
                        onChange={(e) => setPromptDraft(e.target.value)}
                        className="min-h-[110px] bg-background border-border"
                      />
                      <Button
                        onClick={() =>
                          runDebounced(() => void handleGenerate(promptDraft))
                        }
                        className="gradient-primary text-primary-foreground hover:opacity-90"
                        disabled={loading || !promptDraft.trim()}
                      >
                        Gerar com prompt editado
                      </Button>
                    </div>
                  )}

                  {promptNotes && (
                    <div className="border border-border rounded-xl p-4 bg-secondary/20">
                      <p className="text-xs text-muted-foreground mb-2">Notas do agente</p>
                      <p className="text-sm text-foreground">{promptNotes}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {history.length > 0 && (
          <Card className="bg-card border-border shadow-card">
            <CardHeader className="border-b border-border">
              <CardTitle className="font-display text-foreground">Histórico de gerações</CardTitle>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              {history.map((item) => (
                <div key={item.id} className="rounded-xl overflow-hidden border border-border">
                  <img src={item.url} alt="Histórico" className="w-full object-cover" />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}