export type BillingCycle = "mensal" | "anual";

export interface Plan {
  id: string;
  name: string;
  billing: BillingCycle;
  price: number;
  oldPrice: number;
  credits?: number;
  highlight?: boolean;
  benefit?: string;
}

export const MONTHLY_PLANS: Plan[] = [
  {
    id: "aprendiz_mensal",
    name: "Aprendiz",
    billing: "mensal",
    price: 89,
    oldPrice: 129,
    credits: 100,
  },
  {
    id: "avancado_mensal",
    name: "Avançado",
    billing: "mensal",
    price: 149,
    oldPrice: 239,
    credits: 250,
    highlight: true,
  },
  {
    id: "profissional_mensal",
    name: "Profissional",
    billing: "mensal",
    price: 299,
    oldPrice: 499,
    credits: 1000,
  },
];

export const ANNUAL_PLANS: Plan[] = [
  {
    id: "aprendiz_anual",
    name: "Aprendiz",
    billing: "anual",
    price: 988,
    oldPrice: 1079,
    benefit: "Ganhe 1 mês grátis",
  },
  {
    id: "avancado_anual",
    name: "Avançado",
    billing: "anual",
    price: 1649,
    oldPrice: 1799,
    benefit: "Ganhe 1 mês grátis",
    highlight: true,
  },
  {
    id: "profissional_anual",
    name: "Profissional",
    billing: "anual",
    price: 2990,
    oldPrice: 3588,
    benefit: "Ganhe 2 meses grátis",
  },
];

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export function savingsPercent(plan: Plan): number {
  if (plan.oldPrice <= 0) return 0;
  return Math.round(((plan.oldPrice - plan.price) / plan.oldPrice) * 100);
}
