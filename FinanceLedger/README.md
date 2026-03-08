# FinanceLedger (iOS 17)

SwiftUI + SwiftData personal finance app focused on fast account + transaction recording in the style of Pocket Expense.

## Implemented scope
- Accounts: create/edit/delete/archive Asset or Liability accounts with opening balance.
- Transactions: create/edit/delete income, expense, and linked two-leg transfers.
- Account detail: month-grouped transaction list, search, optional date filter, hide cleared, reconcile mode quick-clear.
- Master data: category and payee management screens.
- Net worth + balances:
  - `currentBalance = openingBalance + Σ(transactionEffects)`
  - `netWorth = Σ(assetBalances) - Σ(liabilityBalances)`
- Import-ready scaffolding (v2-ready):
  - transaction source/status/external fields
  - card issuer/last4 account metadata
  - `ImportService` protocol with `MockImportService` and `HTTPImportService` stub
  - Auto-Import settings section with inbox placeholder + card mapping UI + mock sync

## Transfer leg design
Transfers are stored as two `Transaction` rows sharing the same `transferId`:
- `transferOut` in source account (`transferAccountId` points to destination)
- `transferIn` in destination account (`transferAccountId` points to source)

Editing any transfer leg updates both legs. Deleting any transfer leg deletes both legs.

## Import dedupe pipeline
For each imported DTO:
1. If local transaction has same `externalId`, update status/details.
2. Else if local transaction has same `importHash`, skip.
3. Else insert as new transaction (`source = .email`) and map `issuer + last4` to account.
4. If no mapping exists, assign to `Unassigned Imports` liability account.

## Security/privacy assumptions
- Last-4 and issuer only; no full PAN.
- HTTPS-only expectation for real backend.
- Minimal PII persisted locally (`merchant`, `amount`, `timestamp`, statuses).
- Auth is currently stubbed; designed to be replaced with Sign in with Apple later.

## Run
1. Open `/Users/dannychan/Library/Mobile Documents/com~apple~CloudDocs/Codex Folder/FinanceLedger/FinanceLedger.xcodeproj` in Xcode.
2. Select the `FinanceLedger` scheme.
3. Run on iOS 17+ simulator/device.

## Notes
- Currency formatting currently defaults to SGD style (`$` with 2 decimals and separators).
- Budgets and bills are intentionally omitted for v1.
- Cloud sync and bank integrations are not implemented in v1.
