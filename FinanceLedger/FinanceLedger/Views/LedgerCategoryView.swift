import SwiftUI
import SwiftData

struct AccountDetailView: View {
    let account: Account

    @Environment(\.modelContext) private var context

    @Query(sort: [SortDescriptor(\Transaction.date, order: .reverse)])
    private var allTransactions: [Transaction]

    @Query(sort: [SortDescriptor(\Account.sortOrder), SortDescriptor(\Account.name)])
    private var allAccounts: [Account]

    @State private var hideCleared = false
    @State private var reconcileMode = false
    @State private var searchText = ""
    @State private var filterByDate = false
    @State private var startDate = Calendar.current.date(byAdding: .month, value: -1, to: .now) ?? .now
    @State private var endDate: Date = .now
    @State private var showEditor = false
    @State private var editingTransaction: Transaction?

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(.sRGB, red: 0.02, green: 0.03, blue: 0.06, opacity: 1), Color(.sRGB, red: 0.07, green: 0.09, blue: 0.13, opacity: 1)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            List {
                Section {
                    accountHeaderCard
                }
                .listRowBackground(Color.clear)

                Section {
                    Toggle("Hide Cleared", isOn: $hideCleared)
                    Toggle("Reconcile Mode", isOn: $reconcileMode)

                    Toggle("Date Filter", isOn: $filterByDate)
                    if filterByDate {
                        DatePicker("Start", selection: $startDate, displayedComponents: .date)
                        DatePicker("End", selection: $endDate, displayedComponents: .date)
                    }
                }

                ForEach(groupedMonths, id: \.monthKey) { section in
                    Section(section.title) {
                        ForEach(section.items, id: \.id) { tx in
                            TransactionRow(
                                transaction: tx,
                                account: account,
                                peerAccountName: peerAccountName(for: tx),
                                runningBalance: runningBalances[tx.id],
                                reconcileMode: reconcileMode,
                                onToggleCleared: {
                                    tx.cleared.toggle()
                                    tx.updatedAt = .now
                                    try? context.save()
                                }
                            ) {
                                if reconcileMode {
                                    tx.cleared.toggle()
                                    tx.updatedAt = .now
                                    try? context.save()
                                } else {
                                    editingTransaction = tx
                                    showEditor = true
                                }
                            }
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
        }
        .navigationTitle(account.name)
        .searchable(text: $searchText, prompt: "Search payee, category, notes")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    editingTransaction = nil
                    showEditor = true
                } label: {
                    Image(systemName: "plus")
                }
            }

            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink {
                    AccountEditorSheet(account: account)
                } label: {
                    Image(systemName: "square.and.pencil")
                }
            }
        }
        .sheet(isPresented: $showEditor) {
            TransactionEditorSheet(defaultAccount: account, editing: editingTransaction)
        }
    }

    private var accountTransactions: [Transaction] {
        allTransactions.filter { $0.account.id == account.id }
    }

    private var filteredTransactions: [Transaction] {
        Array(accountTransactions).filter { tx in
            if hideCleared && tx.cleared { return false }

            if filterByDate {
                if tx.date < Calendar.current.startOfDay(for: startDate) { return false }
                if tx.date > Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: endDate)) ?? endDate { return false }
            }

            if searchText.isEmpty { return true }
            let needle = searchText.lowercased()
            let payee = tx.payee?.name.lowercased() ?? ""
            let category = tx.category?.name.lowercased() ?? ""
            let notes = tx.notes.lowercased()
            return payee.contains(needle) || category.contains(needle) || notes.contains(needle)
        }
        .sorted { $0.date > $1.date }
    }

    private var groupedMonths: [TransactionMonthSection] {
        let groups = Dictionary(grouping: filteredTransactions) { tx in
            let comps = Calendar.current.dateComponents([.year, .month], from: tx.date)
            return DateComponents(year: comps.year, month: comps.month)
        }

        return groups.compactMap { key, items in
            guard let date = Calendar.current.date(from: key) else { return nil }
            return TransactionMonthSection(monthDate: date, items: items.sorted(by: { $0.date > $1.date }))
        }
        .sorted(by: { $0.monthDate > $1.monthDate })
    }

    private var runningBalances: [UUID: Decimal] {
        let sortedAsc = accountTransactions.sorted(by: { $0.date < $1.date })
        var rolling = account.openingBalance
        var map: [UUID: Decimal] = [:]

        for tx in sortedAsc {
            rolling += AccountingEngine.effect(entryType: tx.entryType, accountType: account.type, amount: tx.amount)
            map[tx.id] = rolling
        }
        return map
    }

    private var accountHeaderCard: some View {
        let balance = AccountingEngine.accountBalance(account, transactions: allTransactions)

        return VStack(alignment: .leading, spacing: 8) {
            Text(account.type.title)
                .font(.caption)
                .foregroundStyle(.secondary)

            Text(MoneyFormatter.currency(balance, code: account.currencyCode))
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .foregroundStyle(.white)

            Text("Opening: \(MoneyFormatter.currency(account.openingBalance, code: account.currencyCode))")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(
                    LinearGradient(colors: account.cardStyle.gradientColors, startPoint: .topLeading, endPoint: .bottomTrailing)
                )
        )
    }

    private func peerAccountName(for tx: Transaction) -> String {
        guard let peerId = tx.transferAccountId else { return "" }
        return allAccounts.first(where: { $0.id == peerId })?.name ?? "Other Account"
    }
}

struct TransactionMonthSection {
    let monthDate: Date
    let items: [Transaction]

    var monthKey: String {
        "\(Calendar.current.component(.year, from: monthDate)):\(Calendar.current.component(.month, from: monthDate))"
    }

    var title: String {
        monthDate.formatted(.dateTime.year().month(.wide))
    }
}

struct TransactionRow: View {
    let transaction: Transaction
    let account: Account
    let peerAccountName: String
    let runningBalance: Decimal?
    let reconcileMode: Bool
    let onToggleCleared: () -> Void
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                iconBadge

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)

                    HStack(spacing: 6) {
                        Text(transaction.date.formatted(.dateTime.month(.abbreviated).day().year()))
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        if transaction.repeatFrequency != .never {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text(displayAmount)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(amountColor)

                    if let runningBalance {
                        Text(MoneyFormatter.currency(runningBalance, code: account.currencyCode))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }

                if transaction.cleared {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .swipeActions {
            Button(role: .destructive) {
                try? Repository.deleteTransaction(transaction, context: transaction.modelContext!)
            } label: {
                Label("Delete", systemImage: "trash")
            }

            if !reconcileMode {
                Button(transaction.cleared ? "Unclear" : "Clear") {
                    onToggleCleared()
                }
                .tint(.blue)
            }
        }
    }

    private var iconBadge: some View {
        ZStack {
            Circle().fill(Color.white.opacity(0.11)).frame(width: 34, height: 34)
            Image(systemName: symbolName)
                .font(.footnote.weight(.bold))
                .foregroundStyle(amountColor)
        }
    }

    private var title: String {
        if transaction.entryType == .transferOut {
            return "Transfer to \(peerAccountName)"
        }
        if transaction.entryType == .transferIn {
            return "Transfer from \(peerAccountName)"
        }
        return transaction.payee?.name ?? transaction.category?.name ?? "Transaction"
    }

    private var symbolName: String {
        if transaction.entryType == .income { return "arrow.down.circle.fill" }
        if transaction.entryType == .expense { return "arrow.up.circle.fill" }
        return "arrow.left.arrow.right.circle.fill"
    }

    private var amountColor: Color {
        switch transaction.entryType {
        case .income, .transferIn:
            return .green
        case .expense, .transferOut:
            return .red
        }
    }

    private var displayAmount: String {
        let positive = transaction.entryType == .income || transaction.entryType == .transferIn
        return MoneyFormatter.signedAmount(transaction.amount, positive: positive, code: account.currencyCode)
    }
}
