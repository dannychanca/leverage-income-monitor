"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PortfolioRiskSnapshot } from "@/lib/utils/calculations";
import { formatCurrency, formatPercent } from "@/lib/utils";

export function MarginLiquidationAnalyzer({
  portfolioRisk,
  baseCurrency,
}: {
  portfolioRisk: PortfolioRiskSnapshot;
  baseCurrency: string;
}) {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Margin Call & Liquidation Analyzer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <AnalyzerPill label="First Warning Risk" value={portfolioRisk.firstWarningFund ?? "N/A"} />
          <AnalyzerPill label="First Margin Call Risk" value={portfolioRisk.firstMarginCallFund ?? "N/A"} danger />
          <AnalyzerPill
            label="First Liquidation Risk"
            value={portfolioRisk.firstLiquidationFund ?? "N/A"}
            danger
          />
        </div>

        <div className="overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NAV Down</TableHead>
                <TableHead>Funding Up</TableHead>
                <TableHead>Dividend Cut</TableHead>
                <TableHead>Stressed LTV</TableHead>
                <TableHead>Stressed Net Carry</TableHead>
                <TableHead>Breaches (W/C/L)</TableHead>
                <TableHead>First at Risk (W/C/L)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portfolioRisk.stressRows.map((row) => (
                <TableRow key={`${row.navDownPct}-${row.fundingUpBps}-${row.dividendCutPct}`}>
                  <TableCell>{`${(row.navDownPct * 100).toFixed(0)}%`}</TableCell>
                  <TableCell>{`${row.fundingUpBps} bps`}</TableCell>
                  <TableCell>{`${(row.dividendCutPct * 100).toFixed(0)}%`}</TableCell>
                  <TableCell>{formatPercent(row.stressedLtv)}</TableCell>
                  <TableCell>{formatCurrency(row.stressedNetCarry, baseCurrency)}</TableCell>
                  <TableCell>{`${row.warningBreaches}/${row.marginCallBreaches}/${row.liquidationBreaches}`}</TableCell>
                  <TableCell>{`${row.firstWarningFund ?? "-"} / ${row.firstMarginCallFund ?? "-"} / ${
                    row.firstLiquidationFund ?? "-"
                  }`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function AnalyzerPill({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className={`rounded border p-3 ${danger ? "border-red-300 bg-red-50" : "border-cyan-100 bg-cyan-50"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
