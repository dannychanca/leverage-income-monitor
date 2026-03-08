import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { ensurePortfolioDataShape } from "@/lib/data/shape";
import { seedData } from "@/lib/data/seed";
import type { PortfolioData } from "@/lib/types/models";
import {
  createBackup,
  deleteBackup,
  getBackupData,
  listBackups,
  type BackupSource,
} from "@/lib/server/portfolio-backups";

export const runtime = "nodejs";

async function resolveUser() {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email;
  if (!userEmail) return null;
  return prisma.user.findUnique({ where: { email: userEmail } });
}

export async function GET(req: Request) {
  const user = await resolveUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "30");
  const backups = await listBackups(user.id, limit);
  return NextResponse.json({ ok: true, backups }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const user = await resolveUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      data?: PortfolioData;
      source?: BackupSource;
      note?: string;
    };

    const portfolioData = ensurePortfolioDataShape(body.data ?? seedData);
    const source = body.source ?? "MANUAL";
    const id = await createBackup({
      userId: user.id,
      data: portfolioData,
      source,
      note: body.note,
    });
    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const user = await resolveUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { backupId?: string };
    const backupId = body.backupId;
    if (!backupId) {
      return NextResponse.json({ ok: false, error: "backupId is required" }, { status: 400 });
    }

    const backup = await getBackupData(user.id, backupId);
    if (!backup) {
      return NextResponse.json({ ok: false, error: "Backup not found" }, { status: 404 });
    }

    const current = await prisma.portfolio.findUnique({ where: { userId: user.id } });
    if (current?.data) {
      await createBackup({
        userId: user.id,
        data: ensurePortfolioDataShape(current.data as unknown as PortfolioData),
        source: "PRE_RESTORE",
        note: `Pre-restore snapshot before restoring ${backupId}`,
      });
    }

    const saved = await prisma.portfolio.upsert({
      where: { userId: user.id },
      create: { userId: user.id, data: backup.data as unknown as Prisma.InputJsonValue },
      update: { data: backup.data as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json({
      ok: true,
      updatedAt: saved.updatedAt.toISOString(),
      data: ensurePortfolioDataShape(saved.data as unknown as PortfolioData),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to restore backup" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const user = await resolveUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const backupId = url.searchParams.get("backupId");
  if (!backupId) {
    return NextResponse.json({ ok: false, error: "backupId is required" }, { status: 400 });
  }

  await deleteBackup(user.id, backupId);
  return NextResponse.json({ ok: true });
}
