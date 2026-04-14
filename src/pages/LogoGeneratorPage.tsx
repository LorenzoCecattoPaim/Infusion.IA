import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Zap, Download, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import DashboardLayout from "@/components/DashboardLayout";
import ChatMessage from "@/components/ChatMessage";
import { useCredits } from "@/hooks/useCredits";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CREDIT_COSTS } from "@/lib/credits";
import { callLogoGenerator } from "@/services/ai";
import { useDebouncedAction } from "@/hooks/useDebouncedAction";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Logo {
  url: string;
  description: string;
  prompt: string;
}

type LogoPhase = "collecting_inputs" | "generating" | "done";

const PHASE_LABELS: Record<LogoPhase, string> = {
  collecting_inputs: "Coletando informacoes da sua marca",
  generating: "Gerando logos personalizados",
  done: "Logos prontos para escolha",
};

export default function LogoGeneratorPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [logos, setLogos] = useState<Logo[]>([]);
  const [selectedLogo, setSelectedLogo] = useState<Logo | null>(null);
  const [previewLogo, setPreviewLogo] = useState<Logo | null>(null);
  const [logoPhase, setLogoPhase] = useState<LogoPhase>("collecting_inputs");
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { credits } = useCredits();
  const imageCost = CREDIT_COSTS.image;
  const runDebounced = useDebouncedAction(500);

  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Ola! Sou seu designer de logo com IA. Vou criar um logo incrivel para a sua marca!\n\nPara comecar, preciso de algumas informacoes:\n\n**Qual e o nome completo da sua marca/empresa?**",
        timestamp: new Date(),
      },
    ]);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, logos]);

  const callLogoApi = async (payload: Record<string, unknown>) => {
    const action = typeof payload.action === "string" ? payload.action : null;
    const requiresCredits =
      action === "generate_logos" || action === "generate_variations";

    if (requiresCredits && credits < imageCost) {
      throw new Error(
        `Creditos insuficientes. Necessario: ${imageCost}, disponivel: ${credits}`
      );
    }

    return callLogoGenerator(payload as never);
  };

  const handleSend = async () => {
    const userMessage = input.trim();
    if (!userMessage || loading) return;

    setInput("");

    const newMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newMsg]);
    setLoading(true);
    setLogoPhase("collecting_inputs");

    try {
      const allMessages = [...messages, newMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const data = await callLogoApi({ messages: allMessages });

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-ai`,
          role: "assistant",
          content: data.message,
          timestamp: new Date(),
        },
      ]);

      if (data.phase === "done" && data.logos?.length) {
        setLogos(data.logos);
        setLogoPhase("done");
      } else {
        setLogos([]);
        setLogoPhase("collecting_inputs");
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard_stats"] }),
      ]);
    } catch (err) {
      console.error("[AI] Logo generator error", err);
      toast.error(err instanceof Error ? err.message : "Erro de conexao.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNew = async () => {
    if (loading) return;

    const actionMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: "Gerar novas opcoes",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, actionMsg]);
    setLoading(true);
    setLogoPhase("generating");

    try {
      const allMessages = [...messages, actionMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const data = await callLogoApi({
        messages: allMessages,
        action: "generate_logos",
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-ai`,
          role: "assistant",
          content: data.message,
          timestamp: new Date(),
        },
      ]);

      if (data.logos?.length) {
        setLogos(data.logos);
        setLogoPhase("done");
      } else {
        setLogos([]);
        setLogoPhase("collecting_inputs");
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard_stats"] }),
      ]);
    } catch (err) {
      console.error("[AI] Logo generator error", err);
      toast.error(err instanceof Error ? err.message : "Erro ao gerar logos.");
    } finally {
      setLoading(false);
    }
  };

  const selectLogo = (logo: Logo) => {
    setSelectedLogo(logo);
  };

  const handleDownloadLogo = async (logo: Logo) => {
    try {
      const res = await fetch(logo.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "logo-infusion-ia.png";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[AI] Download error", err);
      toast.error("Erro ao baixar logo.");
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)] max-w-5xl mx-auto">
        <header className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h1 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Criador de logo com IA
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {PHASE_LABELS[logoPhase]}
            </p>
          </div>
          <Badge variant="outline" className="border-border text-muted-foreground">
            <Zap className="h-3 w-3 mr-1" /> {credits} creditos
          </Badge>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
            />
          ))}

          {logoPhase === "done" && logos.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Opcoes geradas</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runDebounced(() => void handleGenerateNew())}
                  disabled={loading}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-2" /> Gerar novas opcoes
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {logos.map((logo, i) => {
                  const isSelected = selectedLogo?.url === logo.url;

                  return (
                    <div
                      key={i}
                      className={`relative bg-card border rounded-xl overflow-hidden shadow-card ${
                        isSelected ? "border-primary ring-2 ring-primary/30" : "border-border"
                      }`}
                    >
                      {isSelected && (
                        <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground">
                          Selecionada
                        </Badge>
                      )}
                      <img
                        src={logo.url}
                        alt={`Logo ${i + 1}`}
                        className="w-full aspect-square object-contain p-4 cursor-pointer hover:opacity-90 transition-opacity bg-white"
                        onClick={() => setPreviewLogo(logo)}
                      />
                      <div className="p-3 border-t border-border">
                        {logo.description && (
                          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                            {logo.description}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 gradient-primary text-primary-foreground text-xs hover:opacity-90"
                            onClick={() => selectLogo(logo)}
                            disabled={loading}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Escolher este
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="px-2"
                            onClick={() => handleDownloadLogo(logo)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-3">
              <div className="gradient-primary rounded-full p-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <div className="bg-card border border-border rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border shrink-0">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  runDebounced(() => void handleSend());
                }
              }}
              placeholder="Responda as perguntas do designer..."
              className="min-h-[44px] max-h-32 resize-none bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              rows={1}
              disabled={loading}
            />
            <Button
              size="icon"
              className="gradient-primary shrink-0 h-11 w-11 hover:opacity-90"
              onClick={() => runDebounced(() => void handleSend())}
              disabled={!input.trim() || loading}
            >
              <Send className="h-4 w-4 text-primary-foreground" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Cada geracao consome {imageCost} creditos - Infusion.IA Logo Creator
          </p>
        </div>

        <Dialog open={!!previewLogo} onOpenChange={() => setPreviewLogo(null)}>
          <DialogContent className="max-w-3xl bg-card border-border rounded-2xl p-0 overflow-hidden">
            {previewLogo && (
              <>
                <img
                  src={previewLogo.url}
                  alt="Preview"
                  className="w-full max-h-96 object-contain bg-white p-8"
                />
                <div className="p-5 space-y-4">
                  <DialogHeader>
                    <DialogTitle className="font-display text-foreground">
                      Detalhes do logo
                    </DialogTitle>
                  </DialogHeader>
                  {previewLogo.description && (
                    <p className="text-sm text-muted-foreground">
                      {previewLogo.description}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      className="gradient-primary text-primary-foreground hover:opacity-90"
                      onClick={() => handleDownloadLogo(previewLogo)}
                    >
                      <Download className="h-4 w-4 mr-2" /> Baixar
                    </Button>
                    <Button variant="outline" onClick={() => setPreviewLogo(null)}>
                      Fechar
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
