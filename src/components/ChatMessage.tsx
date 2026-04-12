import ReactMarkdown from "react-markdown";
import { Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

export default function ChatMessage({ role, content, timestamp }: ChatMessageProps) {
  const isAssistant = role === "assistant";

  return (
    <div className={cn("flex gap-3", isAssistant ? "items-start" : "items-start flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "rounded-full p-1.5 shrink-0 mt-0.5",
          isAssistant ? "gradient-primary" : "bg-secondary border border-border"
        )}
      >
        {isAssistant ? (
          <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
        ) : (
          <User className="h-3.5 w-3.5 text-foreground" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 shadow-card",
          isAssistant
            ? "bg-card border border-border rounded-tl-sm"
            : "gradient-primary text-primary-foreground rounded-tr-sm"
        )}
      >
        {isAssistant ? (
          <div className="chat-markdown space-y-4 leading-relaxed">
            <ReactMarkdown className="space-y-4 leading-relaxed">{content}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
        )}

        {timestamp && (
          <p
            className={cn(
              "text-[10px] mt-1.5",
              isAssistant ? "text-muted-foreground" : "text-primary-foreground/70"
            )}
          >
            {timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </div>
  );
}
