"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePortfolio } from "@/lib/store/portfolio-store";

export default function CashflowIndexPage() {
  const { data } = usePortfolio();

  return (
    <div>
      <PageHeader
        title="Monthly Cashflow Log"
        subtitle="Select a fund to review and edit monthly NAV, dividends, funding cost, and carry."
      />

      <Card>
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fund</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Records</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.funds.map((fund) => {
                const count = data.monthlyRecords.filter((r) => r.fundId === fund.id).length;
                return (
                  <TableRow key={fund.id}>
                    <TableCell className="font-medium">{fund.fundName}</TableCell>
                    <TableCell>{fund.ticker}</TableCell>
                    <TableCell>{fund.manager}</TableCell>
                    <TableCell>{count}</TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/funds/${fund.id}/cashflow`}>Open Log</Link>
                      </Button>
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
