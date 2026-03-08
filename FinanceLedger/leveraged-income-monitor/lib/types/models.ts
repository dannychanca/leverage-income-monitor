export type Currency = "USD" | "EUR" | "GBP" | "SGD" | "HKD";
export type DividendFrequency = "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";

export interface MonthlyCashflowRecord {
  id: string;
  fundId: string;
  month: string;
  nav: number;
  dividendPerUnit: number;
  totalDividendReceived: number;
  fundingRate: number;
  totalFundingCost: number;
  fundingCostOverridden?: boolean;
  netCarry: number;
  source: "manual" | "generated";
  comments?: string;
}

export interface FundingCostEntry {
  id: string;
  fundId: string;
  date: string;
  amount: number;
  notes?: string;
}

export type FundTransactionType = "BUY" | "SELL";

export interface FundTransaction {
  id: string;
  fundId: string;
  type: FundTransactionType;
  date: string;
  units: number;
  nav: number;
  grossAmount: number;
  commissionPct: number;
  loanAmount?: number;
  fundingBaseRate?: number;
  fundingSpread?: number;
  notes?: string;
}

export interface Fund {
  id: string;
  fundName: string;
  manager: string;
  ticker: string;
  currency: Currency;
  unitsHeld: number;
  currentNav: number;
  averageCost: number;
  loanAmount: number;
  fundingBaseRate: number;
  fundingSpread: number;
  dividendFrequency: DividendFrequency;
  dividendPaymentDay: number;
  dividendPerUnit: number;
  warningLtvThreshold: number;
  marginCallLtvThreshold: number;
  forcedLiquidationLtvThreshold: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Scenario {
  id: string;
  name: string;
  navChangePct: number;
  dividendChangePct: number;
  fundingRateShockBps: number;
  loanAmountChangePct: number;
  fxChangePct: number;
  haircutMarginAssumption: number;
  isDefault?: boolean;
}

export interface Settings {
  baseCurrency: Currency;
  largeNavShockThresholdPct: number;
  defaultWarningThreshold: number;
  defaultMarginCallThreshold: number;
}

export interface PortfolioData {
  funds: Fund[];
  monthlyRecords: MonthlyCashflowRecord[];
  fundingCostEntries: FundingCostEntry[];
  transactions: FundTransaction[];
  scenarios: Scenario[];
  settings: Settings;
}
