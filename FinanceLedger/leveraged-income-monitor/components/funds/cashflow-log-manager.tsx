"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CashflowFormValues,
  cashflowSchema,
  FundingCostEntryFormValues,
  fundingCostEntrySchema,
} from "@/lib/types/schemas";
import { Fund, FundingCostEntry, MonthlyCashflowRecord } from "@/lib/types/models";
import { usePortfolio } from "@/lib/store/portfolio-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { buildCashflowPrefillDefaults, buildEffectiveFunds } from "@/lib/utils/calculations";

const emptyValues: CashflowFormValues = {
  month: "",
  nav: 0,
  dividendPerUnit: 0,
  totalDividendReceived: 0,
  fundingRate: 0,
  totalFundingCost: 0,
  fundingCostOverridden: false,
  netCarry: 0,
  source: "manual",
  comments: "",
};

const emptyFundingEntry: FundingCostEntryFormValues = {
  date: "",
  amount: 0,
  notes: "",
};

export function CashflowLogManager({
  fund,
  fundId,
  records,
  fundingCostEntries,
  currency,
}: {
  fund: Fund;
  fundId: string;
  records: MonthlyCashflowRecord[];
  fundingCostEntries: FundingCostEntry[];
  currency: string;
}) {
  const {
    data,
    addMonthlyRecord,
    updateMonthlyRecord,
    deleteMonthlyRecord,
    addFundingCostEntry,
    updateFundingCostEntry,
    deleteFundingCostEntry,
  } = usePortfolio();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MonthlyCashflowRecord | null>(null);
  const [fundingOpen, setFundingOpen] = useState(false);
  const [editingFunding, setEditingFunding] = useState<FundingCostEntry | null>(null);

  const form = useForm<CashflowFormValues>({
    resolver: zodResolver(cashflowSchema),
    defaultValues: emptyValues,
  });

  const fundingForm = useForm<FundingCostEntryFormValues>({
    resolver: zodResolver(fundingCostEntrySchema),
    defaultValues: emptyFundingEntry,
  });

  const fundingByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of fundingCostEntries) {
      const month = e.date.slice(0, 7);
      map.set(month, (map.get(month) ?? 0) + e.amount);
    }
    return map;
  }, [fundingCostEntries]);

  const effectiveFund = useMemo(
    () => buildEffectiveFunds(data.funds, data.transactions).find((f) => f.id === fundId) ?? fund,
    [data.funds, data.transactions, fund, fundId]
  );

  const openCreate = () => {
    setEditing(null);
    const defaults = buildCashflowPrefillDefaults(effectiveFund, records);
    form.reset({
      ...emptyValues,
      ...defaults,
      fundingCostOverridden: false,
      comments: "",
    });
    setOpen(true);
  };

  const openEdit = (record: MonthlyCashflowRecord) => {
    setEditing(record);
    form.reset({
      month: record.month,
      nav: record.nav,
      dividendPerUnit: record.dividendPerUnit,
      totalDividendReceived: record.totalDividendReceived,
      fundingRate: record.fundingRate,
      totalFundingCost: record.totalFundingCost,
      fundingCostOverridden: record.fundingCostOverridden ?? false,
      netCarry: record.netCarry,
      source: "manual",
      comments: record.comments ?? "",
    });
    setOpen(true);
  };

  const onSubmit = form.handleSubmit((values) => {
    const fundingCostOverridden = values.fundingCostOverridden ?? false;
    const totalFundingCost = fundingCostOverridden
      ? values.totalFundingCost
      : (fundingByMonth.get(values.month) ?? values.totalFundingCost);

    const payload = {
      ...values,
      totalFundingCost,
      fundingCostOverridden,
      netCarry: values.totalDividendReceived - totalFundingCost,
      source: "manual" as const,
    };

    if (editing) {
      updateMonthlyRecord(editing.id, payload);
    } else {
      addMonthlyRecord({ ...payload, fundId });
    }
    setOpen(false);
  });

  const openFundingCreate = () => {
    setEditingFunding(null);
    fundingForm.reset({
      ...emptyFundingEntry,
      date: new Date().toISOString().slice(0, 10),
    });
    setFundingOpen(true);
  };

  const openFundingEdit = (entry: FundingCostEntry) => {
    setEditingFunding(entry);
    fundingForm.reset({
      date: entry.date,
      amount: entry.amount,
      notes: entry.notes ?? "",
    });
    setFundingOpen(true);
  };

  const onFundingSubmit = fundingForm.handleSubmit((values) => {
    if (editingFunding) {
      updateFundingCostEntry(editingFunding.id, values);
    } else {
      addFundingCostEntry({ ...values, fundId });
    }
    setFundingOpen(false);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Dialog open={fundingOpen} onOpenChange={setFundingOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" onClick={openFundingCreate}>
              Add Funding Cost Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editingFunding ? "Edit Funding Cost Entry" : "Add Funding Cost Entry"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={onFundingSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Date">
                <Input type="date" {...fundingForm.register("date")} />
              </Field>
              <Field label="Amount">
                <Input type="number" step="0.01" {...fundingForm.register("amount")} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Notes">
                  <Textarea rows={3} {...fundingForm.register("notes")} />
                </Field>
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setFundingOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save Funding Entry</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>Add Monthly Record</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Monthly Record" : "Add Monthly Record"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Month (YYYY-MM)">
                <Input placeholder="2026-03" {...form.register("month")} />
              </Field>
              <Field label="NAV">
                <Input type="number" step="0.00001" {...form.register("nav")} />
              </Field>
              <Field label="Dividend per Unit">
                <Input type="number" step="0.00001" {...form.register("dividendPerUnit")} />
              </Field>
              <Field label="Total Dividend Received">
                <Input type="number" step="0.00001" {...form.register("totalDividendReceived")} />
              </Field>
              <Field label="Funding Rate">
                <Input type="number" step="0.00001" {...form.register("fundingRate")} />
              </Field>
              <div className="space-y-1">
                <Label className="flex items-center justify-between">
                  <span>Total Funding Cost</span>
                  <span className="text-xs text-muted-foreground">
                    {form.watch("fundingCostOverridden") ? "Manual override" : "From dated entries"}
                  </span>
                </Label>
                <Input type="number" step="0.00001" {...form.register("totalFundingCost")} />
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" {...form.register("fundingCostOverridden")} />
                  Override monthly funding cost
                </label>
              </div>
              <Field label="Net Carry">
                <Input type="number" step="0.00001" {...form.register("netCarry")} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Comments">
                  <Textarea rows={3} {...form.register("comments")} />
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

      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Funding Cost Entries</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Month</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fundingCostEntries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{entry.date}</TableCell>
                <TableCell>{entry.date.slice(0, 7)}</TableCell>
                <TableCell>{formatCurrency(entry.amount, currency)}</TableCell>
                <TableCell>{entry.notes || "-"}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openFundingEdit(entry)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteFundingCostEntry(entry.id)}>
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Monthly Cashflow Records</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead>NAV</TableHead>
              <TableHead>Dividend</TableHead>
              <TableHead>Funding Cost</TableHead>
              <TableHead>Net Carry</TableHead>
              <TableHead>Funding Rate</TableHead>
              <TableHead>Override</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id}>
                <TableCell>{record.month}</TableCell>
                <TableCell>{formatCurrency(record.nav, currency)}</TableCell>
                <TableCell>{formatCurrency(record.totalDividendReceived, currency)}</TableCell>
                <TableCell>{formatCurrency(record.totalFundingCost, currency)}</TableCell>
                <TableCell>{formatCurrency(record.netCarry, currency)}</TableCell>
                <TableCell>{formatPercent(record.fundingRate)}</TableCell>
                <TableCell>{record.fundingCostOverridden ? "Yes" : "No"}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(record)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteMonthlyRecord(record.id)}>
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
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
