"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePortfolio } from "@/lib/store/portfolio-store";
import { formatChartCurrency } from "@/lib/utils";

type SeriesPoint = {
  month: string;
  dividends: number;
  funding: number;
  netCarry: number;
  ltv: number;
};

function ChartCard({
  title,
  data,
  dataKey,
  color,
  valueFormatter,
}: {
  title: string;
  data: SeriesPoint[];
  dataKey: keyof SeriesPoint;
  color: string;
  valueFormatter?: (v: number) => string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={valueFormatter} />
            <Tooltip formatter={(v: number) => (valueFormatter ? valueFormatter(v) : v.toFixed(2))} />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function TimeSeriesCards({ data }: { data: SeriesPoint[] }) {
  const { data: portfolioData } = usePortfolio();
  const ccy = portfolioData.settings.baseCurrency;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ChartCard
        title="Dividends Over Time"
        data={data}
        dataKey="dividends"
        color="#0e7490"
        valueFormatter={(v) => formatChartCurrency(v, ccy)}
      />
      <ChartCard
        title="Funding Costs Over Time"
        data={data}
        dataKey="funding"
        color="#f97316"
        valueFormatter={(v) => formatChartCurrency(v, ccy)}
      />
      <ChartCard
        title="Net Carry Over Time"
        data={data}
        dataKey="netCarry"
        color="#16a34a"
        valueFormatter={(v) => formatChartCurrency(v, ccy)}
      />
      <ChartCard
        title="LTV Trend Over Time"
        data={data}
        dataKey="ltv"
        color="#e11d48"
        valueFormatter={(v) => `${(v * 100).toFixed(1)}%`}
      />
    </div>
  );
}
