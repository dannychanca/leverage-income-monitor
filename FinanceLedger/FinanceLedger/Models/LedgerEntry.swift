import Foundation
import SwiftData

enum AccountType: String, Codable, CaseIterable, Identifiable {
    case asset
    case liability

    var id: String { rawValue }

    var title: String {
        switch self {
        case .asset: return "Asset"
        case .liability: return "Liability"
        }
    }
}

enum AccountCardStyle: String, Codable, CaseIterable, Identifiable {
    case ocean
    case emerald
    case amber
    case rose
    case slate
    case violet

    var id: String { rawValue }
}

enum CardIssuer: String, Codable, CaseIterable, Identifiable {
    case scb
    case dbs
    case citi
    case amex
    case other

    var id: String { rawValue }

    init(raw: String) {
        self = CardIssuer(rawValue: raw.lowercased()) ?? .other
    }
}

enum CategoryKind: String, Codable, CaseIterable, Identifiable {
    case income
    case expense
    case both

    var id: String { rawValue }
}

enum EntryType: String, Codable, CaseIterable, Identifiable {
    case income
    case expense
    case transferIn
    case transferOut

    var id: String { rawValue }

    var isTransfer: Bool {
        self == .transferIn || self == .transferOut
    }
}

enum TransactionSource: String, Codable, CaseIterable, Identifiable {
    case manual
    case email
    case bankSync

    var id: String { rawValue }
}

enum TransactionStatus: String, Codable, CaseIterable, Identifiable {
    case pending
    case posted
    case reversed

    var id: String { rawValue }
}

enum RepeatFrequency: String, Codable, CaseIterable, Identifiable {
    case never
    case daily
    case weekly
    case every2Weeks
    case every3Weeks
    case every4Weeks
    case semimonthly
    case monthly
    case every2Months
    case every3Months
    case every4Months
    case every5Months
    case every6Months
    case everyYear

    var id: String { rawValue }

    var title: String {
        switch self {
        case .never: return "Never"
        case .daily: return "Daily"
        case .weekly: return "Weekly"
        case .every2Weeks: return "Every 2 Weeks"
        case .every3Weeks: return "Every 3 Weeks"
        case .every4Weeks: return "Every 4 Weeks"
        case .semimonthly: return "Semimonthly"
        case .monthly: return "Monthly"
        case .every2Months: return "Every 2 Months"
        case .every3Months: return "Every 3 Months"
        case .every4Months: return "Every 4 Months"
        case .every5Months: return "Every 5 Months"
        case .every6Months: return "Every 6 Months"
        case .everyYear: return "Every Year"
        }
    }
}

@Model
final class Account {
    @Attribute(.unique) var id: UUID
    var name: String
    var type: AccountType
    var subtype: String
    var openingBalance: Decimal
    var currencyCode: String
    var iconName: String
    var cardStyle: AccountCardStyle
    var sortOrder: Int
    var isArchived: Bool
    var issuer: CardIssuer?
    var cardLast4: String?
    var cardNickname: String?
    var createdAt: Date
    var updatedAt: Date

    @Relationship(deleteRule: .cascade, inverse: \Transaction.account)
    var transactions: [Transaction]

    @Relationship(deleteRule: .nullify, inverse: \CardMapping.account)
    var cardMappings: [CardMapping]

    init(
        id: UUID = UUID(),
        name: String,
        type: AccountType,
        subtype: String = "bank",
        openingBalance: Decimal,
        currencyCode: String = "SGD",
        iconName: String = "wallet.pass.fill",
        cardStyle: AccountCardStyle = .ocean,
        sortOrder: Int = 0,
        isArchived: Bool = false,
        issuer: CardIssuer? = nil,
        cardLast4: String? = nil,
        cardNickname: String? = nil,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.name = name
        self.type = type
        self.subtype = subtype
        self.openingBalance = openingBalance
        self.currencyCode = currencyCode
        self.iconName = iconName
        self.cardStyle = cardStyle
        self.sortOrder = sortOrder
        self.isArchived = isArchived
        self.issuer = issuer
        self.cardLast4 = cardLast4
        self.cardNickname = cardNickname
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.transactions = []
        self.cardMappings = []
    }
}

@Model
final class AccountSubtypeOption {
    @Attribute(.unique) var id: UUID
    var name: String
    var sortOrder: Int
    var isArchived: Bool
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        name: String,
        sortOrder: Int = 0,
        isArchived: Bool = false,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.name = name
        self.sortOrder = sortOrder
        self.isArchived = isArchived
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

extension Account {
    var normalizedSubtype: String {
        subtype
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "-", with: " ")
    }

    var isCreditCardSubtype: Bool {
        normalizedSubtype == "credit card" || normalizedSubtype == "creditcard"
    }
}

@Model
final class Category {
    @Attribute(.unique) var id: UUID
    var name: String
    var kind: CategoryKind
    var iconName: String
    var sortOrder: Int
    var isArchived: Bool

    init(
        id: UUID = UUID(),
        name: String,
        kind: CategoryKind,
        iconName: String = "tag.fill",
        sortOrder: Int = 0,
        isArchived: Bool = false
    ) {
        self.id = id
        self.name = name
        self.kind = kind
        self.iconName = iconName
        self.sortOrder = sortOrder
        self.isArchived = isArchived
    }
}

@Model
final class Payee {
    @Attribute(.unique) var id: UUID
    var name: String
    var lastUsedAt: Date?
    var defaultCategory: Category?

    init(
        id: UUID = UUID(),
        name: String,
        lastUsedAt: Date? = nil,
        defaultCategory: Category? = nil
    ) {
        self.id = id
        self.name = name
        self.lastUsedAt = lastUsedAt
        self.defaultCategory = defaultCategory
    }
}

@Model
final class Transaction {
    @Attribute(.unique) var id: UUID
    var entryType: EntryType
    var amount: Decimal
    var date: Date
    var notes: String
    var cleared: Bool
    var transferId: UUID?
    var transferAccountId: UUID?
    var recurrenceId: UUID?
    var source: TransactionSource
    var status: TransactionStatus
    var externalId: String?
    var importHash: String?
    var rawMerchant: String?
    var normalizedMerchant: String?
    var originalCurrencyCode: String
    var originalAmount: Decimal
    var fxRateToAccountCurrency: Decimal?
    var repeatFrequency: RepeatFrequency
    var repeatEndDate: Date?
    var photoData: Data?
    var createdAt: Date
    var updatedAt: Date

    var account: Account
    var category: Category?
    var payee: Payee?

    init(
        id: UUID = UUID(),
        entryType: EntryType,
        account: Account,
        amount: Decimal,
        date: Date = .now,
        notes: String = "",
        cleared: Bool = true,
        category: Category? = nil,
        payee: Payee? = nil,
        transferId: UUID? = nil,
        transferAccountId: UUID? = nil,
        recurrenceId: UUID? = nil,
        source: TransactionSource = .manual,
        status: TransactionStatus = .posted,
        externalId: String? = nil,
        importHash: String? = nil,
        rawMerchant: String? = nil,
        normalizedMerchant: String? = nil,
        originalCurrencyCode: String = "SGD",
        originalAmount: Decimal? = nil,
        fxRateToAccountCurrency: Decimal? = nil,
        repeatFrequency: RepeatFrequency = .never,
        repeatEndDate: Date? = nil,
        photoData: Data? = nil,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.entryType = entryType
        self.account = account
        self.amount = amount
        self.date = date
        self.notes = notes
        self.cleared = cleared
        self.category = category
        self.payee = payee
        self.transferId = transferId
        self.transferAccountId = transferAccountId
        self.recurrenceId = recurrenceId
        self.source = source
        self.status = status
        self.externalId = externalId
        self.importHash = importHash
        self.rawMerchant = rawMerchant
        self.normalizedMerchant = normalizedMerchant
        self.originalCurrencyCode = originalCurrencyCode
        self.originalAmount = originalAmount ?? amount
        self.fxRateToAccountCurrency = fxRateToAccountCurrency
        self.repeatFrequency = repeatFrequency
        self.repeatEndDate = repeatEndDate
        self.photoData = photoData
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

@Model
final class CardMapping {
    @Attribute(.unique) var id: UUID
    var issuer: CardIssuer
    var cardLast4: String
    var createdAt: Date
    var updatedAt: Date
    var account: Account?

    init(
        id: UUID = UUID(),
        issuer: CardIssuer,
        cardLast4: String,
        account: Account? = nil,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.issuer = issuer
        self.cardLast4 = cardLast4
        self.account = account
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var key: String {
        "\(issuer.rawValue)|\(cardLast4)"
    }
}

struct ImportedTransactionDTO: Codable, Identifiable {
    var id: String { externalId }
    let externalId: String
    let importHash: String
    let issuer: String
    let cardLast4: String
    let merchant: String
    let amount: Decimal
    let currencyCode: String
    let timestamp: String
    let status: String
    let authCode: String?
    let city: String?
    let country: String?
}

struct CardMappingDTO: Codable, Identifiable {
    let id: String
    let issuer: String
    let cardLast4: String
    let accountId: UUID?
}
