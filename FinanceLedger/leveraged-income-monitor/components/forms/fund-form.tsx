"use client";

import { useState, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Fund } from "@/lib/types/models";
import { FundFormValues, fundSchema } from "@/lib/types/schemas";
import { usePortfolio } from "@/lib/store/portfolio-store";
import { defaultForcedLiquidationThreshold } from "@/lib/utils/calculations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function FundForm({ fund }: { fund?: Fund }) {
  const router = useRouter();
  const { addFund, updateFund, data } = usePortfolio();
  const [isFetchingYahoo, setIsFetchingYahoo] = useState(false);
  const [yahooMessage, setYahooMessage] = useState<string | null>(null);
  const isCreateMode = !fund;

  const defaults = useMemo<FundFormValues>(
    () => ({
      fundName: fund?.fundName ?? "",
      manager: fund?.manager ?? "",
      ticker: fund?.ticker ?? "",
      currency: fund?.currency ?? data.settings.baseCurrency,
      unitsHeld: fund?.unitsHeld ?? 0,
      currentNav: fund?.currentNav ?? 0,
      averageCost: fund?.averageCost ?? 0,
      loanAmount: fund?.loanAmount ?? 0,
      fundingBaseRate: fund?.fundingBaseRate ?? 0,
      fundingSpread: fund?.fundingSpread ?? 0,
      dividendFrequency: fund?.dividendFrequency ?? "MONTHLY",
      dividendPaymentDay: fund?.dividendPaymentDay ?? 28,
      dividendPerUnit: fund?.dividendPerUnit ?? 0,
      warningLtvThreshold: fund?.warningLtvThreshold ?? data.settings.defaultWarningThreshold,
      marginCallLtvThreshold:
        fund?.marginCallLtvThreshold ?? data.settings.defaultMarginCallThreshold,
      forcedLiquidationLtvThreshold:
        fund?.forcedLiquidationLtvThreshold ??
        defaultForcedLiquidationThreshold(
          fund?.marginCallLtvThreshold ?? data.settings.defaultMarginCallThreshold
        ),
      notes: fund?.notes ?? "",
    }),
    [fund, data.settings]
  );

  const form = useForm<FundFormValues>({
    resolver: zodResolver(fundSchema),
    defaultValues: defaults,
  });

  const onSubmit = form.handleSubmit((values) => {
    if (fund) {
      updateFund(fund.id, values);
      router.push(`/funds/${fund.id}`);
      return;
    }

    const createValues: FundFormValues = {
      ...values,
      unitsHeld: 0,
      averageCost: 0,
      loanAmount: 0,
      fundingBaseRate: 0,
      fundingSpread: 0,
    };
    const id = addFund(createValues);
    router.push(`/funds/${id}?onboarding=add-transaction`);
  });

  const fetchFromYahoo = async () => {
    const ticker = form.getValues("ticker").trim();
    if (!ticker) {
      setYahooMessage("Enter a Yahoo ticker first.");
      return;
    }

    setIsFetchingYahoo(true);
    setYahooMessage(null);
    try {
      const res = await fetch(`/api/yahoo/quote?ticker=${encodeURIComponent(ticker)}`);
      const payload = (await res.json()) as {
        error?: string;
        ticker?: string;
        fundName?: string;
        currency?: string | null;
        price?: number | null;
        dividendPerUnit?: number | null;
        dividendPaymentDay?: number | null;
        dividendFrequency?: FundFormValues["dividendFrequency"] | null;
        warning?: string | null;
      };

      if (!res.ok || payload.error) {
        setYahooMessage(payload.error || "Yahoo fetch failed.");
        return;
      }

      if (payload.ticker) form.setValue("ticker", payload.ticker);
      if (payload.fundName && !form.getValues("fundName")) form.setValue("fundName", payload.fundName);
      if (typeof payload.price === "number" && payload.price > 0) form.setValue("currentNav", payload.price);
      if (typeof payload.dividendPerUnit === "number" && payload.dividendPerUnit >= 0) {
        form.setValue("dividendPerUnit", payload.dividendPerUnit);
      }
      if (
        typeof payload.dividendPaymentDay === "number" &&
        payload.dividendPaymentDay >= 1 &&
        payload.dividendPaymentDay <= 31
      ) {
        form.setValue("dividendPaymentDay", payload.dividendPaymentDay);
      }
      if (
        payload.dividendFrequency &&
        ["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"].includes(payload.dividendFrequency)
      ) {
        form.setValue("dividendFrequency", payload.dividendFrequency);
      }

      const allowedCurrencies = new Set(["USD", "EUR", "GBP", "SGD", "HKD"]);
      if (payload.currency && allowedCurrencies.has(payload.currency)) {
        form.setValue("currency", payload.currency as FundFormValues["currency"]);
      } else if (payload.currency) {
        setYahooMessage(
          `Fetched quote, but currency ${payload.currency} is not in current app list (USD/EUR/GBP/SGD/HKD).`
        );
        return;
      }

      setYahooMessage(
        payload.warning || "Yahoo data fetched. Review dividend frequency/day/per-unit and save."
      );
    } catch {
      setYahooMessage("Unable to fetch Yahoo data.");
    } finally {
      setIsFetchingYahoo(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Fund Name" error={form.formState.errors.fundName?.message}>
        <Input {...form.register("fundName")} />
      </Field>
      <Field label="Manager" error={form.formState.errors.manager?.message}>
        <Input {...form.register("manager")} />
      </Field>
      <Field label="Ticker" error={form.formState.errors.ticker?.message}>
        <div className="flex gap-2">
          <Input {...form.register("ticker")} placeholder="e.g. 0P0000XMS6.SI" />
          <Button type="button" variant="outline" onClick={fetchFromYahoo} disabled={isFetchingYahoo}>
            {isFetchingYahoo ? "Fetching..." : "Fetch Yahoo"}
          </Button>
        </div>
        {yahooMessage ? <p className="text-xs text-muted-foreground">{yahooMessage}</p> : null}
      </Field>
      <Field label="Currency" error={form.formState.errors.currency?.message}>
        <Select {...form.register("currency")}>
          {(["USD", "EUR", "GBP", "SGD", "HKD"] as const).map((ccy) => (
            <option key={ccy} value={ccy}>
              {ccy}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Current NAV / Price" error={form.formState.errors.currentNav?.message}>
        <Input type="number" step="0.00001" {...form.register("currentNav")} />
      </Field>
      {isCreateMode ? (
        <div className="md:col-span-2 rounded border border-cyan-100 bg-cyan-50 p-3 text-sm text-muted-foreground">
          Position fields are transaction-derived. After creating this fund, add your first transaction
          to initialize units, cost basis, loan, and funding rates.
        </div>
      ) : (
        <>
          <Field label="Units Held" error={form.formState.errors.unitsHeld?.message}>
            <Input type="number" step="0.01" {...form.register("unitsHeld")} />
          </Field>
          <Field label="Average Cost" error={form.formState.errors.averageCost?.message}>
            <Input type="number" step="0.00001" {...form.register("averageCost")} />
          </Field>
          <Field label="Loan Amount" error={form.formState.errors.loanAmount?.message}>
            <Input type="number" step="0.01" {...form.register("loanAmount")} />
          </Field>
          <Field label="Funding Base Rate" error={form.formState.errors.fundingBaseRate?.message}>
            <Input type="number" step="0.00001" {...form.register("fundingBaseRate")} />
          </Field>
          <Field label="Funding Spread" error={form.formState.errors.fundingSpread?.message}>
            <Input type="number" step="0.00001" {...form.register("fundingSpread")} />
          </Field>
        </>
      )}
      <Field label="Dividend Frequency" error={form.formState.errors.dividendFrequency?.message}>
        <Select {...form.register("dividendFrequency")}>
          <option value="MONTHLY">Monthly</option>
          <option value="QUARTERLY">Quarterly</option>
          <option value="SEMI_ANNUAL">Semi-Annual</option>
          <option value="ANNUAL">Annual</option>
        </Select>
      </Field>
      <Field label="Dividend Payment Day" error={form.formState.errors.dividendPaymentDay?.message}>
        <Input type="number" step="1" min="1" max="31" {...form.register("dividendPaymentDay")} />
      </Field>
      <Field label="Dividend per Unit" error={form.formState.errors.dividendPerUnit?.message}>
        <Input type="number" step="0.00001" {...form.register("dividendPerUnit")} />
      </Field>
      <Field
        label="Warning LTV Threshold"
        error={form.formState.errors.warningLtvThreshold?.message}
      >
        <Input type="number" step="0.00001" {...form.register("warningLtvThreshold")} />
      </Field>
      <Field
        label="Margin Call LTV Threshold"
        error={form.formState.errors.marginCallLtvThreshold?.message}
      >
        <Input type="number" step="0.00001" {...form.register("marginCallLtvThreshold")} />
      </Field>
      <Field
        label="Forced Liquidation LTV Threshold"
        error={form.formState.errors.forcedLiquidationLtvThreshold?.message}
      >
        <Input type="number" step="0.00001" {...form.register("forcedLiquidationLtvThreshold")} />
      </Field>

      <div className="md:col-span-2">
        <Field label="Notes" error={form.formState.errors.notes?.message}>
          <Textarea rows={4} {...form.register("notes")} />
        </Field>
      </div>

      <div className="md:col-span-2 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit">{fund ? "Save Changes" : "Create Fund"}</Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
