import { seedData } from "@/lib/data/seed";
import { Fund, PortfolioData } from "@/lib/types/models";
import { defaultForcedLiquidationThreshold, inferMonthlyRecordSource } from "@/lib/utils/calculations";

export function ensurePortfolioDataShape(input: Partial<PortfolioData> | PortfolioData): PortfolioData {
  return {
    funds: (input.funds ?? []).map((fund) => ({
      ...fund,
      dividendFrequency: fund.dividendFrequency ?? "MONTHLY",
      dividendPaymentDay: fund.dividendPaymentDay ?? 28,
      dividendPerUnit:
        fund.dividendPerUnit ??
        (fund as Fund & { monthlyDividendPerUnit?: number }).monthlyDividendPerUnit ??
        0,
      forcedLiquidationLtvThreshold:
        fund.forcedLiquidationLtvThreshold ??
        defaultForcedLiquidationThreshold(fund.marginCallLtvThreshold ?? seedData.settings.defaultMarginCallThreshold),
    })),
    monthlyRecords: (input.monthlyRecords ?? []).map((record) => {
      const inferredSource = inferMonthlyRecordSource(record);
      return {
        ...record,
        source: inferredSource,
      };
    }),
    fundingCostEntries: input.fundingCostEntries ?? [],
    transactions: (input.transactions ?? []).map((tx) => ({
      ...tx,
      commissionPct: tx.commissionPct ?? 0,
      loanAmount: tx.loanAmount ?? 0,
      fundingBaseRate: tx.fundingBaseRate ?? 0,
      fundingSpread: tx.fundingSpread ?? 0,
    })),
    scenarios: input.scenarios ?? [],
    settings: input.settings ?? seedData.settings,
  };
}
