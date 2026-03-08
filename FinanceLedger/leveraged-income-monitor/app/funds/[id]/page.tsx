"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { TransactionLogManager } from "@/components/funds/transaction-log-manager";
import { usePortfolio } from "@/lib/store/portfolio-store";
import { useFund } from "@/lib/store/use-fund";
import {
  buildEffectiveFunds,
  calculateFundMetrics,
  calculateFundThresholdRisk,
} from "@/lib/utils/calculations";
import { formatCurrency, formatPercent } from "@/lib/utils";

export default function FundDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { data, updateFund, autoGenerateCashflows, refreshFundNav } = usePortfolio();
  const { fund, records, transactions } = useFund(params.id);
  const [dividendFrequency, setDividendFrequency] = useState<"MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL">("MONTHLY");
  const [dividendPaymentDay, setDividendPaymentDay] = useState("28");
  const [dividendPerUnit, setDividendPerUnit] = useState("0");
  const [isRefreshingNav, setIsRefreshingNav] = useState(false);
  const [navRefreshMessage, setNavRefreshMessage] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState({
    exposure: true,
    risk: true,
    income: true,
    pnl: true,
  });

  useEffect(() => {
    if (!fund) return;
    setDividendFrequency(fund.dividendFrequency);
    setDividendPaymentDay(String(fund.dividendPaymentDay));
    setDividendPerUnit(fund.dividendPerUnit.toString());
  }, [fund]);

  if (!fund) {
    return (
      <div className="rounded-lg border bg-white p-6 text-sm">
        Fund not found. <Link className="text-primary underline" href="/funds">Return to Funds</Link>
      </div>
    );
  }

  const effectiveFund = useMemo(
    () => buildEffectiveFunds(data.funds, data.transactions).find((f) => f.id === fund.id) ?? fund,
    [data.funds, data.transactions, fund]
  );
  const metrics = calculateFundMetrics(effectiveFund);
  const thresholdRisk = calculateFundThresholdRisk(effectiveFund);
  const totalDividendsCollected = records.reduce((sum, record) => sum + record.totalDividendReceived, 0);
  const totalFundingCostPaid = records.reduce((sum, record) => sum + record.totalFundingCost, 0);
  const derivedCostBasis = effectiveFund.unitsHeld * effectiveFund.averageCost;
  const initialLtv = derivedCostBasis > 0 ? effectiveFund.loanAmount / derivedCostBasis : 0;
  const cumulativeNetPnL = metrics.unrealizedPnL + totalDividendsCollected - totalFundingCostPaid;
  const showTransactionOnboarding = transactions.length === 0 || searchParams.get("onboarding") === "add-transaction";

  return (
    <div>
      <PageHeader
        title={fund.fundName}
        subtitle={`${fund.manager} (${fund.ticker})`}
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                setIsRefreshingNav(true);
                const result = await refreshFundNav(fund.id);
                setNavRefreshMessage(result.message);
                setIsRefreshingNav(false);
              }}
              disabled={isRefreshingNav}
            >
              {isRefreshingNav ? "Refreshing NAV..." : "Refresh NAV"}
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/funds/${fund.id}/cashflow`}>Monthly Cashflow Log</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/funds/${fund.id}/edit`}>Edit Fund</Link>
            </Button>
          </>
        }
      />
      {navRefreshMessage ? <p className="mb-3 text-sm text-muted-foreground">{navRefreshMessage}</p> : null}

      <div className="space-y-4">
        {showTransactionOnboarding ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add First Transaction</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
              <p>
                This fund master is set up. Position metrics (units, cost basis, loan, funding rates)
                are derived from transactions.
              </p>
              <Button asChild>
                <Link href="#transaction-ledger">Go to Transaction Log</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <DashboardSection
          title="Exposure & Leverage"
          isOpen={openSections.exposure}
          onToggle={() => setOpenSections((prev) => ({ ...prev, exposure: !prev.exposure }))}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard title="Market Value" value={formatCurrency(metrics.marketValue, fund.currency)} />
            <SummaryCard title="Cost Basis" value={formatCurrency(derivedCostBasis, fund.currency)} />
            <SummaryCard
              title="Loan Amount"
              value={formatCurrency(effectiveFund.loanAmount, effectiveFund.currency)}
              tone="warning"
            />
            <SummaryCard title="Equity Value" value={formatCurrency(metrics.equityValue, fund.currency)} tone="success" />
            <SummaryCard
              title="Current LTV"
              value={formatPercent(metrics.ltv)}
              subtitle="Loan / Market Value"
              tone={
                metrics.ltv >= fund.marginCallLtvThreshold
                  ? "danger"
                  : metrics.ltv >= fund.warningLtvThreshold
                    ? "warning"
                    : "neutral"
              }
            />
            <SummaryCard
              title="Initial LTV"
              value={formatPercent(initialLtv)}
              subtitle="Loan / Cost Basis"
            />
            <SummaryCard
              title="Effective Leverage"
              value={`${thresholdRisk.leverage.toFixed(2)}x`}
              subtitle="Market Value / Equity"
            />
          </div>
        </DashboardSection>

        <Separator />

        <DashboardSection
          title="Margin Call & Liquidation Risk"
          isOpen={openSections.risk}
          onToggle={() => setOpenSections((prev) => ({ ...prev, risk: !prev.risk }))}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard title="Warning LTV Threshold" value={formatPercent(fund.warningLtvThreshold)} />
            <SummaryCard title="Margin Call LTV Threshold" value={formatPercent(fund.marginCallLtvThreshold)} />
            <SummaryCard
              title="Forced Liquidation LTV Threshold"
              value={formatPercent(fund.forcedLiquidationLtvThreshold)}
            />
            <SummaryCard
              title="Distance to Margin Call"
              value={
                thresholdRisk.distanceToMarginCall === null
                  ? "N/A"
                  : formatPercent(thresholdRisk.distanceToMarginCall)
              }
              tone={thresholdRisk.marginCallBreached ? "danger" : "neutral"}
            />
            <SummaryCard
              title="NAV at Warning"
              value={
                thresholdRisk.navAtWarningThreshold === null
                  ? "N/A"
                  : formatCurrency(thresholdRisk.navAtWarningThreshold, fund.currency)
              }
            />
            <SummaryCard
              title="NAV at Margin Call"
              value={
                thresholdRisk.navAtMarginCallThreshold === null
                  ? "N/A"
                  : formatCurrency(thresholdRisk.navAtMarginCallThreshold, fund.currency)
              }
              tone={thresholdRisk.marginCallBreached ? "danger" : "warning"}
            />
            <SummaryCard
              title="NAV at Liquidation"
              value={
                thresholdRisk.navAtLiquidationThreshold === null
                  ? "N/A"
                  : formatCurrency(thresholdRisk.navAtLiquidationThreshold, fund.currency)
              }
              tone={thresholdRisk.liquidationBreached ? "danger" : "warning"}
            />
            <SummaryCard
              title="Downside to Warning"
              value={
                thresholdRisk.downsideToWarningPct === null
                  ? "N/A"
                  : formatPercent(thresholdRisk.downsideToWarningPct)
              }
            />
            <SummaryCard
              title="Downside to Margin Call"
              value={
                thresholdRisk.downsideToMarginCallPct === null
                  ? "N/A"
                  : formatPercent(thresholdRisk.downsideToMarginCallPct)
              }
              tone={thresholdRisk.marginCallBreached ? "danger" : "warning"}
            />
            <SummaryCard
              title="Downside to Liquidation"
              value={
                thresholdRisk.downsideToLiquidationPct === null
                  ? "N/A"
                  : formatPercent(thresholdRisk.downsideToLiquidationPct)
              }
              tone={thresholdRisk.liquidationBreached ? "danger" : "warning"}
            />
            <SummaryCard
              title="Additional Collateral Needed"
              value={
                thresholdRisk.additionalCollateralNeeded === null
                  ? "N/A"
                  : formatCurrency(thresholdRisk.additionalCollateralNeeded, fund.currency)
              }
              subtitle={`Target LTV ${thresholdRisk.targetLtv === null ? "-" : formatPercent(thresholdRisk.targetLtv)}`}
            />
            <SummaryCard
              title="Required Loan Repayment"
              value={
                thresholdRisk.requiredLoanRepayment === null
                  ? "N/A"
                  : formatCurrency(thresholdRisk.requiredLoanRepayment, fund.currency)
              }
            />
            <SummaryCard
              title="Required Market Value"
              value={
                thresholdRisk.requiredMarketValue === null
                  ? "N/A"
                  : formatCurrency(thresholdRisk.requiredMarketValue, fund.currency)
              }
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
            <SummaryCard
              title="Monthly Dividend Income"
              value={formatCurrency(metrics.monthlyDividendAmount, fund.currency)}
            />
            <SummaryCard
              title="Total Dividends Collected"
              value={formatCurrency(totalDividendsCollected, fund.currency)}
              tone="success"
            />
            <SummaryCard
              title="Monthly Funding Cost"
              value={formatCurrency(metrics.monthlyFundingCost, fund.currency)}
              tone="warning"
            />
            <SummaryCard
              title="Total Funding Cost"
              value={formatCurrency(totalFundingCostPaid, fund.currency)}
              tone="warning"
            />
            <SummaryCard
              title="Monthly Net Carry"
              value={formatCurrency(metrics.netCarry, fund.currency)}
              tone={metrics.netCarry < 0 ? "danger" : "success"}
            />
            <SummaryCard
              title="Annualized Net Carry on Equity"
              value={formatPercent(metrics.annualizedNetCarryOnEquity)}
              tone={metrics.annualizedNetCarryOnEquity < 0 ? "danger" : "success"}
            />
            <SummaryCard
              title="All-in Funding Rate"
              value={formatPercent(metrics.allInFundingRate)}
              subtitle={`Base ${formatPercent(effectiveFund.fundingBaseRate)} + Spread ${formatPercent(
                effectiveFund.fundingSpread
              )}`}
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
              value={formatCurrency(metrics.unrealizedPnL, fund.currency)}
              tone={metrics.unrealizedPnL < 0 ? "danger" : "success"}
            />
            <SummaryCard
              title="Net P/L (Cumulative)"
              value={formatCurrency(cumulativeNetPnL, fund.currency)}
              subtitle="Dividends + Unrealized P/L - Funding Costs"
              tone={cumulativeNetPnL < 0 ? "danger" : "success"}
            />
          </div>
        </DashboardSection>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Dividend Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Dividend Frequency</Label>
              <Select
                value={dividendFrequency}
                onChange={(e) => setDividendFrequency(e.target.value as typeof dividendFrequency)}
              >
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="SEMI_ANNUAL">Semi-Annual</option>
                <option value="ANNUAL">Annual</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Dividend Payment Day</Label>
              <Input
                type="number"
                min="1"
                max="31"
                step="1"
                value={dividendPaymentDay}
                onChange={(e) => setDividendPaymentDay(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Dividend per Unit</Label>
              <Input
                type="number"
                step="0.00001"
                value={dividendPerUnit}
                onChange={(e) => setDividendPerUnit(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                updateFund(fund.id, {
                  dividendFrequency,
                  dividendPaymentDay: Number(dividendPaymentDay || 28),
                  dividendPerUnit: Number(dividendPerUnit || 0),
                })
              }
            >
              Save Dividend Settings
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                updateFund(fund.id, {
                  dividendFrequency,
                  dividendPaymentDay: Number(dividendPaymentDay || 28),
                  dividendPerUnit: Number(dividendPerUnit || 0),
                });
                autoGenerateCashflows(fund.id);
              }}
            >
              Auto-Generate Cashflows To Date
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Fund Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
          <Detail
            label="Units Held"
            value={effectiveFund.unitsHeld.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          />
          <Detail label="Current NAV" value={formatCurrency(fund.currentNav, fund.currency)} />
          <Detail label="Average Cost" value={formatCurrency(effectiveFund.averageCost, fund.currency)} />
          <Detail label="Cost Basis" value={formatCurrency(derivedCostBasis, fund.currency)} />
          <Detail
            label="Annualized Distribution Yield"
            value={formatPercent(metrics.annualizedDistributionYield)}
          />
          <Detail
            label="Annualized Net Carry on Equity"
            value={formatPercent(metrics.annualizedNetCarryOnEquity)}
          />
          <Detail label="Warning LTV" value={formatPercent(fund.warningLtvThreshold)} />
          <Detail label="Margin Call LTV" value={formatPercent(fund.marginCallLtvThreshold)} />
          <Detail
            label="Forced Liquidation LTV"
            value={formatPercent(fund.forcedLiquidationLtvThreshold)}
          />
          <Detail label="Monthly Records" value={records.length.toString()} />
          <Detail label="Transactions" value={transactions.length.toString()} />
          <div className="md:col-span-2">
            <Detail label="Notes" value={fund.notes || "-"} />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4" id="transaction-ledger">
        <CardHeader>
          <CardTitle className="text-base">Transaction Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionLogManager fund={fund} transactions={transactions} />
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-secondary/35 p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
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
