import test from "node:test";
import assert from "node:assert/strict";
import type { Fund } from "../lib/types/models.ts";
import { fundSchema } from "../lib/types/schemas.ts";
import {
  calculateFundThresholdRisk,
  calculatePortfolioRiskSnapshot,
  defaultForcedLiquidationThreshold,
} from "../lib/utils/calculations.ts";

function makeFund(overrides: Partial<Fund> = {}): Fund {
  return {
    id: "fund_1",
    fundName: "Fund 1",
    manager: "Mgr",
    ticker: "F1",
    currency: "SGD",
    unitsHeld: 100,
    currentNav: 10,
    averageCost: 10,
    loanAmount: 600,
    fundingBaseRate: 0.01,
    fundingSpread: 0.005,
    dividendFrequency: "MONTHLY",
    dividendPaymentDay: 28,
    dividendPerUnit: 0.1,
    warningLtvThreshold: 0.65,
    marginCallLtvThreshold: 0.75,
    forcedLiquidationLtvThreshold: 0.85,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("PASS5: threshold NAV, downside, leverage, and capital-need formulas are consistent", () => {
  const fund = makeFund();
  const risk = calculateFundThresholdRisk(fund);

  assert.equal(risk.currentLtv, 0.6);
  assert.equal(risk.leverage, 2.5);
  assert.ok(Math.abs((risk.navAtWarningThreshold ?? 0) - 9.2307692308) < 1e-9);
  assert.ok(Math.abs((risk.navAtMarginCallThreshold ?? 0) - 8) < 1e-12);
  assert.ok(Math.abs((risk.navAtLiquidationThreshold ?? 0) - 7.0588235294) < 1e-9);
  assert.ok(Math.abs((risk.downsideToMarginCallPct ?? 0) - (-0.2)) < 1e-12);
  assert.equal(risk.requiredLoanRepayment, 0);
  assert.ok(Math.abs((risk.requiredMarketValue ?? 0) - 923.0769230769) < 1e-9);
  assert.equal(risk.additionalCollateralNeeded, 0);
});

test("PASS5: when effectiveLoan <= 0, threshold NAV outputs are null", () => {
  const fund = makeFund({ loanAmount: 0 });
  const risk = calculateFundThresholdRisk(fund);
  assert.equal(risk.navAtWarningThreshold, null);
  assert.equal(risk.navAtMarginCallThreshold, null);
  assert.equal(risk.navAtLiquidationThreshold, null);
  assert.equal(risk.requiredLoanRepayment, 0);
  assert.equal(risk.additionalCollateralNeeded, 0);
});

test("PASS5: strict threshold ordering is validated", () => {
  const parsed = fundSchema.safeParse({
    fundName: "X",
    manager: "Y",
    ticker: "Z",
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
    warningLtvThreshold: 0.8,
    marginCallLtvThreshold: 0.75,
    forcedLiquidationLtvThreshold: 0.85,
  });
  assert.equal(parsed.success, false);
});

test("PASS5: portfolio buffer and first margin-call risk ranking use LTV distance", () => {
  const funds = [
    makeFund({
      id: "a",
      fundName: "Near Call",
      unitsHeld: 100,
      currentNav: 10,
      loanAmount: 740,
      marginCallLtvThreshold: 0.75,
    }),
    makeFund({
      id: "b",
      fundName: "Safer",
      unitsHeld: 100,
      currentNav: 10,
      loanAmount: 600,
      marginCallLtvThreshold: 0.75,
    }),
  ];

  const snapshot = calculatePortfolioRiskSnapshot(funds);
  assert.equal(snapshot.firstMarginCallFund, "Near Call");
  assert.ok(snapshot.marketValueBufferBeforeMarginCall > 0);
});

test("PASS5: stress rows recompute LTV from stressed market value", () => {
  const fund = makeFund({
    unitsHeld: 100,
    currentNav: 10,
    loanAmount: 600,
    fundingBaseRate: 0.01,
    fundingSpread: 0.005,
    dividendPerUnit: 0.1,
  });
  const snapshot = calculatePortfolioRiskSnapshot([fund]);
  const row = snapshot.stressRows.find(
    (entry) => entry.navDownPct === 0.2 && entry.fundingUpBps === 100 && entry.dividendCutPct === 0.2
  );
  assert.ok(row);
  const expectedStressedNav = 8;
  const expectedStressedMv = 100 * expectedStressedNav;
  const expectedStressedLtv = 600 / expectedStressedMv;
  assert.ok(Math.abs((row?.stressedLtv ?? 0) - expectedStressedLtv) < 1e-12);
});

test("PASS5: default forced liquidation threshold is margin + 0.10 capped below 0.95", () => {
  assert.equal(defaultForcedLiquidationThreshold(0.72), 0.82);
  assert.equal(defaultForcedLiquidationThreshold(0.9), 0.94999);
});
