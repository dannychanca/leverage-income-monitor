import { NextRequest, NextResponse } from "next/server";

type YahooQuote = {
  symbol?: string;
  longName?: string;
  shortName?: string;
  currency?: string;
  regularMarketPrice?: number;
  navPrice?: number;
};

type YahooChartPayload = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        shortName?: string;
        longName?: string;
        currency?: string;
        regularMarketPrice?: number;
      };
      events?: {
        dividends?: Record<
          string,
          {
            amount?: number;
            date?: number;
          }
        >;
      };
    }>;
  };
};

type DividendFrequency = "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";

const RATE_LIMIT_MESSAGE =
  "Yahoo is rate-limiting requests from this environment (HTTP 429). Please try again later or enter values manually.";

function inferDividendFrequency(dates: Date[]): DividendFrequency | null {
  if (dates.length < 2) return null;
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const diffs: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const days = (sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24);
    if (days > 0) diffs.push(days);
  }
  if (diffs.length === 0) return null;
  const avgDays = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  if (avgDays <= 45) return "MONTHLY";
  if (avgDays <= 135) return "QUARTERLY";
  if (avgDays <= 240) return "SEMI_ANNUAL";
  return "ANNUAL";
}

export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get("ticker") || "").trim();
  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
  }

  try {
    const commonHeaders = {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
    };

    const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
      ticker
    )}`;
    const quoteRes = await fetch(quoteUrl, {
      headers: commonHeaders,
      next: { revalidate: 0 },
    });

    let quoteData: {
      ticker: string;
      fundName: string;
      currency: string | null;
      price: number | null;
    } | null = null;

    if (quoteRes.ok) {
      const payload = (await quoteRes.json()) as {
        quoteResponse?: {
          result?: YahooQuote[];
        };
      };

      const quote = payload.quoteResponse?.result?.[0];
      if (quote) {
        quoteData = {
          ticker: quote.symbol ?? ticker,
          fundName: quote.longName || quote.shortName || ticker,
          currency: quote.currency || null,
          price: quote.regularMarketPrice ?? quote.navPrice ?? null,
        };
      }
    }

    if (quoteRes.status === 429 && !quoteData) {
      return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
    }

    // First chart call gets latest price and metadata fallback.
    const chartUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d&region=SG&lang=en-US`;
    const chartRes = await fetch(chartUrl, {
      headers: {
        ...commonHeaders,
      },
      next: { revalidate: 0 },
    });

    if (!chartRes.ok) {
      if (chartRes.status === 429 && quoteData) {
        return NextResponse.json({
          ...quoteData,
          dividendPerUnit: null,
          dividendPaymentDay: null,
          dividendFrequency: null,
          warning: RATE_LIMIT_MESSAGE,
        });
      }
      if (chartRes.status === 429) return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
      return NextResponse.json(
        { error: `Yahoo quote request failed (${quoteRes.status}/${chartRes.status})` },
        { status: 502 }
      );
    }

    const chartPayload = (await chartRes.json()) as YahooChartPayload;

    const meta = chartPayload.chart?.result?.[0]?.meta;
    if (!quoteData && !meta) {
      return NextResponse.json({ error: "Ticker not found on Yahoo Finance" }, { status: 404 });
    }

    // Second chart call tries to fetch dividend events for inference.
    const divUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      ticker
    )}?range=5y&interval=1mo&events=div&region=SG&lang=en-US`;
    const divRes = await fetch(divUrl, {
      headers: { ...commonHeaders },
      next: { revalidate: 0 },
    });

    let dividendPerUnit: number | null = null;
    let dividendPaymentDay: number | null = null;
    let dividendFrequency: DividendFrequency | null = null;
    let warning: string | null = null;
    if (divRes.status === 429) {
      warning = RATE_LIMIT_MESSAGE;
    } else if (divRes.ok) {
      const divPayload = (await divRes.json()) as YahooChartPayload;
      const dividends = divPayload.chart?.result?.[0]?.events?.dividends;
      if (dividends) {
        const points = Object.values(dividends)
          .map((d) => ({
            amount: typeof d.amount === "number" ? d.amount : null,
            date: typeof d.date === "number" ? new Date(d.date * 1000) : null,
          }))
          .filter((d) => d.amount !== null && d.date !== null) as Array<{ amount: number; date: Date }>;

        if (points.length > 0) {
          points.sort((a, b) => b.date.getTime() - a.date.getTime());
          dividendPerUnit = points[0].amount;
          const days = points.map((p) => p.date.getDate());
          const dayCounts = new Map<number, number>();
          for (const day of days) dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
          dividendPaymentDay = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
          dividendFrequency = inferDividendFrequency(points.map((p) => p.date));
        }
      }
    }

    return NextResponse.json({
      ticker: quoteData?.ticker ?? meta?.symbol ?? ticker,
      fundName: quoteData?.fundName ?? meta?.longName ?? meta?.shortName ?? ticker,
      currency: quoteData?.currency ?? meta?.currency ?? null,
      price: quoteData?.price ?? meta?.regularMarketPrice ?? null,
      dividendPerUnit,
      dividendPaymentDay,
      dividendFrequency,
      warning,
    });
  } catch {
    return NextResponse.json({ error: "Unable to fetch Yahoo quote" }, { status: 500 });
  }
}
