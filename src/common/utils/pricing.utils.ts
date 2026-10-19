/**
 * Store pricing rules, all in whole currency units (no fils).
 *
 * - New eSIM: plan price + the provider's QR price.
 * - Renewal / extension: the plan's renewal price, else the provider's
 *   renewal price, else the plan price. No QR price: the line is reused.
 */
export interface PricedPlan {
  price: number;
  renewal_price: number | null;
}
export interface PricedProvider {
  qr_price: number;
  renewal_price: number | null;
}

export const qrPriceOf = (provider: PricedProvider): number =>
  provider.qr_price ?? 0;

export const newEsimTotalOf = (
  plan: PricedPlan,
  provider: PricedProvider,
): number => plan.price + qrPriceOf(provider);

export const renewalPriceOf = (
  plan: PricedPlan,
  provider: PricedProvider,
): number => plan.renewal_price ?? provider.renewal_price ?? plan.price;
