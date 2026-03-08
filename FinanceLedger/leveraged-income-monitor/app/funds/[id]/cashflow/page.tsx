"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useFund } from "@/lib/store/use-fund";
import { CashflowLogManager } from "@/components/funds/cashflow-log-manager";
import { FundCashflowChart } from "@/components/charts/fund-cashflow-chart";

export default function FundCashflowPage() {
  const params = useParams<{ id: string }>();
  const { fund, records, fundingCostEntries } = useFund(params.id);

  if (!fund) {
    return (
      <div className="rounded-lg border bg-white p-6 text-sm">
        Fund not found. <Link className="text-primary underline" href="/funds">Return to Funds</Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`${fund.fundName} - Monthly Cashflow Log`}
        subtitle="Track month-by-month NAV, dividend, funding cost, and carry."
      />

      <div className="space-y-4">
        <FundCashflowChart records={records} />
        <Card>
          <CardContent className="p-4">
            <CashflowLogManager
              fund={fund}
              fundId={fund.id}
              records={records}
              fundingCostEntries={fundingCostEntries}
              currency={fund.currency}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
