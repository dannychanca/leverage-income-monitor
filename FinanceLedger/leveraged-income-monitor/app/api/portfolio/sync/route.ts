import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { seedData } from "@/lib/data/seed";
import { ensurePortfolioDataShape } from "@/lib/data/shape";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { PortfolioData } from "@/lib/types/models";
import { createAutoBackupIfDue } from "@/lib/server/portfolio-backups";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.email;

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: userId } });
  if (!user) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const record = await prisma.portfolio.findUnique({ where: { userId: user.id } });

  if (!record) {
    return NextResponse.json(
      { updatedAt: null, data: ensurePortfolioDataShape(seedData) },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    {
      updatedAt: record.updatedAt.toISOString(),
      data: ensurePortfolioDataShape(record.data as unknown as PortfolioData),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email;

  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  try {
    const body = (await req.json()) as {
      data?: PortfolioData;
      baseUpdatedAt?: string | null;
    };

    const shaped = ensurePortfolioDataShape(body.data ?? seedData);
    const current = await prisma.portfolio.findUnique({ where: { userId: user.id } });

    if (current && current.updatedAt && body.baseUpdatedAt) {
      const currentIso = current.updatedAt.toISOString();
      if (currentIso !== body.baseUpdatedAt) {
        return NextResponse.json(
          {
            ok: false,
            error: "Conflict: data was updated from another session.",
            updatedAt: currentIso,
            data: ensurePortfolioDataShape(current.data as unknown as PortfolioData),
          },
          { status: 409 }
        );
      }
    }

    if (current?.data) {
      const currentData = ensurePortfolioDataShape(current.data as unknown as PortfolioData);
      const incomingJson = JSON.stringify(shaped);
      const currentJson = JSON.stringify(currentData);
      if (incomingJson !== currentJson) {
        await createAutoBackupIfDue(user.id, currentData);
      }
    }

    const saved = await prisma.portfolio.upsert({
      where: { userId: user.id },
      create: { userId: user.id, data: shaped as unknown as Prisma.InputJsonValue },
      update: { data: shaped as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json(
      { ok: true, updatedAt: saved.updatedAt.toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }
}
