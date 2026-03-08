import Foundation

enum ForecastWindow: Int, CaseIterable, Identifiable {
    case days30 = 30
    case days60 = 60
    case days90 = 90

    var id: Int { rawValue }

    var title: String {
        "\(rawValue)D"
    }
}

enum ForecastGranularity: String, CaseIterable, Identifiable {
    case weekly
    case monthly
    case yearly

    var id: String { rawValue }

    var title: String {
        switch self {
        case .weekly: return "Weekly"
        case .monthly: return "Monthly"
        case .yearly: return "Yearly"
        }
    }
}

enum AnalyticsPeriod: String, Identifiable {
    case oneMonth
    case threeMonths
    case sixMonths
    case oneYear
    case ytd
    case all
    case custom

    static var presetCases: [AnalyticsPeriod] {
        [.oneMonth, .threeMonths, .sixMonths, .oneYear, .ytd, .all]
    }

    var id: String { rawValue }

    var title: String {
        switch self {
        case .oneMonth: return "1M"
        case .threeMonths: return "3M"
        case .sixMonths: return "6M"
        case .oneYear: return "1Y"
        case .ytd: return "YTD"
        case .all: return "ALL"
        case .custom: return "Custom"
        }
    }
}

struct MonthlyAggregate: Identifiable, Equatable {
    var id: Date { month }
    let month: Date
    let income: Decimal
    let expense: Decimal
}

struct MonthlyNetWorthPoint: Identifiable, Equatable {
    var id: Date { month }
    let month: Date
    let netWorth: Decimal
}

struct CategoryTotal: Identifiable {
    let categoryId: UUID?
    var id: String {
        "\(categoryId?.uuidString ?? "uncategorized")|\(categoryName)|\(iconName)"
    }
    let categoryName: String
    let iconName: String
    let total: Decimal
    let percentage: Double
}

struct CategoryBreakdown {
    let topExpenseCategories: [CategoryTotal]
    let topIncomeCategories: [CategoryTotal]
}

struct MonthlyDrillDown: Identifiable {
    var id: Date { month }
    let month: Date
    let totalIncome: Decimal
    let totalExpense: Decimal
    let netIncome: Decimal
    let breakdown: CategoryBreakdown
}

struct PayeeTotal: Identifiable {
    var id: String { payeeName }
    let payeeName: String
    let total: Decimal
    let count: Int
}

struct CategoryTransactionItem: Identifiable {
    let id: UUID
    let date: Date
    let payeeName: String
    let accountName: String
    let amount: Decimal
    let notes: String
}

struct CategoryTransactionDrillDown: Identifiable {
    let month: Date
    let entryType: EntryType
    let categoryName: String
    let iconName: String
    let total: Decimal
    let payeeTotals: [PayeeTotal]
    let transactions: [CategoryTransactionItem]

    var id: String {
        "\(month.timeIntervalSince1970)|\(entryType.rawValue)|\(categoryName)"
    }
}

struct PeriodCategoryBreakdown: Identifiable {
    let entryType: EntryType
    let rangeStart: Date
    let rangeEnd: Date
    let total: Decimal
    let categories: [CategoryTotal]

    var id: String {
        "\(entryType.rawValue)|\(rangeStart.timeIntervalSince1970)|\(rangeEnd.timeIntervalSince1970)"
    }
}

struct CategoryPayeeBreakdown: Identifiable {
    let entryType: EntryType
    let rangeStart: Date
    let rangeEnd: Date
    let categoryId: UUID?
    let categoryName: String
    let iconName: String
    let total: Decimal
    let payees: [PayeeTotal]

    var id: String {
        "\(entryType.rawValue)|\(categoryName)|\(rangeStart.timeIntervalSince1970)|\(rangeEnd.timeIntervalSince1970)"
    }
}

struct PayeeTransactionDrillDown: Identifiable {
    let entryType: EntryType
    let rangeStart: Date
    let rangeEnd: Date
    let categoryName: String
    let payeeName: String
    let total: Decimal
    let transactions: [CategoryTransactionItem]

    var id: String {
        "\(entryType.rawValue)|\(categoryName)|\(payeeName)|\(rangeStart.timeIntervalSince1970)|\(rangeEnd.timeIntervalSince1970)"
    }
}

struct RecurringForecastItem: Identifiable {
    let id: String
    let date: Date
    let entryType: EntryType
    let amount: Decimal
    let title: String
    let accountName: String
    let frequency: RepeatFrequency
}

struct RecurringForecast {
    let window: ForecastWindow
    let income: Decimal
    let expense: Decimal
    let net: Decimal
    let upcomingItems: [RecurringForecastItem]

    static func empty(window: ForecastWindow) -> RecurringForecast {
        RecurringForecast(window: window, income: 0, expense: 0, net: 0, upcomingItems: [])
    }
}

struct RecurringForecastTrendPoint: Identifiable {
    let periodStart: Date
    let income: Decimal
    let expense: Decimal

    var id: Date { periodStart }
    var net: Decimal { income - expense }
}

struct RecurringForecastTrend {
    let granularity: ForecastGranularity
    let points: [RecurringForecastTrendPoint]
    let totalIncome: Decimal
    let totalExpense: Decimal
    let net: Decimal

    static func empty(granularity: ForecastGranularity) -> RecurringForecastTrend {
        RecurringForecastTrend(
            granularity: granularity,
            points: [],
            totalIncome: 0,
            totalExpense: 0,
            net: 0
        )
    }
}

struct RecurringForecastDrillDown: Identifiable {
    let granularity: ForecastGranularity
    let periodStart: Date
    let periodEnd: Date
    let incomeItems: [RecurringForecastItem]
    let expenseItems: [RecurringForecastItem]

    var id: String {
        "\(granularity.rawValue)|\(periodStart.timeIntervalSince1970)"
    }

    var incomeTotal: Decimal {
        incomeItems.reduce(Decimal.zero) { $0 + $1.amount }
    }

    var expenseTotal: Decimal {
        expenseItems.reduce(Decimal.zero) { $0 + $1.amount }
    }

    var net: Decimal { incomeTotal - expenseTotal }
}

struct AnalyticsSnapshot {
    let rangeStart: Date
    let rangeEnd: Date
    let monthlyAggregates: [MonthlyAggregate]
    let netWorthPoints: [MonthlyNetWorthPoint]
    let totalIncome: Decimal
    let totalExpense: Decimal
}
