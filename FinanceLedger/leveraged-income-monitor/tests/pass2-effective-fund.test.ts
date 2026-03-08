import test from "node:test";
import assert from "node:assert/strict";
import type { Fund, FundTransaction, MonthlyCashflowRecord } from "../lib/types/models.ts";
import {
  buildCashflowPrefillDefaults,
  buildEffectiveFunds,
  calculateFundMetrics,
  calculateHoldingPeriodPL,
} from "../lib/utils/calculations.ts";

function makeFund(overrides: Partial<Fund> = {}): Fund {
  return {
    id: "fund_x",
    fundName: "Fund X",
    manager: "Mgr",
    ticker: "FX",
    currency: "SGD",
    unitsHeld: 9999,
    currentNav: 9.5,
    averageCost: 9.2,
    loanAmount: 8888,
    fundingBaseRate: 0.01,
    fundingSpread: 0.005,
    dividendFrequency: "MONTHLY",
    dividendPaymentDay: 28,
    dividendPerUnit: 0.05,
    warningLtvThreshold: 0.65,
    marginCallLtvThreshold: 0.72,
    forcedLiquidationLtvThreshold: 0.82,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("PASS2: cashflow prefill defaults use effective (transaction-derived) holdings and financing", () => {
  const rawFund = makeFund();
  const txs: FundTransaction[] = [
    {
      id: "tx1",
      fundId: rawFund.id,
      type: "BUY",
      date: "2025-01-01",
      units: 100,
      nav: 9.2,
      grossAmount: 920,
      commissionPct: 0,
      loanAmount: 300,
      fundingBaseRate: 0.0125,
      fundingSpread: 0.006,
    },
    {
      id: "tx2",
      fundId: rawFund.id,
      type: "BUY",
      date: "2025-03-01",
      units: 50,
      nav: 9.4,
      grossAmount: 470,
      commissionPct: 0,
      loanAmount: 200,
      fundingBaseRate: 0.014,
      fundingSpread: 0.007,
    },
  ];
  const effectiveFund = buildEffectiveFunds([rawFund], txs)[0];
  const records: MonthlyCashflowRecord[] = [
    {
      id: "r1",
      fundId: rawFund.id,
      month: "2025-03",
      nav: 9.4,
      dividendPerUnit: 0.05,
      totalDividendReceived: 7.5,
      fundingRate: 0.02,
      totalFundingCost: 1,
      netCarry: 6.5,
      source: "manual",
    },
  ];

  const prefill = buildCashflowPrefillDefaults(effectiveFund, records);

  assert.equal(effectiveFund.unitsHeld, 150);
  assert.equal(effectiveFund.loanAmount, 500);
  assert.equal(prefill.totalDividendReceived, 150 * effectiveFund.dividendPerUnit);
  assert.equal(prefill.totalFundingCost, (500 * (effectiveFund.fundingBaseRate + effectiveFund.fundingSpread)) / 12);
  assert.equal(prefill.month, "2025-04");
  assert.notEqual(prefill.totalDividendReceived, rawFund.unitsHeld * rawFund.dividendPerUnit);
});

test("PASS2: shared effective-fund selector drives consistent page-facing consumer calculations", () => {
  const rawFund = makeFund({
    unitsHeld: 10,
    loanAmount: 10,
    averageCost: 10,
  });
  const txs: FundTransaction[] = [
    {
      id: "buy",
      fundId: rawFund.id,
      type: "BUY",
      date: "2025-01-01",
      units: 200,
      nav: 9,
      grossAmount: 1800,
      commissionPct: 0,
      loanAmount: 1000,
      fundingBaseRate: 0.012,
      fundingSpread: 0.006,
    },
    {
      id: "sell",
      fundId: rawFund.id,
      type: "SELL",
      date: "2025-03-01",
      units: 50,
      nav: 9.4,
      grossAmount: 470,
      commissionPct: 0,
      loanAmount: 250,
      fundingBaseRate: 0.02,
      fundingSpread: 0.02,
    },
  ];

  const effectiveFund = buildEffectiveFunds([rawFund], txs)[0];
  const fundMetrics = calculateFundMetrics(effectiveFund);
  const holding = calculateHoldingPeriodPL(effectiveFund, 1, 10);

  assert.equal(effectiveFund.unitsHeld, 150);
  assert.equal(effectiveFund.loanAmount, 750);
  assert.equal(fundMetrics.marketValue, 150 * effectiveFund.currentNav);
  assert.equal(holding.startingMarketValue, 150 * effectiveFund.averageCost);
  assert.notEqual(fundMetrics.marketValue, rawFund.unitsHeld * rawFund.currentNav);
});
