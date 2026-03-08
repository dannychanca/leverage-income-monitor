"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FundForm } from "@/components/forms/fund-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { usePortfolio } from "@/lib/store/portfolio-store";

export default function EditFundPage() {
  const params = useParams<{ id: string }>();
  const { data } = usePortfolio();
  const fund = data.funds.find((f) => f.id === params.id);

  if (!fund) {
    return (
      <div className="rounded-lg border bg-white p-6 text-sm">
        Fund not found. <Link className="text-primary underline" href="/funds">Return to Funds</Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={`Edit ${fund.fundName}`} subtitle="Update fund assumptions and limits." />
      <Card>
        <CardContent className="p-5">
          <FundForm fund={fund} />
        </CardContent>
      </Card>
    </div>
  );
}
