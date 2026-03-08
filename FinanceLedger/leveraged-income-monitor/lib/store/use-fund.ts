"use client";

import { useMemo } from "react";
import { usePortfolio } from "@/lib/store/portfolio-store";

export function useFund(fundId: string) {
  const { data } = usePortfolio();

  return useMemo(() => {
    const fund = data.funds.find((f) => f.id === fundId);
    const records = data.monthlyRecords
      .filter((r) => r.fundId === fundId)
      .sort((a, b) => a.month.localeCompare(b.month));
    const fundingCostEntries = data.fundingCostEntries
      .filter((e) => e.fundId === fundId)
      .sort((a, b) => a.date.localeCompare(b.date));
    const transactions = data.transactions
      .filter((tx) => tx.fundId === fundId)
      .sort((a, b) => a.date.localeCompare(b.date));

    return { fund, records, fundingCostEntries, transactions };
  }, [data.funds, data.monthlyRecords, data.fundingCostEntries, data.transactions, fundId]);
}
