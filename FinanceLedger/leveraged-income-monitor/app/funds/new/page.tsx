"use client";

import { FundForm } from "@/components/forms/fund-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function NewFundPage() {
  return (
    <div>
      <PageHeader title="Add Fund" subtitle="Create a new financed fund position." />
      <Card>
        <CardContent className="p-5">
          <FundForm />
        </CardContent>
      </Card>
    </div>
  );
}
