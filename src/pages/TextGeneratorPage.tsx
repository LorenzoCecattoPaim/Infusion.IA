import { useState } from "react";
import { Sparkles, Copy, RefreshCw, Lightbulb, Loader2, Wand2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import DashboardLayout from "@/components/DashboardLayout";
import { generateText, type GenerateTextResponse } from "@/services/ai";
import { useCredits } from "@/hooks/useCredits";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const CONTENT_TYPES = [
  { value: "Legenda Instagram", label: "Legenda Instagram", limit: 2200 },
  { value: "Legenda Facebook", label: "Legenda Facebook", limit: 63206 },
  { value: "Legenda LinkedIn", label: "Legenda LinkedIn", limit: 3000 },
  { value: "Título", label: "Título", limit: 0 },
  { value: "Descrição", label: "Descrição", limit: 0 },
  { value: "Prompt para IA", label: "Prompt para IA", limit: 0 },
];

const TONES = ["Profissional", "Descontraído", "Persuasivo", "Educativo"];

interface HistoryItem extends GenerateTextResponse {
  id: string;
  tipo: string;
  createdAt: string;
}

export default function TextGeneratorPage() {
  const { credits } = useCredits();
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState(CONTENT_TYPES[0].value);
  const [descricao, setDescricao] = useState("");
  const [publico, setPublico] = useState("");
  const [tom, setTom] = useState(TONES[0]);
  const [refineNotes, setRefineNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateTextResponse | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const limit = CONTENT_TYPES.find((c) => c.value === tipo)?.limit ?? 0;

  const handleGenerate = async (opts?: { variation?: boolean; refine?: boolean }) => {
    if (!descricao.trim()) {
      toast.error("Descreva o que vocÃª quer gerar.");
      return;
    }

    setLoading(true);
    try {
      const data = await generateText({
        tipo_conteudo: tipo,
        descricao,
        publico_alvo: publico || undefined,
        tom_voz: tom || undefined,
        variation: opts?.variation ?? false,
        refine_notes: opts?.refine ? refineNotes : undefined,
        previous_text: opts?.refine ? result?.texto : undefined,
      });

      setResult(data);
      setHistory((prev) => [
        {
          ...data,
          id: `${Date.now()}`,
          tipo,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 8));
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard_stats"] });
      toast.success("Texto gerado com sucesso.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar texto.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text?: string | null) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success("Copiado com 1 clique.");
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" /> Gerador de Texto
            </h1>
            <p className="text-muted-foreground mt-1">
              Crie legendas, tÃ­tulos, descriÃ§Ãµes e prompts prontos para IA.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {credits} crÃ©ditos disponÃ­veis
          </div>
        </div>

        <Card className="bg-card border-border shadow-card">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="gradient-primary rounded-xl p-2">
              <Lightbulb className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm text-foreground font-medium">Dica rÃ¡pida</p>
              <p className="text-xs text-muted-foreground mt-1">
                Para gerar imagens mais precisas, vocÃª pode primeiro criar um prompt detalhado aqui e depois usÃ¡-lo no Gerador de Posts. Quanto mais especÃ­fico (cores, estilo, cenÃ¡rio, iluminaÃ§Ã£o), melhor serÃ¡ o resultado da IA.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card border-border shadow-card">
            <CardHeader className="border-b border-border">
              <CardTitle className="font-display text-foreground">Briefing</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Tipo de conteÃºdo</label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_TYPES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {limit > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Limite de caracteres: {limit}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Descreva o que vocÃª quer gerar</label>
                <Textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Descreva o que vocÃª quer gerar..."
                  className="min-h-[140px] bg-secondary border-border"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">PÃºblico-alvo (opcional)</label>
                <Input
                  value={publico}
                  onChange={(e) => setPublico(e.target.value)}
                  placeholder="Ex.: jovens, empresas, mulheres..."
                  className="bg-secondary border-border"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Tom de voz (opcional)</label>
                <Select value={tom} onValueChange={setTom}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {TONES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Refinar resultado (opcional)</label>
                <Input
                  value={refineNotes}
                  onChange={(e) => setRefineNotes(e.target.value)}
                  placeholder="Ex.: deixe mais curto, mais persuasivo..."
                  className="bg-secondary border-border"
                />
              </div>

              <Button
                onClick={() => handleGenerate()}
                className="w-full gradient-primary text-primary-foreground hover:opacity-90"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Gerar Texto
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-card">
            <CardHeader className="border-b border-border flex flex-row items-center justify-between">
              <CardTitle className="font-display text-foreground">Resultado</CardTitle>
              {result && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(result.texto)}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleGenerate({ variation: true })}
                    disabled={loading}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Gerar variaÃ§Ã£o
                  </Button>
                  <Button
                    size="sm"
                    className="gradient-primary text-primary-foreground hover:opacity-90"
                    onClick={() => handleGenerate({ refine: true })}
                    disabled={loading}
                  >
                    Refinar resultado
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {!result ? (
                <div className="text-sm text-muted-foreground">
                  Preencha o briefing para gerar seu texto.
                </div>
              ) : (
                <>
                  <div className="border border-border rounded-xl p-4 bg-secondary/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">Texto gerado</p>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyToClipboard(result.texto)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-line">
                      {result.texto}
                    </p>
                  </div>

                  <div className="border border-border rounded-xl p-4 bg-secondary/20 space-y-2">
                    <p className="text-xs text-muted-foreground">SugestÃµes de melhoria</p>
                    {result.sugestoes?.length ? (
                      <ul className="space-y-1 text-sm text-foreground">
                        {result.sugestoes.map((item, idx) => (
                          <li key={`${item}-${idx}`}>- {item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhuma sugestÃ£o retornada.</p>
                    )}
                  </div>

                  {result.prompt && (
                    <div className="border border-border rounded-xl p-4 bg-secondary/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Prompt para IA</p>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => copyToClipboard(result.prompt)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-line">
                        {result.prompt}
                      </p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {history.length > 0 && (
          <Card className="bg-card border-border shadow-card">
            <CardHeader className="border-b border-border">
              <CardTitle className="font-display text-foreground">HistÃ³rico de geraÃ§Ãµes</CardTitle>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {history.map((item) => (
                <div key={item.id} className="border border-border rounded-xl p-4 bg-secondary/10">
                  <p className="text-xs text-muted-foreground mb-2">{item.tipo}</p>
                  <p className="text-sm text-foreground">
                    {item.texto}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
