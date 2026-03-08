"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RiskChip } from "@/components/funds/risk-chip";
import { usePortfolio } from "@/lib/store/portfolio-store";
import {
  buildEffectiveFunds,
  calculateFundMetrics,
  calculatePortfolioRiskSnapshot,
} from "@/lib/utils/calculations";
import { formatCurrency, formatPercent } from "@/lib/utils";

export default function FundsPage() {
  const { data, deleteFund } = usePortfolio();
  const effectiveFunds = useMemo(
    () => buildEffectiveFunds(data.funds, data.transactions),
    [data.funds, data.transactions]
  );
  const riskSnapshot = useMemo(() => calculatePortfolioRiskSnapshot(effectiveFunds), [effectiveFunds]);
  const riskByFundId = useMemo(
    () => new Map(riskSnapshot.fundRiskRows.map((row) => [row.fundId, row])),
    [riskSnapshot]
  );

  return (
    <div>
      <PageHeader
        title="Funds"
        subtitle="Manage financed funds and monitor leverage-level risk at the instrument level."
        actions={
          <Button asChild variant="secondary">
            <Link href="/funds/new">Add Fund</Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-3 md:p-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fund</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead>Market Value</TableHead>
                <TableHead>Loan</TableHead>
                <TableHead>LTV</TableHead>
                <TableHead>Net Carry (M)</TableHead>
                <TableHead>Dist. to Margin Call</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {effectiveFunds.map((fund) => {
                const effectiveFund = fund;
                const m = calculateFundMetrics(effectiveFund);
                const risk = riskByFundId.get(fund.id);
                const riskLevel =
                  risk?.liquidationBreached || risk?.marginCallBreached
                    ? "danger"
                    : risk?.warningBreached || m.netCarry < 0
                      ? "warning"
                      : "ok";
                const distanceToMarginCall =
                  risk?.distanceToMarginCall !== null && risk?.distanceToMarginCall !== undefined
                    ? formatPercent(risk.distanceToMarginCall)
                    : "N/A";

                return (
                  <TableRow key={fund.id}>
                    <TableCell className="font-medium">{fund.fundName}</TableCell>
                    <TableCell>{fund.manager}</TableCell>
                    <TableCell>{fund.ticker}</TableCell>
                    <TableCell>{formatCurrency(m.marketValue, fund.currency)}</TableCell>
                    <TableCell>{formatCurrency(effectiveFund.loanAmount, fund.currency)}</TableCell>
                    <TableCell>{formatPercent(m.ltv)}</TableCell>
                    <TableCell>{formatCurrency(m.netCarry, fund.currency)}</TableCell>
                    <TableCell>{distanceToMarginCall}</TableCell>
                    <TableCell>
                      <RiskChip
                        label={riskLevel === "danger" ? "High" : riskLevel === "warning" ? "Watch" : "OK"}
                        level={riskLevel}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/funds/${fund.id}`}>View</Link>
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteFund(fund.id)}>
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
