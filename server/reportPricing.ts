/**
 * Release B report prices, applied in code behind FEATURE_RELEASE_B_PRICING so the stored
 * catalogue (and production prices) stay as they are until the flag is turned on. The listing
 * and the order both price through reportPrice, so a customer is charged what they were shown.
 */
import type { ReportType } from "@shared/schema";
import { features } from "./features";

export const RELEASE_B_REPORT_PRICES: Readonly<Record<string, number>> = {
  "career-report": 299,
  "marriage-report": 299,
  "finance-report": 299,
  "year-ahead-report": 499,
  "complete-life-report": 999,
};

export function reportPrice(t: Pick<ReportType, "slug" | "price">): number {
  const override = features.releaseBPricing() ? RELEASE_B_REPORT_PRICES[t.slug] : undefined;
  return override ?? parseFloat(t.price);
}

/** A catalogue row as customers see it. */
export function pricedReportType<T extends Pick<ReportType, "slug" | "price">>(t: T): T {
  return { ...t, price: reportPrice(t).toFixed(2) };
}
