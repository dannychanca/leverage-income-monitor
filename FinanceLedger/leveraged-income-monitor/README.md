# Leveraged Income Monitor (MVP)

Responsive portfolio analytics web app for monitoring leveraged income funds with multi-fund support, monthly cashflow tracking, and stress testing.

## Stack
- Next.js (App Router)
- React + TypeScript
- Tailwind CSS
- shadcn-style component primitives
- Recharts
- Zod + React Hook Form
- NextAuth (Google + Email magic link)
- Prisma + SQLite (user auth + per-user portfolio sync)

## Features Implemented
- Portfolio Dashboard with:
  - total portfolio market value
  - total loan outstanding
  - equity value
  - weighted average LTV
  - total monthly dividend income
  - total monthly funding cost
  - total monthly net carry
  - annualized net carry on equity
- Charts:
  - dividends over time
  - funding costs over time
  - net carry over time
  - LTV trend over time
- Multi-fund CRUD:
  - add/edit/delete financed funds
  - full required fund fields
  - Yahoo ticker assist: fetch fund name, quote currency, and latest price from Yahoo Finance
  - NAV refresh actions (per-fund and refresh-all from dashboard) using ticker quote lookup
  - transaction ledger per fund (BUY/SELL with date, units, NAV, gross amount, commission %, notes)
  - transaction edit modal can update fund financing inputs (loan amount or LTV, base rate, spread)
  - fund financing can be derived from transaction entries (loan amounts summed across transactions; rates derived from transaction financing)
  - fund detail holdings (units, average cost, cost basis) auto-reflect transaction history
- Monthly cashflow tracking:
  - per-fund manual add/edit/delete records
  - auto-generate cashflows from transactions + dividend settings (frequency, payment day, dividend per unit)
  - generation runs up to today (or a provided end date) based on units held at each payout date
  - cashflow table and chart
- Stress Test Lab:
  - default scenarios (Base, Mild, Severe, Recovery/Upside)
  - custom scenario add/edit/delete
  - stressed output table with margin-call breach warnings
  - holding-period P/L analysis with user-input years and NAV decline
  - outputs: dividends, funding cost, unrealized capital P/L, total strategy P/L
  - holding-period starting NAV is based on average purchase price (average cost)
  - enter NAV decline as a percent (example: `5` means `5%`)
  - holding-period ending NAV uses: `ending NAV = starting NAV x (1 - NAV decline % / 100)`
  - stress test matrix: rows are NAV decline in `0.5%` increments, columns are holding period in `3-month` increments, cells show net strategy P/L
  - matrix supports optional overrides for starting NAV, funding rate, and funding amount
- Risk monitoring:
  - warning/margin LTV thresholds
  - negative carry
  - funding > dividend
  - large NAV shock vulnerability
- Screens:
  - Dashboard (`/dashboard`)
  - Funds (`/funds`)
  - Fund Detail (`/funds/[id]`)
  - Add/Edit Fund (`/funds/new`, `/funds/[id]/edit`)
  - Monthly Cashflow Log index (`/cashflow`) + per fund (`/funds/[id]/cashflow`)
  - Stress Test Lab (`/stress`)
  - Settings (`/settings`)
  - Import/Export Data (`/import-export`)
- Data persistence:
  - per-user backend sync (`/api/portfolio/sync`) after sign-in
  - localStorage fallback cache (`leveraged-income-monitor:v1`)
  - import/export JSON backup
  - seeded sample data for PIMCO GIS Income Fund
- Access control:
   - sign-in required
   - each signed-in user has isolated portfolio data
   - role model (`ADMIN` / `TESTER`) from `ADMIN_EMAILS`
   - admin-only reset control in settings
- Auth UX polish:
  - signed-in identity + role badge + sign-out in app header
  - clearer sign-in error states
  - button loading states for Google and magic link
- Backup guardrails:
  - automatic server-side sync snapshots (timestamped)
  - manual snapshot create/restore/delete in Import/Export
  - automatic pre-import and pre-restore safety snapshots

## Project Structure

```text
leveraged-income-monitor/
  app/
    page.tsx
    layout.tsx
    globals.css
    auth/signin/page.tsx
    api/auth/[...nextauth]/route.ts
    api/portfolio/backups/route.ts
    api/portfolio/sync/route.ts
    dashboard/page.tsx
    funds/page.tsx
    funds/new/page.tsx
    funds/[id]/page.tsx
    funds/[id]/edit/page.tsx
    funds/[id]/cashflow/page.tsx
    cashflow/page.tsx
    stress/page.tsx
    settings/page.tsx
    import-export/page.tsx

  components/
    layout/
      app-shell.tsx
      page-header.tsx
    dashboard/
      summary-card.tsx
    charts/
      time-series-cards.tsx
      fund-cashflow-chart.tsx
    funds/
      risk-chip.tsx
      cashflow-log-manager.tsx
      transaction-log-manager.tsx
    forms/
      fund-form.tsx
    stress/
      scenario-form.tsx
      scenario-results-table.tsx
    ui/
      badge.tsx
      button.tsx
      card.tsx
      dialog.tsx
      input.tsx
      label.tsx
      select.tsx
      separator.tsx
      switch.tsx
      table.tsx
      textarea.tsx

  lib/
    data/
      shape.ts
      seed.ts
    auth-options.ts
    auth-roles.ts
    prisma.ts
    server/
      portfolio-backups.ts
    store/
      portfolio-store.tsx
      use-fund.ts
    types/
      models.ts
      schemas.ts
    utils/
      calculations.ts
    utils.ts

  package.json
  tsconfig.json
  tailwind.config.ts
  postcss.config.mjs
  next.config.ts
  middleware.ts
  prisma/
    schema.prisma
    dev.db
  .eslintrc.json
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
```

Set values in `.env`:
- `NEXTAUTH_SECRET`
- `ADMIN_EMAILS` (comma-separated admin emails)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Google sign-in)
- `EMAIL_SERVER` / `EMAIL_FROM` (email magic link)

3. Start dev server:
```bash
npm run dev
```

4. Open:
```text
http://localhost:3000
```

5. Sign in at:
```text
/auth/signin
```

## Core Calculations
Centralized in `lib/utils/calculations.ts`:
- `marketValue = unitsHeld * currentNav`
- `costBasis = unitsHeld * averageCost`
- `unrealizedPnL = marketValue - costBasis`
- `equity = marketValue - loanAmount`
- `ltv = loanAmount / marketValue`
- `monthlyDividend = (unitsHeld * dividendPerUnit * payoutsPerYear(dividendFrequency)) / 12`
- `monthlyFundingCost = loanAmount * allInFundingRate / 12`
- `netCarry = monthlyDividend - monthlyFundingCost`
- `netPnL (monthly view) = unrealizedPnL + netCarry`
- `netPnL (annual carry view) = unrealizedPnL + (netCarry * 12)`
- `annualizedNetCarryOnEquity = (netCarry * 12) / equity`
- Scenario engine formulas for stressed NAV/MV/dividend/funding/LTV/equity/margin buffer

## Assumptions
- Single-currency valuation display per fund; no live FX feeds in v1.
- `fundingBaseRate` and `fundingSpread` are decimal rates (e.g. `0.047` = 4.7%).
- Thresholds are decimal ratios (e.g. `0.65` = 65%).
- Monthly cashflow entries are user-managed manual records (no auto-sync).
- Import JSON expects the `PortfolioData` shape used in `lib/types/models.ts`.

## Notes
- Auth + sync requires configured providers and a running backend.
- Seeded sample starts with one PIMCO GIS Income Fund and multiple monthly records/scenarios.
- Yahoo quote fetch uses an unofficial Yahoo endpoint and only auto-maps currencies currently supported in app (`USD`, `EUR`, `GBP`, `SGD`, `HKD`).
