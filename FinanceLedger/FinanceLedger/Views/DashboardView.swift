import SwiftUI
import SwiftData

struct AccountsHomeView: View {
    @Environment(\.modelContext) private var context

    @Query(sort: [SortDescriptor(\Account.sortOrder), SortDescriptor(\Account.name)])
    private var accounts: [Account]

    @Query(sort: [SortDescriptor(\Transaction.date, order: .reverse)])
    private var transactions: [Transaction]

    @State private var showAddAccount = false
    @State private var isReordering = false
    @State private var reorderAccounts: [Account] = []

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    colors: [Color(.sRGB, red: 0.02, green: 0.03, blue: 0.06, opacity: 1), Color(.sRGB, red: 0.07, green: 0.09, blue: 0.13, opacity: 1)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                if isReordering {
                    List {
                        Section {
                            netWorthHeader
                                .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 10, trailing: 16))
                                .listRowBackground(Color.clear)
                        }

                        Section {
                            ForEach(reorderAccounts) { account in
                                AccountCardView(account: account, balance: balances[account.id] ?? account.openingBalance)
                                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                                    .listRowBackground(Color.clear)
                            }
                            .onMove(perform: moveAccounts)
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .environment(\.editMode, .constant(.active))
                } else {
                    ScrollView {
                        VStack(spacing: 14) {
                            netWorthHeader

                            ForEach(activeAccounts) { account in
                                NavigationLink {
                                    AccountDetailView(account: account)
                                } label: {
                                    AccountCardView(account: account, balance: balances[account.id] ?? account.openingBalance)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                    }
                }
            }
            .navigationTitle("Accounts")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(isReordering ? "Done" : "Edit") {
                        toggleReorderMode()
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showAddAccount = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .disabled(isReordering)
                }
            }
            .onAppear {
                if reorderAccounts.isEmpty {
                    reorderAccounts = activeAccounts
                }
            }
            .onChange(of: activeAccounts.map(\.id)) { _, _ in
                if !isReordering {
                    reorderAccounts = activeAccounts
                }
            }
            .sheet(isPresented: $showAddAccount) {
                AccountEditorSheet(account: nil)
            }
        }
    }

    private var activeAccounts: [Account] {
        accounts.filter { !$0.isArchived }
    }

    private var balances: [UUID: Decimal] {
        Repository.accountBalances(accounts: activeAccounts, transactions: transactions)
    }

    private var netWorth: Decimal {
        AccountingEngine.netWorth(accounts: activeAccounts, transactions: transactions)
    }

    private var netWorthHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Net Worth")
                .font(.footnote.weight(.medium))
                .foregroundStyle(.secondary)

            Text(MoneyFormatter.currency(netWorth, code: "SGD"))
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundStyle(.white)

            Text("Assets − Liabilities")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.07))
        )
    }

    private func toggleReorderMode() {
        if isReordering {
            applyReorderedSort()
        } else {
            reorderAccounts = activeAccounts
        }
        isReordering.toggle()
    }

    private func moveAccounts(from source: IndexSet, to destination: Int) {
        reorderAccounts.move(fromOffsets: source, toOffset: destination)
        applyReorderedSort()
    }

    private func applyReorderedSort() {
        for (index, account) in reorderAccounts.enumerated() {
            account.sortOrder = index
            account.updatedAt = .now
        }
        try? context.save()
    }
}

struct AccountCardView: View {
    let account: Account
    let balance: Decimal

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.white.opacity(0.15))
                    .frame(width: 44, height: 44)

                if account.iconName.count == 1 {
                    Text(account.iconName)
                        .font(.title3)
                } else {
                    Image(systemName: account.iconName)
                        .font(.title3)
                        .foregroundStyle(.white)
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(account.name)
                    .font(.headline)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                    .allowsTightening(true)

                Text("\(subtitleTypeText) • \(account.currencyCode)")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.8))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .allowsTightening(true)
            }

            Spacer()

            Text(MoneyFormatter.currency(balance, code: account.currencyCode))
                .font(.title3.weight(.bold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.trailing)
                .lineLimit(1)
                .minimumScaleFactor(0.55)
                .allowsTightening(true)
                .monospacedDigit()
        }
        .padding(14)
        .frame(height: 96)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: account.cardStyle.gradientColors,
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .shadow(color: .black.opacity(0.28), radius: 8, x: 0, y: 6)
        )
    }

    private var subtitleTypeText: String {
        let trimmed = account.subtype.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return account.type.title }
        return trimmed
            .replacingOccurrences(of: "-", with: " ")
            .split(separator: " ")
            .map { $0.prefix(1).uppercased() + $0.dropFirst().lowercased() }
            .joined(separator: " ")
    }
}

extension AccountCardStyle {
    var gradientColors: [Color] {
        switch self {
        case .ocean:
            return [Color(red: 0.10, green: 0.38, blue: 0.72), Color(red: 0.24, green: 0.31, blue: 0.70)]
        case .emerald:
            return [Color(red: 0.04, green: 0.55, blue: 0.44), Color(red: 0.11, green: 0.72, blue: 0.52)]
        case .amber:
            return [Color(red: 0.76, green: 0.45, blue: 0.12), Color(red: 0.90, green: 0.60, blue: 0.18)]
        case .rose:
            return [Color(red: 0.65, green: 0.20, blue: 0.35), Color(red: 0.86, green: 0.34, blue: 0.46)]
        case .slate:
            return [Color(red: 0.24, green: 0.28, blue: 0.35), Color(red: 0.34, green: 0.40, blue: 0.50)]
        case .violet:
            return [Color(red: 0.36, green: 0.24, blue: 0.70), Color(red: 0.52, green: 0.31, blue: 0.80)]
        }
    }
}
