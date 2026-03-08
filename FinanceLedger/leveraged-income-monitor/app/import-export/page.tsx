"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePortfolio } from "@/lib/store/portfolio-store";
import { PortfolioData } from "@/lib/types/models";
import { Input } from "@/components/ui/input";
import { formatMonth } from "@/lib/utils";

interface BackupItem {
  id: string;
  source: "AUTO_SYNC" | "MANUAL" | "PRE_IMPORT" | "PRE_RESTORE";
  note: string | null;
  createdAt: string;
}

export default function ImportExportPage() {
  const { exportData, importData } = usePortfolio();
  const [json, setJson] = useState("");
  const [message, setMessage] = useState("");
  const [backupNote, setBackupNote] = useState("");
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  const onExport = () => {
    setJson(exportData());
    setMessage("Exported current portfolio to JSON text box.");
  };

  const onDownload = () => {
    const blob = new Blob([exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leveraged-income-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadBackups = async () => {
    try {
      const res = await fetch("/api/portfolio/backups?limit=40", { cache: "no-store" });
      const payload = (await res.json()) as { backups?: BackupItem[] };
      if (res.ok) {
        setBackups(payload.backups ?? []);
      }
    } catch {
      setBackups([]);
    }
  };

  useEffect(() => {
    void loadBackups();
  }, []);

  const createManualBackup = async () => {
    setIsBusy(true);
    try {
      const data = JSON.parse(exportData()) as PortfolioData;
      const res = await fetch("/api/portfolio/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, source: "MANUAL", note: backupNote || "Manual backup" }),
      });
      if (!res.ok) {
        setMessage("Unable to create backup.");
      } else {
        setBackupNote("");
        setMessage("Manual backup created.");
        await loadBackups();
      }
    } catch {
      setMessage("Unable to create backup.");
    } finally {
      setIsBusy(false);
    }
  };

  const onImport = async () => {
    try {
      const parsed = JSON.parse(json) as PortfolioData;
      const currentData = JSON.parse(exportData()) as PortfolioData;
      await fetch("/api/portfolio/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: currentData,
          source: "PRE_IMPORT",
          note: "Automatic snapshot before JSON import",
        }),
      });
      importData(parsed);
      setMessage("Imported portfolio JSON successfully.");
      await loadBackups();
    } catch {
      setMessage("Invalid JSON. Import failed.");
    }
  };

  const restoreBackup = async (backupId: string) => {
    setIsBusy(true);
    try {
      const res = await fetch("/api/portfolio/backups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupId }),
      });
      const payload = (await res.json()) as { data?: PortfolioData; error?: string };
      if (!res.ok || !payload.data) {
        setMessage(payload.error ?? "Restore failed.");
      } else {
        importData(payload.data);
        setMessage("Backup restored successfully.");
        await loadBackups();
      }
    } catch {
      setMessage("Restore failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const removeBackup = async (backupId: string) => {
    setIsBusy(true);
    try {
      const res = await fetch(`/api/portfolio/backups?backupId=${encodeURIComponent(backupId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setMessage("Unable to delete backup.");
      } else {
        setMessage("Backup deleted.");
        await loadBackups();
      }
    } catch {
      setMessage("Unable to delete backup.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Import/Export Data"
        subtitle="Backup portfolio state to JSON and restore data when needed."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">JSON Backup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={onExport}>Load Current Data</Button>
            <Button variant="outline" onClick={onDownload}>
              Download JSON File
            </Button>
            <Button variant="secondary" onClick={() => void onImport()} disabled={isBusy}>
              Import from Text
            </Button>
          </div>

          <Textarea
            rows={18}
            placeholder="Portfolio JSON appears here"
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />

          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Backup Guardrails</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Auto snapshots are created periodically during sync. Create manual backups before major edits.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Optional note for manual backup"
              value={backupNote}
              onChange={(e) => setBackupNote(e.target.value)}
              className="max-w-sm"
            />
            <Button onClick={() => void createManualBackup()} disabled={isBusy}>
              Create Manual Backup
            </Button>
            <Button variant="outline" onClick={() => void loadBackups()} disabled={isBusy}>
              Refresh Backups
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-secondary/30">
                <tr>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Note</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => (
                  <tr key={backup.id} className="border-t">
                    <td className="px-3 py-2">{formatMonth(backup.createdAt.slice(0, 10))} {new Date(backup.createdAt).toLocaleTimeString()}</td>
                    <td className="px-3 py-2">{backup.source}</td>
                    <td className="px-3 py-2">{backup.note ?? "-"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void restoreBackup(backup.id)}
                          disabled={isBusy}
                        >
                          Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void removeBackup(backup.id)}
                          disabled={isBusy}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {backups.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-muted-foreground" colSpan={4}>
                      No backups found yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
