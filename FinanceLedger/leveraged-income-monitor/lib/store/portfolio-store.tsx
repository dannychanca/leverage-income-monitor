"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { seedData } from "@/lib/data/seed";
import { ensurePortfolioDataShape } from "@/lib/data/shape";
import {
  Fund, FundingCostEntry, FundTransaction, MonthlyCashflowRecord, PortfolioData, Scenario, Settings,
} from "@/lib/types/models";
import {
  aggregateFundingCostsByMonth,
  deriveFinancingFromTransactions,
  generateCashflowsFromTransactions,
  mergeGeneratedAndManualMonthlyRecords,
} from "@/lib/utils/calculations";
import { uid } from "@/lib/utils";

const STORAGE_KEY = "leveraged-income-monitor:v1";

interface PortfolioContextValue {
  data: PortfolioData;
  isLoaded: boolean;
  addFund: (fund: Omit<Fund, "id" | "createdAt" | "updatedAt">) => string;
  updateFund: (id: string, updates: Partial<Fund>) => void;
  deleteFund: (id: string) => void;
  addMonthlyRecord: (record: Omit<MonthlyCashflowRecord, "id">) => void;
  updateMonthlyRecord: (id: string, updates: Partial<MonthlyCashflowRecord>) => void;
  deleteMonthlyRecord: (id: string) => void;
  addFundingCostEntry: (entry: Omit<FundingCostEntry, "id">) => void;
  updateFundingCostEntry: (id: string, updates: Partial<FundingCostEntry>) => void;
  deleteFundingCostEntry: (id: string) => void;
  autoGenerateCashflows: (fundId: string, endDate?: string) => void;
  addTransaction: (transaction: Omit<FundTransaction, "id">) => void;
  updateTransaction: (id: string, updates: Partial<FundTransaction>) => void;
  deleteTransaction: (id: string) => void;
  addScenario: (scenario: Omit<Scenario, "id">) => void;
  updateScenario: (id: string, updates: Partial<Scenario>) => void;
  deleteScenario: (id: string) => void;
  updateSettings: (updates: Partial<Settings>) => void;
  refreshFundNav: (fundId: string) => Promise<{ updated: boolean; message: string }>;
  refreshAllFundNavs: () => Promise<{ updated: number; attempted: number }>;
  resetToSeed: () => void;
  importData: (nextData: PortfolioData) => void;
  exportData: () => string;
  pullFromSharedBackend: () => Promise<{ ok: boolean; message: string }>;
  pushToSharedBackend: () => Promise<{ ok: boolean; message: string }>;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

function nowIso() {
  return new Date().toISOString();
}

function applyFundingCostsToFundRecords(
  records: MonthlyCashflowRecord[],
  entries: FundingCostEntry[],
  fund: Fund
) {
  const sums = aggregateFundingCostsByMonth(entries, fund.id);
  const allInFundingRate = fund.fundingBaseRate + fund.fundingSpread;
  const byMonth = new Map(records.map((r) => [r.month, r]));
  const months = new Set<string>([...records.map((r) => r.month), ...sums.keys()]);

  for (const month of months) {
    const existing = byMonth.get(month);
    const sumFunding = sums.get(month);
    if (!existing) {
      if (sumFunding === undefined) continue;
      byMonth.set(month, {
        id: uid("cf"),
        fundId: fund.id,
        month,
        nav: fund.currentNav,
        dividendPerUnit: 0,
        totalDividendReceived: 0,
        fundingRate: allInFundingRate,
        totalFundingCost: sumFunding,
        fundingCostOverridden: false,
        netCarry: -sumFunding,
        source: "generated",
        comments: "Auto-created from funding cost entries",
      });
      continue;
    }

    if (existing.fundingCostOverridden) {
      byMonth.set(month, existing);
      continue;
    }

    if (sumFunding === undefined) {
      byMonth.set(month, {
        ...existing,
        fundingRate: allInFundingRate,
        netCarry: existing.totalDividendReceived - existing.totalFundingCost,
      });
      continue;
    }

    byMonth.set(month, {
      ...existing,
      fundingRate: allInFundingRate,
      totalFundingCost: sumFunding,
      netCarry: existing.totalDividendReceived - sumFunding,
    });
  }

  return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
}

function reconcileFundAutoCashflows(prev: PortfolioData, fundId: string, endDate?: string): PortfolioData {
  const fund = prev.funds.find((f) => f.id === fundId);
  if (!fund) return prev;

  const savedTransactions = prev.transactions.filter((tx) => tx.fundId === fundId);
  const fundTransactions =
    savedTransactions.length > 0
      ? savedTransactions
      : fund.unitsHeld > 0
        ? [
            {
              id: uid("txseed"),
              fundId,
              type: "BUY" as const,
              date: fund.createdAt.slice(0, 10),
              units: fund.unitsHeld,
              nav: fund.averageCost > 0 ? fund.averageCost : fund.currentNav,
              grossAmount: fund.unitsHeld * (fund.averageCost > 0 ? fund.averageCost : fund.currentNav),
              commissionPct: 0,
              loanAmount: fund.loanAmount,
              fundingBaseRate: fund.fundingBaseRate,
              fundingSpread: fund.fundingSpread,
              notes: "Synthetic transaction for auto-generation",
            },
          ]
        : [];

  const derivedFinancing = deriveFinancingFromTransactions(
    fundTransactions,
    fund.loanAmount,
    fund.fundingBaseRate,
    fund.fundingSpread
  );
  const effectiveFund = {
    ...fund,
    loanAmount: derivedFinancing.loanAmount,
    fundingBaseRate: derivedFinancing.fundingBaseRate,
    fundingSpread: derivedFinancing.fundingSpread,
  };
  const generated = generateCashflowsFromTransactions(effectiveFund, fundTransactions, endDate).map((r) => ({
    ...r,
    id: uid("cf"),
    fundId,
  }));

  const existingFundRecords = prev.monthlyRecords.filter((r) => r.fundId === fundId);
  const mergedGeneratedAndManual = mergeGeneratedAndManualMonthlyRecords(existingFundRecords, generated);
  const mergedFundRecords = applyFundingCostsToFundRecords(
    mergedGeneratedAndManual,
    prev.fundingCostEntries,
    effectiveFund
  );

  return {
    ...prev,
    monthlyRecords: [
      ...prev.monthlyRecords.filter((r) => r.fundId !== fundId),
      ...mergedFundRecords,
    ].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PortfolioData>(seedData);
  const [isLoaded, setIsLoaded] = useState(false);
  const [sharedUpdatedAt, setSharedUpdatedAt] = useState<string | null>(null);
  const [didInitialSyncLoad, setDidInitialSyncLoad] = useState(false);
  const sharedUpdatedAtRef = useRef<string | null>(null);

  useEffect(() => {
    sharedUpdatedAtRef.current = sharedUpdatedAt;
  }, [sharedUpdatedAt]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await fetch("/api/portfolio/sync", { cache: "no-store" });
        if (res.ok) {
          const snapshot = (await res.json()) as {
            updatedAt?: string | null;
            data?: PortfolioData;
          };
          if (active) {
            setData(ensurePortfolioDataShape(snapshot.data ?? seedData));
            setSharedUpdatedAt(snapshot.updatedAt ?? null);
            setIsLoaded(true);
            setDidInitialSyncLoad(true);
          }
          return;
        }
      } catch {
        // Fallback to local cache below.
      }

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as PortfolioData;
          if (active) setData(ensurePortfolioDataShape(parsed));
        }
      } catch {
        if (active) setData(seedData);
      } finally {
        if (active) {
          setIsLoaded(true);
          setDidInitialSyncLoad(true);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !didInitialSyncLoad) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      void fetch("/api/portfolio/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, baseUpdatedAt: sharedUpdatedAtRef.current }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (res.status === 401) return;
          if (res.status === 409) {
            const conflict = (await res.json()) as {
              updatedAt?: string | null;
              data?: PortfolioData;
            };
            if (conflict.data) {
              setData(ensurePortfolioDataShape(conflict.data));
              setSharedUpdatedAt(conflict.updatedAt ?? null);
            }
            return;
          }
          if (!res.ok) return;
          const payload = (await res.json()) as { updatedAt?: string | null };
          setSharedUpdatedAt(payload.updatedAt ?? null);
        })
        .catch(() => {
        // Keep local save even if backend sync fails.
        });
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [data, didInitialSyncLoad, isLoaded]);

  const addFund = useCallback((fund: Omit<Fund, "id" | "createdAt" | "updatedAt">) => {
    const id = uid("fund");
    const now = nowIso();
    setData((prev) => ({
      ...prev,
      funds: [...prev.funds, { ...fund, id, createdAt: now, updatedAt: now }],
    }));
    return id;
  }, []);

  const updateFund = useCallback((id: string, updates: Partial<Fund>) => {
    setData((prev) => ({
      ...prev,
      funds: prev.funds.map((fund) =>
        fund.id === id ? { ...fund, ...updates, updatedAt: nowIso() } : fund
      ),
    }));
  }, []);

  const deleteFund = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      funds: prev.funds.filter((fund) => fund.id !== id),
      monthlyRecords: prev.monthlyRecords.filter((record) => record.fundId !== id),
      fundingCostEntries: prev.fundingCostEntries.filter((entry) => entry.fundId !== id),
      transactions: prev.transactions.filter((tx) => tx.fundId !== id),
    }));
  }, []);

  const addMonthlyRecord = useCallback((record: Omit<MonthlyCashflowRecord, "id">) => {
    setData((prev) => ({
      ...prev,
      monthlyRecords: [...prev.monthlyRecords, { ...record, id: uid("cf"), source: "manual" }],
    }));
  }, []);

  const updateMonthlyRecord = useCallback((id: string, updates: Partial<MonthlyCashflowRecord>) => {
    setData((prev) => ({
      ...prev,
      monthlyRecords: prev.monthlyRecords.map((record) =>
        record.id === id ? { ...record, ...updates } : record
      ),
    }));
  }, []);

  const deleteMonthlyRecord = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      monthlyRecords: prev.monthlyRecords.filter((record) => record.id !== id),
    }));
  }, []);

  const addFundingCostEntry = useCallback((entry: Omit<FundingCostEntry, "id">) => {
    setData((prev) => {
      const fund = prev.funds.find((f) => f.id === entry.fundId);
      if (!fund) return prev;
      const nextEntries = [...prev.fundingCostEntries, { ...entry, id: uid("fc") }];
      const fundRecords = prev.monthlyRecords.filter((r) => r.fundId === entry.fundId);
      const otherRecords = prev.monthlyRecords.filter((r) => r.fundId !== entry.fundId);
      const updatedFundRecords = applyFundingCostsToFundRecords(fundRecords, nextEntries, fund);
      return {
        ...prev,
        fundingCostEntries: nextEntries,
        monthlyRecords: [...otherRecords, ...updatedFundRecords].sort((a, b) => a.month.localeCompare(b.month)),
      };
    });
  }, []);

  const updateFundingCostEntry = useCallback((id: string, updates: Partial<FundingCostEntry>) => {
    setData((prev) => {
      const existing = prev.fundingCostEntries.find((e) => e.id === id);
      if (!existing) return prev;
      const nextEntries = prev.fundingCostEntries.map((e) => (e.id === id ? { ...e, ...updates } : e));
      const fundId = updates.fundId ?? existing.fundId;
      const fund = prev.funds.find((f) => f.id === fundId);
      if (!fund) return { ...prev, fundingCostEntries: nextEntries };
      const fundRecords = prev.monthlyRecords.filter((r) => r.fundId === fundId);
      const otherRecords = prev.monthlyRecords.filter((r) => r.fundId !== fundId);
      const updatedFundRecords = applyFundingCostsToFundRecords(fundRecords, nextEntries, fund);
      return {
        ...prev,
        fundingCostEntries: nextEntries,
        monthlyRecords: [...otherRecords, ...updatedFundRecords].sort((a, b) => a.month.localeCompare(b.month)),
      };
    });
  }, []);

  const deleteFundingCostEntry = useCallback((id: string) => {
    setData((prev) => {
      const existing = prev.fundingCostEntries.find((e) => e.id === id);
      if (!existing) return prev;
      const nextEntries = prev.fundingCostEntries.filter((e) => e.id !== id);
      const fund = prev.funds.find((f) => f.id === existing.fundId);
      if (!fund) return { ...prev, fundingCostEntries: nextEntries };
      const fundRecords = prev.monthlyRecords.filter((r) => r.fundId === existing.fundId);
      const otherRecords = prev.monthlyRecords.filter((r) => r.fundId !== existing.fundId);
      const updatedFundRecords = applyFundingCostsToFundRecords(fundRecords, nextEntries, fund);
      return {
        ...prev,
        fundingCostEntries: nextEntries,
        monthlyRecords: [...otherRecords, ...updatedFundRecords].sort((a, b) => a.month.localeCompare(b.month)),
      };
    });
  }, []);

  const autoGenerateCashflows = useCallback(
    (fundId: string, endDate?: string) => {
      setData((prev) => reconcileFundAutoCashflows(prev, fundId, endDate));
    },
    []
  );

  const addTransaction = useCallback((transaction: Omit<FundTransaction, "id">) => {
    setData((prev) =>
      reconcileFundAutoCashflows(
        {
          ...prev,
          transactions: [...prev.transactions, { ...transaction, id: uid("tx") }],
        },
        transaction.fundId
      )
    );
  }, []);

  const updateTransaction = useCallback((id: string, updates: Partial<FundTransaction>) => {
    setData((prev) => {
      const existing = prev.transactions.find((tx) => tx.id === id);
      if (!existing) return prev;
      const updatedFundId = updates.fundId ?? existing.fundId;
      let next = {
        ...prev,
        transactions: prev.transactions.map((tx) => (tx.id === id ? { ...tx, ...updates } : tx)),
      };
      next = reconcileFundAutoCashflows(next, existing.fundId);
      if (updatedFundId !== existing.fundId) {
        next = reconcileFundAutoCashflows(next, updatedFundId);
      }
      return next;
    });
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    setData((prev) => {
      const existing = prev.transactions.find((tx) => tx.id === id);
      if (!existing) return prev;
      return reconcileFundAutoCashflows(
        {
          ...prev,
          transactions: prev.transactions.filter((tx) => tx.id !== id),
        },
        existing.fundId
      );
    });
  }, []);

  const addScenario = useCallback((scenario: Omit<Scenario, "id">) => {
    setData((prev) => ({
      ...prev,
      scenarios: [...prev.scenarios, { ...scenario, id: uid("sc") }],
    }));
  }, []);

  const updateScenario = useCallback((id: string, updates: Partial<Scenario>) => {
    setData((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((scenario) =>
        scenario.id === id ? { ...scenario, ...updates } : scenario
      ),
    }));
  }, []);

  const deleteScenario = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      scenarios: prev.scenarios.filter((scenario) => scenario.id !== id),
    }));
  }, []);

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setData((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...updates },
    }));
  }, []);

  const refreshFundNav = useCallback(
    async (fundId: string) => {
      const fund = data.funds.find((f) => f.id === fundId);
      if (!fund) return { updated: false, message: "Fund not found." };
      if (!fund.ticker?.trim()) return { updated: false, message: "Ticker is required for NAV refresh." };

      try {
        const res = await fetch(`/api/yahoo/quote?ticker=${encodeURIComponent(fund.ticker.trim())}`);
        const payload = (await res.json()) as { error?: string; price?: number | null };
        if (!res.ok || payload.error) {
          return { updated: false, message: payload.error || "Failed to refresh NAV." };
        }

        if (typeof payload.price === "number" && payload.price > 0) {
          updateFund(fundId, { currentNav: payload.price });
          return { updated: true, message: `Updated NAV to ${payload.price.toFixed(4)}.` };
        }

        return { updated: false, message: "No valid NAV/price returned from Yahoo." };
      } catch {
        return { updated: false, message: "Unable to refresh NAV." };
      }
    },
    [data.funds, updateFund]
  );

  const refreshAllFundNavs = useCallback(async () => {
    const fundsWithTicker = data.funds.filter((f) => f.ticker?.trim());
    let updated = 0;

    for (const fund of fundsWithTicker) {
      const result = await refreshFundNav(fund.id);
      if (result.updated) updated += 1;
    }

    return { updated, attempted: fundsWithTicker.length };
  }, [data.funds, refreshFundNav]);

  const resetToSeed = useCallback(() => {
    setData(seedData);
  }, []);

  const importData = useCallback((nextData: PortfolioData) => {
    setData(ensurePortfolioDataShape(nextData));
  }, []);

  const exportData = useCallback(() => JSON.stringify(data, null, 2), [data]);

  const pullFromSharedBackend = useCallback(async () => {
    try {
      const res = await fetch("/api/portfolio/sync", { cache: "no-store" });
      if (res.status === 401) return { ok: false, message: "Sign in required." };
      if (!res.ok) return { ok: false, message: "Pull failed." };
      const snapshot = (await res.json()) as {
        updatedAt?: string | null;
        data?: PortfolioData;
      };
      setData(ensurePortfolioDataShape(snapshot.data ?? seedData));
      setSharedUpdatedAt(snapshot.updatedAt ?? null);
      return { ok: true, message: "Pulled latest shared portfolio data." };
    } catch {
      return { ok: false, message: "Unable to pull from shared backend." };
    }
  }, []);

  const pushToSharedBackend = useCallback(async () => {
    try {
      const res = await fetch("/api/portfolio/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, baseUpdatedAt: sharedUpdatedAt }),
      });
      if (res.status === 401) return { ok: false, message: "Sign in required." };
      if (res.status === 409) {
        const conflict = (await res.json()) as {
          updatedAt?: string | null;
          data?: PortfolioData;
        };
        if (conflict.data) {
          setData(ensurePortfolioDataShape(conflict.data));
          setSharedUpdatedAt(conflict.updatedAt ?? null);
        }
        return { ok: false, message: "Push blocked: shared data is newer. Pulled latest instead." };
      }
      if (!res.ok) return { ok: false, message: "Push failed." };
      const payload = (await res.json()) as { updatedAt?: string | null };
      setSharedUpdatedAt(payload.updatedAt ?? null);
      return { ok: true, message: "Pushed local data to shared backend." };
    } catch {
      return { ok: false, message: "Unable to push to shared backend." };
    }
  }, [data, sharedUpdatedAt]);

  const value = useMemo(
    () => ({
      data,
      isLoaded,
      addFund,
      updateFund,
      deleteFund,
      addMonthlyRecord,
      updateMonthlyRecord,
      deleteMonthlyRecord,
      autoGenerateCashflows,
      addFundingCostEntry,
      updateFundingCostEntry,
      deleteFundingCostEntry,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addScenario,
      updateScenario,
      deleteScenario,
      updateSettings,
      refreshFundNav,
      refreshAllFundNavs,
      resetToSeed,
      importData,
      exportData,
      pullFromSharedBackend,
      pushToSharedBackend,
    }),
    [
      data,
      isLoaded,
      addFund,
      updateFund,
      deleteFund,
      addMonthlyRecord,
      updateMonthlyRecord,
      deleteMonthlyRecord,
      autoGenerateCashflows,
      addFundingCostEntry,
      updateFundingCostEntry,
      deleteFundingCostEntry,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addScenario,
      updateScenario,
      deleteScenario,
      updateSettings,
      refreshFundNav,
      refreshAllFundNavs,
      resetToSeed,
      importData,
      exportData,
      pullFromSharedBackend,
      pushToSharedBackend,
    ]
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) {
    throw new Error("usePortfolio must be used within PortfolioProvider");
  }
  return ctx;
}
