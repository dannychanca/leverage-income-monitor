import Foundation
import SwiftData

struct CSVImportSummary {
    var inserted: Int = 0
    var skippedDuplicates: Int = 0
    var failedRows: Int = 0
    var failureDetails: [String] = []
}

private struct CSVTransactionRow {
    let lineNumber: Int
    let date: Date
    let type: String
    let accountName: String
    let fromAccountName: String
    let toAccountName: String
    let amount: Decimal
    let currencyCode: String
    let categoryName: String
    let payeeName: String
    let notes: String
    let cleared: Bool
    let status: TransactionStatus
    let repeatFrequency: RepeatFrequency
    let importHash: String
}

private enum CSVParserError: LocalizedError {
    case missingHeaders([String])
    case invalidDate(line: Int, value: String)
    case invalidAmount(line: Int, value: String)
    case invalidType(line: Int, value: String)
    case invalidStatus(line: Int, value: String)
    case invalidRepeatFrequency(line: Int, value: String)
    case missingField(line: Int, field: String)

    var errorDescription: String? {
        switch self {
        case .missingHeaders(let headers):
            return "Missing required CSV headers: \(headers.joined(separator: ", "))"
        case .invalidDate(let line, let value):
            return "Line \(line): invalid date '\(value)'. Use yyyy-MM-dd or ISO8601."
        case .invalidAmount(let line, let value):
            return "Line \(line): invalid amount '\(value)'."
        case .invalidType(let line, let value):
            return "Line \(line): invalid type '\(value)'. Use income, expense, or transfer."
        case .invalidStatus(let line, let value):
            return "Line \(line): invalid status '\(value)'. Use pending, posted, or reversed."
        case .invalidRepeatFrequency(let line, let value):
            return "Line \(line): invalid repeat_frequency '\(value)'."
        case .missingField(let line, let field):
            return "Line \(line): missing required field '\(field)'."
        }
    }
}

private enum CSVTransactionParser {
    static let requiredHeaders = ["date", "type", "amount"]

    static func parse(data: Data) throws -> [CSVTransactionRow] {
        guard let raw = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .utf16) else {
            return []
        }

        let lines = raw
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map(String.init)

        guard let headerLine = lines.first, !headerLine.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return []
        }

        let headers = splitCSVLine(headerLine).map { normalizeHeader($0) }
        let missing = requiredHeaders.filter { !headers.contains($0) }
        if !missing.isEmpty { throw CSVParserError.missingHeaders(missing) }

        var result: [CSVTransactionRow] = []
        for (index, line) in lines.dropFirst().enumerated() {
            let lineNumber = index + 2
            if line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
            let columns = splitCSVLine(line)
            let map = Dictionary(uniqueKeysWithValues: headers.enumerated().map { i, key in
                (key, i < columns.count ? columns[i].trimmingCharacters(in: .whitespacesAndNewlines) : "")
            })

            let type = value(in: map, key: "type").lowercased()
            guard ["income", "expense", "transfer"].contains(type) else {
                throw CSVParserError.invalidType(line: lineNumber, value: value(in: map, key: "type"))
            }

            let dateRaw = value(in: map, key: "date")
            guard let date = parseDate(dateRaw) else {
                throw CSVParserError.invalidDate(line: lineNumber, value: dateRaw)
            }

            let amountRaw = value(in: map, key: "amount")
            guard let amount = parseDecimal(amountRaw) else {
                throw CSVParserError.invalidAmount(line: lineNumber, value: amountRaw)
            }

            let accountName = value(in: map, key: "account")
            let fromAccountName = value(in: map, key: "from_account")
            let toAccountName = value(in: map, key: "to_account")

            if type == "transfer" {
                if fromAccountName.isEmpty { throw CSVParserError.missingField(line: lineNumber, field: "from_account") }
                if toAccountName.isEmpty { throw CSVParserError.missingField(line: lineNumber, field: "to_account") }
            } else if accountName.isEmpty {
                throw CSVParserError.missingField(line: lineNumber, field: "account")
            }

            let statusRaw = value(in: map, key: "status")
            let status: TransactionStatus
            if statusRaw.isEmpty {
                status = .posted
            } else if let parsed = TransactionStatus(rawValue: statusRaw.lowercased()) {
                status = parsed
            } else {
                throw CSVParserError.invalidStatus(line: lineNumber, value: statusRaw)
            }

            let repeatRaw = value(in: map, key: "repeat_frequency")
            let repeatFrequency: RepeatFrequency
            if repeatRaw.isEmpty {
                repeatFrequency = .never
            } else if let parsed = parseRepeatFrequency(repeatRaw) {
                repeatFrequency = parsed
            } else {
                throw CSVParserError.invalidRepeatFrequency(line: lineNumber, value: repeatRaw)
            }

            let normalizedAmount = amount.magnitude
            let currencyCode = value(in: map, key: "currency").uppercased()
            let categoryName = value(in: map, key: "category")
            let payeeName = value(in: map, key: "payee")
            let notes = value(in: map, key: "notes")
            let cleared = parseBool(value(in: map, key: "cleared")) ?? true
            let hash = buildImportHash(
                lineNumber: lineNumber,
                date: date,
                type: type,
                account: accountName,
                fromAccount: fromAccountName,
                toAccount: toAccountName,
                amount: normalizedAmount,
                category: categoryName,
                payee: payeeName,
                notes: notes
            )

            result.append(
                CSVTransactionRow(
                    lineNumber: lineNumber,
                    date: date,
                    type: type,
                    accountName: accountName,
                    fromAccountName: fromAccountName,
                    toAccountName: toAccountName,
                    amount: normalizedAmount,
                    currencyCode: currencyCode.isEmpty ? "SGD" : currencyCode,
                    categoryName: categoryName,
                    payeeName: payeeName,
                    notes: notes,
                    cleared: cleared,
                    status: status,
                    repeatFrequency: repeatFrequency,
                    importHash: hash
                )
            )
        }

        return result
    }

    private static func value(in map: [String: String], key: String) -> String {
        map[key, default: ""]
    }

    private static func normalizeHeader(_ header: String) -> String {
        header
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: " ", with: "_")
    }

    private static func parseDate(_ value: String) -> Date? {
        let isoFormatter = ISO8601DateFormatter()
        if let date = isoFormatter.date(from: value) { return date }

        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: value)
    }

    private static func parseDecimal(_ value: String) -> Decimal? {
        let sanitized = value
            .replacingOccurrences(of: ",", with: "")
            .replacingOccurrences(of: "$", with: "")
        return Decimal(string: sanitized)
    }

    private static func parseBool(_ value: String) -> Bool? {
        switch value.lowercased() {
        case "1", "true", "yes", "y":
            return true
        case "0", "false", "no", "n":
            return false
        default:
            return nil
        }
    }

    private static func parseRepeatFrequency(_ value: String) -> RepeatFrequency? {
        let normalized = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "_", with: "")
            .replacingOccurrences(of: "-", with: "")

        for option in RepeatFrequency.allCases {
            let raw = option.rawValue.lowercased().replacingOccurrences(of: "_", with: "")
            let title = option.title.lowercased().replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "-", with: "")
            if normalized == raw || normalized == title {
                return option
            }
        }
        return nil
    }

    private static func buildImportHash(
        lineNumber: Int,
        date: Date,
        type: String,
        account: String,
        fromAccount: String,
        toAccount: String,
        amount: Decimal,
        category: String,
        payee: String,
        notes: String
    ) -> String {
        let key = [
            "csv",
            String(lineNumber),
            ISO8601DateFormatter().string(from: date),
            type,
            account.lowercased(),
            fromAccount.lowercased(),
            toAccount.lowercased(),
            NSDecimalNumber(decimal: amount).stringValue,
            category.lowercased(),
            payee.lowercased(),
            notes.lowercased()
        ].joined(separator: "|")
        return key
    }

    private static func splitCSVLine(_ line: String) -> [String] {
        var values: [String] = []
        var current = ""
        var inQuotes = false
        let chars = Array(line)
        var i = 0

        while i < chars.count {
            let c = chars[i]
            if c == "\"" {
                if inQuotes && i + 1 < chars.count && chars[i + 1] == "\"" {
                    current.append("\"")
                    i += 1
                } else {
                    inQuotes.toggle()
                }
            } else if c == "," && !inQuotes {
                values.append(current)
                current = ""
            } else {
                current.append(c)
            }
            i += 1
        }
        values.append(current)
        return values
    }
}

struct MoneyFormatter {
    static func currency(_ value: Decimal, code: String = "SGD") -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = code
        formatter.locale = Locale(identifier: code == "SGD" ? "en_SG" : Locale.current.identifier)
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        return formatter.string(for: value) ?? "\(value)"
    }

    static func signedAmount(_ amount: Decimal, positive: Bool, code: String = "SGD") -> String {
        let absAmount = amount.magnitude
        let rendered = currency(absAmount, code: code)
        return positive ? rendered : "-\(rendered)"
    }
}

enum AccountingEngine {
    static func effect(entryType: EntryType, accountType: AccountType, amount: Decimal) -> Decimal {
        let incomeEffect: Decimal = accountType == .asset ? amount : -amount
        let expenseEffect: Decimal = accountType == .asset ? -amount : amount

        switch entryType {
        case .income, .transferIn:
            return incomeEffect
        case .expense, .transferOut:
            return expenseEffect
        }
    }

    static func accountBalance(_ account: Account, transactions: [Transaction]) -> Decimal {
        let sum = transactions
            .filter { $0.account.id == account.id }
            .reduce(Decimal.zero) { partial, item in
                partial + effect(entryType: item.entryType, accountType: account.type, amount: item.amount)
            }
        return account.openingBalance + sum
    }

    static func netWorth(accounts: [Account], transactions: [Transaction]) -> Decimal {
        let assetTotal = accounts
            .filter { $0.type == .asset && !$0.isArchived }
            .reduce(Decimal.zero) { $0 + accountBalance($1, transactions: transactions) }

        let liabilityTotal = accounts
            .filter { $0.type == .liability && !$0.isArchived }
            .reduce(Decimal.zero) { $0 + accountBalance($1, transactions: transactions) }

        return assetTotal - liabilityTotal
    }
}

protocol ImportService {
    func authDevice() async throws -> String
    func inboxAddress(deviceToken: String) async throws -> String
    func fetchTransactions(since: Date?) async throws -> [ImportedTransactionDTO]
    func fetchMappings() async throws -> [CardMappingDTO]
    func upsertMapping(issuer: CardIssuer, cardLast4: String, accountId: UUID?) async throws
}

struct MockImportService: ImportService {
    func authDevice() async throws -> String {
        "mock-device-token"
    }

    func inboxAddress(deviceToken: String) async throws -> String {
        "imports+\(deviceToken.prefix(6))@ledgermail.local"
    }

    func fetchTransactions(since: Date?) async throws -> [ImportedTransactionDTO] {
        [
            ImportedTransactionDTO(
                externalId: "dbs_20260220_1201",
                importHash: "hash_dbs_4343_8.90_nyonya_20260220",
                issuer: "dbs",
                cardLast4: "4343",
                merchant: "Nyonya Kopi",
                amount: 8.90,
                currencyCode: "SGD",
                timestamp: "2026-02-20T11:24:00Z",
                status: "posted",
                authCode: nil,
                city: "Singapore",
                country: "SG"
            ),
            ImportedTransactionDTO(
                externalId: "amex_20260221_9801",
                importHash: "hash_amex_9900_122.00_airasia_20260221",
                issuer: "amex",
                cardLast4: "9900",
                merchant: "AirAsia",
                amount: 122.00,
                currencyCode: "SGD",
                timestamp: "2026-02-21T02:15:00Z",
                status: "pending",
                authCode: nil,
                city: "Singapore",
                country: "SG"
            )
        ]
    }

    func fetchMappings() async throws -> [CardMappingDTO] {
        []
    }

    func upsertMapping(issuer: CardIssuer, cardLast4: String, accountId: UUID?) async throws {}
}

struct HTTPImportService: ImportService {
    let baseURL: URL

    init(baseURL: URL = URL(string: "https://api.example.com")!) {
        self.baseURL = baseURL
    }

    func authDevice() async throws -> String {
        _ = URLRequest(url: baseURL.appending(path: "/v1/auth/device"))
        return "stub-device-token"
    }

    func inboxAddress(deviceToken: String) async throws -> String {
        _ = URLRequest(url: baseURL.appending(path: "/v1/import/inbox-address"))
        return "stub+\(deviceToken.prefix(6))@example.com"
    }

    func fetchTransactions(since: Date?) async throws -> [ImportedTransactionDTO] {
        _ = URLRequest(url: baseURL.appending(path: "/v1/transactions"))
        return []
    }

    func fetchMappings() async throws -> [CardMappingDTO] {
        _ = URLRequest(url: baseURL.appending(path: "/v1/mappings/cards"))
        return []
    }

    func upsertMapping(issuer: CardIssuer, cardLast4: String, accountId: UUID?) async throws {
        _ = URLRequest(url: baseURL.appending(path: "/v1/mappings/cards"))
    }
}

@MainActor
final class AppServices: ObservableObject {
    let importService: ImportService

    @Published var deviceToken: String = ""
    @Published var inboxAddress: String = ""

    init(importService: ImportService = MockImportService()) {
        self.importService = importService
    }

    func loadImportAddress() async {
        do {
            let token = try await importService.authDevice()
            let inbox = try await importService.inboxAddress(deviceToken: token)
            self.deviceToken = token
            self.inboxAddress = inbox
        } catch {
            self.inboxAddress = "unavailable@local"
        }
    }
}

@MainActor
enum Repository {
    static func seedIfNeeded(context: ModelContext) throws {
        let hasAccounts = try context.fetchCount(FetchDescriptor<Account>()) > 0
        let hasCategories = try context.fetchCount(FetchDescriptor<Category>()) > 0
        let hasSubtypeOptions = try context.fetchCount(FetchDescriptor<AccountSubtypeOption>()) > 0
        let hasTransactions = try context.fetchCount(FetchDescriptor<Transaction>()) > 0

        if !hasCategories {
            let seeds: [(String, CategoryKind, String)] = [
                ("Salary", .income, "banknote.fill"),
                ("Dividends", .income, "chart.bar.fill"),
                ("Food", .expense, "fork.knife"),
                ("Transport", .expense, "car.fill"),
                ("Gifts", .both, "gift.fill"),
                ("Utilities", .expense, "bolt.fill"),
                ("Insurance", .expense, "shield.fill"),
                ("Shopping", .expense, "bag.fill"),
                ("Travel", .expense, "airplane"),
                ("Investments", .both, "chart.line.uptrend.xyaxis"),
                ("Medical", .expense, "cross.case.fill"),
                ("Education", .expense, "book.fill")
            ]
            for (index, item) in seeds.enumerated() {
                context.insert(Category(name: item.0, kind: item.1, iconName: item.2, sortOrder: index))
            }
        }

        if !hasSubtypeOptions {
            let subtypeSeeds = ["cash", "bank", "credit card", "investment", "property", "loan", "other"]
            for (index, name) in subtypeSeeds.enumerated() {
                context.insert(AccountSubtypeOption(name: name, sortOrder: index))
            }
        }

        if !hasAccounts {
            context.insert(Account(name: "Cash at Bank", type: .asset, subtype: "bank", openingBalance: 12_500, iconName: "building.columns.fill"))
            context.insert(Account(name: "Daily Wallet", type: .asset, subtype: "cash", openingBalance: 300, iconName: "wallet.pass.fill", sortOrder: 1))
            context.insert(Account(name: "Main Credit Card", type: .liability, subtype: "credit card", openingBalance: 1_250, iconName: "creditcard.fill", sortOrder: 2, issuer: .dbs, cardLast4: "4343"))
        }

        try ensureDemoAccounts(context: context)
        try context.save()

        if !hasTransactions {
            let accounts = try context.fetch(FetchDescriptor<Account>())
            let categories = try context.fetch(FetchDescriptor<Category>())
            _ = try seedDemoTransactions(context: context, accounts: accounts, categories: categories)
            _ = try seedRecurringDemoTransactions(context: context, accounts: accounts, categories: categories)
            try context.save()
        }
    }

    static func save(context: ModelContext) throws {
        try context.save()
    }

    static func seedDemoData(context: ModelContext) throws -> Int {
        let existing = try context.fetch(FetchDescriptor<Transaction>())
        let hasBaseDemo = existing.contains { $0.notes.hasPrefix("Demo income #") || $0.notes.hasPrefix("Demo expense #") }

        try ensureDemoAccounts(context: context)
        let accounts = try context.fetch(FetchDescriptor<Account>())
        let categories = try context.fetch(FetchDescriptor<Category>())
        var inserted = 0
        if !hasBaseDemo {
            inserted += try seedDemoTransactions(context: context, accounts: accounts, categories: categories)
        }
        inserted += try seedRecurringDemoTransactions(context: context, accounts: accounts, categories: categories)
        try context.save()
        return inserted
    }

    private static func seedDemoTransactions(
        context: ModelContext,
        accounts: [Account],
        categories: [Category]
    ) throws -> Int {
        let usableAccounts = accounts.filter { !$0.isArchived }
        guard !usableAccounts.isEmpty else { return 0 }

        let incomeAccounts = usableAccounts.filter { $0.type == .asset }
        let expenseAccounts = usableAccounts

        let incomeCategories = categories
            .filter { $0.kind == .income || $0.kind == .both }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        let expenseCategories = categories
            .filter { $0.kind == .expense || $0.kind == .both }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

        guard !incomeCategories.isEmpty, !expenseCategories.isEmpty else { return 0 }

        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)
        guard let startDate = calendar.date(byAdding: .year, value: -2, to: today) else { return 0 }

        let incomePayeeNames = [
            "Acme Pte Ltd", "Northstar Holdings", "Dividend Agent", "Freelance Client",
            "Bonus Payout", "Tax Refund Office", "Rental Tenant", "Consulting Client",
            "Interest Credit", "Side Hustle Buyer"
        ]
        let expensePayeeNames = [
            "NTUC", "Sheng Siong", "Grab", "Shell", "SP Services", "StarHub", "Singtel",
            "Watsons", "Guardian", "IKEA", "Amazon", "Uniqlo", "FairPrice", "Shaw Theatres",
            "AIA", "Prudential", "Mount Elizabeth", "Coursera", "Apple", "Deliveroo"
        ]

        var payeeByName = (try context.fetch(FetchDescriptor<Payee>()))
            .reduce(into: [String: Payee]()) { partial, payee in
                partial[payee.name.lowercased()] = partial[payee.name.lowercased()] ?? payee
            }
        var inserted = 0

        func payee(named name: String) -> Payee {
            if let existing = payeeByName[name.lowercased()] {
                return existing
            }
            let created = Payee(name: name, lastUsedAt: .now)
            context.insert(created)
            payeeByName[name.lowercased()] = created
            return created
        }

        for index in 0..<100 {
            let dayOffset = index * 7
            guard let date = calendar.date(byAdding: .day, value: dayOffset, to: startDate) else { continue }
            let account = incomeAccounts[index % incomeAccounts.count]
            let category = incomeCategories[index % incomeCategories.count]
            let payer = payee(named: incomePayeeNames[index % incomePayeeNames.count])
            let amount = Decimal(1_800 + ((index % 9) * 220) + ((index % 3) * 15))

            context.insert(
                Transaction(
                    entryType: .income,
                    account: account,
                    amount: amount,
                    date: date,
                    notes: "Demo income #\(index + 1)",
                    cleared: true,
                    category: category,
                    payee: payer,
                    source: .manual,
                    status: .posted
                )
            )
            inserted += 1
        }

        for index in 0..<100 {
            let dayOffset = (index * 7) + 3
            guard let date = calendar.date(byAdding: .day, value: dayOffset, to: startDate) else { continue }
            let account = expenseAccounts[index % expenseAccounts.count]
            let category = expenseCategories[index % expenseCategories.count]
            let payeeValue = payee(named: expensePayeeNames[index % expensePayeeNames.count])
            let amount = Decimal(9 + ((index % 14) * 11) + ((index % 5) * 3))

            context.insert(
                Transaction(
                    entryType: .expense,
                    account: account,
                    amount: amount,
                    date: date,
                    notes: "Demo expense #\(index + 1)",
                    cleared: index % 5 != 0,
                    category: category,
                    payee: payeeValue,
                    source: .manual,
                    status: .posted
                )
            )
            inserted += 1
        }

        let assetAccounts = usableAccounts.filter { $0.type == .asset }
        let liabilityAccounts = usableAccounts.filter { $0.type == .liability }

        if assetAccounts.count >= 2 && !liabilityAccounts.isEmpty {
            for index in 0..<48 {
                let dayOffset = (index * 15) + 1
                guard let date = calendar.date(byAdding: .day, value: dayOffset, to: startDate) else { continue }
                let transferId = UUID()
                let amount = Decimal(100 + ((index % 8) * 25))

                let fromAccount: Account
                let toAccount: Account
                if index % 3 == 0 {
                    fromAccount = assetAccounts[index % assetAccounts.count]
                    toAccount = liabilityAccounts[index % liabilityAccounts.count]
                } else {
                    fromAccount = assetAccounts[index % assetAccounts.count]
                    toAccount = assetAccounts[(index + 1) % assetAccounts.count]
                }

                context.insert(
                    Transaction(
                        entryType: .transferOut,
                        account: fromAccount,
                        amount: amount,
                        date: date,
                        notes: "Demo transfer #\(index + 1)",
                        cleared: index % 4 != 0,
                        transferId: transferId,
                        transferAccountId: toAccount.id,
                        source: .manual,
                        status: .posted
                    )
                )
                context.insert(
                    Transaction(
                        entryType: .transferIn,
                        account: toAccount,
                        amount: amount,
                        date: date,
                        notes: "Demo transfer #\(index + 1)",
                        cleared: index % 4 != 0,
                        transferId: transferId,
                        transferAccountId: fromAccount.id,
                        source: .manual,
                        status: .posted
                    )
                )
                inserted += 2
            }
        }

        return inserted
    }

    private static func seedRecurringDemoTransactions(
        context: ModelContext,
        accounts: [Account],
        categories: [Category]
    ) throws -> Int {
        let usableAccounts = accounts.filter { !$0.isArchived }
        let incomeAccounts = usableAccounts.filter { $0.type == .asset }
        let expenseAccounts = usableAccounts

        guard !incomeAccounts.isEmpty, !expenseAccounts.isEmpty else { return 0 }

        let incomeCategories = categories
            .filter { $0.kind == .income || $0.kind == .both }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        let expenseCategories = categories
            .filter { $0.kind == .expense || $0.kind == .both }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

        guard !incomeCategories.isEmpty, !expenseCategories.isEmpty else { return 0 }

        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)
        let allFrequencies = RepeatFrequency.allCases.filter { $0 != .never }

        let incomePayeeNames = [
            "Recurring Payroll", "Recurring Dividends", "Recurring Rental",
            "Recurring Consulting", "Recurring Bonus"
        ]
        let expensePayeeNames = [
            "Recurring Utilities", "Recurring Insurance", "Recurring Subscription",
            "Recurring Transport", "Recurring Groceries"
        ]

        var payeeByName = (try context.fetch(FetchDescriptor<Payee>()))
            .reduce(into: [String: Payee]()) { partial, payee in
                partial[payee.name.lowercased()] = partial[payee.name.lowercased()] ?? payee
            }

        func payee(named name: String) -> Payee {
            if let existing = payeeByName[name.lowercased()] {
                return existing
            }
            let created = Payee(name: name, lastUsedAt: .now)
            context.insert(created)
            payeeByName[name.lowercased()] = created
            return created
        }

        let existingNotes = Set(
            try context.fetch(FetchDescriptor<Transaction>())
                .map(\.notes)
        )

        var inserted = 0

        for index in 0..<20 {
            let note = "Demo recurring income #\(index + 1)"
            if existingNotes.contains(note) { continue }

            let monthOffset = -((index % 6) + 1)
            let day = ((index * 3) % 24) + 1
            let baseMonth = calendar.date(byAdding: .month, value: monthOffset, to: today) ?? today
            let date = calendar.date(bySetting: .day, value: day, of: baseMonth) ?? baseMonth

            context.insert(
                Transaction(
                    entryType: .income,
                    account: incomeAccounts[index % incomeAccounts.count],
                    amount: Decimal(900 + (index * 140)),
                    date: date,
                    notes: note,
                    cleared: true,
                    category: incomeCategories[index % incomeCategories.count],
                    payee: payee(named: incomePayeeNames[index % incomePayeeNames.count]),
                    recurrenceId: UUID(),
                    source: .manual,
                    status: .posted,
                    repeatFrequency: allFrequencies[index % allFrequencies.count]
                )
            )
            inserted += 1
        }

        for index in 0..<20 {
            let note = "Demo recurring expense #\(index + 1)"
            if existingNotes.contains(note) { continue }

            let monthOffset = -((index % 6) + 1)
            let day = ((index * 5) % 24) + 1
            let baseMonth = calendar.date(byAdding: .month, value: monthOffset, to: today) ?? today
            let date = calendar.date(bySetting: .day, value: day, of: baseMonth) ?? baseMonth

            context.insert(
                Transaction(
                    entryType: .expense,
                    account: expenseAccounts[index % expenseAccounts.count],
                    amount: Decimal(35 + (index * 12)),
                    date: date,
                    notes: note,
                    cleared: true,
                    category: expenseCategories[index % expenseCategories.count],
                    payee: payee(named: expensePayeeNames[index % expensePayeeNames.count]),
                    recurrenceId: UUID(),
                    source: .manual,
                    status: .posted,
                    repeatFrequency: allFrequencies[(index + 3) % allFrequencies.count]
                )
            )
            inserted += 1
        }

        return inserted
    }

    private static func ensureDemoAccounts(context: ModelContext) throws {
        let existing = try context.fetch(FetchDescriptor<Account>())
        let byName = existing.reduce(into: [String: Account]()) { partial, account in
            partial[account.name.lowercased()] = partial[account.name.lowercased()] ?? account
        }
        var nextSort = (existing.map(\.sortOrder).max() ?? 0) + 1

        let demos: [(name: String, type: AccountType, subtype: String, openingBalance: Decimal, iconName: String, issuer: CardIssuer?, last4: String?, nickname: String?)] = [
            ("High Yield Savings", .asset, "bank", 18_000, "building.columns.circle.fill", nil, nil, nil),
            ("Brokerage Portfolio", .asset, "investment", 45_000, "chart.line.uptrend.xyaxis.circle.fill", nil, nil, nil),
            ("Property Equity", .asset, "property", 120_000, "house.fill", nil, nil, nil),
            ("Travel Credit Card", .liability, "credit card", 3_200, "airplane.circle.fill", .amex, "9900", "Travel Card"),
            ("Home Loan", .liability, "loan", 280_000, "building.2.crop.circle.fill", nil, nil, nil),
            ("Car Loan", .liability, "loan", 38_000, "car.circle.fill", nil, nil, nil)
        ]

        for demo in demos {
            if byName[demo.name.lowercased()] != nil { continue }
            context.insert(
                Account(
                    name: demo.name,
                    type: demo.type,
                    subtype: demo.subtype,
                    openingBalance: demo.openingBalance,
                    iconName: demo.iconName,
                    sortOrder: nextSort,
                    issuer: demo.issuer,
                    cardLast4: demo.last4,
                    cardNickname: demo.nickname
                )
            )
            nextSort += 1
        }
    }

    static func accountBalances(accounts: [Account], transactions: [Transaction]) -> [UUID: Decimal] {
        Dictionary(uniqueKeysWithValues: accounts.map { account in
            (account.id, AccountingEngine.accountBalance(account, transactions: transactions))
        })
    }

    static func findOrCreatePayee(
        name: String,
        selectedCategory: Category?,
        entryType: EntryType,
        context: ModelContext
    ) throws -> Payee {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let descriptor = FetchDescriptor<Payee>()
        let allPayees = try context.fetch(descriptor)

        if let existing = allPayees.first(where: { $0.name.caseInsensitiveCompare(trimmed) == .orderedSame }) {
            existing.lastUsedAt = .now
            return existing
        }

        let defaultCategory = isCategoryCompatible(selectedCategory, with: entryType) ? selectedCategory : nil
        let payee = Payee(name: trimmed, lastUsedAt: .now, defaultCategory: defaultCategory)
        context.insert(payee)
        return payee
    }

    static func createCategory(name: String, kind: CategoryKind, context: ModelContext) throws -> Category {
        let existingCount = try context.fetchCount(FetchDescriptor<Category>())
        let category = Category(name: name.trimmingCharacters(in: .whitespacesAndNewlines), kind: kind, sortOrder: existingCount + 1)
        context.insert(category)
        return category
    }

    static func upsertTransaction(
        editing: Transaction?,
        account: Account,
        entryType: EntryType,
        amount: Decimal,
        date: Date,
        notes: String,
        cleared: Bool,
        repeatFrequency: RepeatFrequency,
        repeatEndDate: Date?,
        photoData: Data?,
        category: Category?,
        payeeName: String,
        context: ModelContext
    ) throws {
        let payee: Payee? = payeeName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? nil
            : try findOrCreatePayee(name: payeeName, selectedCategory: category, entryType: entryType, context: context)
        let fallbackCategory = payee?.defaultCategory
        let effectiveCategory = category ?? (isCategoryCompatible(fallbackCategory, with: entryType) ? fallbackCategory : nil)
        let recurrenceId: UUID? = repeatFrequency == .never ? nil : (editing?.recurrenceId ?? UUID())
        let effectiveRepeatEndDate = normalizedRepeatEndDate(
            repeatFrequency: repeatFrequency,
            repeatEndDate: repeatEndDate,
            anchorDate: date
        )

        if let editing {
            editing.entryType = entryType
            editing.account = account
            editing.amount = amount
            editing.date = date
            editing.notes = notes
            editing.cleared = cleared
            editing.repeatFrequency = repeatFrequency
            editing.repeatEndDate = effectiveRepeatEndDate
            editing.photoData = photoData
            editing.category = effectiveCategory
            editing.payee = payee
            editing.recurrenceId = recurrenceId
            editing.updatedAt = .now

            if let recurrenceId {
                try trimOccurrencesBeyondEndDate(
                    recurrenceId: recurrenceId,
                    repeatEndDate: effectiveRepeatEndDate,
                    context: context
                )
                try createMissingOccurrences(
                    recurrenceId: recurrenceId,
                    anchorDate: date,
                    entryType: entryType,
                    account: account,
                    amount: amount,
                    notes: notes,
                    cleared: cleared,
                    repeatFrequency: repeatFrequency,
                    repeatEndDate: effectiveRepeatEndDate,
                    photoData: photoData,
                    category: effectiveCategory,
                    payee: payee,
                    context: context
                )
            }
        } else {
            let occurrenceDates = scheduledDates(
                from: date,
                until: min(Date.now, effectiveRepeatEndDate ?? Date.now),
                frequency: repeatFrequency
            )

            if occurrenceDates.isEmpty {
                context.insert(
                    Transaction(
                        entryType: entryType,
                        account: account,
                        amount: amount,
                        date: date,
                        notes: notes,
                        cleared: cleared,
                        category: effectiveCategory,
                        payee: payee,
                        recurrenceId: recurrenceId,
                        repeatFrequency: repeatFrequency,
                        repeatEndDate: effectiveRepeatEndDate,
                        photoData: photoData
                    )
                )
            } else {
                for occurrenceDate in occurrenceDates {
                    context.insert(
                        Transaction(
                            entryType: entryType,
                            account: account,
                            amount: amount,
                            date: occurrenceDate,
                            notes: notes,
                            cleared: cleared,
                            category: effectiveCategory,
                            payee: payee,
                            recurrenceId: recurrenceId,
                            repeatFrequency: repeatFrequency,
                            repeatEndDate: effectiveRepeatEndDate,
                            photoData: photoData
                        )
                    )
                }
            }
        }

        try context.save()
    }

    static func createTransfer(
        editingLeg: Transaction?,
        fromAccount: Account,
        toAccount: Account,
        amount: Decimal,
        date: Date,
        notes: String,
        cleared: Bool,
        repeatFrequency: RepeatFrequency,
        repeatEndDate: Date?,
        photoData: Data?,
        context: ModelContext
    ) throws {
        let transferId = editingLeg?.transferId ?? UUID()
        let effectiveRepeatEndDate = normalizedRepeatEndDate(
            repeatFrequency: repeatFrequency,
            repeatEndDate: repeatEndDate,
            anchorDate: date
        )

        if let editingLeg,
           let sibling = try siblingLeg(of: editingLeg, transferId: transferId, context: context) {
            let isEditingOutLeg = editingLeg.entryType == .transferOut
            let outLeg = isEditingOutLeg ? editingLeg : sibling
            let inLeg = isEditingOutLeg ? sibling : editingLeg

            outLeg.account = fromAccount
            outLeg.entryType = .transferOut
            outLeg.amount = amount
            outLeg.date = date
            outLeg.notes = notes
            outLeg.cleared = cleared
            outLeg.repeatFrequency = repeatFrequency
            outLeg.repeatEndDate = effectiveRepeatEndDate
            outLeg.photoData = photoData
            outLeg.transferId = transferId
            outLeg.transferAccountId = toAccount.id
            outLeg.category = nil
            outLeg.payee = nil
            outLeg.updatedAt = .now

            inLeg.account = toAccount
            inLeg.entryType = .transferIn
            inLeg.amount = amount
            inLeg.date = date
            inLeg.notes = notes
            inLeg.cleared = cleared
            inLeg.repeatFrequency = repeatFrequency
            inLeg.repeatEndDate = effectiveRepeatEndDate
            inLeg.photoData = photoData
            inLeg.transferId = transferId
            inLeg.transferAccountId = fromAccount.id
            inLeg.category = nil
            inLeg.payee = nil
            inLeg.updatedAt = .now
        } else {
            let outLeg = Transaction(
                entryType: .transferOut,
                account: fromAccount,
                amount: amount,
                date: date,
                notes: notes,
                cleared: cleared,
                transferId: transferId,
                transferAccountId: toAccount.id,
                repeatFrequency: repeatFrequency,
                repeatEndDate: effectiveRepeatEndDate,
                photoData: photoData
            )

            let inLeg = Transaction(
                entryType: .transferIn,
                account: toAccount,
                amount: amount,
                date: date,
                notes: notes,
                cleared: cleared,
                transferId: transferId,
                transferAccountId: fromAccount.id,
                repeatFrequency: repeatFrequency,
                repeatEndDate: effectiveRepeatEndDate,
                photoData: photoData
            )

            context.insert(outLeg)
            context.insert(inLeg)
        }

        try context.save()
    }

    static func deleteTransaction(_ transaction: Transaction, context: ModelContext) throws {
        if transaction.entryType.isTransfer, let transferId = transaction.transferId {
            let descriptor = FetchDescriptor<Transaction>(predicate: #Predicate { $0.transferId == transferId })
            let legs = try context.fetch(descriptor)
            for leg in legs {
                context.delete(leg)
            }
        } else {
            context.delete(transaction)
        }
        try context.save()
    }

    static func siblingLeg(of leg: Transaction, transferId: UUID, context: ModelContext) throws -> Transaction? {
        let descriptor = FetchDescriptor<Transaction>(predicate: #Predicate { $0.transferId == transferId })
        return try context.fetch(descriptor).first(where: { $0.id != leg.id })
    }

    static func upsertCardMapping(
        issuer: CardIssuer,
        last4: String,
        account: Account?,
        context: ModelContext
    ) throws {
        let descriptor = FetchDescriptor<CardMapping>()
        let current = try context.fetch(descriptor)
        if let existing = current.first(where: { $0.issuer == issuer && $0.cardLast4 == last4 }) {
            existing.account = account
            existing.updatedAt = .now
        } else {
            context.insert(CardMapping(issuer: issuer, cardLast4: last4, account: account))
        }
        try context.save()
    }

    static func importTransactions(
        dtos: [ImportedTransactionDTO],
        context: ModelContext
    ) throws -> Int {
        let transactions = try context.fetch(FetchDescriptor<Transaction>())
        let mappings = try context.fetch(FetchDescriptor<CardMapping>())
        let accounts = try context.fetch(FetchDescriptor<Account>())
        let unassigned = try findOrCreateUnassignedImportsAccount(accounts: accounts, context: context)

        var inserted = 0

        for dto in dtos {
            if let existing = transactions.first(where: { $0.externalId == dto.externalId }) {
                existing.status = TransactionStatus(rawValue: dto.status) ?? .posted
                existing.rawMerchant = dto.merchant
                existing.updatedAt = .now
                continue
            }

            if transactions.contains(where: { $0.importHash == dto.importHash }) {
                continue
            }

            let issuer = CardIssuer(raw: dto.issuer)
            let mappedAccount = mappings.first(where: { $0.issuer == issuer && $0.cardLast4 == dto.cardLast4 })?.account
            let account = mappedAccount ?? unassigned
            let parsedDate = ISO8601DateFormatter().date(from: dto.timestamp) ?? .now

            let tx = Transaction(
                entryType: .expense,
                account: account,
                amount: dto.amount,
                date: parsedDate,
                notes: "Imported alert",
                cleared: dto.status == "posted",
                source: .email,
                status: TransactionStatus(rawValue: dto.status) ?? .posted,
                externalId: dto.externalId,
                importHash: dto.importHash,
                rawMerchant: dto.merchant,
                normalizedMerchant: dto.merchant,
                originalCurrencyCode: dto.currencyCode,
                originalAmount: dto.amount
            )
            context.insert(tx)
            inserted += 1
        }

        try context.save()
        return inserted
    }

    static func importTransactionsFromCSV(
        data: Data,
        context: ModelContext
    ) throws -> CSVImportSummary {
        let rows = try CSVTransactionParser.parse(data: data)
        var summary = CSVImportSummary()

        var allAccounts = try context.fetch(FetchDescriptor<Account>())
        let allCategories = try context.fetch(FetchDescriptor<Category>())
        let allPayees = try context.fetch(FetchDescriptor<Payee>())
        let existingTransactions = try context.fetch(FetchDescriptor<Transaction>())
        var seenHashes = Set(existingTransactions.compactMap(\.importHash))

        var categoryByName = allCategories.reduce(into: [String: Category]()) { partial, category in
            partial[category.name.lowercased()] = partial[category.name.lowercased()] ?? category
        }
        var payeeByName = allPayees.reduce(into: [String: Payee]()) { partial, payee in
            partial[payee.name.lowercased()] = partial[payee.name.lowercased()] ?? payee
        }
        var accountByName = allAccounts.reduce(into: [String: Account]()) { partial, account in
            partial[account.name.lowercased()] = partial[account.name.lowercased()] ?? account
        }

        for row in rows {
            if seenHashes.contains(row.importHash) {
                summary.skippedDuplicates += 1
                continue
            }

            do {
                switch row.type {
                case "income", "expense":
                    let account = try findOrCreateAccountForCSV(name: row.accountName, cache: &accountByName, allAccounts: &allAccounts, context: context)
                    let entryType: EntryType = row.type == "income" ? .income : .expense
                    let category = try findOrCreateCategoryForCSV(
                        name: row.categoryName,
                        entryType: entryType,
                        cache: &categoryByName,
                        context: context
                    )
                    let payee = try findOrCreatePayeeForCSV(name: row.payeeName, cache: &payeeByName, context: context)

                    context.insert(
                        Transaction(
                            entryType: entryType,
                            account: account,
                            amount: row.amount,
                            date: row.date,
                            notes: row.notes,
                            cleared: row.cleared,
                            category: category,
                            payee: payee,
                            source: .manual,
                            status: row.status,
                            importHash: row.importHash,
                            originalCurrencyCode: row.currencyCode,
                            originalAmount: row.amount,
                            repeatFrequency: row.repeatFrequency
                        )
                    )
                    summary.inserted += 1

                case "transfer":
                    let fromAccount = try findOrCreateAccountForCSV(name: row.fromAccountName, cache: &accountByName, allAccounts: &allAccounts, context: context)
                    let toAccount = try findOrCreateAccountForCSV(name: row.toAccountName, cache: &accountByName, allAccounts: &allAccounts, context: context)
                    let transferId = UUID()

                    context.insert(
                        Transaction(
                            entryType: .transferOut,
                            account: fromAccount,
                            amount: row.amount,
                            date: row.date,
                            notes: row.notes,
                            cleared: row.cleared,
                            transferId: transferId,
                            transferAccountId: toAccount.id,
                            source: .manual,
                            status: row.status,
                            importHash: row.importHash,
                            originalCurrencyCode: row.currencyCode,
                            originalAmount: row.amount,
                            repeatFrequency: row.repeatFrequency
                        )
                    )

                    context.insert(
                        Transaction(
                            entryType: .transferIn,
                            account: toAccount,
                            amount: row.amount,
                            date: row.date,
                            notes: row.notes,
                            cleared: row.cleared,
                            transferId: transferId,
                            transferAccountId: fromAccount.id,
                            source: .manual,
                            status: row.status,
                            importHash: row.importHash,
                            originalCurrencyCode: row.currencyCode,
                            originalAmount: row.amount,
                            repeatFrequency: row.repeatFrequency
                        )
                    )
                    summary.inserted += 2

                default:
                    throw CSVParserError.invalidType(line: row.lineNumber, value: row.type)
                }

                seenHashes.insert(row.importHash)
            } catch {
                summary.failedRows += 1
                summary.failureDetails.append(error.localizedDescription)
            }
        }

        try context.save()
        return summary
    }

    private static func findOrCreateAccountForCSV(
        name: String,
        cache: inout [String: Account],
        allAccounts: inout [Account],
        context: ModelContext
    ) throws -> Account {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if let existing = cache[trimmed.lowercased()] {
            return existing
        }

        let nextSort = (allAccounts.map(\.sortOrder).max() ?? 0) + 1
        let account = Account(
            name: trimmed,
            type: .asset,
            subtype: "bank",
            openingBalance: 0,
            currencyCode: "SGD",
            iconName: "building.columns.fill",
            sortOrder: nextSort
        )
        context.insert(account)
        allAccounts.append(account)
        cache[trimmed.lowercased()] = account
        return account
    }

    private static func findOrCreateCategoryForCSV(
        name: String,
        entryType: EntryType,
        cache: inout [String: Category],
        context: ModelContext
    ) throws -> Category? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }

        if let existing = cache[trimmed.lowercased()] {
            return existing
        }

        let kind: CategoryKind = entryType == .income ? .income : .expense
        let category = try createCategory(name: trimmed, kind: kind, context: context)
        cache[trimmed.lowercased()] = category
        return category
    }

    private static func findOrCreatePayeeForCSV(
        name: String,
        cache: inout [String: Payee],
        context: ModelContext
    ) throws -> Payee? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }
        if let existing = cache[trimmed.lowercased()] {
            existing.lastUsedAt = .now
            return existing
        }

        let payee = Payee(name: trimmed, lastUsedAt: .now)
        context.insert(payee)
        cache[trimmed.lowercased()] = payee
        return payee
    }

    private static func findOrCreateUnassignedImportsAccount(accounts: [Account], context: ModelContext) throws -> Account {
        if let existing = accounts.first(where: { $0.name == "Unassigned Imports" }) {
            return existing
        }
        let account = Account(
            name: "Unassigned Imports",
            type: .liability,
            subtype: "credit card",
            openingBalance: 0,
            iconName: "tray.fill",
            sortOrder: (accounts.map(\.sortOrder).max() ?? 0) + 1,
            issuer: .other,
            cardLast4: nil,
            cardNickname: "Needs Mapping"
        )
        context.insert(account)
        try context.save()
        return account
    }

    private static func isCategoryCompatible(_ category: Category?, with entryType: EntryType) -> Bool {
        guard let category else { return false }
        switch entryType {
        case .income:
            return category.kind == .income || category.kind == .both
        case .expense:
            return category.kind == .expense || category.kind == .both
        case .transferIn, .transferOut:
            return false
        }
    }

    private static func trimOccurrencesBeyondEndDate(
        recurrenceId: UUID,
        repeatEndDate: Date?,
        context: ModelContext
    ) throws {
        guard let repeatEndDate else { return }
        let normalizedEnd = Calendar.current.startOfDay(for: repeatEndDate)
        let descriptor = FetchDescriptor<Transaction>(
            predicate: #Predicate { $0.recurrenceId == recurrenceId }
        )
        let allOccurrences = try context.fetch(descriptor)
        for occurrence in allOccurrences where Calendar.current.startOfDay(for: occurrence.date) > normalizedEnd {
            context.delete(occurrence)
        }
    }

    private static func createMissingOccurrences(
        recurrenceId: UUID,
        anchorDate: Date,
        entryType: EntryType,
        account: Account,
        amount: Decimal,
        notes: String,
        cleared: Bool,
        repeatFrequency: RepeatFrequency,
        repeatEndDate: Date?,
        photoData: Data?,
        category: Category?,
        payee: Payee?,
        context: ModelContext
    ) throws {
        guard repeatFrequency != .never else { return }

        let descriptor = FetchDescriptor<Transaction>(
            predicate: #Predicate { $0.recurrenceId == recurrenceId }
        )
        let existing = try context.fetch(descriptor)
        let existingDays = Set(existing.map { Calendar.current.startOfDay(for: $0.date) })

        let dates = scheduledDates(
            from: anchorDate,
            until: min(Date.now, repeatEndDate ?? Date.now),
            frequency: repeatFrequency
        )
        for date in dates {
            let normalized = Calendar.current.startOfDay(for: date)
            if existingDays.contains(normalized) { continue }

            context.insert(
                Transaction(
                    entryType: entryType,
                    account: account,
                    amount: amount,
                    date: date,
                    notes: notes,
                    cleared: cleared,
                    category: category,
                    payee: payee,
                    recurrenceId: recurrenceId,
                    repeatFrequency: repeatFrequency,
                    repeatEndDate: repeatEndDate,
                    photoData: photoData
                )
            )
        }
    }

    private static func scheduledDates(from startDate: Date, until endDate: Date, frequency: RepeatFrequency) -> [Date] {
        if frequency == .never { return [] }

        let calendar = Calendar.current
        let start = calendar.startOfDay(for: startDate)
        let end = calendar.startOfDay(for: endDate)
        if start > end { return [] }

        var dates: [Date] = [start]
        var cursor = start

        while true {
            guard let next = nextOccurrence(after: cursor, frequency: frequency, calendar: calendar) else { break }
            let normalized = calendar.startOfDay(for: next)
            if normalized > end { break }
            dates.append(normalized)
            cursor = normalized
        }

        return dates
    }

    private static func nextOccurrence(after date: Date, frequency: RepeatFrequency, calendar: Calendar) -> Date? {
        switch frequency {
        case .never:
            return nil
        case .daily:
            return calendar.date(byAdding: .day, value: 1, to: date)
        case .weekly:
            return calendar.date(byAdding: .day, value: 7, to: date)
        case .every2Weeks:
            return calendar.date(byAdding: .day, value: 14, to: date)
        case .every3Weeks:
            return calendar.date(byAdding: .day, value: 21, to: date)
        case .every4Weeks:
            return calendar.date(byAdding: .day, value: 28, to: date)
        case .semimonthly:
            return calendar.date(byAdding: .day, value: 15, to: date)
        case .monthly:
            return calendar.date(byAdding: .month, value: 1, to: date)
        case .every2Months:
            return calendar.date(byAdding: .month, value: 2, to: date)
        case .every3Months:
            return calendar.date(byAdding: .month, value: 3, to: date)
        case .every4Months:
            return calendar.date(byAdding: .month, value: 4, to: date)
        case .every5Months:
            return calendar.date(byAdding: .month, value: 5, to: date)
        case .every6Months:
            return calendar.date(byAdding: .month, value: 6, to: date)
        case .everyYear:
            return calendar.date(byAdding: .year, value: 1, to: date)
        }
    }

    private static func normalizedRepeatEndDate(
        repeatFrequency: RepeatFrequency,
        repeatEndDate: Date?,
        anchorDate: Date
    ) -> Date? {
        guard repeatFrequency != .never else { return nil }
        guard let repeatEndDate else { return nil }
        return max(Calendar.current.startOfDay(for: repeatEndDate), Calendar.current.startOfDay(for: anchorDate))
    }
}
