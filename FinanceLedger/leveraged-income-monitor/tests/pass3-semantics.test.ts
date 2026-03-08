import test from "node:test";
import assert from "node:assert/strict";
import { formatChartCurrency } from "../lib/utils.ts";
import {
  normalizeTransactionNumbers,
  toScenarioDecimalValues,
  toScenarioPercentInput,
} from "../lib/utils/calculations.ts";

test("PASS3: scenario percent input conversion is unambiguous and backward-compatible with decimal storage", () => {
  const storedDecimalScenario = {
    name: "Mild stress",
    navChangePct: -0.08,
    dividendChangePct: -0.05,
    fundingRateShockBps: 75,
    loanAmountChangePct: 0.1,
    fxChangePct: -0.01,
    haircutMarginAssumption: 0.02,
  };

  const asPercentInput = toScenarioPercentInput(storedDecimalScenario);
  assert.equal(asPercentInput.navChangePct, -8);
  assert.equal(asPercentInput.dividendChangePct, -5);
  assert.equal(asPercentInput.loanAmountChangePct, 10);
  assert.equal(asPercentInput.fxChangePct, -1);
  assert.equal(asPercentInput.haircutMarginAssumption, 2);

  const backToDecimal = toScenarioDecimalValues(asPercentInput);
  assert.equal(backToDecimal.navChangePct, storedDecimalScenario.navChangePct);
  assert.equal(backToDecimal.dividendChangePct, storedDecimalScenario.dividendChangePct);
  assert.equal(backToDecimal.loanAmountChangePct, storedDecimalScenario.loanAmountChangePct);
  assert.equal(backToDecimal.fxChangePct, storedDecimalScenario.fxChangePct);
  assert.equal(backToDecimal.haircutMarginAssumption, storedDecimalScenario.haircutMarginAssumption);
});

test("PASS3: chart formatting helper does not hardcode dollar symbol and respects currency", () => {
  const sgd = formatChartCurrency(1234.56, "SGD");
  assert.ok(sgd.includes("SGD"));
  assert.ok(!sgd.startsWith("$"));
});

test("PASS3: transaction normalization keeps 5dp precision for units/nav/rates without 2dp truncation", () => {
  const normalized = normalizeTransactionNumbers({
    units: 41_711.987654,
    nav: 9.581239,
    commissionPct: 0.1267,
    loanAmount: 300_000.123456,
    fundingBaseRate: 0.0187654,
    fundingSpread: 0.0065432,
  });

  assert.equal(normalized.units, 41711.98765);
  assert.equal(normalized.nav, 9.58124);
  assert.equal(normalized.loanAmount, 300000.12346);
  assert.equal(normalized.fundingBaseRate, 0.01877);
  assert.equal(normalized.fundingSpread, 0.00654);
  assert.equal(normalized.commissionPct, 0.13);
  assert.equal(normalized.grossAmount, 399652.56455);
});
