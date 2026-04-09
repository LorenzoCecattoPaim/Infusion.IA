import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ANNUAL_PLANS,
  MONTHLY_PLANS,
  formatBRL,
  savingsPercent,
  type Plan,
} from "@/lib/plans";

const PLANOS_URL = "https://infusionai-hub.lovable.app/#planos";

function PlanCard({ plan }: { plan: Plan }) {
  const isAnnual = plan.billing === "anual";
  const savings = isAnnual ? savingsPercent(plan) : 0;

  return (
    <div
      className={`relative rounded-2xl border p-5 shadow-card transition-all ${
        plan.highlight
          ? "border-primary/40 bg-primary/5 shadow-glow"
          : "border-border bg-card hover:border-primary/30"
      }`}
    >
      {plan.highlight && (
        <span className="absolute -top-3 left-5 text-[10px] font-semibold gradient-primary text-primary-foreground px-3 py-1 rounded-full shadow-glow">
          Mais popular
        </span>
      )}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wider text-muted-foreground">
            {plan.billing === "mensal" ? "Mensal" : "Anual"}
          </p>
          <h3 className="font-display text-xl text-foreground">{plan.name}</h3>
        </div>
        {isAnnual && (
          <Badge className="bg-foreground text-background text-xs">
            Economize {savings}%
          </Badge>
        )}
      </div>

      <div className="mt-4 space-y-1">
        <p className="text-xs text-muted-foreground">De:</p>
        <p className="text-sm text-muted-foreground line-through">
          {formatBRL(plan.oldPrice)}
        </p>
        <p className="text-xs text-muted-foreground mt-2">Por:</p>
        <p className="text-2xl font-bold text-foreground">
          {formatBRL(plan.price)}
        </p>
      </div>

      {plan.credits !== undefined && (
        <p className="text-sm text-muted-foreground mt-3">
          {plan.credits} créditos por mês
        </p>
      )}

      {plan.benefit && (
        <p className="text-sm text-primary font-semibold mt-3">
          {plan.benefit}
        </p>
      )}

      <Button
        className="mt-5 w-full gradient-primary text-primary-foreground hover:opacity-90"
        onClick={() => {
          window.location.href = PLANOS_URL;
        }}
      >
        Assinar agora
      </Button>
    </div>
  );
}

export default function PlansSection() {
  return (
    <section id="planos" className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">
          Planos e créditos
        </h2>
        <p className="text-muted-foreground mt-1">
          Compare mensal e anual e escolha o melhor custo-benefício.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-border bg-card/60 p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-lg text-foreground">Planos mensais</h3>
              <p className="text-xs text-muted-foreground">
                Flexibilidade total para crescer mês a mês
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {MONTHLY_PLANS.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card/60 p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-lg text-foreground">Planos anuais</h3>
              <p className="text-xs text-muted-foreground">
                Mais economia com benefício de meses grátis
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ANNUAL_PLANS.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
