import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, TrendingUp, Target, Calendar, BarChart2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DashboardLayout from "@/components/DashboardLayout";
import ChatMessage from "@/components/ChatMessage";
import { useQueryClient } from "@tanstack/react-query";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";
import { useAuth } from "@/hooks/useAuth";
import { buildRagContext } from "@/lib/rag";
import { fetchFunctions } from "@/lib/apiBase";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ConversationSummary {
  id: string;
  title: string | null;
  updated_at: string;
}

const suggestions = [
  {
    text: "Crie um cronograma de postagens para 15 dias",
    icon: Calendar,
  },
  {
    text: "Sugira campanhas para as próximas datas comemorativas",
    icon: TrendingUp,
  },
  {
    text: "Quais são os melhores horários e formatos de postagem?",
    icon: Target,
  },
  {
    text: "Traga insights com base em referências de mercado",
    icon: BarChart2,
  },
];

const insights = [
  {
    title: "Engajamento no Instagram",
    description: "Posts com perguntas geram 2x mais comentários",
    icon: TrendingUp,
  },
  {
    title: "Melhor horário para postar",
    description: "Entre 18h e 21h para maior alcance orgânico",
    icon: Calendar,
  },
  {
    title: "Tendência de conteúdo",
    description: "Vídeos curtos têm 3x mais alcance que fotos",
    icon: BarChart2,
  },
  {
    title: "CTA eficaz",
    description: "Perguntas diretas aumentam cliques em 40%",
    icon: Target,
  },
];

function buildTitle(text: string) {
  const words = text.trim().split(/\s+/).slice(0, 6);
  return words.join(" ");
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { profile: businessProfile } = useBusinessProfile();
  const { user } = useAuth();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!user) return;
    fetchHistory();
  }, [user]);

  const fetchHistory = async () => {
    const res = await fetchFunctions("/chat/conversations");
    if (!res.ok) return;
    const data = await res.json();
    setConversations((data.conversations || []) as ConversationSummary[]);
  };

  const loadConversation = async (id: string) => {
    const res = await fetchFunctions(`/chat/conversations/${id}/messages`);
    if (!res.ok) return;
    const data = await res.json();

    setActiveConversationId(id);
    setMessages(
      (data.messages || []).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: new Date(m.created_at),
      }))
    );
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
  };

  const createConversation = async (firstMessage: string) => {
    if (!user) return null;
    const title = buildTitle(firstMessage);
    const res = await fetchFunctions("/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.id) {
      setActiveConversationId(data.id);
    }
    return data?.id || null;
  };

  const persistMessage = async (conversationId: string, role: "user" | "assistant", content: string) => {
    if (!user) return;
    await fetchFunctions(`/chat/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ role, content }),
    });
  };

  const handleSend = async (text?: string) => {
    const userMessage = text ? text.trim() : input.trim();
    if (!userMessage || isLoading) return;
    setInput("");

    const newMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMsg]);
    setIsLoading(true);

    const ragContext = buildRagContext();
    const enrichedMessage = userMessage + ragContext;

    try {
      let conversationId = activeConversationId;
      if (!conversationId) {
        conversationId = await createConversation(userMessage);
      }
      if (conversationId) {
        await persistMessage(conversationId, "user", userMessage);
      }

      const allMessages = [...messages, newMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetchFunctions("/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          messages: allMessages,
          stream: true,
          lastMessageOverride: enrichedMessage,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error("[AI] Chat response error", { status: response.status, err });
        if (response.status === 402) {
          toast.error("Créditos insuficientes. Compre mais créditos para continuar.");
        } else {
          toast.error(err.error || "Erro ao processar sua mensagem.");
        }
        setIsLoading(false);
        return;
      }

      const assistantMsgId = Date.now().toString() + "-ai";
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: "assistant", content: "", timestamp: new Date() },
      ]);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              const chunk = parsed.choices?.[0]?.delta?.content || "";
              if (chunk) {
                finalContent += chunk;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: m.content + chunk }
                      : m
                  )
                );
              }
            } catch {
              // ignore parse errors in stream
            }
          }
        }
      }

      if (conversationId) {
        await persistMessage(conversationId, "assistant", finalContent);
        await fetchHistory();
      }
    } catch (err) {
      console.error("[AI] Chat error", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Erro de conexão. Verifique sua internet e tente novamente."
      );
    } finally {
      setIsLoading(false);
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
        {conversations.length > 0 && (
          <div className="border-b border-border bg-card/50 p-4 shrink-0">
            <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-3 justify-between">
              <div className="flex flex-wrap gap-2">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => loadConversation(conv.id)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                      activeConversationId === conv.id
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {conv.title || "Conversa"}
                  </button>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={handleNewConversation}>
                Nova conversa
              </Button>
            </div>
          </div>
        )}

        {messages.length === 0 && (
          <div className="border-b border-border bg-card/50 p-4 shrink-0">
            <div className="max-w-4xl mx-auto">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                ?ltimos insights
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {insights.map((insight) => (
                  <Card
                    key={insight.title}
                    className="bg-card border-border hover:shadow-glow transition-shadow duration-200"
                  >
                    <CardContent className="p-3">
                      <insight.icon className="h-4 w-4 text-primary mb-1.5" />
                      <p className="text-xs font-medium text-foreground">
                        {insight.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {insight.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto text-center">
              <div className="gradient-primary rounded-2xl p-4 mb-6 shadow-glow">
                <Sparkles className="h-8 w-8 text-primary-foreground" />
              </div>
              <h2 className="font-display text-2xl font-bold text-foreground mb-2">
                Especialista de Marketing com IA
              </h2>
              <p className="text-muted-foreground mb-2 max-w-md">
                Seu especialista em marketing para pequenas e médias empresas brasileiras.
              </p>
              {businessProfile?.nome_empresa && (
                <p className="text-xs text-primary mb-8">
                  Contexto ativo: {businessProfile.nome_empresa} ? perfil carregado
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                {suggestions.map((s) => (
                  <Card
                    key={s.text}
                    className="bg-card border-border hover:border-primary/30 hover:shadow-glow cursor-pointer transition-all duration-200 group"
                    onClick={() => handleSend(s.text)}
                  >
                    <CardContent className="p-4 text-left">
                      <s.icon className="h-4 w-4 text-primary mb-2" />
                      <p className="text-sm text-foreground group-hover:text-primary transition-colors">
                        {s.text}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-5">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  timestamp={msg.timestamp}
                />
              ))}
              {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
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
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="border-t border-border p-4 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="bg-card border border-border rounded-2xl flex items-end gap-2 p-3 shadow-card focus-within:border-primary/50 focus-within:shadow-glow transition-all duration-200">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Pergunte sobre estratégias de marketing, criação de conteúdo..."
                className="flex-1 bg-transparent resize-none text-foreground placeholder:text-muted-foreground text-sm outline-none min-h-[40px] max-h-[120px] py-2 px-1"
                rows={1}
                disabled={isLoading}
              />
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                size="icon"
                className="gradient-primary text-primary-foreground rounded-xl h-10 w-10 shrink-0 hover:opacity-90"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Especialista de Marketing com IA • Powered by Infusion.IA • 1 crédito por mensagem
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}






