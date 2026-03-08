import test from "node:test";
import assert from "node:assert/strict";
import type { MonthlyCashflowRecord } from "../lib/types/models.ts";
import {
  inferMonthlyRecordSource,
  mergeGeneratedAndManualMonthlyRecords,
} from "../lib/utils/calculations.ts";

function makeRecord(overrides: Partial<MonthlyCashflowRecord>): MonthlyCashflowRecord {
  return {
    id: "r",
    fundId: "f1",
    month: "2025-01",
    nav: 10,
    dividendPerUnit: 0.1,
    totalDividendReceived: 10,
    fundingRate: 0.02,
    totalFundingCost: 1,
    fundingCostOverridden: false,
    netCarry: 9,
    source: "manual",
    comments: "",
    ...overrides,
  };
}

test("PASS4: generated records are replaced during regeneration", () => {
  const existing = [
    makeRecord({ id: "old_gen", month: "2025-06", source: "generated", totalDividendReceived: 100 }),
  ];
  const generated = [
    makeRecord({ id: "new_gen", month: "2025-06", source: "generated", totalDividendReceived: 200 }),
    makeRecord({ id: "new_gen_2", month: "2025-07", source: "generated", totalDividendReceived: 300 }),
  ];

  const merged = mergeGeneratedAndManualMonthlyRecords(existing, generated);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((r) => r.month === "2025-06")?.id, "new_gen");
  assert.equal(merged.find((r) => r.month === "2025-07")?.id, "new_gen_2");
});

test("PASS4: manual records remain untouched when regenerated month overlaps", () => {
  const existing = [
    makeRecord({ id: "manual_keep", month: "2025-06", source: "manual", totalDividendReceived: 111 }),
    makeRecord({ id: "old_gen", month: "2025-07", source: "generated", totalDividendReceived: 50 }),
  ];
  const generated = [
    makeRecord({ id: "new_gen_overlap", month: "2025-06", source: "generated", totalDividendReceived: 222 }),
    makeRecord({ id: "new_gen", month: "2025-07", source: "generated", totalDividendReceived: 333 }),
  ];

  const merged = mergeGeneratedAndManualMonthlyRecords(existing, generated);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((r) => r.month === "2025-06")?.id, "manual_keep");
  assert.equal(merged.find((r) => r.month === "2025-07")?.id, "new_gen");
});

test("PASS4: backward compatibility infers source from legacy comments", () => {
  const legacyAuto = {
    comments: "Auto-generated from transactions",
  } as MonthlyCashflowRecord;
  const legacyManual = {
    comments: "Reviewed manually",
  } as MonthlyCashflowRecord;
  const explicitManual = {
    source: "manual" as const,
    comments: "Auto-generated from transactions",
  } as MonthlyCashflowRecord;

  assert.equal(inferMonthlyRecordSource(legacyAuto), "generated");
  assert.equal(inferMonthlyRecordSource(legacyManual), "manual");
  assert.equal(inferMonthlyRecordSource(explicitManual), "manual");
});

test("PASS4: mixed manual/generated records keep manual months and replace generated months deterministically", () => {
  const existing = [
    makeRecord({ id: "m1", month: "2025-03", source: "manual" }),
    makeRecord({ id: "g1", month: "2025-04", source: "generated" }),
    makeRecord({ id: "g2", month: "2025-05", source: "generated" }),
  ];
  const generated = [
    makeRecord({ id: "g_new_1", month: "2025-03", source: "generated" }),
    makeRecord({ id: "g_new_2", month: "2025-04", source: "generated" }),
    makeRecord({ id: "g_new_3", month: "2025-05", source: "generated" }),
    makeRecord({ id: "g_new_4", month: "2025-06", source: "generated" }),
  ];

  const merged = mergeGeneratedAndManualMonthlyRecords(existing, generated);
  assert.deepEqual(
    merged.map((r) => [r.month, r.id]),
    [
      ["2025-03", "m1"],
      ["2025-04", "g_new_2"],
      ["2025-05", "g_new_3"],
      ["2025-06", "g_new_4"],
    ]
  );
});
