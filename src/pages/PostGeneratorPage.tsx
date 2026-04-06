import { useState } from "react";
import { FileText, Sparkles, Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DashboardLayout from "@/components/DashboardLayout";
import { useCredits } from "@/hooks/useCredits";
import { generatePosts, type GeneratedPost } from "@/services/ai";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const CANAIS = ["Instagram", "TikTok", "YouTube", "LinkedIn", "Site prÃ³prio", "WhatsApp"];
const OBJETIVOS = [
  "Vender mais",
  "Gerar leads",
  "Aumentar reconhecimento de marca",
  "Melhorar autoridade",
  "LanÃ§ar um produto",
];
const TIPOS = [
  "Posts para redes sociais",
  "AnÃºncios (ads)",
  "Textos para site",
  "E-mails marketing",
  "Roteiros de vÃ­deo",
  "Imagens com IA",
];

export default function PostGeneratorPage() {
  const { credits } = useCredits();
  const [canal, setCanal] = useState("Instagram");
  const [objetivo, setObjetivo] = useState(OBJETIVOS[0]);
  const [tipoConteudo, setTipoConteudo] = useState(TIPOS[0]);
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState<GeneratedPost[]>([]);
  const queryClient = useQueryClient();

  const handleGenerate = async () => {
    if (!canal || !objetivo || !tipoConteudo) {
      toast.error("Preencha todos os campos obrigatÃ³rios.");
      return;
    }
    if (credits <= 0) {
      toast.error("CrÃ©ditos insuficientes.");
      return;
    }

    setLoading(true);
    try {
      const data = await generatePosts({
        canal,
        objetivo,
        tipo_conteudo: tipoConteudo,
        brief,
        channels: [canal],
      });
      setPosts(data.posts || []);
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      queryClient.invalidateQueries({ queryKey: ["user_summary"] });
      toast.success("Post gerado com sucesso!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar post.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" /> Gerar Posts
            </h1>
            <p className="text-muted-foreground mt-1">
              Gere posts prontos com base no contexto do seu negÃ³cio.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {credits} crÃ©ditos disponÃ­veis
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card border-border shadow-card">
            <CardHeader className="border-b border-border">
              <CardTitle className="font-display text-foreground">Briefing rÃ¡pido</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Canal</label>
                <Select value={canal} onValueChange={setCanal}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {CANAIS.map((item) => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Objetivo</label>
                <Select value={objetivo} onValueChange={setObjetivo}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {OBJETIVOS.map((item) => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Tipo de conteÃºdo</label>
                <Select value={tipoConteudo} onValueChange={setTipoConteudo}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((item) => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Detalhes adicionais (opcional)</label>
                <textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="Ex: campanha de PÃ¡scoa, foco em desconto, linguagem jovem..."
                  className="w-full min-h-[110px] bg-secondary border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/50 transition-colors"
                />
              </div>

              <Button
                onClick={handleGenerate}
                className="w-full gradient-primary text-primary-foreground hover:opacity-90"
                disabled={loading}
              >
                {loading ? "Gerando..." : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" /> Gerar Post
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-card">
            <CardHeader className="border-b border-border">
              <CardTitle className="font-display text-foreground">Resultado</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {posts.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Preencha o briefing para gerar o post.
                </div>
              ) : (
                posts.map((post, idx) => (
                  <div key={idx} className="border border-border rounded-xl p-4 bg-secondary/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-muted-foreground">{post.canal}</div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(post.texto_pronto || "");
                          toast.success("Texto copiado!");
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Texto pronto</p>
                      <p className="text-sm text-foreground whitespace-pre-line">{post.texto_pronto}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">CTA</p>
                      <p className="text-sm text-foreground">{post.cta}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">SugestÃ£o visual</p>
                      <p className="text-sm text-foreground">{post.sugestao_visual}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
