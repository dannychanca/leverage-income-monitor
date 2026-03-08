"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  WalletCards,
  FlaskConical,
  Settings,
  Database,
  CalendarRange,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/funds", label: "Funds", icon: WalletCards },
  { href: "/cashflow", label: "Monthly Cashflow Log", icon: CalendarRange },
  { href: "/stress", label: "Stress Test Lab", icon: FlaskConical },
  { href: "/import-export", label: "Import/Export", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname.startsWith("/auth/");
  const { data: session, status } = useSession();

  if (isAuthPage) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Leveraged Income Monitor</h1>
            <p className="text-xs text-muted-foreground">Portfolio carry, leverage, and scenario analytics</p>
          </div>
          <div className="flex items-center gap-2">
            {status === "loading" ? <span className="text-xs text-muted-foreground">Checking session...</span> : null}
            {session?.user?.email ? (
              <>
                <Badge variant="secondary" className="max-w-[190px] truncate">
                  {session.user.email}
                </Badge>
                <Badge>{session.user.role}</Badge>
                <Button size="sm" variant="outline" onClick={() => signOut({ callbackUrl: "/auth/signin" })}>
                  <LogOut className="mr-1 h-3 w-3" />
                  Sign out
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-3 py-4 md:grid-cols-[240px_1fr] md:px-6 md:py-6">
        <aside className="overflow-x-auto md:overflow-visible">
          <nav className="flex gap-2 md:flex-col">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex min-w-max items-center gap-2 rounded-md border px-3 py-2 text-sm",
                    active ? "bg-primary text-primary-foreground" : "bg-white hover:bg-secondary"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main>{children}</main>
      </div>
    </div>
  );
}
