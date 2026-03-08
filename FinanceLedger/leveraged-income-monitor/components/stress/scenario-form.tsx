"use client";

import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Scenario } from "@/lib/types/models";
import {
  scenarioPercentInputSchema,
  ScenarioFormValues,
  ScenarioPercentInputFormValues,
} from "@/lib/types/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toScenarioDecimalValues, toScenarioPercentInput } from "@/lib/utils/calculations";

export function ScenarioForm({
  onSubmit,
  scenario,
}: {
  onSubmit: (values: ScenarioFormValues) => void;
  scenario?: Scenario;
}) {
  const form = useForm<ScenarioPercentInputFormValues>({
    resolver: zodResolver(scenarioPercentInputSchema),
    defaultValues: {
      ...(scenario
        ? toScenarioPercentInput(scenario)
        : {
            name: "",
            navChangePct: 0,
            dividendChangePct: 0,
            fundingRateShockBps: 0,
            loanAmountChangePct: 0,
            fxChangePct: 0,
            haircutMarginAssumption: 0,
          }),
    },
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => onSubmit(toScenarioDecimalValues(values)))}
      className="grid grid-cols-1 gap-3 md:grid-cols-2"
    >
      <Field label="Scenario Name">
        <Input {...form.register("name")} />
      </Field>
      <Field label="NAV Change %">
        <Input type="number" step="0.01" {...form.register("navChangePct")} />
      </Field>
      <Field label="Dividend Change %">
        <Input type="number" step="0.01" {...form.register("dividendChangePct")} />
      </Field>
      <Field label="Funding Rate Shock (bps)">
        <Input type="number" step="1" {...form.register("fundingRateShockBps")} />
      </Field>
      <Field label="Loan Amount Change %">
        <Input type="number" step="0.01" {...form.register("loanAmountChangePct")} />
      </Field>
      <Field label="FX Change %">
        <Input type="number" step="0.01" {...form.register("fxChangePct")} />
      </Field>
      <Field label="Haircut/Margin Assumption %">
        <Input type="number" step="0.01" {...form.register("haircutMarginAssumption")} />
      </Field>
      <div className="md:col-span-2 flex justify-end">
        <Button type="submit">Save Scenario</Button>
      </div>
    </form>
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
