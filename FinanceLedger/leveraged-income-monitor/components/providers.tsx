"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { PortfolioProvider } from "@/lib/store/portfolio-store";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <PortfolioProvider>{children}</PortfolioProvider>
    </SessionProvider>
  );
}
