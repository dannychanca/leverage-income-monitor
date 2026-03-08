import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatChartCurrency(value: number, currency: string = "USD") {
  const safe = Number.isFinite(value) ? value : 0;
  return formatCurrency(Math.round(safe), currency);
}

export function formatBps(value: number) {
  return `${value.toFixed(0)} bps`;
}

export function formatMonth(month: string) {
  if (!month) return "-";
  const [year, m] = month.split("-");
  return `${year}-${m}`;
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
