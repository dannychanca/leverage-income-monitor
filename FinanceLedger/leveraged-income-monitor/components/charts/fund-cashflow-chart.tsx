"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyCashflowRecord } from "@/lib/types/models";
import { usePortfolio } from "@/lib/store/portfolio-store";
import { formatChartCurrency } from "@/lib/utils";

export function FundCashflowChart({ records }: { records: MonthlyCashflowRecord[] }) {
  const { data } = usePortfolio();
  const fundId = records[0]?.fundId;
  const currency = data.funds.find((f) => f.id === fundId)?.currency ?? data.settings.baseCurrency;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Fund Monthly Cashflow</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={records}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={(v: number) => formatChartCurrency(v, currency)} />
            <Bar dataKey="totalDividendReceived" fill="#0891b2" name="Dividend" />
            <Bar dataKey="totalFundingCost" fill="#f97316" name="Funding" />
            <Bar dataKey="netCarry" fill="#16a34a" name="Net Carry" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
