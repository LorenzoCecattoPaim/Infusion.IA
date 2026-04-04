import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Zap, Download } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { getFunctionsBaseUrl } from "@/lib/apiBase";
import { useCredits } from "@/hooks/useCredits";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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

const STAGE_LABELS: Record<number, string> = {
  0: "Coletando informações da sua marca",
  1: "Definindo estilo e identidade visual",
  2: "Gerando logos personalizados",
  3: "Refinando e criando variações",
};

export default function LogoGeneratorPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [logos, setLogos] = useState<Logo[]>([]);
  const [previewLogo, setPreviewLogo] = useState<Logo | null>(null);
  const [stage, setStage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { credits } = useCredits();

  // Auto-start with welcome message
  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Olá! Sou seu Designer de Logo IA. Vou criar um logo incrível para sua marca! 🎨\n\nPrimeiro, preciso de algumas informações:\n\n**Qual é o nome completo da sua marca/empresa?**",
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

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const allMessages = [...messages, newMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(
        `${getFunctionsBaseUrl()}/functions/v1/logo-generator`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ messages: allMessages }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 402) {
          toast.error("Créditos insuficientes.");
        } else {
          toast.error(err.error || "Erro ao processar.");
        }
        setLoading(false);
        return;
      }

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "-ai",
          role: "assistant",
          content: data.message,
          timestamp: new Date(),
        },
      ]);

      if (data.logos?.length) {
        setLogos(data.logos);
        setStage((prev) => Math.min(prev + 1, 3));
      }

      queryClient.invalidateQueries({ queryKey: ["credits"] });
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLogo = (logo: Logo, index: number) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "user",
        content: `Gostei do Logo ${index}. Pode criar as variações (prata, dourado, preto e branco)?`,
        timestamp: new Date(),
      },
    ]);
    setInput(
      `Gostei do Logo ${index}. Pode criar as variações (prata, dourado, preto e branco)?`
    );
    handleSend();
  };

  const handleDownloadLogo = async (logo: Logo) => {
    try {
      const res = await fetch(logo.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `logo-infusion-ia.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Erro ao baixar logo.");
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)] max-w-5xl mx-auto">
        {/* Header */}
        <header className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h1 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Criador de Logo IA
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {STAGE_LABELS[stage]}
            </p>
          </div>
          <Badge variant="outline" className="border-border text-muted-foreground">
            <Zap className="h-3 w-3 mr-1" /> {credits} créditos
          </Badge>
        </header>

        {/* Messages + Logos */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4"
        >
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
            />
          ))}

          {logos.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
              {logos.map((logo, i) => (
                <div
                  key={i}
                  className="bg-card border border-border rounded-xl overflow-hidden shadow-card"
                >
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
                        onClick={() => handleSelectLogo(logo, i + 1)}
                      >
                        Selecionar
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
              ))}
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

        {/* Input */}
        <div className="p-4 border-t border-border shrink-0">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Descreva sua marca ou responda às perguntas..."
              className="min-h-[44px] max-h-32 resize-none bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              rows={1}
              disabled={loading}
            />
            <Button
              size="icon"
              className="gradient-primary shrink-0 h-11 w-11 hover:opacity-90"
              onClick={handleSend}
              disabled={!input.trim() || loading}
            >
              <Send className="h-4 w-4 text-primary-foreground" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Cada mensagem consome créditos • Infusion.IA Logo Creator
          </p>
        </div>

        {/* Preview dialog */}
        <Dialog
          open={!!previewLogo}
          onOpenChange={() => setPreviewLogo(null)}
        >
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
                      Detalhes do Logo
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
                    <Button
                      variant="outline"
                      onClick={() => setPreviewLogo(null)}
                    >
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
