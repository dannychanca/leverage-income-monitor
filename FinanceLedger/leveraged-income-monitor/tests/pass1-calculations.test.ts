import test from "node:test";
import assert from "node:assert/strict";
import type { Fund, FundTransaction, MonthlyCashflowRecord, PortfolioData } from "../lib/types/models.ts";
import {
  aggregateMonthlySeries,
  buildDashboardMetricsSnapshot,
  buildEffectiveFunds,
  calculatePortfolioMetrics,
  deriveFinancingFromTransactions,
} from "../lib/utils/calculations.ts";

function makeFund(overrides: Partial<Fund> = {}): Fund {
  return {
    id: "fund_1",
    fundName: "Test Fund",
    manager: "Mgr",
    ticker: "TST",
    currency: "SGD",
    unitsHeld: 0,
    currentNav: 10,
    averageCost: 10,
    loanAmount: 0,
    fundingBaseRate: 0.01,
    fundingSpread: 0.005,
    dividendFrequency: "MONTHLY",
    dividendPaymentDay: 28,
    dividendPerUnit: 0.1,
    warningLtvThreshold: 0.65,
    marginCallLtvThreshold: 0.8,
    forcedLiquidationLtvThreshold: 0.9,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("H1: deriveFinancingFromTransactions correctly reduces outstanding loan and keeps weighted rates after partial sell repayment", () => {
  const txs: FundTransaction[] = [
    {
      id: "tx1",
      fundId: "fund_1",
      type: "BUY",
      date: "2025-01-10",
      units: 10,
      nav: 10,
      grossAmount: 100,
      commissionPct: 0,
      loanAmount: 100,
      fundingBaseRate: 0.01,
      fundingSpread: 0.005,
    },
    {
      id: "tx2",
      fundId: "fund_1",
      type: "BUY",
      date: "2025-02-10",
      units: 20,
      nav: 10,
      grossAmount: 200,
      commissionPct: 0,
      loanAmount: 200,
      fundingBaseRate: 0.02,
      fundingSpread: 0.01,
    },
    {
      id: "tx3",
      fundId: "fund_1",
      type: "SELL",
      date: "2025-03-10",
      units: 5,
      nav: 10,
      grossAmount: 50,
      commissionPct: 0,
      loanAmount: 150,
      fundingBaseRate: 0.99,
      fundingSpread: 0.99,
    },
  ];

  const result = deriveFinancingFromTransactions(txs, 0, 0, 0);

  assert.equal(result.loanAmount, 150);
  assert.ok(Math.abs(result.fundingBaseRate - (5 / 300)) < 1e-12);
  assert.ok(Math.abs(result.fundingSpread - (2.5 / 300)) < 1e-12);
});

test("H2: aggregateMonthlySeries uses month-specific units and loan balances from transactions", () => {
  const fund = makeFund({
    unitsHeld: 60,
    loanAmount: 30,
    currentNav: 12,
  });
  const txs: FundTransaction[] = [
    {
      id: "buy",
      fundId: fund.id,
      type: "BUY",
      date: "2025-01-10",
      units: 100,
      nav: 10,
      grossAmount: 1000,
      commissionPct: 0,
      loanAmount: 60,
      fundingBaseRate: 0.01,
      fundingSpread: 0.01,
    },
    {
      id: "sell",
      fundId: fund.id,
      type: "SELL",
      date: "2025-03-10",
      units: 40,
      nav: 11,
      grossAmount: 440,
      commissionPct: 0,
      loanAmount: 30,
      fundingBaseRate: 0.01,
      fundingSpread: 0.01,
    },
  ];
  const records: MonthlyCashflowRecord[] = [
    {
      id: "r1",
      fundId: fund.id,
      month: "2025-02",
      nav: 10,
      dividendPerUnit: 0.1,
      totalDividendReceived: 10,
      fundingRate: 0.02,
      totalFundingCost: 1,
      netCarry: 9,
      source: "manual",
    },
    {
      id: "r2",
      fundId: fund.id,
      month: "2025-03",
      nav: 11,
      dividendPerUnit: 0.1,
      totalDividendReceived: 11,
      fundingRate: 0.02,
      totalFundingCost: 1,
      netCarry: 10,
      source: "manual",
    },
    {
      id: "r3",
      fundId: fund.id,
      month: "2025-04",
      nav: 12,
      dividendPerUnit: 0.1,
      totalDividendReceived: 12,
      fundingRate: 0.02,
      totalFundingCost: 1,
      netCarry: 11,
      source: "manual",
    },
  ];

  const series = aggregateMonthlySeries([fund], records, txs);
  const feb = series.find((s) => s.month === "2025-02");
  const mar = series.find((s) => s.month === "2025-03");
  const apr = series.find((s) => s.month === "2025-04");

  assert.ok(feb && mar && apr);
  assert.equal(feb.marketValue, 1000);
  assert.equal(feb.loanAmount, 60);
  assert.ok(Math.abs(feb.ltv - 0.06) < 1e-12);

  assert.equal(mar.marketValue, 660);
  assert.equal(mar.loanAmount, 30);
  assert.ok(Math.abs(mar.ltv - (30 / 660)) < 1e-12);

  assert.equal(apr.marketValue, 720);
  assert.equal(apr.loanAmount, 30);
  assert.ok(Math.abs(apr.ltv - (30 / 720)) < 1e-12);
});

test("H3 reconciliation helper: dashboard snapshot portfolio metrics reconcile with effective funds and record totals", () => {
  const fund = makeFund({
    unitsHeld: 9999,
    averageCost: 9999,
    loanAmount: 9999,
    currentNav: 9.5,
  });
  const txs: FundTransaction[] = [
    {
      id: "b1",
      fundId: fund.id,
      type: "BUY",
      date: "2025-01-01",
      units: 100,
      nav: 9,
      grossAmount: 900,
      commissionPct: 0,
      loanAmount: 300,
      fundingBaseRate: 0.01,
      fundingSpread: 0.01,
    },
  ];
  const records: MonthlyCashflowRecord[] = [
    {
      id: "c1",
      fundId: fund.id,
      month: "2025-02",
      nav: 9.2,
      dividendPerUnit: 0.1,
      totalDividendReceived: 10,
      fundingRate: 0.02,
      totalFundingCost: 3,
      netCarry: 7,
      source: "manual",
    },
    {
      id: "c2",
      fundId: fund.id,
      month: "2025-03",
      nav: 9.3,
      dividendPerUnit: 0.1,
      totalDividendReceived: 11,
      fundingRate: 0.02,
      totalFundingCost: 4,
      netCarry: 7,
      source: "manual",
    },
  ];
  const data: PortfolioData = {
    funds: [fund],
    transactions: txs,
    monthlyRecords: records,
    fundingCostEntries: [],
    scenarios: [],
    settings: {
      baseCurrency: "SGD",
      largeNavShockThresholdPct: 0.1,
      defaultWarningThreshold: 0.65,
      defaultMarginCallThreshold: 0.72,
    },
  };

  const snapshot = buildDashboardMetricsSnapshot(data);
  const expectedFunds = buildEffectiveFunds(data.funds, data.transactions);
  const expectedPortfolio = calculatePortfolioMetrics(expectedFunds);

  assert.equal(snapshot.effectiveFunds[0].unitsHeld, 100);
  assert.equal(snapshot.effectiveFunds[0].loanAmount, 300);
  assert.equal(snapshot.portfolio.marketValue, expectedPortfolio.marketValue);
  assert.equal(snapshot.totalDividendsCollected, 21);
  assert.equal(snapshot.totalFundingCostPaid, 7);
  assert.equal(
    snapshot.cumulativeNetPnL,
    snapshot.portfolio.unrealizedPnL + snapshot.totalDividendsCollected - snapshot.totalFundingCostPaid
  );
});
