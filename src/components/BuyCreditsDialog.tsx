import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, Sparkles, Crown } from "lucide-react";

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
  const handleOpenPlans = () => {
    window.location.href = PLANOS_URL;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-foreground">Ver planos</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Compare os planos e escolha o ideal para o seu negócio
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
                  <p className="text-xs text-muted-foreground">
                    {plan.credits} créditos • {plan.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-foreground">{plan.price}</span>
                <Button
                  size="sm"
                  className="gradient-primary text-primary-foreground hover:opacity-90"
                  onClick={handleOpenPlans}
                >
                  Ver planos
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
          onClick={handleOpenPlans}
        >
          Ver planos completos
        </Button>
      </DialogContent>
    </Dialog>
  );
}
