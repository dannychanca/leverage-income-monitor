import { prisma } from "@/lib/prisma";
import type { PortfolioData } from "@/lib/types/models";
import { uid } from "@/lib/utils";

export type BackupSource = "AUTO_SYNC" | "MANUAL" | "PRE_IMPORT" | "PRE_RESTORE";

export interface BackupListItem {
  id: string;
  source: BackupSource;
  note: string | null;
  createdAt: string;
}

interface BackupRow {
  id: string;
  source: BackupSource;
  note: string | null;
  data: string;
  createdAt: string;
}

const AUTO_BACKUP_WINDOW_MS = 6 * 60 * 60 * 1000;
const MAX_BACKUPS_PER_USER = 200;

async function ensureBackupsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS portfolio_backups (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      source TEXT NOT NULL,
      note TEXT,
      data TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_portfolio_backups_user_created
    ON portfolio_backups(userId, createdAt DESC)
  `);
}

export async function createBackup(params: {
  userId: string;
  data: PortfolioData;
  source: BackupSource;
  note?: string;
}) {
  await ensureBackupsTable();

  const id = uid("bkp");
  const payload = JSON.stringify(params.data);
  const note = params.note ?? null;

  await prisma.$executeRawUnsafe(
    `INSERT INTO portfolio_backups (id, userId, source, note, data, createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    id,
    params.userId,
    params.source,
    note,
    payload
  );

  await prisma.$executeRawUnsafe(
    `
    DELETE FROM portfolio_backups
    WHERE userId = ?
      AND id NOT IN (
        SELECT id
        FROM portfolio_backups
        WHERE userId = ?
        ORDER BY datetime(createdAt) DESC
        LIMIT ?
      )
    `,
    params.userId,
    params.userId,
    MAX_BACKUPS_PER_USER
  );

  return id;
}

export async function createAutoBackupIfDue(userId: string, data: PortfolioData) {
  await ensureBackupsTable();

  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT id, source, note, data, createdAt
    FROM portfolio_backups
    WHERE userId = ? AND source = 'AUTO_SYNC'
    ORDER BY datetime(createdAt) DESC
    LIMIT 1
    `,
    userId
  )) as BackupRow[];

  const latest = rows[0];
  if (!latest) {
    await createBackup({ userId, data, source: "AUTO_SYNC", note: "Automatic sync snapshot" });
    return;
  }

  const latestMs = new Date(latest.createdAt).getTime();
  const nowMs = Date.now();
  if (!Number.isFinite(latestMs) || nowMs - latestMs >= AUTO_BACKUP_WINDOW_MS) {
    await createBackup({ userId, data, source: "AUTO_SYNC", note: "Automatic sync snapshot" });
  }
}

export async function listBackups(userId: string, limit = 30) {
  await ensureBackupsTable();
  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT id, source, note, createdAt
    FROM portfolio_backups
    WHERE userId = ?
    ORDER BY datetime(createdAt) DESC
    LIMIT ?
    `,
    userId,
    Math.max(1, Math.min(limit, MAX_BACKUPS_PER_USER))
  )) as Array<{ id: string; source: BackupSource; note: string | null; createdAt: string }>;

  return rows.map(
    (row): BackupListItem => ({
      id: row.id,
      source: row.source,
      note: row.note,
      createdAt: new Date(row.createdAt).toISOString(),
    })
  );
}

export async function getBackupData(userId: string, backupId: string) {
  await ensureBackupsTable();
  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT id, source, note, data, createdAt
    FROM portfolio_backups
    WHERE userId = ? AND id = ?
    LIMIT 1
    `,
    userId,
    backupId
  )) as BackupRow[];

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    note: row.note,
    createdAt: new Date(row.createdAt).toISOString(),
    data: JSON.parse(row.data) as PortfolioData,
  };
}

export async function deleteBackup(userId: string, backupId: string) {
  await ensureBackupsTable();
  await prisma.$executeRawUnsafe(
    `DELETE FROM portfolio_backups WHERE userId = ? AND id = ?`,
    userId,
    backupId
  );
}

