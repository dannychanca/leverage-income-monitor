import { z } from "zod";

export const fundSchema = z.object({
  fundName: z.string().min(2, "Fund name is required"),
  manager: z.string().min(2, "Manager is required"),
  ticker: z.string().min(1, "Ticker is required"),
  currency: z.enum(["USD", "EUR", "GBP", "SGD", "HKD"]),
  unitsHeld: z.coerce.number().nonnegative("Units must be >= 0"),
  currentNav: z.coerce.number().positive("NAV must be > 0"),
  averageCost: z.coerce.number().nonnegative(),
  loanAmount: z.coerce.number().nonnegative(),
  fundingBaseRate: z.coerce.number().min(-1).max(1),
  fundingSpread: z.coerce.number().min(0).max(1),
  dividendFrequency: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"]),
  dividendPaymentDay: z.coerce.number().int().min(1).max(31),
  dividendPerUnit: z.coerce.number().nonnegative(),
  warningLtvThreshold: z.coerce.number().min(0).max(1),
  marginCallLtvThreshold: z.coerce.number().min(0).max(1),
  forcedLiquidationLtvThreshold: z.coerce.number().min(0).max(1),
  notes: z.string().optional(),
}).superRefine((value, ctx) => {
  if (!(value.warningLtvThreshold < value.marginCallLtvThreshold)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Warning LTV must be lower than margin call LTV",
      path: ["warningLtvThreshold"],
    });
  }
  if (!(value.marginCallLtvThreshold < value.forcedLiquidationLtvThreshold)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Margin call LTV must be lower than forced liquidation LTV",
      path: ["forcedLiquidationLtvThreshold"],
    });
  }
});

export const cashflowSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM"),
  nav: z.coerce.number().positive(),
  dividendPerUnit: z.coerce.number().nonnegative(),
  totalDividendReceived: z.coerce.number().nonnegative(),
  fundingRate: z.coerce.number().min(-1).max(2),
  totalFundingCost: z.coerce.number().nonnegative(),
  fundingCostOverridden: z.coerce.boolean().optional(),
  netCarry: z.coerce.number(),
  source: z.enum(["manual", "generated"]).optional(),
  comments: z.string().optional(),
});

export const fundingCostEntrySchema = z.object({
  date: z.string().min(1, "Date is required"),
  amount: z.coerce.number().nonnegative(),
  notes: z.string().optional(),
});

export const scenarioSchema = z.object({
  name: z.string().min(2),
  navChangePct: z.coerce.number().min(-1).max(1),
  dividendChangePct: z.coerce.number().min(-1).max(1),
  fundingRateShockBps: z.coerce.number().min(-5000).max(5000),
  loanAmountChangePct: z.coerce.number().min(-1).max(2),
  fxChangePct: z.coerce.number().min(-1).max(1),
  haircutMarginAssumption: z.coerce.number().min(0).max(1),
});

export const scenarioPercentInputSchema = z.object({
  name: z.string().min(2),
  navChangePct: z.coerce.number().min(-100).max(100),
  dividendChangePct: z.coerce.number().min(-100).max(100),
  fundingRateShockBps: z.coerce.number().min(-5000).max(5000),
  loanAmountChangePct: z.coerce.number().min(-100).max(200),
  fxChangePct: z.coerce.number().min(-100).max(100),
  haircutMarginAssumption: z.coerce.number().min(0).max(100),
});

export const transactionSchema = z.object({
  type: z.enum(["BUY", "SELL"]),
  date: z.string().min(1, "Date is required"),
  units: z.coerce.number().positive("Units must be > 0"),
  nav: z.coerce.number().positive("NAV must be > 0"),
  grossAmount: z.coerce.number().nonnegative(),
  commissionPct: z.coerce.number().min(0).max(100),
  loanAmount: z.coerce.number().nonnegative().optional(),
  ltv: z.coerce.number().min(0).max(2).optional(),
  fundingBaseRate: z.coerce.number().min(-1).max(2).optional(),
  fundingSpread: z.coerce.number().min(0).max(2).optional(),
  notes: z.string().optional(),
});

export type FundFormValues = z.infer<typeof fundSchema>;
export type CashflowFormValues = z.infer<typeof cashflowSchema>;
export type FundingCostEntryFormValues = z.infer<typeof fundingCostEntrySchema>;
export type ScenarioFormValues = z.infer<typeof scenarioSchema>;
export type ScenarioPercentInputFormValues = z.infer<typeof scenarioPercentInputSchema>;
export type TransactionFormValues = z.infer<typeof transactionSchema>;
