export const CREDIT_COSTS = {
  text: 5,
  image: 15,
};

export const LOW_CREDITS_THRESHOLD = CREDIT_COSTS.image;

export function formatCredits(value: number): string {
  return `${value} créditos`;
}
