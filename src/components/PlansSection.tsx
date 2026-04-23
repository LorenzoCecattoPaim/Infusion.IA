import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ANNUAL_PLANS,
  MONTHLY_PLANS,
  formatBRL,
  savingsPercent,
  type Plan,
} from "@/lib/plans";

const PLANOS_URL = "https://infusionai-hub.lovable.app/#planos";

interface PlansSectionProps {
  currentPlan?: string;
  isLoading?: boolean;
}

function isCurrentPlan(plan: Plan, currentPlan?: string) {
  if (!currentPlan || currentPlan === "free") return false;

  const normalizedCurrentPlan = currentPlan.trim().toLowerCase();
  const normalizedPlanId = plan.id.toLowerCase();
  const normalizedPlanName = plan.name.toLowerCase();

  return (
    normalizedCurrentPlan === normalizedPlanId ||
    normalizedCurrentPlan === normalizedPlanName ||
    normalizedCurrentPlan.includes(normalizedPlanName)
  );
}

function PlanCard({ plan, currentPlan }: { plan: Plan; currentPlan?: string }) {
  const isAnnual = plan.billing === "anual";
  const savings = isAnnual ? savingsPercent(plan) : 0;
  const activePlan = isCurrentPlan(plan, currentPlan);

  return (
    <article
      className={cn(
        "relative flex h-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border bg-card p-5 shadow-card box-border transition-all duration-200",
        "break-words [overflow-wrap:anywhere] [word-wrap:break-word] whitespace-normal hover:-translate-y-0.5 hover:shadow-lg",
        plan.highlight
          ? "border-primary/40 bg-primary/5 shadow-glow"
          : "border-border hover:border-primary/30",
        activePlan && "border-primary ring-1 ring-primary/40"
      )}
    >
      {(plan.highlight || activePlan) && (
        <div className="absolute left-5 right-5 -top-3 flex flex-wrap items-center gap-2">
          {activePlan && (
            <span className="rounded-full border border-primary/20 bg-background px-3 py-1 text-[10px] font-semibold text-primary">
              Plano atual
            </span>
          )}
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm uppercase tracking-wider text-muted-foreground">
              {plan.billing === "mensal" ? "Mensal" : "Anual"}
            </p>
            <h3
              className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-display text-xl text-foreground sm:whitespace-normal"
              title={plan.name}
            >
              {plan.name}
            </h3>
          </div>
          {isAnnual && (
            <Badge className="w-fit max-w-full shrink-0 whitespace-normal bg-foreground text-xs text-background break-words [overflow-wrap:anywhere]">
              Economize {savings}%
            </Badge>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">De:</p>
          <p className="break-words text-sm text-muted-foreground line-through">
            {formatBRL(plan.oldPrice)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Por:</p>
          <p className="break-words text-2xl font-bold text-foreground">
            {formatBRL(plan.price)}
          </p>
        </div>

        <div className="min-h-12 space-y-2">
          {plan.credits !== undefined && (
            <p className="text-sm text-muted-foreground break-words">
              {plan.credits} créditos por mês
            </p>
          )}

          {plan.benefit && (
            <p className="text-sm font-semibold text-primary break-words">
              {plan.benefit}
            </p>
          )}
        </div>

        <Button
          className="mt-auto w-full max-w-full gradient-primary text-primary-foreground hover:opacity-90"
          onClick={() => {
            window.location.href = PLANOS_URL;
          }}
        >
          Assinar agora
        </Button>
      </div>
    </article>
  );
}

function PlansGroupSkeleton() {
  return (
    <div className="rounded-3xl border border-border bg-card/60 p-5 shadow-card">
      <div className="mb-4 space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-border/60 bg-card p-5 shadow-card"
          >
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-3 h-6 w-28" />
            <Skeleton className="mt-5 h-4 w-16" />
            <Skeleton className="mt-2 h-5 w-24" />
            <Skeleton className="mt-6 h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PlansSection({
  currentPlan,
  isLoading = false,
}: PlansSectionProps) {
  return (
    <section id="planos" className="space-y-6 overflow-hidden">
      <div className="min-w-0">
        <h2 className="font-display text-2xl font-bold text-foreground">
          Planos e créditos
        </h2>
        <p className="mt-1 break-words text-muted-foreground">
          Compare mensal e anual e escolha o melhor custo-benefício.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6">
          <PlansGroupSkeleton />
          <PlansGroupSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          <div className="min-w-0 rounded-3xl border border-border bg-card/60 p-5 shadow-card box-border">
            <div className="mb-4 min-w-0">
              <h3 className="font-display text-lg text-foreground break-words">
                Planos mensais
              </h3>
              <p className="text-xs text-muted-foreground break-words">
                Flexibilidade total para crescer mês a mês
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {MONTHLY_PLANS.map((plan) => (
                <PlanCard key={plan.id} plan={plan} currentPlan={currentPlan} />
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-3xl border border-border bg-card/60 p-5 shadow-card box-border">
            <div className="mb-4 min-w-0">
              <h3 className="font-display text-lg text-foreground break-words">
                Planos anuais
              </h3>
              <p className="text-xs text-muted-foreground break-words">
                Mais economia com benefício de meses grátis
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {ANNUAL_PLANS.map((plan) => (
                <PlanCard key={plan.id} plan={plan} currentPlan={currentPlan} />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
