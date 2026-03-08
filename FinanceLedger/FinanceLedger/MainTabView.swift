import SwiftUI
import SwiftData
import UniformTypeIdentifiers

struct MainTabView: View {
    @State private var selectedTab: AppTab = .accounts

    enum AppTab: String, CaseIterable, Identifiable {
        case accounts
        case analytics
        case forecast
        case settings

        var id: String { rawValue }
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            AccountsHomeView()
                .tabItem {
                    Label("Accounts", systemImage: "wallet.pass.fill")
                }
                .tag(AppTab.accounts)

            AnalyticsView()
                .tabItem {
                    Label("Analytics", systemImage: "chart.bar.xaxis")
                }
                .tag(AppTab.analytics)

            ForecastView()
                .tabItem {
                    Label("Forecast", systemImage: "arrow.triangle.2.circlepath")
                }
                .tag(AppTab.forecast)

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
                .tag(AppTab.settings)
        }
        .tint(.blue)
    }
}

struct SettingsView: View {
    @EnvironmentObject private var services: AppServices
    @Environment(\.modelContext) private var context

    @Query(sort: [SortDescriptor(\CardMapping.updatedAt, order: .reverse)])
    private var mappings: [CardMapping]

    @Query(sort: [SortDescriptor(\Account.sortOrder), SortDescriptor(\Account.name)])
    private var accounts: [Account]

    @State private var importedCards: [ImportedCardKey] = []
    @State private var isSyncing = false
    @State private var syncMessage = ""
    @State private var isImportingCSV = false
    @State private var csvImportMessage = ""
    @State private var showCSVTemplate = false
    @State private var demoDataMessage = ""
    @State private var showingCreateAccount = false
    @State private var prefillIssuer: CardIssuer = .other
    @State private var prefillLast4: String = ""

    var body: some View {
        NavigationStack {
            List {
                Section("Auto-Import") {
                    LabeledContent("Inbox") {
                        Text(services.inboxAddress.isEmpty ? "Loading..." : services.inboxAddress)
                            .font(.footnote)
                            .textSelection(.enabled)
                            .foregroundStyle(.secondary)
                    }

                    Button(isSyncing ? "Syncing..." : "Sync Mock Imports") {
                        Task { await syncImports() }
                    }
                    .disabled(isSyncing)

                    if !syncMessage.isEmpty {
                        Text(syncMessage)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Card Mappings") {
                    if importedCards.isEmpty {
                        Text("No detected cards yet. Run mock sync first.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(importedCards) { card in
                            CardMappingRow(
                                card: card,
                                accounts: creditCardAccounts,
                                currentMapping: mappingFor(card: card),
                                onSelect: { account in
                                    try? Repository.upsertCardMapping(
                                        issuer: card.issuer,
                                        last4: card.last4,
                                        account: account,
                                        context: context
                                    )
                                },
                                onCreateAccount: {
                                    prefillIssuer = card.issuer
                                    prefillLast4 = card.last4
                                    showingCreateAccount = true
                                }
                            )
                        }
                    }
                }

                Section("Master Data") {
                    NavigationLink("Manage Categories") {
                        CategoryManagerView()
                    }
                    NavigationLink("Manage Payees") {
                        PayeeManagerView()
                    }
                }

                Section("Data Import (CSV)") {
                    Button("Import Transactions CSV") {
                        isImportingCSV = true
                    }

                    Button("View CSV Template") {
                        showCSVTemplate = true
                    }

                    if !csvImportMessage.isEmpty {
                        Text(csvImportMessage)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Testing Data") {
                    Button("Add Demo Data (2 Years)") {
                        do {
                            let inserted = try Repository.seedDemoData(context: context)
                            demoDataMessage = inserted == 0
                                ? "Demo data already exists."
                                : "Added \(inserted) demo transactions."
                        } catch {
                            demoDataMessage = "Failed to add demo data: \(error.localizedDescription)"
                        }
                    }

                    if !demoDataMessage.isEmpty {
                        Text(demoDataMessage)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Backend API (v2-ready)") {
                    Text("POST /v1/auth/device")
                    Text("GET /v1/import/inbox-address")
                    Text("GET /v1/transactions?since=ISO8601")
                    Text("GET /v1/mappings/cards")
                    Text("POST /v1/mappings/cards")
                }
                .font(.footnote)
            }
            .scrollContentBackground(.hidden)
            .background(LinearGradient(colors: [Color.black, Color(.sRGB, red: 0.06, green: 0.08, blue: 0.12, opacity: 1)], startPoint: .top, endPoint: .bottom))
            .navigationTitle("Settings")
            .task {
                await loadDetectedCards()
            }
            .sheet(isPresented: $showingCreateAccount) {
                AccountEditorSheet(
                    account: nil,
                    defaultType: .liability,
                    defaultSubtype: "credit card",
                    defaultIssuer: prefillIssuer,
                    defaultLast4: prefillLast4
                )
            }
            .fileImporter(
                isPresented: $isImportingCSV,
                allowedContentTypes: [UTType.commaSeparatedText, .plainText],
                allowsMultipleSelection: false
            ) { result in
                handleCSVImport(result)
            }
            .sheet(isPresented: $showCSVTemplate) {
                CSVImportTemplateView()
            }
        }
    }

    private var creditCardAccounts: [Account] {
        accounts.filter { $0.isCreditCardSubtype && !$0.isArchived }
    }

    private func mappingFor(card: ImportedCardKey) -> CardMapping? {
        mappings.first(where: { $0.issuer == card.issuer && $0.cardLast4 == card.last4 })
    }

    private func loadDetectedCards() async {
        do {
            let dtos = try await services.importService.fetchTransactions(since: nil)
            importedCards = Array(Set(dtos.map { ImportedCardKey(issuer: CardIssuer(raw: $0.issuer), last4: $0.cardLast4) })).sorted {
                $0.issuer.rawValue < $1.issuer.rawValue
            }
        } catch {
            importedCards = []
        }
    }

    private func syncImports() async {
        isSyncing = true
        defer { isSyncing = false }

        do {
            let dtos = try await services.importService.fetchTransactions(since: nil)
            let inserted = try Repository.importTransactions(dtos: dtos, context: context)
            syncMessage = "Imported \(inserted) new transaction(s)."
            await loadDetectedCards()
        } catch {
            syncMessage = "Import failed: \(error.localizedDescription)"
        }
    }

    private func handleCSVImport(_ result: Result<[URL], Error>) {
        do {
            guard let url = try result.get().first else { return }
            let hasAccess = url.startAccessingSecurityScopedResource()
            defer {
                if hasAccess {
                    url.stopAccessingSecurityScopedResource()
                }
            }

            let data = try Data(contentsOf: url)
            let summary = try Repository.importTransactionsFromCSV(data: data, context: context)
            var lines: [String] = []
            lines.append("Inserted: \(summary.inserted)")
            lines.append("Skipped duplicates: \(summary.skippedDuplicates)")
            lines.append("Failed rows: \(summary.failedRows)")
            if let firstFailure = summary.failureDetails.first {
                lines.append("First error: \(firstFailure)")
            }
            csvImportMessage = lines.joined(separator: "\n")
        } catch {
            csvImportMessage = "CSV import failed: \(error.localizedDescription)"
        }
    }
}

private struct CSVImportTemplateView: View {
    @Environment(\.dismiss) private var dismiss

    private let template = """
date,type,account,from_account,to_account,amount,currency,category,payee,notes,cleared,status,repeat_frequency
2026-02-20,expense,Cash at Bank,,,12.50,SGD,Food,NTUC,Lunch,TRUE,posted,never
2026-02-21,income,Cash at Bank,,,2500.00,SGD,Salary,Employer,Monthly salary,TRUE,posted,monthly
2026-02-22,transfer,,Cash at Bank,Savings Account,200.00,SGD,,,Move to savings,TRUE,posted,never
"""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("CSV Format")
                        .font(.headline)
                    Text("Required headers: date, type, amount")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text("For income/expense, `account` is required. For transfer, `from_account` and `to_account` are required.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)

                    Text(template)
                        .font(.system(.footnote, design: .monospaced))
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(Color.white.opacity(0.08))
                        )
                }
                .padding(16)
            }
            .scrollContentBackground(.hidden)
            .background(LinearGradient(colors: [Color.black, Color(.sRGB, red: 0.06, green: 0.08, blue: 0.12, opacity: 1)], startPoint: .top, endPoint: .bottom))
            .navigationTitle("CSV Template")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

struct ImportedCardKey: Hashable, Identifiable {
    let issuer: CardIssuer
    let last4: String

    var id: String { "\(issuer.rawValue)-\(last4)" }
}

struct CardMappingRow: View {
    let card: ImportedCardKey
    let accounts: [Account]
    let currentMapping: CardMapping?
    let onSelect: (Account?) -> Void
    let onCreateAccount: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(card.issuer.rawValue.uppercased()) •••• \(card.last4)")
                .font(.subheadline.weight(.semibold))

            Picker("Account", selection: selectionBinding) {
                Text("Unassigned").tag(UUID?.none)
                ForEach(accounts) { account in
                    Text(account.name).tag(Optional(account.id))
                }
            }
            .pickerStyle(.menu)

            if selectionBinding.wrappedValue == nil {
                Button("Create Credit Card Account") {
                    onCreateAccount()
                }
                .font(.caption)
            }
        }
    }

    private var selectionBinding: Binding<UUID?> {
        Binding(
            get: { currentMapping?.account?.id },
            set: { selectedId in
                let account = accounts.first(where: { $0.id == selectedId })
                onSelect(account)
            }
        )
    }
}
