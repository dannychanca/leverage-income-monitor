"use client";

import { useState, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { usePortfolio } from "@/lib/store/portfolio-store";
import { signOut, useSession } from "next-auth/react";

export default function SettingsPage() {
  const { data, updateSettings, resetToSeed, pullFromSharedBackend, pushToSharedBackend } = usePortfolio();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [baseCurrency, setBaseCurrency] = useState(data.settings.baseCurrency);
  const [shockThreshold, setShockThreshold] = useState(data.settings.largeNavShockThresholdPct);
  const [warningThreshold, setWarningThreshold] = useState(data.settings.defaultWarningThreshold);
  const [marginThreshold, setMarginThreshold] = useState(data.settings.defaultMarginCallThreshold);
  const [syncMessage, setSyncMessage] = useState("");

  const save = () => {
    updateSettings({
      baseCurrency,
      largeNavShockThresholdPct: shockThreshold,
      defaultWarningThreshold: warningThreshold,
      defaultMarginCallThreshold: marginThreshold,
    });
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Configure defaults and risk limits for new positions." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">General Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-secondary/35 p-3">
            <p className="text-sm font-medium">Account Sync</p>
            <p className="text-xs text-muted-foreground">
              Signed in as: {session?.user?.email ?? "Unknown"}
            </p>
            <p className="text-xs text-muted-foreground">
              Role: {session?.user?.role ?? "TESTER"}
            </p>
            <p className="text-xs text-muted-foreground">
              Session expires: {session?.expires ? new Date(session.expires).toLocaleString() : "Unknown"}
            </p>
          </div>

          <Field label="Base Currency">
            <Select value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value as typeof baseCurrency)}>
              {(["USD", "EUR", "GBP", "SGD", "HKD"] as const).map((ccy) => (
                <option key={ccy} value={ccy}>
                  {ccy}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Large NAV Shock Threshold (decimal, e.g. 0.12)">
            <Input type="number" step="0.00001" value={shockThreshold} onChange={(e) => setShockThreshold(Number(e.target.value))} />
          </Field>

          <Field label="Default Warning LTV Threshold">
            <Input type="number" step="0.00001" value={warningThreshold} onChange={(e) => setWarningThreshold(Number(e.target.value))} />
          </Field>

          <Field label="Default Margin Call LTV Threshold">
            <Input type="number" step="0.00001" value={marginThreshold} onChange={(e) => setMarginThreshold(Number(e.target.value))} />
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save}>Save Settings</Button>
            <Button
              variant="secondary"
              onClick={async () => {
                const result = await pullFromSharedBackend();
                setSyncMessage(result.message);
              }}
            >
              Pull Shared Data
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                const result = await pushToSharedBackend();
                setSyncMessage(result.message);
              }}
            >
              Push Local Data
            </Button>
            <Button variant="outline" onClick={() => signOut({ callbackUrl: "/auth/signin" })}>
              Sign Out
            </Button>
            {isAdmin ? (
              <Button variant="outline" onClick={resetToSeed}>
                Reset to Seed Data
              </Button>
            ) : null}
          </div>

          {syncMessage ? <p className="text-sm text-muted-foreground">{syncMessage}</p> : null}
          {!isAdmin ? (
            <p className="text-xs text-muted-foreground">
              Tester role active: reset action is restricted to admins.
            </p>
          ) : null}
        </CardContent>
      </Card>
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
