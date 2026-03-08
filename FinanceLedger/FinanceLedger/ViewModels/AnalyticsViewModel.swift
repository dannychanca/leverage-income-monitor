import Foundation
import SwiftUI

@MainActor
final class AnalyticsViewModel: ObservableObject {
    @Published var selectedPeriod: AnalyticsPeriod = .sixMonths
    @Published var selectedForecastWindow: ForecastWindow = .days30
    @Published var selectedForecastGranularity: ForecastGranularity = .weekly
    @Published var monthlyAggregates: [MonthlyAggregate] = []
    @Published var netWorthPoints: [MonthlyNetWorthPoint] = []
    @Published var totalIncome: Decimal = 0
    @Published var totalExpense: Decimal = 0
    @Published var selectedDrillDown: MonthlyDrillDown?
    @Published var selectedPeriodBreakdown: PeriodCategoryBreakdown?
    @Published var selectedForecastDrillDown: RecurringForecastDrillDown?
    @Published var recurringForecast: RecurringForecast = .empty(window: .days30)
    @Published var recurringForecastTrend: RecurringForecastTrend = .empty(granularity: .weekly)
    @Published var customStartDate: Date
    @Published var customEndDate: Date
    @Published var rangeStart: Date
    @Published var rangeEnd: Date

    var netIncome: Decimal { totalIncome - totalExpense }
    var isCustomPeriod: Bool { selectedPeriod == .custom }

    var customRangeTitle: String {
        let start = customStartDate.formatted(.dateTime.day().month(.abbreviated).year())
        let end = customEndDate.formatted(.dateTime.day().month(.abbreviated).year())
        return "\(start) - \(end)"
    }

    private let service: AnalyticsService
    private var cached: [String: AnalyticsSnapshot] = [:]
    private var currentTransactions: [Transaction] = []
    private var currentAccounts: [Account] = []

    init(service: AnalyticsService = AnalyticsService()) {
        self.service = service
        let calendar = Calendar.current
        let today = Date.now
        self.customEndDate = today
        self.customStartDate = calendar.date(byAdding: .month, value: -2, to: today) ?? today
        self.rangeStart = calendar.date(byAdding: .month, value: -5, to: today) ?? today
        self.rangeEnd = today
    }

    func updateData(accounts: [Account], transactions: [Transaction]) {
        currentAccounts = accounts
        currentTransactions = transactions
        recalculate(period: selectedPeriod)
    }

    func setPeriod(_ period: AnalyticsPeriod) {
        guard period != selectedPeriod else { return }
        withAnimation(.easeInOut(duration: 0.25)) {
            selectedPeriod = period
            recalculate(period: period)
        }
    }

    func setCustomRange(start: Date, end: Date) {
        withAnimation(.easeInOut(duration: 0.25)) {
            customStartDate = min(start, end)
            customEndDate = max(start, end)
            selectedPeriod = .custom
            recalculate(period: .custom)
        }
    }

    func setForecastWindow(_ window: ForecastWindow) {
        guard window != selectedForecastWindow else { return }
        withAnimation(.easeInOut(duration: 0.25)) {
            selectedForecastWindow = window
            recalculateForecast()
        }
    }

    func setForecastGranularity(_ granularity: ForecastGranularity) {
        guard granularity != selectedForecastGranularity else { return }
        withAnimation(.easeInOut(duration: 0.25)) {
            selectedForecastGranularity = granularity
            selectedForecastDrillDown = nil
            recalculateForecast()
        }
    }

    func selectForecastPeriod(_ date: Date?) {
        guard let date else {
            selectedForecastDrillDown = nil
            return
        }
        selectedForecastDrillDown = service.recurringForecastDrillDown(
            transactions: currentTransactions,
            granularity: selectedForecastGranularity,
            selectedDate: date
        )
    }

    func selectMonth(_ month: Date?) {
        guard let month else {
            selectedDrillDown = nil
            return
        }
        let normalized = service.monthStart(for: month)
        selectedDrillDown = service.drillDown(month: normalized, transactions: currentTransactions)
    }

    func openPeriodBreakdown(_ entryType: EntryType) {
        selectedPeriodBreakdown = service.periodCategoryBreakdown(
            entryType: entryType,
            start: rangeStart,
            end: rangeEnd,
            transactions: currentTransactions
        )
    }

    private func recalculate(period: AnalyticsPeriod) {
        let cacheKey: String
        if period == .custom {
            cacheKey = "\(period.rawValue)-\(customStartDate.timeIntervalSince1970)-\(customEndDate.timeIntervalSince1970)-\(dataVersion)"
        } else {
            cacheKey = "\(period.rawValue)-\(dataVersion)"
        }

        let snapshot: AnalyticsSnapshot

        if let cachedSnapshot = cached[cacheKey] {
            snapshot = cachedSnapshot
        } else {
            let computed: AnalyticsSnapshot
            if period == .custom {
                computed = service.buildSnapshot(
                    rangeStart: customStartDate,
                    rangeEnd: customEndDate,
                    accounts: currentAccounts,
                    transactions: currentTransactions
                )
            } else {
                computed = service.buildSnapshot(period: period, accounts: currentAccounts, transactions: currentTransactions)
            }
            cached[cacheKey] = computed
            snapshot = computed
        }

        monthlyAggregates = snapshot.monthlyAggregates
        netWorthPoints = snapshot.netWorthPoints
        totalIncome = snapshot.totalIncome
        totalExpense = snapshot.totalExpense
        rangeStart = snapshot.rangeStart
        rangeEnd = snapshot.rangeEnd

        if let selected = selectedDrillDown?.month {
            let months = Set(snapshot.monthlyAggregates.map(\.month))
            if months.contains(selected) {
                selectedDrillDown = service.drillDown(month: selected, transactions: currentTransactions)
            } else {
                selectedDrillDown = nil
            }
        }

        recalculateForecast()
    }

    private func recalculateForecast() {
        recurringForecast = service.recurringForecast(
            transactions: currentTransactions,
            window: selectedForecastWindow
        )
        recurringForecastTrend = service.recurringForecastTrend(
            transactions: currentTransactions,
            granularity: selectedForecastGranularity
        )
    }

    private var dataVersion: String {
        let accountsStamp = currentAccounts.map(\.updatedAt).max()?.timeIntervalSince1970 ?? 0
        let txStamp = currentTransactions.map(\.updatedAt).max()?.timeIntervalSince1970 ?? 0
        return "a\(currentAccounts.count)-t\(currentTransactions.count)-\(accountsStamp)-\(txStamp)"
    }
}
