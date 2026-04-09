import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ANNUAL_PLANS,
  MONTHLY_PLANS,
  formatBRL,
  savingsPercent,
} from "@/lib/plans";

interface BuyCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PLANOS_URL = "https://infusionai-hub.lovable.app/#planos";

function PlanRow({
  name,
  oldPrice,
  price,
  highlight,
  subtitle,
  badge,
}: {
  name: string;
  oldPrice: string;
  price: string;
  highlight?: boolean;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <div
      className={`relative rounded-xl border p-4 flex flex-col gap-2 transition-all ${
        highlight
          ? "border-primary/50 bg-primary/5 shadow-glow"
          : "border-border hover:border-primary/30"
      }`}
    >
      {highlight && (
        <span className="absolute -top-2.5 left-4 text-[10px] font-bold gradient-primary text-primary-foreground px-2 py-0.5 rounded-full">
          Mais popular
        </span>
      )}
      <div className="flex items-center justify-between">
        <p className="font-semibold text-foreground text-sm">{name}</p>
        {badge && (
          <Badge className="text-[10px] bg-foreground text-background">
            {badge}
          </Badge>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        <span className="line-through mr-2">{oldPrice}</span>
        <span className="text-foreground font-semibold">{price}</span>
      </div>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      <Button
        size="sm"
        className="gradient-primary text-primary-foreground hover:opacity-90"
        onClick={() => {
          window.location.href = PLANOS_URL;
        }}
      >
        Ver planos
      </Button>
    </div>
  );
}

export default function BuyCreditsDialog({ open, onOpenChange }: BuyCreditsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-foreground">Planos e créditos</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Compare mensal e anual e escolha o melhor custo-benefício
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Planos mensais
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {MONTHLY_PLANS.map((plan) => (
                <PlanRow
                  key={plan.id}
                  name={plan.name}
                  oldPrice={formatBRL(plan.oldPrice)}
                  price={formatBRL(plan.price)}
                  highlight={plan.highlight}
                  subtitle={`${plan.credits} créditos por mês`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Planos anuais
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {ANNUAL_PLANS.map((plan) => (
                <PlanRow
                  key={plan.id}
                  name={plan.name}
                  oldPrice={formatBRL(plan.oldPrice)}
                  price={formatBRL(plan.price)}
                  highlight={plan.highlight}
                  subtitle={plan.benefit || undefined}
                  badge={`Economize ${savingsPercent(plan)}%`}
                />
              ))}
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Pagamento seguro via Pagar.me • Créditos adicionados imediatamente após confirmação
        </p>
        <Button
          variant="outline"
          className="w-full"
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
