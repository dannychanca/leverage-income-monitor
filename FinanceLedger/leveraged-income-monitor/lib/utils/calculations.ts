import type {
  DividendFrequency,
  Fund,
  FundingCostEntry,
  FundTransaction,
  MonthlyCashflowRecord,
  PortfolioData,
  Scenario,
} from "@/lib/types/models";

export interface FundMetrics {
  marketValue: number;
  costBasis: number;
  unrealizedPnL: number;
  equityValue: number;
  ltv: number;
  allInFundingRate: number;
  monthlyDividendAmount: number;
  monthlyFundingCost: number;
  netCarry: number;
  netPnL: number;
  annualizedNetPnL: number;
  annualizedDistributionYield: number;
  annualizedNetCarryOnEquity: number;
}

export interface ScenarioResult {
  stressedNav: number;
  stressedMarketValue: number;
  stressedDividendIncome: number;
  stressedFundingCost: number;
  stressedNetCarry: number;
  stressedLtv: number;
  stressedEquity: number;
  marginBufferRemaining: number;
  marginCallBreached: boolean;
  annualizedNetCarryOnEquity: number;
}

export interface HoldingPeriodPLResult {
  years: number;
  navDeclinePct: number;
  startingNav: number;
  startingMarketValue: number;
  endingNav: number;
  endingMarketValue: number;
  totalDividendsReceived: number;
  totalFundingCost: number;
  unrealizedCapitalPnL: number;
  strategyTotalPnL: number;
}

export interface PortfolioHoldingPeriodPLResult {
  years: number;
  navDeclinePct: number;
  weightedStartingNav: number;
  weightedEndingNav: number;
  startingMarketValue: number;
  endingMarketValue: number;
  totalInitialFundingAmount: number;
  totalDividendsReceived: number;
  totalFundingCost: number;
  unrealizedCapitalPnL: number;
  strategyTotalPnL: number;
}

export interface TransactionDerivedHoldings {
  unitsHeld: number;
  averageCost: number;
  costBasis: number;
}

export interface TransactionDerivedFinancing {
  loanAmount: number;
  fundingBaseRate: number;
  fundingSpread: number;
}

export interface HoldingPeriodOverrides {
  startingNav?: number;
  endingNav?: number;
  fundingRate?: number;
  fundingAmount?: number;
  dividendPerUnit?: number;
}

export interface CashflowPrefillDefaults {
  month: string;
  nav: number;
  dividendPerUnit: number;
  totalDividendReceived: number;
  fundingRate: number;
  totalFundingCost: number;
  netCarry: number;
}

export interface ScenarioPercentInputValues {
  name: string;
  navChangePct: number;
  dividendChangePct: number;
  fundingRateShockBps: number;
  loanAmountChangePct: number;
  fxChangePct: number;
  haircutMarginAssumption: number;
}

export interface NormalizedTransactionNumbers {
  units: number;
  nav: number;
  grossAmount: number;
  commissionPct: number;
  loanAmount: number;
  fundingBaseRate: number;
  fundingSpread: number;
}

export interface FundThresholdRiskSnapshot {
  fundId: string;
  fundName: string;
  currency: string;
  currentNav: number;
  currentLtv: number;
  leverage: number;
  warningLtvThreshold: number | null;
  marginCallLtvThreshold: number | null;
  forcedLiquidationLtvThreshold: number | null;
  navAtWarningThreshold: number | null;
  navAtMarginCallThreshold: number | null;
  navAtLiquidationThreshold: number | null;
  downsideToWarningPct: number | null;
  downsideToMarginCallPct: number | null;
  downsideToLiquidationPct: number | null;
  requiredLoanRepayment: number | null;
  requiredMarketValue: number | null;
  additionalCollateralNeeded: number | null;
  targetLtv: number | null;
  distanceToWarning: number | null;
  distanceToMarginCall: number | null;
  distanceToLiquidation: number | null;
  warningBreached: boolean;
  marginCallBreached: boolean;
  liquidationBreached: boolean;
  isLevered: boolean;
  canComputeThresholdNav: boolean;
}

export interface FundStressRiskSnapshot {
  fundId: string;
  fundName: string;
  stressedNav: number;
  stressedMarketValue: number;
  stressedLtv: number;
  stressedDividendIncome: number;
  stressedFundingCost: number;
  stressedNetCarry: number;
  warningBreached: boolean;
  marginCallBreached: boolean;
  liquidationBreached: boolean;
  distanceToMarginCall: number | null;
}

export interface PortfolioStressRiskRow {
  navDownPct: number;
  fundingUpBps: number;
  dividendCutPct: number;
  stressedMarketValue: number;
  stressedLoan: number;
  stressedLtv: number;
  stressedDividendIncome: number;
  stressedFundingCost: number;
  stressedNetCarry: number;
  warningBreaches: number;
  marginCallBreaches: number;
  liquidationBreaches: number;
  firstWarningFund: string | null;
  firstMarginCallFund: string | null;
  firstLiquidationFund: string | null;
}

export interface PortfolioRiskSnapshot {
  weightedAverageLtv: number;
  totalFinancedExposure: number;
  marketValueBufferBeforeMarginCall: number;
  firstWarningFund: string | null;
  firstMarginCallFund: string | null;
  firstLiquidationFund: string | null;
  fundRiskRows: FundThresholdRiskSnapshot[];
  stressRows: PortfolioStressRiskRow[];
}

export function inferMonthlyRecordSource(record: {
  source?: "manual" | "generated";
  comments?: string;
}): "manual" | "generated" {
  if (record.source === "generated") return "generated";
  if (record.source === "manual") return "manual";
  return typeof record.comments === "string" && record.comments.startsWith("Auto-generated")
    ? "generated"
    : "manual";
}

export function isGeneratedMonthlyRecord(record: Pick<MonthlyCashflowRecord, "source">) {
  return record.source === "generated";
}

export function mergeGeneratedAndManualMonthlyRecords(
  existingFundRecords: MonthlyCashflowRecord[],
  generatedFundRecords: MonthlyCashflowRecord[]
) {
  const manualFundRecords = existingFundRecords.filter((record) => !isGeneratedMonthlyRecord(record));
  const manualMonthKeys = new Set(manualFundRecords.map((r) => r.month));
  const generatedWithoutManualOverlap = generatedFundRecords.filter((r) => !manualMonthKeys.has(r.month));
  return [...manualFundRecords, ...generatedWithoutManualOverlap].sort((a, b) => a.month.localeCompare(b.month));
}

const safeDivide = (a: number, b: number) => (b === 0 ? 0 : a / b);

export function defaultForcedLiquidationThreshold(marginCallLtvThreshold: number) {
  return Math.min(0.94999, marginCallLtvThreshold + 0.1);
}

function payoutsPerYear(frequency: DividendFrequency) {
  if (frequency === "MONTHLY") return 12;
  if (frequency === "QUARTERLY") return 4;
  if (frequency === "SEMI_ANNUAL") return 2;
  return 1;
}

function monthsPerPayout(frequency: DividendFrequency) {
  if (frequency === "MONTHLY") return 1;
  if (frequency === "QUARTERLY") return 3;
  if (frequency === "SEMI_ANNUAL") return 6;
  return 12;
}

export function calculateFundMetrics(fund: Fund): FundMetrics {
  const marketValue = fund.unitsHeld * fund.currentNav;
  const costBasis = fund.unitsHeld * fund.averageCost;
  const unrealizedPnL = marketValue - costBasis;
  const equityValue = marketValue - fund.loanAmount;
  const ltv = safeDivide(fund.loanAmount, marketValue);
  const allInFundingRate = fund.fundingBaseRate + fund.fundingSpread;
  const annualDividendAmount = fund.unitsHeld * fund.dividendPerUnit * payoutsPerYear(fund.dividendFrequency);
  const monthlyDividendAmount = annualDividendAmount / 12;
  const monthlyFundingCost = (fund.loanAmount * allInFundingRate) / 12;
  const netCarry = monthlyDividendAmount - monthlyFundingCost;
  const netPnL = unrealizedPnL + netCarry;
  const annualizedNetPnL = unrealizedPnL + netCarry * 12;
  const annualizedDistributionYield = safeDivide(monthlyDividendAmount * 12, marketValue);
  const annualizedNetCarryOnEquity = safeDivide(netCarry * 12, equityValue);

  return {
    marketValue,
    costBasis,
    unrealizedPnL,
    equityValue,
    ltv,
    allInFundingRate,
    monthlyDividendAmount,
    monthlyFundingCost,
    netCarry,
    netPnL,
    annualizedNetPnL,
    annualizedDistributionYield,
    annualizedNetCarryOnEquity,
  };
}

function validThreshold(threshold: number | null | undefined) {
  if (threshold === undefined || threshold === null) return null;
  if (!Number.isFinite(threshold) || threshold <= 0) return null;
  return threshold;
}

function navAtLtvThreshold(unitsHeld: number, loanAmount: number, threshold: number | null) {
  if (loanAmount <= 0) return null;
  if (unitsHeld <= 0) return null;
  if (threshold === null) return null;
  return safeDivide(loanAmount, unitsHeld * threshold);
}

function downsideFromCurrentNav(currentNav: number, thresholdNav: number | null) {
  if (thresholdNav === null) return null;
  if (currentNav <= 0) return null;
  return safeDivide(thresholdNav - currentNav, currentNav);
}

export function calculateFundThresholdRisk(
  fund: Fund,
  options?: {
    targetLtv?: number;
  }
): FundThresholdRiskSnapshot {
  const marketValue = fund.unitsHeld * fund.currentNav;
  const isLevered = fund.loanAmount > 0;
  const canComputeThresholdNav = fund.unitsHeld > 0 && fund.currentNav > 0 && marketValue > 0;
  const currentLtv = safeDivide(fund.loanAmount, marketValue);

  const warningLtvThreshold = validThreshold(fund.warningLtvThreshold);
  const marginCallLtvThreshold = validThreshold(fund.marginCallLtvThreshold);
  const forcedLiquidationLtvThreshold = validThreshold(fund.forcedLiquidationLtvThreshold);

  const navAtWarningThreshold = canComputeThresholdNav
    ? navAtLtvThreshold(fund.unitsHeld, fund.loanAmount, warningLtvThreshold)
    : null;
  const navAtMarginCallThreshold = canComputeThresholdNav
    ? navAtLtvThreshold(fund.unitsHeld, fund.loanAmount, marginCallLtvThreshold)
    : null;
  const navAtLiquidationThreshold = canComputeThresholdNav
    ? navAtLtvThreshold(fund.unitsHeld, fund.loanAmount, forcedLiquidationLtvThreshold)
    : null;

  const downsideToWarningPct = downsideFromCurrentNav(fund.currentNav, navAtWarningThreshold);
  const downsideToMarginCallPct = downsideFromCurrentNav(fund.currentNav, navAtMarginCallThreshold);
  const downsideToLiquidationPct = downsideFromCurrentNav(fund.currentNav, navAtLiquidationThreshold);

  const fallbackTarget = warningLtvThreshold;
  const targetLtv = validThreshold(options?.targetLtv ?? fallbackTarget);
  const requiredLoanRepayment =
    targetLtv !== null && marketValue > 0
      ? Math.max(0, fund.loanAmount - targetLtv * marketValue)
      : targetLtv !== null && fund.loanAmount <= 0
        ? 0
        : null;
  const requiredMarketValue =
    targetLtv !== null && fund.loanAmount > 0
      ? safeDivide(fund.loanAmount, targetLtv)
      : targetLtv !== null
        ? 0
        : null;
  const additionalCollateralNeeded =
    targetLtv !== null && requiredMarketValue !== null
      ? Math.max(0, requiredMarketValue - Math.max(0, marketValue))
      : null;

  const distanceToWarning = warningLtvThreshold !== null && canComputeThresholdNav
    ? warningLtvThreshold - currentLtv
    : null;
  const distanceToMarginCall = marginCallLtvThreshold !== null && canComputeThresholdNav
    ? marginCallLtvThreshold - currentLtv
    : null;
  const distanceToLiquidation = forcedLiquidationLtvThreshold !== null && canComputeThresholdNav
    ? forcedLiquidationLtvThreshold - currentLtv
    : null;

  const warningBreached = distanceToWarning !== null ? distanceToWarning <= 0 : false;
  const marginCallBreached = distanceToMarginCall !== null ? distanceToMarginCall <= 0 : false;
  const liquidationBreached = distanceToLiquidation !== null ? distanceToLiquidation <= 0 : false;

  const equityValue = marketValue - fund.loanAmount;
  const leverage = equityValue > 0 ? marketValue / equityValue : 0;

  return {
    fundId: fund.id,
    fundName: fund.fundName,
    currency: fund.currency,
    currentNav: fund.currentNav,
    currentLtv,
    leverage,
    warningLtvThreshold,
    marginCallLtvThreshold,
    forcedLiquidationLtvThreshold,
    navAtWarningThreshold,
    navAtMarginCallThreshold,
    navAtLiquidationThreshold,
    downsideToWarningPct,
    downsideToMarginCallPct,
    downsideToLiquidationPct,
    requiredLoanRepayment,
    requiredMarketValue,
    additionalCollateralNeeded,
    targetLtv,
    distanceToWarning,
    distanceToMarginCall,
    distanceToLiquidation,
    warningBreached,
    marginCallBreached,
    liquidationBreached,
    isLevered,
    canComputeThresholdNav,
  };
}

export function calculatePortfolioMetrics(funds: Fund[]) {
  const totals = funds.reduce(
    (acc, fund) => {
      const m = calculateFundMetrics(fund);
      acc.marketValue += m.marketValue;
      acc.loanAmount += fund.loanAmount;
      acc.equity += m.equityValue;
      acc.costBasis += m.costBasis;
      acc.unrealizedPnL += m.unrealizedPnL;
      acc.monthlyDividends += m.monthlyDividendAmount;
      acc.monthlyFunding += m.monthlyFundingCost;
      acc.monthlyNetCarry += m.netCarry;
      acc.monthlyNetPnL += m.netPnL;
      acc.annualizedNetPnL += m.annualizedNetPnL;
      return acc;
    },
    {
      marketValue: 0,
      costBasis: 0,
      unrealizedPnL: 0,
      loanAmount: 0,
      equity: 0,
      monthlyDividends: 0,
      monthlyFunding: 0,
      monthlyNetCarry: 0,
      monthlyNetPnL: 0,
      annualizedNetPnL: 0,
    }
  );

  const weightedAverageLtv = safeDivide(totals.loanAmount, totals.marketValue);
  const initialLtv = safeDivide(totals.loanAmount, totals.costBasis);
  const annualizedNetCarryOnEquity = safeDivide(totals.monthlyNetCarry * 12, totals.equity);

  return {
    ...totals,
    weightedAverageLtv,
    initialLtv,
    annualizedNetCarryOnEquity,
  };
}

function firstBySmallestDistance(
  rows: FundThresholdRiskSnapshot[],
  key: "distanceToWarning" | "distanceToMarginCall" | "distanceToLiquidation"
) {
  const sorted = rows
    .filter((row) => row[key] !== null)
    .sort((a, b) => (a[key] ?? Number.MAX_SAFE_INTEGER) - (b[key] ?? Number.MAX_SAFE_INTEGER));
  return sorted[0]?.fundName ?? null;
}

export function calculatePortfolioStressRiskRows(funds: Fund[]): PortfolioStressRiskRow[] {
  const navDownPcts = [0.05, 0.1, 0.15, 0.2];
  const fundingUpBps = [50, 100, 200];
  const dividendCutPcts = [0.1, 0.2, 0.3];
  const rows: PortfolioStressRiskRow[] = [];
  const thresholdByFundId = new Map(
    funds.map((fund) => [
      fund.id,
      {
        warning: fund.warningLtvThreshold,
        margin: fund.marginCallLtvThreshold,
        liquidation: fund.forcedLiquidationLtvThreshold,
      },
    ])
  );

  for (const navDownPct of navDownPcts) {
    for (const fundingUpBp of fundingUpBps) {
      for (const dividendCutPct of dividendCutPcts) {
        const fundStressRows: FundStressRiskSnapshot[] = funds.map((fund) => {
          const stressedNav = fund.currentNav * (1 - navDownPct);
          const stressedMarketValue = fund.unitsHeld * stressedNav;
          const stressedLtv = safeDivide(fund.loanAmount, stressedMarketValue);
          const stressedFundingRate = fund.fundingBaseRate + fund.fundingSpread + fundingUpBp / 10000;
          const stressedDividendIncome =
            (fund.unitsHeld * fund.dividendPerUnit * (1 - dividendCutPct) * payoutsPerYear(fund.dividendFrequency)) / 12;
          const stressedFundingCost = (fund.loanAmount * stressedFundingRate) / 12;
          const stressedNetCarry = stressedDividendIncome - stressedFundingCost;
          const warningDistance =
            fund.unitsHeld > 0 && stressedMarketValue > 0 ? fund.warningLtvThreshold - stressedLtv : null;
          const marginDistance =
            fund.unitsHeld > 0 && stressedMarketValue > 0 ? fund.marginCallLtvThreshold - stressedLtv : null;
          const liquidationDistance =
            fund.unitsHeld > 0 && stressedMarketValue > 0
              ? fund.forcedLiquidationLtvThreshold - stressedLtv
              : null;

          return {
            fundId: fund.id,
            fundName: fund.fundName,
            stressedNav,
            stressedMarketValue,
            stressedLtv,
            stressedDividendIncome,
            stressedFundingCost,
            stressedNetCarry,
            warningBreached: warningDistance !== null ? warningDistance <= 0 : false,
            marginCallBreached: marginDistance !== null ? marginDistance <= 0 : false,
            liquidationBreached: liquidationDistance !== null ? liquidationDistance <= 0 : false,
            distanceToMarginCall: marginDistance,
          };
        });

        const stressedMarketValue = fundStressRows.reduce((sum, row) => sum + row.stressedMarketValue, 0);
        const stressedLoan = funds.reduce((sum, fund) => sum + fund.loanAmount, 0);
        const stressedLtv = safeDivide(stressedLoan, stressedMarketValue);
        const stressedDividendIncome = fundStressRows.reduce((sum, row) => sum + row.stressedDividendIncome, 0);
        const stressedFundingCost = fundStressRows.reduce((sum, row) => sum + row.stressedFundingCost, 0);
        const stressedNetCarry = stressedDividendIncome - stressedFundingCost;

        const warningBreaches = fundStressRows.filter((row) => row.warningBreached).length;
        const marginCallBreaches = fundStressRows.filter((row) => row.marginCallBreached).length;
        const liquidationBreaches = fundStressRows.filter((row) => row.liquidationBreached).length;
        const firstWarningFund =
          fundStressRows
            .filter((row) => row.stressedMarketValue > 0)
            .sort((a, b) => {
              const aThreshold = thresholdByFundId.get(a.fundId)?.warning ?? Number.MAX_SAFE_INTEGER;
              const bThreshold = thresholdByFundId.get(b.fundId)?.warning ?? Number.MAX_SAFE_INTEGER;
              const aDistance = aThreshold - a.stressedLtv;
              const bDistance = bThreshold - b.stressedLtv;
              return aDistance - bDistance;
            })[0]?.fundName ?? null;
        const firstMarginCallFund =
          fundStressRows
            .filter((row) => row.distanceToMarginCall !== null)
            .sort((a, b) => (a.distanceToMarginCall ?? Number.MAX_SAFE_INTEGER) - (b.distanceToMarginCall ?? Number.MAX_SAFE_INTEGER))[0]
            ?.fundName ?? null;
        const firstLiquidationFund =
          fundStressRows
            .filter((row) => row.stressedMarketValue > 0)
            .sort((a, b) => {
              const aThreshold = thresholdByFundId.get(a.fundId)?.liquidation ?? Number.MAX_SAFE_INTEGER;
              const bThreshold = thresholdByFundId.get(b.fundId)?.liquidation ?? Number.MAX_SAFE_INTEGER;
              const aDistance = aThreshold - a.stressedLtv;
              const bDistance = bThreshold - b.stressedLtv;
              return aDistance - bDistance;
            })[0]?.fundName ?? null;

        rows.push({
          navDownPct,
          fundingUpBps: fundingUpBp,
          dividendCutPct,
          stressedMarketValue,
          stressedLoan,
          stressedLtv,
          stressedDividendIncome,
          stressedFundingCost,
          stressedNetCarry,
          warningBreaches,
          marginCallBreaches,
          liquidationBreaches,
          firstWarningFund,
          firstMarginCallFund,
          firstLiquidationFund,
        });
      }
    }
  }

  return rows;
}

export function calculatePortfolioRiskSnapshot(
  funds: Fund[],
  options?: {
    targetLtv?: number;
  }
): PortfolioRiskSnapshot {
  const fundRiskRows = funds.map((fund) => calculateFundThresholdRisk(fund, options));
  const totals = funds.reduce(
    (acc, fund) => {
      const marketValue = fund.unitsHeld * fund.currentNav;
      acc.marketValue += marketValue;
      acc.loan += fund.loanAmount;
      return acc;
    },
    { marketValue: 0, loan: 0 }
  );
  const fundById = new Map(funds.map((fund) => [fund.id, fund]));
  const marketValueBufferBeforeMarginCall = fundRiskRows.reduce((sum, row) => {
    if (row.marginCallLtvThreshold === null) return sum;
    const fund = fundById.get(row.fundId);
    if (!fund) return sum;
    const marketValue = row.currentNav * fund.unitsHeld;
    const loan = fund.loanAmount;
    if (marketValue <= 0 || loan <= 0) return sum;
    const buffer = Math.max(0, marketValue - safeDivide(loan, row.marginCallLtvThreshold));
    return sum + buffer;
  }, 0);

  return {
    weightedAverageLtv: safeDivide(totals.loan, totals.marketValue),
    totalFinancedExposure: totals.loan,
    marketValueBufferBeforeMarginCall,
    firstWarningFund: firstBySmallestDistance(fundRiskRows, "distanceToWarning"),
    firstMarginCallFund: firstBySmallestDistance(fundRiskRows, "distanceToMarginCall"),
    firstLiquidationFund: firstBySmallestDistance(fundRiskRows, "distanceToLiquidation"),
    fundRiskRows,
    stressRows: calculatePortfolioStressRiskRows(funds),
  };
}

export function applyScenarioToFund(fund: Fund, scenario: Scenario): ScenarioResult {
  const base = calculateFundMetrics(fund);
  const stressedNav = fund.currentNav * (1 + scenario.navChangePct) * (1 + scenario.fxChangePct);
  const stressedMarketValue = fund.unitsHeld * stressedNav;
  const stressedLoanAmount = fund.loanAmount * (1 + scenario.loanAmountChangePct);
  const stressedDividendPerUnit = fund.dividendPerUnit * (1 + scenario.dividendChangePct);
  const stressedAnnualDividendIncome =
    fund.unitsHeld * stressedDividendPerUnit * payoutsPerYear(fund.dividendFrequency);
  const stressedDividendIncome = stressedAnnualDividendIncome / 12;

  const stressedFundingRate = base.allInFundingRate + scenario.fundingRateShockBps / 10000;
  const stressedFundingCost = (stressedLoanAmount * stressedFundingRate) / 12;
  const stressedNetCarry = stressedDividendIncome - stressedFundingCost;
  const stressedLtv = safeDivide(stressedLoanAmount, stressedMarketValue);
  const stressedEquity = stressedMarketValue - stressedLoanAmount;

  const effectiveMarginThreshold = Math.max(
    0,
    fund.marginCallLtvThreshold - scenario.haircutMarginAssumption
  );
  const marginBufferRemaining = effectiveMarginThreshold - stressedLtv;
  const marginCallBreached = stressedLtv >= effectiveMarginThreshold;
  const annualizedNetCarryOnEquity = safeDivide(stressedNetCarry * 12, stressedEquity);

  return {
    stressedNav,
    stressedMarketValue,
    stressedDividendIncome,
    stressedFundingCost,
    stressedNetCarry,
    stressedLtv,
    stressedEquity,
    marginBufferRemaining,
    marginCallBreached,
    annualizedNetCarryOnEquity,
  };
}

export function aggregateMonthlySeries(
  funds: Fund[],
  records: MonthlyCashflowRecord[],
  transactions: FundTransaction[] = []
) {
  const byMonth = new Map<
    string,
    {
      month: string;
      dividends: number;
      funding: number;
      netCarry: number;
      marketValue: number;
      loanAmount: number;
      ltv: number;
    }
  >();

  const txByFundId = new Map<string, FundTransaction[]>();
  for (const tx of transactions) {
    const existing = txByFundId.get(tx.fundId) ?? [];
    existing.push(tx);
    txByFundId.set(tx.fundId, existing);
  }
  for (const [fundId, txs] of txByFundId.entries()) {
    txByFundId.set(fundId, [...txs].sort(compareTransactionDates));
  }

  for (const record of records) {
    const existing = byMonth.get(record.month) || {
      month: record.month,
      dividends: 0,
      funding: 0,
      netCarry: 0,
      marketValue: 0,
      loanAmount: 0,
      ltv: 0,
    };

    const fund = funds.find((f) => f.id === record.fundId);
    if (!fund) continue;

    const fundTransactions = txByFundId.get(fund.id) ?? [];
    const hasTransactions = fundTransactions.length > 0;
    const monthSnapshotDate = endOfMonthDate(record.month);
    const unitsHeld = hasTransactions && monthSnapshotDate
      ? Math.max(0, unitsHeldAtDate(fundTransactions, monthSnapshotDate))
      : fund.unitsHeld;

    const financing = hasTransactions && monthSnapshotDate
      ? financingAtDate(
          fundTransactions,
          monthSnapshotDate,
          fund.fundingBaseRate,
          fund.fundingSpread
        )
      : {
          loanOutstanding: fund.loanAmount,
        };

    const marketValue = unitsHeld * record.nav;
    const loanAmount = financing.loanOutstanding;

    existing.dividends += record.totalDividendReceived;
    existing.funding += record.totalFundingCost;
    existing.netCarry += record.netCarry;
    existing.marketValue += marketValue;
    existing.loanAmount += loanAmount;
    existing.ltv = safeDivide(existing.loanAmount, existing.marketValue);

    byMonth.set(record.month, existing);
  }

  return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export function calculateHoldingPeriodPL(
  fund: Fund,
  years: number,
  navDeclinePct: number,
  overrides?: HoldingPeriodOverrides
): HoldingPeriodPLResult {
  const normalizedYears = Number.isFinite(years) ? Math.max(0, years) : 0;
  const normalizedDeclinePct = Number.isFinite(navDeclinePct) ? Math.max(0, navDeclinePct) : 0;
  const normalizedDeclineRatio = normalizedDeclinePct / 100;
  const defaultFundingRate = fund.fundingBaseRate + fund.fundingSpread;
  const startingNav =
    overrides?.startingNav !== undefined ? Math.max(0, overrides.startingNav) : fund.averageCost;
  const fundingRate =
    overrides?.fundingRate !== undefined ? Math.max(0, overrides.fundingRate) : defaultFundingRate;
  const fundingAmount =
    overrides?.fundingAmount !== undefined ? Math.max(0, overrides.fundingAmount) : fund.loanAmount;
  const dividendPerUnit =
    overrides?.dividendPerUnit !== undefined
      ? Math.max(0, overrides.dividendPerUnit)
      : fund.dividendPerUnit;
  const startingMarketValue = fund.unitsHeld * startingNav;

  const endingNav =
    overrides?.endingNav !== undefined
      ? Math.max(0, overrides.endingNav)
      : Math.max(0, startingNav * (1 - normalizedDeclineRatio));
  const endingMarketValue = fund.unitsHeld * endingNav;
  const totalDividendsReceived =
    fund.unitsHeld *
    dividendPerUnit *
    payoutsPerYear(fund.dividendFrequency) *
    normalizedYears;
  const totalFundingCost = fundingAmount * fundingRate * normalizedYears;
  const unrealizedCapitalPnL = endingMarketValue - startingMarketValue;
  const strategyTotalPnL = totalDividendsReceived - totalFundingCost + unrealizedCapitalPnL;

  return {
    years: normalizedYears,
    navDeclinePct: normalizedDeclinePct,
    startingNav,
    startingMarketValue,
    endingNav,
    endingMarketValue,
    totalDividendsReceived,
    totalFundingCost,
    unrealizedCapitalPnL,
    strategyTotalPnL,
  };
}

function addMonths(date: Date, diff: number) {
  return new Date(date.getFullYear(), date.getMonth() + diff, 1);
}

function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function payoutDateForMonth(year: number, monthIndex: number, paymentDay: number) {
  const day = Math.min(Math.max(1, paymentDay), lastDayOfMonth(year, monthIndex));
  return new Date(year, monthIndex, day);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
}

function parseIsoDate(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  const slashDmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDmy) {
    const d = Number(slashDmy[1]);
    const m = Number(slashDmy[2]);
    const y = Number(slashDmy[3]);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function compareTransactionDates(a: FundTransaction, b: FundTransaction) {
  const aDate = parseIsoDate(a.date);
  const bDate = parseIsoDate(b.date);
  const aTs = aDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bTs = bDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (aTs !== bTs) return aTs - bTs;
  return a.date.localeCompare(b.date);
}

function transactionGrossAmount(tx: FundTransaction) {
  const computed = tx.units * tx.nav;
  if (Number.isFinite(computed) && computed > 0) return computed;
  return tx.grossAmount > 0 ? tx.grossAmount : 0;
}

export function toMonthKeyFromIsoDate(value: string) {
  const d = parseIsoDate(value);
  return d ? monthKey(d) : "";
}

function unitsHeldAtDate(transactions: FundTransaction[], atDate: Date) {
  return transactions.reduce((units, tx) => {
    const txDate = parseIsoDate(tx.date);
    if (!txDate || txDate > atDate) return units;
    return tx.type === "BUY" ? units + tx.units : units - tx.units;
  }, 0);
}

function financingAtDate(
  transactions: FundTransaction[],
  atDate: Date,
  fallbackFundingBaseRate: number,
  fallbackFundingSpread: number
) {
  let loanOutstanding = 0;
  let baseNumerator = 0;
  let spreadNumerator = 0;
  let rateWeightDenominator = 0;

  for (const tx of transactions) {
    const txDate = parseIsoDate(tx.date);
    if (!txDate || txDate > atDate) continue;

    const loan = Math.max(0, tx.loanAmount ?? 0);
    if (loan <= 0) continue;

    if (tx.type === "BUY") {
      const base = tx.fundingBaseRate ?? fallbackFundingBaseRate;
      const spread = tx.fundingSpread ?? fallbackFundingSpread;
      loanOutstanding += loan;
      baseNumerator += base * loan;
      spreadNumerator += spread * loan;
      rateWeightDenominator += loan;
      continue;
    }

    // SELL: treat loanAmount as principal repaid at this date.
    const repay = Math.min(loan, Math.max(0, loanOutstanding));
    if (repay <= 0) continue;
    const avgBase = rateWeightDenominator > 0 ? baseNumerator / rateWeightDenominator : fallbackFundingBaseRate;
    const avgSpread = rateWeightDenominator > 0 ? spreadNumerator / rateWeightDenominator : fallbackFundingSpread;

    loanOutstanding -= repay;
    baseNumerator -= avgBase * repay;
    spreadNumerator -= avgSpread * repay;
    rateWeightDenominator -= repay;
  }

  loanOutstanding = Math.max(0, loanOutstanding);
  rateWeightDenominator = Math.max(0, rateWeightDenominator);
  const fundingBaseRate =
    rateWeightDenominator > 0 ? baseNumerator / rateWeightDenominator : fallbackFundingBaseRate;
  const fundingSpread =
    rateWeightDenominator > 0 ? spreadNumerator / rateWeightDenominator : fallbackFundingSpread;
  const allInFundingRate = fundingBaseRate + fundingSpread;
  const monthlyFundingCost = (loanOutstanding * allInFundingRate) / 12;

  return {
    loanOutstanding,
    fundingBaseRate,
    fundingSpread,
    allInFundingRate,
    monthlyFundingCost,
  };
}

export function generateCashflowsFromTransactions(
  fund: Fund,
  transactions: FundTransaction[],
  endDateIso?: string
): Omit<MonthlyCashflowRecord, "id" | "fundId">[] {
  if (transactions.length === 0) return [];

  const sorted = [...transactions].sort(compareTransactionDates);
  const firstTxDate = parseIsoDate(sorted[0].date);
  if (!firstTxDate) return [];

  const endDate = endDateIso ? parseIsoDate(endDateIso) : new Date();
  if (!endDate) return [];

  const interval = monthsPerPayout(fund.dividendFrequency);
  const paymentDay = fund.dividendPaymentDay;

  let cursor = new Date(firstTxDate.getFullYear(), firstTxDate.getMonth(), 1);
  let monthIndex = 0;
  const results: Omit<MonthlyCashflowRecord, "id" | "fundId">[] = [];

  while (cursor <= endDate) {
    const isPayoutMonth = monthIndex % interval === 0;
    const payoutDate = payoutDateForMonth(cursor.getFullYear(), cursor.getMonth(), paymentDay);
    if (isPayoutMonth && payoutDate <= endDate) {
      const unitsAtPayout = Math.max(0, unitsHeldAtDate(sorted, payoutDate));
      const financingAtPayout = financingAtDate(
        sorted,
        payoutDate,
        fund.fundingBaseRate,
        fund.fundingSpread
      );
      if (unitsAtPayout > 0) {
        const dividendPerUnit = fund.dividendPerUnit;
        const totalDividendReceived = unitsAtPayout * dividendPerUnit;
        const totalFundingCost = financingAtPayout.monthlyFundingCost;
        const netCarry = totalDividendReceived - totalFundingCost;

        results.push({
          month: monthKey(cursor),
          nav: fund.currentNav,
          dividendPerUnit,
          totalDividendReceived,
          fundingRate: financingAtPayout.allInFundingRate,
          totalFundingCost,
          netCarry,
          source: "generated",
          comments: `Auto-generated from transactions (${fund.dividendFrequency} paid on day ${paymentDay})`,
        });
      }
    }

    monthIndex += 1;
    cursor = addMonths(cursor, 1);
  }

  return results;
}

export function aggregateFundingCostsByMonth(entries: FundingCostEntry[], fundId: string) {
  const sums = new Map<string, number>();
  for (const entry of entries) {
    if (entry.fundId !== fundId) continue;
    const month = toMonthKeyFromIsoDate(entry.date);
    if (!month) continue;
    sums.set(month, (sums.get(month) ?? 0) + Math.max(0, entry.amount));
  }
  return sums;
}

export function calculatePortfolioHoldingPeriodPL(
  funds: Fund[],
  years: number,
  navDeclinePct: number,
  overrides?: HoldingPeriodOverrides
): PortfolioHoldingPeriodPLResult {
  const totals = funds.reduce(
    (acc, fund) => {
      const result = calculateHoldingPeriodPL(fund, years, navDeclinePct, overrides);
      acc.units += fund.unitsHeld;
      acc.weightedStartingNav += result.startingNav * fund.unitsHeld;
      acc.weightedEndingNav += result.endingNav * fund.unitsHeld;
      acc.startingMarketValue += result.startingMarketValue;
      acc.endingMarketValue += result.endingMarketValue;
      acc.totalInitialFundingAmount +=
        overrides?.fundingAmount !== undefined ? Math.max(0, overrides.fundingAmount) : fund.loanAmount;
      acc.totalDividendsReceived += result.totalDividendsReceived;
      acc.totalFundingCost += result.totalFundingCost;
      acc.unrealizedCapitalPnL += result.unrealizedCapitalPnL;
      acc.strategyTotalPnL += result.strategyTotalPnL;
      return acc;
    },
    {
      units: 0,
      weightedStartingNav: 0,
      weightedEndingNav: 0,
      startingMarketValue: 0,
      endingMarketValue: 0,
      totalInitialFundingAmount: 0,
      totalDividendsReceived: 0,
      totalFundingCost: 0,
      unrealizedCapitalPnL: 0,
      strategyTotalPnL: 0,
    }
  );

  return {
    years,
    navDeclinePct,
    weightedStartingNav: safeDivide(totals.weightedStartingNav, totals.units),
    weightedEndingNav: safeDivide(totals.weightedEndingNav, totals.units),
    startingMarketValue: totals.startingMarketValue,
    endingMarketValue: totals.endingMarketValue,
    totalInitialFundingAmount: totals.totalInitialFundingAmount,
    totalDividendsReceived: totals.totalDividendsReceived,
    totalFundingCost: totals.totalFundingCost,
    unrealizedCapitalPnL: totals.unrealizedCapitalPnL,
    strategyTotalPnL: totals.strategyTotalPnL,
  };
}

export function deriveHoldingsFromTransactions(
  transactions: FundTransaction[],
  fallbackUnits: number,
  fallbackAverageCost: number
): TransactionDerivedHoldings {
  if (transactions.length === 0) {
    return {
      unitsHeld: fallbackUnits,
      averageCost: fallbackAverageCost,
      costBasis: fallbackUnits * fallbackAverageCost,
    };
  }

  const sorted = [...transactions].sort(compareTransactionDates);
  let unitsHeld = 0;
  let costBasis = 0;

  for (const tx of sorted) {
    const grossAmount = transactionGrossAmount(tx);
    const commissionAmount = grossAmount * (Math.max(0, tx.commissionPct ?? 0) / 100);

    if (tx.type === "BUY") {
      unitsHeld += tx.units;
      // Cost basis includes commission paid to acquire position.
      costBasis += grossAmount + commissionAmount;
      continue;
    }

    if (unitsHeld <= 0) continue;
    const sellUnits = Math.min(tx.units, unitsHeld);
    const avgCostBeforeSell = costBasis / unitsHeld;
    unitsHeld -= sellUnits;
    costBasis -= sellUnits * avgCostBeforeSell;
  }

  const averageCost = unitsHeld > 0 ? costBasis / unitsHeld : 0;

  return {
    unitsHeld,
    averageCost,
    costBasis,
  };
}

export function deriveFinancingFromTransactions(
  transactions: FundTransaction[],
  fallbackLoanAmount: number,
  fallbackFundingBaseRate: number,
  fallbackFundingSpread: number
): TransactionDerivedFinancing {
  if (transactions.length === 0) {
    return {
      loanAmount: fallbackLoanAmount,
      fundingBaseRate: fallbackFundingBaseRate,
      fundingSpread: fallbackFundingSpread,
    };
  }

  const sorted = [...transactions].sort(compareTransactionDates);
  let loanOutstanding = 0;
  let weightedBaseNumerator = 0;
  let weightedSpreadNumerator = 0;
  let weightedDenominator = 0;

  for (const tx of sorted) {
    const loan = Math.max(0, tx.loanAmount ?? 0);
    if (loan <= 0) continue;

    if (tx.type === "BUY") {
      const base = tx.fundingBaseRate ?? fallbackFundingBaseRate;
      const spread = tx.fundingSpread ?? fallbackFundingSpread;
      loanOutstanding += loan;
      weightedBaseNumerator += base * loan;
      weightedSpreadNumerator += spread * loan;
      weightedDenominator += loan;
      continue;
    }

    // SELL loanAmount is principal repaid. Remove exposure using weighted average of outstanding mix.
    const repay = Math.min(loan, Math.max(0, loanOutstanding));
    if (repay <= 0) continue;

    const avgBase =
      weightedDenominator > 0 ? weightedBaseNumerator / weightedDenominator : fallbackFundingBaseRate;
    const avgSpread =
      weightedDenominator > 0 ? weightedSpreadNumerator / weightedDenominator : fallbackFundingSpread;

    loanOutstanding -= repay;
    weightedBaseNumerator -= avgBase * repay;
    weightedSpreadNumerator -= avgSpread * repay;
    weightedDenominator -= repay;
  }

  loanOutstanding = Math.max(0, loanOutstanding);
  weightedDenominator = Math.max(0, weightedDenominator);

  return {
    loanAmount: loanOutstanding,
    fundingBaseRate:
      weightedDenominator > 0 ? weightedBaseNumerator / weightedDenominator : fallbackFundingBaseRate,
    fundingSpread:
      weightedDenominator > 0 ? weightedSpreadNumerator / weightedDenominator : fallbackFundingSpread,
  };
}

function endOfMonthDate(month: string) {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return null;
  const day = new Date(year, m, 0).getDate();
  return new Date(year, m - 1, day);
}

export function buildEffectiveFunds(funds: Fund[], transactions: FundTransaction[]) {
  return funds.map((fund) => {
    const fundTransactions = transactions.filter((tx) => tx.fundId === fund.id);
    const holdings = deriveHoldingsFromTransactions(fundTransactions, fund.unitsHeld, fund.averageCost);
    const financing = deriveFinancingFromTransactions(
      fundTransactions,
      fund.loanAmount,
      fund.fundingBaseRate,
      fund.fundingSpread
    );
    return {
      ...fund,
      unitsHeld: holdings.unitsHeld,
      averageCost: holdings.averageCost,
      loanAmount: financing.loanAmount,
      fundingBaseRate: financing.fundingBaseRate,
      fundingSpread: financing.fundingSpread,
    };
  });
}

export function buildDashboardMetricsSnapshot(
  data: Pick<PortfolioData, "funds" | "transactions" | "monthlyRecords">
) {
  const effectiveFunds = buildEffectiveFunds(data.funds, data.transactions);
  const portfolio = calculatePortfolioMetrics(effectiveFunds);
  const portfolioRisk = calculatePortfolioRiskSnapshot(effectiveFunds);
  const series = aggregateMonthlySeries(effectiveFunds, data.monthlyRecords);
  const totalDividendsCollected = data.monthlyRecords.reduce(
    (sum, record) => sum + record.totalDividendReceived,
    0
  );
  const totalFundingCostPaid = data.monthlyRecords.reduce(
    (sum, record) => sum + record.totalFundingCost,
    0
  );
  const cumulativeNetPnL = portfolio.unrealizedPnL + totalDividendsCollected - totalFundingCostPaid;

  return {
    effectiveFunds,
    portfolio,
    portfolioRisk,
    series,
    totalDividendsCollected,
    totalFundingCostPaid,
    cumulativeNetPnL,
  };
}

export function getNextMonth(records: Pick<MonthlyCashflowRecord, "month">[]) {
  if (records.length === 0) {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, "0");
    return `${year}-${month}`;
  }

  const latest = [...records].sort((a, b) => a.month.localeCompare(b.month)).at(-1)?.month;
  if (!latest) return "";

  const [year, month] = latest.split("-").map(Number);
  if (!year || !month) return "";

  const next = new Date(year, month, 1);
  const nextYear = next.getFullYear();
  const nextMonth = `${next.getMonth() + 1}`.padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

export function buildCashflowPrefillDefaults(
  fund: Pick<
    Fund,
    "currentNav" | "dividendPerUnit" | "unitsHeld" | "fundingBaseRate" | "fundingSpread" | "loanAmount"
  >,
  records: Pick<MonthlyCashflowRecord, "month">[]
): CashflowPrefillDefaults {
  const month = getNextMonth(records);
  const nav = fund.currentNav;
  const dividendPerUnit = fund.dividendPerUnit;
  const totalDividendReceived = fund.unitsHeld * dividendPerUnit;
  const fundingRate = fund.fundingBaseRate + fund.fundingSpread;
  const totalFundingCost = (fund.loanAmount * fundingRate) / 12;
  const netCarry = totalDividendReceived - totalFundingCost;

  return {
    month,
    nav,
    dividendPerUnit,
    totalDividendReceived,
    fundingRate,
    totalFundingCost,
    netCarry,
  };
}

export function toScenarioPercentInput(
  scenario: Pick<
    Scenario,
    | "name"
    | "navChangePct"
    | "dividendChangePct"
    | "fundingRateShockBps"
    | "loanAmountChangePct"
    | "fxChangePct"
    | "haircutMarginAssumption"
  >
): ScenarioPercentInputValues {
  return {
    name: scenario.name,
    navChangePct: scenario.navChangePct * 100,
    dividendChangePct: scenario.dividendChangePct * 100,
    fundingRateShockBps: scenario.fundingRateShockBps,
    loanAmountChangePct: scenario.loanAmountChangePct * 100,
    fxChangePct: scenario.fxChangePct * 100,
    haircutMarginAssumption: scenario.haircutMarginAssumption * 100,
  };
}

export function toScenarioDecimalValues(input: ScenarioPercentInputValues): Omit<Scenario, "id" | "isDefault"> {
  return {
    name: input.name,
    navChangePct: input.navChangePct / 100,
    dividendChangePct: input.dividendChangePct / 100,
    fundingRateShockBps: input.fundingRateShockBps,
    loanAmountChangePct: input.loanAmountChangePct / 100,
    fxChangePct: input.fxChangePct / 100,
    haircutMarginAssumption: input.haircutMarginAssumption / 100,
  };
}

export function roundToDecimals(value: number, decimals: number) {
  const safe = Number.isFinite(value) ? value : 0;
  const factor = 10 ** decimals;
  return Math.round(safe * factor) / factor;
}

export function normalizeTransactionNumbers(input: {
  units: number;
  nav: number;
  commissionPct: number;
  loanAmount?: number;
  fundingBaseRate?: number;
  fundingSpread?: number;
}): NormalizedTransactionNumbers {
  const units = roundToDecimals(input.units, 5);
  const nav = roundToDecimals(input.nav, 5);
  const grossAmount = roundToDecimals(units * nav, 5);
  return {
    units,
    nav,
    grossAmount,
    commissionPct: roundToDecimals(input.commissionPct, 2),
    loanAmount: roundToDecimals(input.loanAmount ?? 0, 5),
    fundingBaseRate: roundToDecimals(input.fundingBaseRate ?? 0, 5),
    fundingSpread: roundToDecimals(input.fundingSpread ?? 0, 5),
  };
}

type DatedCashflow = { date: Date; amount: number };
export type PortfolioIrrCashflowType =
  | "BUY"
  | "SELL"
  | "COMMISSION"
  | "LOAN_REPAYMENT"
  | "FUNDING_COST"
  | "DIVIDEND"
  | "TERMINAL_VALUE";

export interface PortfolioIrrCashflowLine {
  date: string;
  amount: number;
  type: PortfolioIrrCashflowType;
  fundId?: string;
  fundName: string;
  note: string;
}

function xnpv(rate: number, flows: DatedCashflow[]) {
  if (flows.length === 0) return 0;
  const t0 = flows[0].date.getTime();
  return flows.reduce((npv, flow) => {
    const years = (flow.date.getTime() - t0) / (1000 * 60 * 60 * 24 * 365);
    return npv + flow.amount / Math.pow(1 + rate, years);
  }, 0);
}

function xnpvDerivative(rate: number, flows: DatedCashflow[]) {
  if (flows.length === 0) return 0;
  const t0 = flows[0].date.getTime();
  return flows.reduce((acc, flow) => {
    const years = (flow.date.getTime() - t0) / (1000 * 60 * 60 * 24 * 365);
    if (years === 0) return acc;
    return acc - (years * flow.amount) / Math.pow(1 + rate, years + 1);
  }, 0);
}

export function calculateXirr(flows: DatedCashflow[]): number | null {
  if (flows.length < 2) return null;
  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const hasPositive = sorted.some((f) => f.amount > 0);
  const hasNegative = sorted.some((f) => f.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  let rate = 0.1;
  for (let i = 0; i < 80; i += 1) {
    const f = xnpv(rate, sorted);
    const df = xnpvDerivative(rate, sorted);
    if (Math.abs(df) < 1e-12) break;
    const next = rate - f / df;
    if (!Number.isFinite(next) || next <= -0.9999 || next > 1000) break;
    if (Math.abs(next - rate) < 1e-8) return next;
    rate = next;
  }

  let low = -0.95;
  let high = 5;
  let fLow = xnpv(low, sorted);
  let fHigh = xnpv(high, sorted);
  for (let i = 0; i < 80; i += 1) {
    if (fLow * fHigh <= 0) break;
    high *= 1.5;
    fHigh = xnpv(high, sorted);
    if (!Number.isFinite(fHigh) || high > 5000) return null;
  }
  if (fLow * fHigh > 0) return null;

  for (let i = 0; i < 120; i += 1) {
    const mid = (low + high) / 2;
    const fMid = xnpv(mid, sorted);
    if (Math.abs(fMid) < 1e-8) return mid;
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

export function calculatePortfolioIrr(
  data: Pick<PortfolioData, "funds" | "transactions" | "fundingCostEntries" | "monthlyRecords">
): number | null {
  const lines = buildPortfolioIrrCashflows(data);
  const flows: DatedCashflow[] = lines
    .map((line) => {
      const date = parseIsoDate(line.date);
      if (!date) return null;
      return { date, amount: line.amount };
    })
    .filter((flow): flow is DatedCashflow => flow !== null);

  return calculateXirr(flows);
}

export function buildPortfolioIrrCashflows(
  data: Pick<PortfolioData, "funds" | "transactions" | "fundingCostEntries" | "monthlyRecords">
): PortfolioIrrCashflowLine[] {
  const lines: PortfolioIrrCashflowLine[] = [];
  const todayIso = new Date().toISOString().slice(0, 10);
  const fundNameById = new Map(data.funds.map((fund) => [fund.id, fund.fundName]));
  const fundById = new Map(data.funds.map((fund) => [fund.id, fund]));
  const monthEndIso = (month: string) => {
    const [y, m] = month.split("-").map(Number);
    if (!y || !m) return `${month}-28`;
    const lastDay = new Date(y, m, 0).getDate();
    return `${y}-${`${m}`.padStart(2, "0")}-${`${lastDay}`.padStart(2, "0")}`;
  };
  const payoutIso = (month: string, paymentDay: number) => {
    const [y, m] = month.split("-").map(Number);
    if (!y || !m) return monthEndIso(month);
    const lastDay = new Date(y, m, 0).getDate();
    const day = Math.min(Math.max(1, paymentDay), lastDay);
    return `${y}-${`${m}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;
  };
  const typePriority: Record<PortfolioIrrCashflowType, number> = {
    BUY: 1,
    COMMISSION: 2,
    LOAN_REPAYMENT: 3,
    FUNDING_COST: 4,
    DIVIDEND: 5,
    SELL: 6,
    TERMINAL_VALUE: 7,
  };
  const monthKeyFromDate = (isoDate: string) => isoDate.slice(0, 7);
  const fundingMonthKey = (fundId: string, month: string) => `${fundId}::${month}`;
  const overriddenFundingMonths = new Set(
    data.monthlyRecords
      .filter((r) => r.fundingCostOverridden && r.totalFundingCost > 0)
      .map((r) => fundingMonthKey(r.fundId, r.month))
  );
  const explicitFundingMonths = new Set(
    data.fundingCostEntries
      .filter((fc) => fc.amount > 0)
      .map((fc) => fundingMonthKey(fc.fundId, monthKeyFromDate(fc.date)))
  );

  for (const tx of data.transactions) {
    const gross = transactionGrossAmount(tx);
    const commission = gross * (Math.max(0, tx.commissionPct) / 100);
    const loanUsed = Math.max(0, tx.loanAmount ?? 0);
    const amount =
      tx.type === "BUY"
        ? -(gross - loanUsed)
        : gross;
    lines.push({
      date: tx.date,
      amount,
      type: tx.type,
      fundId: tx.fundId,
      fundName: fundNameById.get(tx.fundId) ?? "Unknown Fund",
      note:
        tx.type === "BUY"
          ? "Purchase equity outflow (gross - loan)"
          : "Sale gross inflow",
    });

    if (commission > 0) {
      lines.push({
        date: tx.date,
        amount: -commission,
        type: "COMMISSION",
        fundId: tx.fundId,
        fundName: fundNameById.get(tx.fundId) ?? "Unknown Fund",
        note: `${tx.type} commission outflow`,
      });
    }

    if (tx.type === "SELL") {
      const loanRepayment = Math.max(0, tx.loanAmount ?? 0);
      if (loanRepayment > 0) {
        lines.push({
          date: tx.date,
          amount: -loanRepayment,
          type: "LOAN_REPAYMENT",
          fundId: tx.fundId,
          fundName: fundNameById.get(tx.fundId) ?? "Unknown Fund",
          note: "Loan principal repayment on sell",
        });
      }
    }
  }

  for (const fc of data.fundingCostEntries) {
    if (fc.amount <= 0) continue;
    const month = monthKeyFromDate(fc.date);
    if (!month) continue;
    if (overriddenFundingMonths.has(fundingMonthKey(fc.fundId, month))) continue;

    lines.push({
      date: fc.date,
      amount: -Math.max(0, fc.amount),
      type: "FUNDING_COST",
      fundId: fc.fundId,
      fundName: fundNameById.get(fc.fundId) ?? "Unknown Fund",
      note: "Funding cost cash outflow (dated entry)",
    });
  }

  for (const record of data.monthlyRecords) {
    const month = record.month;
    const hasExplicitFunding = explicitFundingMonths.has(fundingMonthKey(record.fundId, month));

    if (record.totalFundingCost > 0 && (record.fundingCostOverridden || !hasExplicitFunding)) {
      lines.push({
        date: monthEndIso(month),
        amount: -Math.max(0, record.totalFundingCost),
        type: "FUNDING_COST",
        fundId: record.fundId,
        fundName: fundNameById.get(record.fundId) ?? "Unknown Fund",
        note: record.fundingCostOverridden
          ? "Funding cost cash outflow (monthly override)"
          : "Funding cost cash outflow (monthly record)",
      });
    }

    if (record.totalDividendReceived > 0) {
      const fund = fundById.get(record.fundId);
      const paymentDay = fund?.dividendPaymentDay ?? 28;
      lines.push({
        date: payoutIso(record.month, paymentDay),
        amount: record.totalDividendReceived,
        type: "DIVIDEND",
        fundId: record.fundId,
        fundName: fundNameById.get(record.fundId) ?? "Unknown Fund",
        note: "Dividend cash inflow",
      });
    }
  }

  for (const fund of data.funds) {
    const txs = data.transactions.filter((tx) => tx.fundId === fund.id);
    const holdings = deriveHoldingsFromTransactions(txs, fund.unitsHeld, fund.averageCost);
    const financing = deriveFinancingFromTransactions(
      txs,
      fund.loanAmount,
      fund.fundingBaseRate,
      fund.fundingSpread
    );
    const terminalValue = holdings.unitsHeld * fund.currentNav;
    if (terminalValue <= 0) continue;
    lines.push({
      date: todayIso,
      amount: terminalValue,
      type: "TERMINAL_VALUE",
      fundId: fund.id,
      fundName: fund.fundName,
      note: "Current market value terminal inflow",
    });
    if (financing.loanAmount > 0) {
      lines.push({
        date: todayIso,
        amount: -financing.loanAmount,
        type: "LOAN_REPAYMENT",
        fundId: fund.id,
        fundName: fund.fundName,
        note: "Terminal loan principal repayment",
      });
    }
  }

  return lines.sort((a, b) => {
    const aTs = parseIsoDate(a.date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTs = parseIsoDate(b.date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (aTs !== bTs) return aTs - bTs;
    if (a.amount !== b.amount) return a.amount - b.amount;
    return typePriority[a.type] - typePriority[b.type];
  });
}
