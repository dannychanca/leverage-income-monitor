"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { TimeSeriesCards } from "@/components/charts/time-series-cards";
import { usePortfolio } from "@/lib/store/portfolio-store";
import {
  buildDashboardMetricsSnapshot,
  buildPortfolioIrrCashflows,
  calculatePortfolioIrr,
} from "@/lib/utils/calculations";
import { formatCurrency, formatPercent } from "@/lib/utils";

export default function DashboardPage() {
  const { data, refreshAllFundNavs } = usePortfolio();
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState({
    exposure: true,
    income: true,
    pnl: true,
  });
  const {
    portfolio,
    series,
    totalDividendsCollected,
    totalFundingCostPaid,
    cumulativeNetPnL,
    portfolioRisk,
  } = useMemo(() => buildDashboardMetricsSnapshot(data), [data]);
  const portfolioIrr = calculatePortfolioIrr(data);
  const irrLines = useMemo(() => {
    const lines = buildPortfolioIrrCashflows(data);
    let cumulative = 0;
    return lines.map((line) => {
      cumulative += line.amount;
      return {
        ...line,
        cumulative,
      };
    });
  }, [data]);
  const irrSummary = useMemo(() => {
    let inflows = 0;
    let outflows = 0;
    for (const line of irrLines) {
      if (line.amount >= 0) inflows += line.amount;
      else outflows += Math.abs(line.amount);
    }
    return {
      inflows,
      outflows,
      net: inflows - outflows,
      count: irrLines.length,
    };
  }, [irrLines]);

  const warnings = portfolioRisk.fundRiskRows
    .map((risk) => {
      if (risk.liquidationBreached) return `${risk.fundName}: forced liquidation threshold breached`;
      if (risk.marginCallBreached) return `${risk.fundName}: margin call threshold breached`;
      if (risk.warningBreached) return `${risk.fundName}: warning LTV breached`;
      return null;
    })
    .filter(Boolean) as string[];

  return (
    <div>
      <PageHeader
        title="Portfolio Dashboard"
        subtitle="Monitor leverage, carry, and month-on-month trends across financed funds."
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                setIsRefreshingAll(true);
                const result = await refreshAllFundNavs();
                setRefreshMessage(`Updated NAV for ${result.updated} of ${result.attempted} ticker-linked funds.`);
                setIsRefreshingAll(false);
              }}
              disabled={isRefreshingAll}
            >
              {isRefreshingAll ? "Refreshing NAVs..." : "Refresh All NAVs"}
            </Button>
            <Button asChild variant="secondary">
              <Link href="/funds/new">Add Fund</Link>
            </Button>
          </>
        }
      />
      {refreshMessage ? <p className="mb-3 text-sm text-muted-foreground">{refreshMessage}</p> : null}

      <div className="space-y-4">
        <DashboardSection
          title="Exposure & Leverage"
          isOpen={openSections.exposure}
          onToggle={() => setOpenSections((prev) => ({ ...prev, exposure: !prev.exposure }))}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard title="Total Portfolio Market Value" value={formatCurrency(portfolio.marketValue)} />
            <SummaryCard title="Total Cost Basis" value={formatCurrency(portfolio.costBasis)} />
            <SummaryCard
              title="Total Loan Outstanding"
              value={formatCurrency(portfolio.loanAmount)}
              tone="warning"
            />
            <SummaryCard title="Equity Value" value={formatCurrency(portfolio.equity)} tone="success" />
            <SummaryCard
              title="Current LTV"
              value={formatPercent(portfolio.weightedAverageLtv)}
              subtitle="Loan / Market Value"
            />
            <SummaryCard
              title="Total Financed Exposure"
              value={formatCurrency(portfolioRisk.totalFinancedExposure, data.settings.baseCurrency)}
              tone="warning"
            />
            <SummaryCard
              title="Initial LTV"
              value={formatPercent(portfolio.initialLtv)}
              subtitle="Loan / Cost Basis"
            />
            <SummaryCard
              title="Market Value Buffer Before Margin Call"
              value={formatCurrency(
                portfolioRisk.marketValueBufferBeforeMarginCall,
                data.settings.baseCurrency
              )}
            />
          </div>
        </DashboardSection>

        <Separator />

        <DashboardSection
          title="Income & Funding"
          isOpen={openSections.income}
          onToggle={() => setOpenSections((prev) => ({ ...prev, income: !prev.income }))}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard title="Monthly Dividend Income" value={formatCurrency(portfolio.monthlyDividends)} />
            <SummaryCard
              title="Total Dividends Collected"
              value={formatCurrency(totalDividendsCollected)}
              tone="success"
            />
            <SummaryCard
              title="Monthly Funding Cost"
              value={formatCurrency(portfolio.monthlyFunding)}
              tone="warning"
            />
            <SummaryCard
              title="Total Funding Cost"
              value={formatCurrency(totalFundingCostPaid)}
              tone="warning"
            />
            <SummaryCard
              title="Monthly Net Carry"
              value={formatCurrency(portfolio.monthlyNetCarry)}
              tone={portfolio.monthlyNetCarry < 0 ? "danger" : "success"}
            />
            <SummaryCard
              title="Annualized Net Carry on Equity"
              value={formatPercent(portfolio.annualizedNetCarryOnEquity)}
              tone={portfolio.annualizedNetCarryOnEquity < 0 ? "danger" : "success"}
            />
          </div>
        </DashboardSection>

        <Separator />

        <DashboardSection
          title="P/L Snapshot"
          isOpen={openSections.pnl}
          onToggle={() => setOpenSections((prev) => ({ ...prev, pnl: !prev.pnl }))}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Total Unrealized P/L"
              value={formatCurrency(portfolio.unrealizedPnL)}
              tone={portfolio.unrealizedPnL < 0 ? "danger" : "success"}
            />
            <SummaryCard
              title="Net P/L (Cumulative)"
              value={formatCurrency(cumulativeNetPnL)}
              subtitle="Dividends + Unrealized P/L - Funding Costs"
              tone={cumulativeNetPnL < 0 ? "danger" : "success"}
            />
            <SummaryCard
              title="Portfolio IRR"
              value={portfolioIrr === null ? "N/A" : formatPercent(portfolioIrr)}
              subtitle="Transaction + dividend + funding cashflows"
              tone={portfolioIrr !== null && portfolioIrr < 0 ? "danger" : "success"}
            />
          </div>
        </DashboardSection>
      </div>

      <div className="mt-4">
        <TimeSeriesCards data={series} />
      </div>

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">IRR Drilldown</CardTitle>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                View Cashflow Lines
              </Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[85vh] max-w-6xl flex-col overflow-hidden">
              <DialogHeader>
                <DialogTitle>Portfolio IRR Cashflow Drilldown</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <DrilldownPill label="Cashflow Lines" value={irrSummary.count.toString()} />
                <DrilldownPill label="Total Inflows" value={formatCurrency(irrSummary.inflows, data.settings.baseCurrency)} tone="positive" />
                <DrilldownPill label="Total Outflows" value={formatAccountingCurrency(-irrSummary.outflows, data.settings.baseCurrency)} tone="negative" />
                <DrilldownPill
                  label="Net Cashflow"
                  value={formatAccountingCurrency(irrSummary.net, data.settings.baseCurrency)}
                  tone={irrSummary.net < 0 ? "negative" : "positive"}
                />
              </div>
              <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Fund</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Cumulative</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {irrLines.map((line, idx) => (
                      <TableRow key={`${line.date}-${line.fundId ?? "portfolio"}-${line.type}-${idx}`}>
                        <TableCell className="whitespace-nowrap">{line.date}</TableCell>
                        <TableCell>{line.fundName}</TableCell>
                        <TableCell className="whitespace-nowrap">{line.type.replace("_", " ")}</TableCell>
                        <TableCell>{line.note}</TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {renderAccountingAmount(line.amount, data.settings.baseCurrency)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {renderAccountingAmount(line.cumulative, data.settings.baseCurrency)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {irrLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No cashflow lines yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Portfolio IRR is computed from transactions, funding cost entries, dividends, and terminal market value.
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" />
            Risk Monitoring Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {warnings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active risk alerts in current portfolio.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {warnings.map((warning) => (
                <li key={warning} className="rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900">
                  {warning}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatAccountingCurrency(value: number, currency: string) {
  const abs = formatCurrency(Math.abs(value), currency);
  return value < 0 ? `(${abs})` : abs;
}

function renderAccountingAmount(value: number, currency: string) {
  const formatted = formatAccountingCurrency(value, currency);
  if (value < 0) {
    return <span className="font-medium text-red-600">{formatted}</span>;
  }
  return <span>{formatted}</span>;
}

function DrilldownPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "negative"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "positive"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-border bg-secondary/35 text-foreground";

  return (
    <div className={`rounded-md border px-3 py-2 ${toneClass}`}>
      <p className="text-xs">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function DashboardSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-md border bg-white px-3 py-2 text-left md:hidden"
      >
        <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      <h3 className="hidden text-sm font-semibold uppercase tracking-wide text-muted-foreground md:block">{title}</h3>
      <div className={isOpen ? "block" : "hidden md:block"}>{children}</div>
    </section>
  );
}
