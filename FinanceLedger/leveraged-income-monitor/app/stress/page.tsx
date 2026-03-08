"use client";

import { useMemo, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { usePortfolio } from "@/lib/store/portfolio-store";
import { Scenario } from "@/lib/types/models";
import { ScenarioFormValues } from "@/lib/types/schemas";
import { ScenarioForm } from "@/components/stress/scenario-form";
import { ScenarioResultsTable } from "@/components/stress/scenario-results-table";
import { MarginLiquidationAnalyzer } from "@/components/stress/margin-liquidation-analyzer";
import {
  applyScenarioToFund,
  buildEffectiveFunds,
  calculatePortfolioRiskSnapshot,
  calculateHoldingPeriodPL,
  calculatePortfolioHoldingPeriodPL,
} from "@/lib/utils/calculations";
import { formatCurrency, formatPercent } from "@/lib/utils";

type MatrixMetricMode = "NET_PL" | "IRR" | "EQUITY_MULTIPLE";
type EndingNavMode = "CALCULATED" | "MANUAL";
type MatrixScopeMode = "PORTFOLIO" | "FUND";
type StressLabViewMode = "STRESS_MATRIX" | "MARGIN_ANALYZER";

export default function StressPage() {
  const { data, addScenario, updateScenario, deleteScenario } = usePortfolio();
  const [selectedScenarioId, setSelectedScenarioId] = useState(data.scenarios[0]?.id ?? "");
  const [editing, setEditing] = useState<Scenario | null>(null);
  const [open, setOpen] = useState(false);

  const weightedFundingDefaults = useMemo(() => {
    const totalLoan = data.funds.reduce((sum, fund) => sum + Math.max(0, fund.loanAmount), 0);
    if (totalLoan <= 0) return { base: 0, spread: 0 };
    const weightedBase = data.funds.reduce(
      (sum, fund) => sum + Math.max(0, fund.loanAmount) * fund.fundingBaseRate,
      0
    );
    const weightedSpread = data.funds.reduce(
      (sum, fund) => sum + Math.max(0, fund.loanAmount) * fund.fundingSpread,
      0
    );
    return { base: weightedBase / totalLoan, spread: weightedSpread / totalLoan };
  }, [data.funds]);

  const [holdingYearsInput, setHoldingYearsInput] = useState("3");
  const [navDeclinePctInput, setNavDeclinePctInput] = useState("15");
  const [startingNavOverrideInput, setStartingNavOverrideInput] = useState("");
  const [endingNavMode, setEndingNavMode] = useState<EndingNavMode>("CALCULATED");
  const [manualEndingNavInput, setManualEndingNavInput] = useState("");
  const [fundingBaseRateInput, setFundingBaseRateInput] = useState(weightedFundingDefaults.base.toFixed(5));
  const [fundingSpreadInput, setFundingSpreadInput] = useState(weightedFundingDefaults.spread.toFixed(5));
  const [fundingAmountInput, setFundingAmountInput] = useState("");
  const [dividendPerUnitInput, setDividendPerUnitInput] = useState("");

  const [matrixMetricMode, setMatrixMetricMode] = useState<MatrixMetricMode>("NET_PL");
  const [matrixScopeMode, setMatrixScopeMode] = useState<MatrixScopeMode>("PORTFOLIO");
  const [selectedMatrixFundId, setSelectedMatrixFundId] = useState(data.funds[0]?.id ?? "");
  const [matrixMaxYearsInput, setMatrixMaxYearsInput] = useState("5");
  const [matrixMaxDeclineInput, setMatrixMaxDeclineInput] = useState("30");
  const [viewMode, setViewMode] = useState<StressLabViewMode>("STRESS_MATRIX");

  const scenario = useMemo(
    () => data.scenarios.find((s) => s.id === selectedScenarioId) ?? data.scenarios[0],
    [data.scenarios, selectedScenarioId]
  );

  const effectiveFunds = useMemo(
    () => buildEffectiveFunds(data.funds, data.transactions),
    [data.funds, data.transactions]
  );
  const selectedMatrixFund = useMemo(
    () => effectiveFunds.find((fund) => fund.id === selectedMatrixFundId) ?? effectiveFunds[0],
    [effectiveFunds, selectedMatrixFundId]
  );
  const portfolioRisk = useMemo(() => calculatePortfolioRiskSnapshot(effectiveFunds), [effectiveFunds]);

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = () => {
    if (!scenario) return;
    setEditing(scenario);
    setOpen(true);
  };

  const onSave = (values: ScenarioFormValues) => {
    if (editing) {
      updateScenario(editing.id, values);
    } else {
      addScenario(values);
    }
    setOpen(false);
  };

  const holdingYears = Math.max(0, toNumberOr(holdingYearsInput, 0));
  const navDeclinePct = Math.max(0, toNumberOr(navDeclinePctInput, 0));
  const fundingRate = Math.max(0, toNumberOr(fundingBaseRateInput, 0)) + Math.max(0, toNumberOr(fundingSpreadInput, 0));
  const matrixMaxYears = Math.max(0.25, toNumberOr(matrixMaxYearsInput, 5));
  const matrixMaxDecline = Math.max(0, toNumberOr(matrixMaxDeclineInput, 30));

  const sharedOverrides = useMemo(
    () => ({
      startingNav: toOptionalNumber(startingNavOverrideInput),
      endingNav: endingNavMode === "MANUAL" ? toOptionalNumber(manualEndingNavInput) : undefined,
      fundingRate,
      fundingAmount: toOptionalNumber(fundingAmountInput),
      dividendPerUnit: toOptionalNumber(dividendPerUnitInput),
    }),
    [
      startingNavOverrideInput,
      endingNavMode,
      manualEndingNavInput,
      fundingRate,
      fundingAmountInput,
      dividendPerUnitInput,
    ]
  );

  const matrixOverrides = useMemo(
    () => ({
      startingNav: sharedOverrides.startingNav,
      fundingRate: sharedOverrides.fundingRate,
      fundingAmount: sharedOverrides.fundingAmount,
      dividendPerUnit: sharedOverrides.dividendPerUnit,
    }),
    [sharedOverrides]
  );

  const scenarioSummary = useMemo(() => {
    if (!scenario) return { netCarry: 0, equity: 0, breachCount: 0 };
    return effectiveFunds.reduce(
      (acc, fund) => {
        const result = applyScenarioToFund(fund, scenario);
        acc.netCarry += result.stressedNetCarry;
        acc.equity += result.stressedEquity;
        if (result.marginCallBreached) acc.breachCount += 1;
        return acc;
      },
      { netCarry: 0, equity: 0, breachCount: 0 }
    );
  }, [effectiveFunds, scenario]);

  const scenarioCompare = useMemo(
    () =>
      data.scenarios.map((sc) => {
        const totals = effectiveFunds.reduce(
          (acc, fund) => {
            const result = applyScenarioToFund(fund, sc);
            acc.netCarry += result.stressedNetCarry;
            acc.equity += result.stressedEquity;
            if (result.marginCallBreached) acc.breachCount += 1;
            return acc;
          },
          { netCarry: 0, equity: 0, breachCount: 0 }
        );
        return { scenario: sc, ...totals };
      }),
    [effectiveFunds, data.scenarios]
  );

  const holdingPeriod = useMemo(() => {
    const rows = effectiveFunds.map((fund) => ({
      fund,
      result: calculateHoldingPeriodPL(fund, holdingYears, navDeclinePct, sharedOverrides),
    }));

    const totals = rows.reduce(
      (acc, row) => {
        acc.startingMarketValue += row.result.startingMarketValue;
        acc.endingMarketValue += row.result.endingMarketValue;
        acc.totalDividendsReceived += row.result.totalDividendsReceived;
        acc.totalFundingCost += row.result.totalFundingCost;
        acc.unrealizedCapitalPnL += row.result.unrealizedCapitalPnL;
        acc.strategyTotalPnL += row.result.strategyTotalPnL;
        return acc;
      },
      {
        startingMarketValue: 0,
        endingMarketValue: 0,
        totalDividendsReceived: 0,
        totalFundingCost: 0,
        unrealizedCapitalPnL: 0,
        strategyTotalPnL: 0,
      }
    );
    const totalFundingAmount =
      sharedOverrides.fundingAmount !== undefined
        ? sharedOverrides.fundingAmount * effectiveFunds.length
        : effectiveFunds.reduce((sum, fund) => sum + Math.max(0, fund.loanAmount), 0);
    const initialEquity = totals.startingMarketValue - totalFundingAmount;
    const endingEquity = initialEquity + totals.strategyTotalPnL;
    const equityMultiple = initialEquity > 0 ? endingEquity / initialEquity : 0;
    const annualizedReturn =
      holdingYears > 0 && initialEquity > 0 && endingEquity > 0
        ? Math.pow(equityMultiple, 1 / holdingYears) - 1
        : 0;

    return { rows, totals, initialEquity, endingEquity, equityMultiple, annualizedReturn };
  }, [effectiveFunds, holdingYears, navDeclinePct, sharedOverrides]);

  const stressMatrix = useMemo(() => {
    const columns: number[] = [];
    for (let years = 0.25; years <= matrixMaxYears + 1e-9; years += 0.25) {
      columns.push(Number(years.toFixed(2)));
    }

    const rows: Array<{
      navDeclinePct: number;
      endingNav: number;
      cells: Array<{
        years: number;
        netPl: number;
        irr: number;
        equityMultiple: number;
        initialEquity: number;
        dividends: number;
        fundingCost: number;
        unrealizedPnL: number;
      }>;
    }> = [];

    for (let decline = 0; decline <= matrixMaxDecline + 1e-9; decline += 0.5) {
      const cells = columns.map((years) => {
        if (matrixScopeMode === "FUND" && selectedMatrixFund) {
          const result = calculateHoldingPeriodPL(selectedMatrixFund, years, decline, matrixOverrides);
          const fundingAmount =
            matrixOverrides.fundingAmount !== undefined
              ? matrixOverrides.fundingAmount
              : selectedMatrixFund.loanAmount;
          const initialEquity = result.startingMarketValue - fundingAmount;
          const endingEquity = initialEquity + result.strategyTotalPnL;
          const equityMultiple = initialEquity > 0 ? endingEquity / initialEquity : 0;
          const irr =
            years > 0 && initialEquity > 0 && endingEquity > 0
              ? Math.pow(equityMultiple, 1 / years) - 1
              : 0;
          return {
            years,
            netPl: result.strategyTotalPnL,
            irr,
            equityMultiple,
            initialEquity,
            dividends: result.totalDividendsReceived,
            fundingCost: result.totalFundingCost,
            unrealizedPnL: result.unrealizedCapitalPnL,
          };
        }

        const totals = calculatePortfolioHoldingPeriodPL(effectiveFunds, years, decline, matrixOverrides);
        const initialEquity = totals.startingMarketValue - totals.totalInitialFundingAmount;
        const endingEquity = initialEquity + totals.strategyTotalPnL;
        const equityMultiple = initialEquity > 0 ? endingEquity / initialEquity : 0;
        const irr =
          years > 0 && initialEquity > 0 && endingEquity > 0
            ? Math.pow(equityMultiple, 1 / years) - 1
            : 0;
        return {
          years,
          netPl: totals.strategyTotalPnL,
          irr,
          equityMultiple,
          initialEquity,
          dividends: totals.totalDividendsReceived,
          fundingCost: totals.totalFundingCost,
          unrealizedPnL: totals.unrealizedCapitalPnL,
        };
      });

      const endingNav = (() => {
        if (matrixScopeMode === "FUND" && selectedMatrixFund) {
          return calculateHoldingPeriodPL(selectedMatrixFund, columns[0] ?? 0.25, decline, matrixOverrides).endingNav;
        }
        return calculatePortfolioHoldingPeriodPL(
          effectiveFunds,
          columns[0] ?? 0.25,
          decline,
          matrixOverrides
        ).weightedEndingNav;
      })();

      rows.push({
        navDeclinePct: Number(decline.toFixed(1)),
        endingNav,
        cells,
      });
    }

    return { columns, rows };
  }, [
    effectiveFunds,
    matrixMaxYears,
    matrixMaxDecline,
    matrixOverrides,
    matrixScopeMode,
    selectedMatrixFund,
  ]);

  const matrixScale = useMemo(() => {
    const values = stressMatrix.rows.flatMap((row) =>
      row.cells.map((cell) => {
        if (matrixMetricMode === "NET_PL") return cell.netPl;
        if (matrixMetricMode === "IRR") return cell.irr;
        return cell.equityMultiple - 1;
      })
    );
    const maxProfit = values.length ? Math.max(0, ...values) : 0;
    const maxLoss = values.length ? Math.max(0, ...values.map((v) => -v)) : 0;
    return { maxProfit, maxLoss };
  }, [stressMatrix, matrixMetricMode]);

  const resetAssumptions = () => {
    setHoldingYearsInput("3");
    setNavDeclinePctInput("15");
    setStartingNavOverrideInput("");
    setEndingNavMode("CALCULATED");
    setManualEndingNavInput("");
    setFundingBaseRateInput(weightedFundingDefaults.base.toFixed(5));
    setFundingSpreadInput(weightedFundingDefaults.spread.toFixed(5));
    setFundingAmountInput("");
    setDividendPerUnitInput("");
    setMatrixMaxYearsInput("5");
    setMatrixMaxDeclineInput("30");
    setMatrixMetricMode("NET_PL");
  };

  return (
    <div>
      <PageHeader title="Stress Test Lab" subtitle="Flexible scenario engine for holding-period strategy P/L." />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Lab View</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant={viewMode === "STRESS_MATRIX" ? "default" : "outline"}
            onClick={() => setViewMode("STRESS_MATRIX")}
          >
            Stress Matrix
          </Button>
          <Button
            variant={viewMode === "MARGIN_ANALYZER" ? "default" : "outline"}
            onClick={() => setViewMode("MARGIN_ANALYZER")}
          >
            Margin Call & Liquidation Analyzer
          </Button>
        </CardContent>
      </Card>

      {viewMode === "STRESS_MATRIX" ? (
        <>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Assumptions & Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Holding Period (Years)">
              <Input type="number" min="0" step="0.25" value={holdingYearsInput} onChange={(e) => setHoldingYearsInput(e.target.value)} />
            </Field>
            <Field label="NAV Decline %">
              <Input type="number" step="0.01" value={navDeclinePctInput} onChange={(e) => setNavDeclinePctInput(e.target.value)} />
            </Field>
            <Field label="Funding Base Rate (decimal)">
              <Input type="number" step="0.00001" value={fundingBaseRateInput} onChange={(e) => setFundingBaseRateInput(e.target.value)} />
            </Field>
            <Field label="Funding Spread (decimal)">
              <Input type="number" step="0.00001" value={fundingSpreadInput} onChange={(e) => setFundingSpreadInput(e.target.value)} />
            </Field>
            <Field label="Starting NAV Override (optional)">
              <Input type="number" step="0.00001" value={startingNavOverrideInput} onChange={(e) => setStartingNavOverrideInput(e.target.value)} />
            </Field>
            <Field label="Ending NAV Mode">
              <Select value={endingNavMode} onChange={(e) => setEndingNavMode(e.target.value as EndingNavMode)}>
                <option value="CALCULATED">Calculated (Start x (1 - decline%))</option>
                <option value="MANUAL">Manual Override</option>
              </Select>
            </Field>
            <Field label="Ending NAV Override (optional)">
              <Input
                type="number"
                step="0.00001"
                value={manualEndingNavInput}
                onChange={(e) => setManualEndingNavInput(e.target.value)}
                disabled={endingNavMode !== "MANUAL"}
              />
            </Field>
            <Field label="Funding Amount Override (optional, per fund)">
              <Input type="number" step="0.01" value={fundingAmountInput} onChange={(e) => setFundingAmountInput(e.target.value)} />
            </Field>
            <Field label="Dividend per Unit Override (optional)">
              <Input type="number" step="0.00001" value={dividendPerUnitInput} onChange={(e) => setDividendPerUnitInput(e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={resetAssumptions}>
              Reset to Current Portfolio Defaults
            </Button>
          </div>

          <div className="rounded-md border bg-secondary/30 p-3 text-sm">
            <p className="font-medium">Assumption Snapshot</p>
            <p className="text-muted-foreground">
              Holding {holdingYears.toFixed(2)} years | NAV decline {navDeclinePct.toFixed(2)}% | Funding rate {formatPercent(fundingRate)} | Ending NAV mode {endingNavMode}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Stress Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Matrix Scope">
              <Select value={matrixScopeMode} onChange={(e) => setMatrixScopeMode(e.target.value as MatrixScopeMode)}>
                <option value="PORTFOLIO">Portfolio (weighted)</option>
                <option value="FUND">Single Fund</option>
              </Select>
            </Field>
            <Field label="Matrix Value">
              <Select value={matrixMetricMode} onChange={(e) => setMatrixMetricMode(e.target.value as MatrixMetricMode)}>
                <option value="NET_PL">Net Strategy P/L</option>
                <option value="IRR">Annualized Return</option>
                <option value="EQUITY_MULTIPLE">Equity Multiple</option>
              </Select>
            </Field>
            <Field label="Max NAV Decline %">
              <Input type="number" step="0.5" value={matrixMaxDeclineInput} onChange={(e) => setMatrixMaxDeclineInput(e.target.value)} />
            </Field>
            <Field label="Max Holding Period (Years)">
              <Input type="number" step="0.25" value={matrixMaxYearsInput} onChange={(e) => setMatrixMaxYearsInput(e.target.value)} />
            </Field>
          </div>
          {matrixScopeMode === "FUND" ? (
            <div className="mt-3">
              <Field label="Selected Fund">
                <Select value={selectedMatrixFund?.id ?? ""} onChange={(e) => setSelectedMatrixFundId(e.target.value)}>
                  {effectiveFunds.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.fundName}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}

          <div className="mt-4 overflow-auto">
            <Table className="min-w-[1040px]">
              <TableHeader>
                <TableRow>
                  <TableHead>NAV Decline %</TableHead>
                  <TableHead>{matrixScopeMode === "PORTFOLIO" ? "Ending NAV (Weighted)" : "Ending NAV"}</TableHead>
                  {stressMatrix.columns.map((years) => (
                    <TableHead key={years}>{Math.round(years * 12)}M</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {stressMatrix.rows.map((row) => (
                  <TableRow key={row.navDeclinePct}>
                    <TableCell>{row.navDeclinePct.toFixed(1)}%</TableCell>
                    <TableCell>{formatCurrency(row.endingNav, data.settings.baseCurrency)}</TableCell>
                    {row.cells.map((cell) => {
                      const metricValue =
                        matrixMetricMode === "NET_PL"
                          ? cell.netPl
                          : matrixMetricMode === "IRR"
                            ? cell.irr
                            : cell.equityMultiple - 1;
                      const tooltip = [
                        `${cell.years.toFixed(2)} years, NAV decline ${row.navDeclinePct.toFixed(1)}%`,
                        `Dividends: ${formatCurrency(cell.dividends, data.settings.baseCurrency)}`,
                        `Funding cost: ${formatCurrency(cell.fundingCost, data.settings.baseCurrency)}`,
                        `Unrealized P/L: ${formatCurrency(cell.unrealizedPnL, data.settings.baseCurrency)}`,
                        `Net P/L: ${formatCurrency(cell.netPl, data.settings.baseCurrency)}`,
                        `Annualized return: ${formatPercent(cell.irr)}`,
                        `Equity multiple: ${cell.equityMultiple.toFixed(3)}x`,
                      ].join("\n");
                      return (
                        <TableCell
                          key={`${row.navDeclinePct}-${cell.years}`}
                          className={getHeatmapCellClass(metricValue, matrixScale.maxProfit, matrixScale.maxLoss)}
                          style={getHeatmapCellStyle(metricValue, matrixScale.maxProfit, matrixScale.maxLoss)}
                          title={tooltip}
                        >
                          {matrixMetricMode === "NET_PL"
                            ? formatCurrency(cell.netPl, data.settings.baseCurrency)
                            : matrixMetricMode === "IRR"
                              ? formatPercent(cell.irr)
                              : `${cell.equityMultiple.toFixed(3)}x`}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Scenario Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="w-full md:max-w-sm">
              <Select value={selectedScenarioId} onChange={(e) => setSelectedScenarioId(e.target.value)}>
                {data.scenarios.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex gap-2">
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button onClick={openCreate}>Add Scenario</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{editing ? "Edit Scenario" : "Add Scenario"}</DialogTitle>
                  </DialogHeader>
                  <ScenarioForm scenario={editing ?? undefined} onSubmit={onSave} />
                </DialogContent>
              </Dialog>
              <Button variant="outline" onClick={openEdit} disabled={!scenario}>
                Edit Selected
              </Button>
              <Button variant="destructive" onClick={() => scenario && deleteScenario(scenario.id)} disabled={!scenario?.id || scenario.isDefault}>
                Delete
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Metric title="Selected Scenario Net Carry (M)" value={formatCurrency(scenarioSummary.netCarry)} />
            <Metric title="Selected Scenario Equity" value={formatCurrency(scenarioSummary.equity)} />
            <Metric title="Margin Call Breaches" value={`${scenarioSummary.breachCount} fund(s)`} danger={scenarioSummary.breachCount > 0} />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Scenario Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scenario</TableHead>
                <TableHead>Stressed Net Carry</TableHead>
                <TableHead>Stressed Equity</TableHead>
                <TableHead>Margin Breaches</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenarioCompare.map((row) => (
                <TableRow key={row.scenario.id}>
                  <TableCell className="font-medium">{row.scenario.name}</TableCell>
                  <TableCell>{formatCurrency(row.netCarry)}</TableCell>
                  <TableCell>{formatCurrency(row.equity)}</TableCell>
                  <TableCell className={row.breachCount > 0 ? "text-red-600 font-semibold" : ""}>{row.breachCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {scenario ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Scenario Results: {scenario.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <ScenarioResultsTable funds={effectiveFunds} scenario={scenario} />
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Holding Period Strategy P/L</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Metric title="Total Dividends Received" value={formatCurrency(holdingPeriod.totals.totalDividendsReceived)} />
            <Metric title="Total Funding Cost" value={formatCurrency(holdingPeriod.totals.totalFundingCost)} danger={holdingPeriod.totals.totalFundingCost > holdingPeriod.totals.totalDividendsReceived} />
            <Metric title="Unrealized Capital Gain/Loss" value={formatCurrency(holdingPeriod.totals.unrealizedCapitalPnL)} danger={holdingPeriod.totals.unrealizedCapitalPnL < 0} />
            <Metric title="Net Strategy P/L (Cumulative)" value={formatCurrency(holdingPeriod.totals.strategyTotalPnL)} danger={holdingPeriod.totals.strategyTotalPnL < 0} />
            <Metric title="Initial Equity" value={formatCurrency(holdingPeriod.initialEquity)} />
            <Metric title="Ending Equity" value={formatCurrency(holdingPeriod.endingEquity)} danger={holdingPeriod.endingEquity < 0} />
            <Metric title="Equity Multiple" value={`${holdingPeriod.equityMultiple.toFixed(3)}x`} danger={holdingPeriod.equityMultiple < 1} />
            <Metric title="Annualized Return" value={formatPercent(holdingPeriod.annualizedReturn)} danger={holdingPeriod.annualizedReturn < 0} />
          </div>

          <div className="mt-4 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fund</TableHead>
                  <TableHead>Starting NAV</TableHead>
                  <TableHead>Ending NAV</TableHead>
                  <TableHead>Dividends</TableHead>
                  <TableHead>Funding Cost</TableHead>
                  <TableHead>Unrealized P/L</TableHead>
                  <TableHead>Net Strategy P/L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdingPeriod.rows.map(({ fund, result }) => (
                  <TableRow key={fund.id}>
                    <TableCell className="font-medium">{fund.fundName}</TableCell>
                    <TableCell>{formatCurrency(result.startingNav, fund.currency)}</TableCell>
                    <TableCell>{formatCurrency(result.endingNav, fund.currency)}</TableCell>
                    <TableCell>{formatCurrency(result.totalDividendsReceived, fund.currency)}</TableCell>
                    <TableCell>{formatCurrency(result.totalFundingCost, fund.currency)}</TableCell>
                    <TableCell>{formatCurrency(result.unrealizedCapitalPnL, fund.currency)}</TableCell>
                    <TableCell>{formatCurrency(result.strategyTotalPnL, fund.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
        </>
      ) : (
        <MarginLiquidationAnalyzer
          portfolioRisk={portfolioRisk}
          baseCurrency={data.settings.baseCurrency}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Metric({ title, value, danger = false }: { title: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded border p-3 ${danger ? "border-red-300 bg-red-50" : "border-cyan-100 bg-cyan-50"}`}>
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function toNumberOr(value: string, fallback: number) {
  if (value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toOptionalNumber(value: string) {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getHeatmapCellStyle(value: number, maxProfit: number, maxLoss: number) {
  if (value > 0 && maxProfit > 0) {
    const intensity = Math.max(0.12, Math.min(0.88, value / maxProfit));
    return { backgroundColor: `rgba(22, 163, 74, ${intensity})` };
  }
  if (value < 0 && maxLoss > 0) {
    const intensity = Math.max(0.12, Math.min(0.88, -value / maxLoss));
    return { backgroundColor: `rgba(220, 38, 38, ${intensity})` };
  }
  return { backgroundColor: "rgba(148, 163, 184, 0.12)" };
}

function getHeatmapCellClass(value: number, maxProfit: number, maxLoss: number) {
  if (value > 0 && maxProfit > 0 && value / maxProfit > 0.55) return "text-white font-semibold";
  if (value < 0 && maxLoss > 0 && -value / maxLoss > 0.45) return "text-white font-semibold";
  return "text-foreground";
}
