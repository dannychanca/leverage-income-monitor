"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Fund, FundTransaction } from "@/lib/types/models";
import { transactionSchema, TransactionFormValues } from "@/lib/types/schemas";
import { usePortfolio } from "@/lib/store/portfolio-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import {
  deriveFinancingFromTransactions,
  normalizeTransactionNumbers,
  roundToDecimals,
} from "@/lib/utils/calculations";

const emptyValues: TransactionFormValues = {
  type: "BUY",
  date: "",
  units: 0,
  nav: 0,
  grossAmount: 0,
  commissionPct: 0,
  loanAmount: 0,
  ltv: 0,
  fundingBaseRate: 0,
  fundingSpread: 0,
  notes: "",
};

export function TransactionLogManager({
  fund,
  transactions,
}: {
  fund: Fund;
  transactions: FundTransaction[];
}) {
  const { addTransaction, updateTransaction, deleteTransaction, autoGenerateCashflows } = usePortfolio();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FundTransaction | null>(null);
  const [syncSource, setSyncSource] = useState<"loan" | "ltv" | null>(null);

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: emptyValues,
  });
  const loanAmountReg = form.register("loanAmount");
  const ltvReg = form.register("ltv");
  const unitsValue = Number(form.watch("units") ?? 0);
  const navValue = Number(form.watch("nav") ?? 0);
  const loanAmountValue = Number(form.watch("loanAmount") ?? 0);
  const ltvValue = Number(form.watch("ltv") ?? 0);
  const derivedFinancing = useMemo(
    () =>
      deriveFinancingFromTransactions(
        transactions,
        fund.loanAmount,
        fund.fundingBaseRate,
        fund.fundingSpread
      ),
    [transactions, fund.loanAmount, fund.fundingBaseRate, fund.fundingSpread]
  );

  const openCreate = () => {
    setSyncSource(null);
    const baseAmount = 0;
    const currentLtv = computeLtvFromBase(derivedFinancing.loanAmount, baseAmount);
    setEditing(null);
    form.reset({
      ...emptyValues,
      date: new Date().toISOString().slice(0, 10),
      nav: fund.currentNav,
      loanAmount: roundToDecimals(derivedFinancing.loanAmount, 5),
      ltv: roundToDecimals(currentLtv, 5),
      fundingBaseRate: roundToDecimals(derivedFinancing.fundingBaseRate, 5),
      fundingSpread: roundToDecimals(derivedFinancing.fundingSpread, 5),
    });
    setOpen(true);
  };

  const openEdit = (tx: FundTransaction) => {
    setSyncSource(null);
    const baseAmount = tx.units * tx.nav;
    const currentLtv = computeLtvFromBase(tx.loanAmount ?? derivedFinancing.loanAmount, baseAmount);
    setEditing(tx);
    form.reset({
      type: tx.type,
      date: tx.date,
      units: roundToDecimals(tx.units, 5),
      nav: roundToDecimals(tx.nav, 5),
      grossAmount: roundToDecimals(tx.units * tx.nav, 5),
      commissionPct: roundToDecimals(tx.commissionPct, 2),
      loanAmount: roundToDecimals(tx.loanAmount ?? derivedFinancing.loanAmount, 5),
      ltv: roundToDecimals(currentLtv, 5),
      fundingBaseRate: roundToDecimals(tx.fundingBaseRate ?? derivedFinancing.fundingBaseRate, 5),
      fundingSpread: roundToDecimals(tx.fundingSpread ?? derivedFinancing.fundingSpread, 5),
      notes: tx.notes ?? "",
    });
    setOpen(true);
  };

  const onSubmit = form.handleSubmit((values) => {
    const normalized = normalizeTransactionNumbers({
      units: values.units,
      nav: values.nav,
      commissionPct: values.commissionPct,
      loanAmount: values.loanAmount,
      fundingBaseRate: values.fundingBaseRate,
      fundingSpread: values.fundingSpread,
    });
    const payload = {
      type: values.type,
      date: values.date,
      units: normalized.units,
      nav: normalized.nav,
      grossAmount: normalized.grossAmount,
      commissionPct: normalized.commissionPct,
      loanAmount: normalized.loanAmount,
      fundingBaseRate: normalized.fundingBaseRate,
      fundingSpread: normalized.fundingSpread,
      notes: values.notes ?? "",
    };

    if (editing) {
      updateTransaction(editing.id, payload);
    } else {
      addTransaction({ ...payload, fundId: fund.id });
    }

    autoGenerateCashflows(fund.id);
    setOpen(false);
  });

  const onDelete = (transactionId: string) => {
    deleteTransaction(transactionId);
    autoGenerateCashflows(fund.id);
  };

  const summary = useMemo(() => {
    let boughtUnits = 0;
    let soldUnits = 0;
    let buyAmount = 0;
    let totalCommissionAmount = 0;
    let totalLoanAmount = 0;

    for (const tx of transactions) {
      const grossAmount = tx.units * tx.nav;
      const commissionAmount = grossAmount * (Math.max(0, tx.commissionPct) / 100);
      totalCommissionAmount += commissionAmount;

      if (tx.type === "BUY") {
        boughtUnits += tx.units;
        buyAmount += grossAmount;
        totalLoanAmount += Math.max(0, tx.loanAmount ?? 0);
      } else {
        soldUnits += tx.units;
        totalLoanAmount -= Math.max(0, tx.loanAmount ?? 0);
      }
    }

    const netUnits = boughtUnits - soldUnits;
    const avgBuyNav = boughtUnits > 0 ? buyAmount / boughtUnits : 0;

    return {
      boughtUnits,
      soldUnits,
      netUnits,
      avgBuyNav,
      totalCommissionAmount,
      totalLoanAmount: Math.max(0, totalLoanAmount),
    };
  }, [transactions]);

  const ltvBaseForSync = roundToDecimals(unitsValue * navValue, 5);

  useEffect(() => {
    if (!open || ltvBaseForSync <= 0 || !syncSource) return;

    if (syncSource === "loan") {
      const nextLtv = roundToDecimals(loanAmountValue / ltvBaseForSync, 5);
      if (Math.abs(ltvValue - nextLtv) > 0.000005) {
        form.setValue("ltv", nextLtv, { shouldDirty: true });
      }
      return;
    }

    const nextLoan = roundToDecimals(ltvBaseForSync * ltvValue, 5);
    if (Math.abs(loanAmountValue - nextLoan) > 0.000005) {
      form.setValue("loanAmount", nextLoan, { shouldDirty: true });
    }
  }, [form, loanAmountValue, ltvValue, ltvBaseForSync, open, syncSource]);

  useEffect(() => {
    if (!open) return;
    const nextGross = roundToDecimals(unitsValue * navValue, 5);
    const currentGross = Number(form.getValues("grossAmount") ?? 0);
    if (Math.abs(currentGross - nextGross) > 0.000005) {
      form.setValue("grossAmount", nextGross, { shouldDirty: true });
    }
  }, [form, navValue, open, unitsValue]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-6">
        <SummaryPill label="Units Bought" value={summary.boughtUnits.toLocaleString(undefined, { maximumFractionDigits: 4 })} />
        <SummaryPill label="Units Sold" value={summary.soldUnits.toLocaleString(undefined, { maximumFractionDigits: 4 })} />
        <SummaryPill label="Net Units" value={summary.netUnits.toLocaleString(undefined, { maximumFractionDigits: 4 })} />
        <SummaryPill label="Total Loan" value={formatCurrency(summary.totalLoanAmount, fund.currency)} />
        <SummaryPill label="Avg Buy NAV" value={formatCurrency(summary.avgBuyNav, fund.currency)} />
        <SummaryPill label="Total Commission" value={formatCurrency(summary.totalCommissionAmount, fund.currency)} />
      </div>

      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>Add Transaction</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Type">
                <Select {...form.register("type")}>
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </Select>
              </Field>
              <Field label="Date">
                <Input type="date" {...form.register("date")} />
              </Field>
              <Field label="Units">
                <Input type="number" step="0.00001" {...form.register("units")} />
              </Field>
              <Field label="NAV">
                <Input type="number" step="0.00001" {...form.register("nav")} />
              </Field>
              <Field label="Gross Amount (derived)">
                <Input type="number" step="0.00001" {...form.register("grossAmount")} readOnly />
              </Field>
              <Field label="Commission %">
                <Input type="number" step="0.01" {...form.register("commissionPct")} />
              </Field>
              <Field label="Loan Amount (updates fund)">
                <Input
                  type="number"
                  step="0.00001"
                  {...loanAmountReg}
                  onChange={(e) => {
                    setSyncSource("loan");
                    loanAmountReg.onChange(e);
                  }}
                />
              </Field>
              <Field label="LTV (decimal, updates fund)">
                <Input
                  type="number"
                  step="0.00001"
                  {...ltvReg}
                  onChange={(e) => {
                    setSyncSource("ltv");
                    ltvReg.onChange(e);
                  }}
                />
              </Field>
              <Field label="Funding Base Rate (updates fund)">
                <Input type="number" step="0.00001" {...form.register("fundingBaseRate")} />
              </Field>
              <Field label="Funding Spread (updates fund)">
                <Input type="number" step="0.00001" {...form.register("fundingSpread")} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Notes">
                  <Textarea rows={3} {...form.register("notes")} />
                </Field>
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Units</TableHead>
            <TableHead>NAV</TableHead>
            <TableHead>Gross Amount</TableHead>
            <TableHead>Loan Amount</TableHead>
            <TableHead>Commission %</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((tx) => (
            <TableRow key={tx.id}>
              <TableCell>{tx.date}</TableCell>
              <TableCell className={tx.type === "BUY" ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"}>
                {tx.type}
              </TableCell>
              <TableCell>{tx.units.toLocaleString(undefined, { maximumFractionDigits: 5 })}</TableCell>
              <TableCell>{formatCurrency(tx.nav, fund.currency)}</TableCell>
              <TableCell>{formatCurrency(tx.units * tx.nav, fund.currency)}</TableCell>
              <TableCell>{formatCurrency(tx.loanAmount ?? 0, fund.currency)}</TableCell>
                  <TableCell>{tx.commissionPct.toFixed(2)}%</TableCell>
              <TableCell>{tx.notes || "-"}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(tx)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => onDelete(tx.id)}>
                    Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-secondary/35 p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function computeLtvFromBase(loanAmount: number, baseAmount: number) {
  return baseAmount > 0 ? loanAmount / baseAmount : 0;
}
