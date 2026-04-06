import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, Sparkles, Crown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getFunctionsBaseUrl } from "@/lib/apiBase";
import { useState } from "react";

interface BuyCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PLANS = [
  {
    id: "starter",
    label: "Starter",
    credits: 100,
    price: "R$ 19,90",
    icon: Zap,
    highlight: false,
    description: "Ideal para começar",
  },
  {
    id: "pro",
    label: "Pro",
    credits: 300,
    price: "R$ 49,90",
    icon: Sparkles,
    highlight: true,
    description: "Mais popular",
  },
  {
    id: "business",
    label: "Business",
    credits: 1000,
    price: "R$ 129,90",
    icon: Crown,
    highlight: false,
    description: "Para times e agências",
  },
];

const PLANOS_URL = "https://infusionai-hub.lovable.app/#planos";

export default function BuyCreditsDialog({ open, onOpenChange }: BuyCreditsDialogProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleBuy = async (planId: string) => {
    setLoading(planId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(
        `${getFunctionsBaseUrl()}/functions/v1/buy-credits`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ plan: planId }),
        }
      );
      const data = await res.json();
      if (data.payment_url) {
        window.open(data.payment_url, "_blank");
        onOpenChange(false);
      } else {
        toast.error(data.error || "Não foi possível iniciar o pagamento.");
      }
    } catch {
      toast.error("Não foi possível conectar ao servidor de pagamentos.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-foreground">Comprar créditos</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Escolha o pacote ideal para o seu negócio
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 mt-2">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-xl border p-4 flex items-center justify-between transition-all ${
                plan.highlight
                  ? "border-primary/50 bg-primary/5 shadow-glow"
                  : "border-border hover:border-primary/30"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-2.5 left-4 text-[10px] font-bold gradient-primary text-primary-foreground px-2 py-0.5 rounded-full">
                  Mais popular
                </span>
              )}
              <div className="flex items-center gap-3">
                <div className="gradient-primary rounded-lg p-2">
                  <plan.icon className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">{plan.label}</p>
                  <p className="text-xs text-muted-foreground">{plan.credits} créditos • {plan.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-foreground">{plan.price}</span>
                <Button
                  size="sm"
                  className="gradient-primary text-primary-foreground hover:opacity-90"
                  onClick={() => handleBuy(plan.id)}
                  disabled={loading === plan.id}
                >
                  {loading === plan.id ? "..." : "Comprar"}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          Pagamento seguro via Pagar.me • Créditos adicionados imediatamente após confirmação
        </p>
        <Button
          variant="outline"
          className="w-full mt-2"
          onClick={() => {
            window.location.href = PLANOS_URL;
          }}
        >
          Ver planos completos
        </Button>
      </DialogContent>
    </Dialog>
  );
}


