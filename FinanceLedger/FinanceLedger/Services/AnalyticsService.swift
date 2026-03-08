import Foundation

struct AnalyticsService {
    private let calendar = Calendar.current
    
    private struct CategoryKey: Hashable {
        let categoryId: UUID?
        let name: String
        let iconName: String
    }

    func periodRange(period: AnalyticsPeriod, transactions: [Transaction], referenceDate: Date = .now) -> (start: Date, end: Date) {
        let end = referenceDate
        let endMonth = monthStart(for: end)

        switch period {
        case .oneMonth:
            return (endMonth, end)
        case .threeMonths:
            return (calendar.date(byAdding: .month, value: -2, to: endMonth) ?? endMonth, end)
        case .sixMonths:
            return (calendar.date(byAdding: .month, value: -5, to: endMonth) ?? endMonth, end)
        case .oneYear:
            return (calendar.date(byAdding: .month, value: -11, to: endMonth) ?? endMonth, end)
        case .ytd:
            let year = calendar.component(.year, from: end)
            let start = calendar.date(from: DateComponents(year: year, month: 1, day: 1)) ?? endMonth
            return (start, end)
        case .all:
            let earliest = transactions.map(\.date).min() ?? end
            return (monthStart(for: earliest), end)
        case .custom:
            return (endMonth, end)
        }
    }

    func buildSnapshot(
        period: AnalyticsPeriod,
        accounts: [Account],
        transactions: [Transaction],
        referenceDate: Date = .now
    ) -> AnalyticsSnapshot {
        let scopedAccounts = accounts.filter { !$0.isArchived }
        let posted = postedNonReversed(transactions)
        let range = periodRange(period: period, transactions: posted, referenceDate: referenceDate)
        let months = monthsInRange(start: range.start, end: range.end)

        return buildSnapshot(
            rangeStart: range.start,
            rangeEnd: range.end,
            accounts: scopedAccounts,
            transactions: posted
        )
    }

    func buildSnapshot(
        rangeStart: Date,
        rangeEnd: Date,
        accounts: [Account],
        transactions: [Transaction]
    ) -> AnalyticsSnapshot {
        let scopedAccounts = accounts.filter { !$0.isArchived }
        let posted = postedNonReversed(transactions)

        let start = min(rangeStart, rangeEnd)
        let end = max(rangeStart, rangeEnd)
        let months = monthsInRange(start: start, end: end)

        let aggregates = monthlyAggregates(months: months, transactions: posted, start: start, end: end)
        let income = aggregates.reduce(Decimal.zero) { $0 + $1.income }
        let expense = aggregates.reduce(Decimal.zero) { $0 + $1.expense }
        let netWorth = monthlyNetWorth(months: months, accounts: scopedAccounts, transactions: posted)

        return AnalyticsSnapshot(
            rangeStart: start,
            rangeEnd: end,
            monthlyAggregates: aggregates,
            netWorthPoints: netWorth,
            totalIncome: income,
            totalExpense: expense
        )
    }

    func drillDown(
        month: Date,
        transactions: [Transaction]
    ) -> MonthlyDrillDown {
        let monthStart = monthStart(for: month)
        guard let monthEnd = calendar.date(byAdding: DateComponents(month: 1, day: -1), to: monthStart) else {
            return MonthlyDrillDown(month: monthStart, totalIncome: 0, totalExpense: 0, netIncome: 0, breakdown: CategoryBreakdown(topExpenseCategories: [], topIncomeCategories: []))
        }

        let monthly = postedNonReversed(transactions).filter { tx in
            tx.date >= monthStart && tx.date <= monthEnd
        }

        let incomeTx = monthly.filter { $0.entryType == .income }
        let expenseTx = monthly.filter { $0.entryType == .expense }

        let totalIncome = incomeTx.reduce(Decimal.zero) { $0 + $1.amount }
        let totalExpense = expenseTx.reduce(Decimal.zero) { $0 + $1.amount }

        let breakdown = CategoryBreakdown(
            topExpenseCategories: topCategories(from: expenseTx, total: totalExpense),
            topIncomeCategories: topCategories(from: incomeTx, total: totalIncome)
        )

        return MonthlyDrillDown(
            month: monthStart,
            totalIncome: totalIncome,
            totalExpense: totalExpense,
            netIncome: totalIncome - totalExpense,
            breakdown: breakdown
        )
    }

    func categoryDrillDown(
        month: Date,
        category: CategoryTotal,
        entryType: EntryType,
        transactions: [Transaction]
    ) -> CategoryTransactionDrillDown {
        let monthStart = monthStart(for: month)
        guard let nextMonth = calendar.date(byAdding: .month, value: 1, to: monthStart) else {
            return CategoryTransactionDrillDown(
                month: monthStart,
                entryType: entryType,
                categoryName: category.categoryName,
                iconName: category.iconName,
                total: 0,
                payeeTotals: [],
                transactions: []
            )
        }

        let scoped = postedNonReversed(transactions)
            .filter { tx in
                tx.entryType == entryType &&
                tx.date >= monthStart &&
                tx.date < nextMonth &&
                categoryMatches(tx: tx, category: category)
            }
            .sorted { $0.date > $1.date }

        let items = scoped.map { tx in
            CategoryTransactionItem(
                id: tx.id,
                date: tx.date,
                payeeName: tx.payee?.name ?? "No Payee",
                accountName: tx.account.name,
                amount: tx.amount,
                notes: tx.notes
            )
        }

        let total = scoped.reduce(Decimal.zero) { $0 + $1.amount }
        let payeeTotals = topPayees(from: scoped)

        return CategoryTransactionDrillDown(
            month: monthStart,
            entryType: entryType,
            categoryName: category.categoryName,
            iconName: category.iconName,
            total: total,
            payeeTotals: payeeTotals,
            transactions: items
        )
    }

    func periodCategoryBreakdown(
        entryType: EntryType,
        start: Date,
        end: Date,
        transactions: [Transaction]
    ) -> PeriodCategoryBreakdown {
        let normalizedStart = min(start, end)
        let normalizedEnd = max(start, end)
        let scoped = postedNonReversed(transactions).filter { tx in
            tx.entryType == entryType && tx.date >= normalizedStart && tx.date <= normalizedEnd
        }
        let total = scoped.reduce(Decimal.zero) { $0 + $1.amount }
        let categories = categoryTotals(from: scoped, total: total, limit: nil)

        return PeriodCategoryBreakdown(
            entryType: entryType,
            rangeStart: normalizedStart,
            rangeEnd: normalizedEnd,
            total: total,
            categories: categories
        )
    }

    func categoryPayeeBreakdown(
        entryType: EntryType,
        category: CategoryTotal,
        start: Date,
        end: Date,
        transactions: [Transaction]
    ) -> CategoryPayeeBreakdown {
        let normalizedStart = min(start, end)
        let normalizedEnd = max(start, end)

        let scoped = postedNonReversed(transactions)
            .filter { tx in
                tx.entryType == entryType &&
                tx.date >= normalizedStart &&
                tx.date <= normalizedEnd &&
                categoryMatches(tx: tx, category: category)
            }

        let total = scoped.reduce(Decimal.zero) { $0 + $1.amount }
        let payees = topPayees(from: scoped)

        return CategoryPayeeBreakdown(
            entryType: entryType,
            rangeStart: normalizedStart,
            rangeEnd: normalizedEnd,
            categoryId: category.categoryId,
            categoryName: category.categoryName,
            iconName: category.iconName,
            total: total,
            payees: payees
        )
    }

    func payeeTransactionDrillDown(
        entryType: EntryType,
        category: CategoryTotal,
        payeeName: String,
        start: Date,
        end: Date,
        transactions: [Transaction]
    ) -> PayeeTransactionDrillDown {
        let normalizedStart = min(start, end)
        let normalizedEnd = max(start, end)

        let scoped = postedNonReversed(transactions)
            .filter { tx in
                tx.entryType == entryType &&
                tx.date >= normalizedStart &&
                tx.date <= normalizedEnd &&
                categoryMatches(tx: tx, category: category) &&
                (tx.payee?.name ?? "No Payee").caseInsensitiveCompare(payeeName) == .orderedSame
            }
            .sorted { $0.date > $1.date }

        let items = scoped.map { tx in
            CategoryTransactionItem(
                id: tx.id,
                date: tx.date,
                payeeName: tx.payee?.name ?? "No Payee",
                accountName: tx.account.name,
                amount: tx.amount,
                notes: tx.notes
            )
        }

        return PayeeTransactionDrillDown(
            entryType: entryType,
            rangeStart: normalizedStart,
            rangeEnd: normalizedEnd,
            categoryName: category.categoryName,
            payeeName: payeeName,
            total: scoped.reduce(Decimal.zero) { $0 + $1.amount },
            transactions: items
        )
    }

    func recurringForecast(
        transactions: [Transaction],
        window: ForecastWindow,
        referenceDate: Date = .now
    ) -> RecurringForecast {
        let start = calendar.startOfDay(for: referenceDate)
        guard let end = calendar.date(byAdding: .day, value: window.rawValue, to: start) else {
            return .empty(window: window)
        }
        var items = projectedRecurringItems(transactions: transactions, start: start, end: end)
        items.sort { $0.date < $1.date }
        let income = items.filter { $0.entryType == .income }.reduce(Decimal.zero) { $0 + $1.amount }
        let expense = items.filter { $0.entryType == .expense }.reduce(Decimal.zero) { $0 + $1.amount }

        return RecurringForecast(
            window: window,
            income: income,
            expense: expense,
            net: income - expense,
            upcomingItems: items
        )
    }

    func recurringForecastTrend(
        transactions: [Transaction],
        granularity: ForecastGranularity,
        referenceDate: Date = .now
    ) -> RecurringForecastTrend {
        let start = calendar.startOfDay(for: referenceDate)
        let bucketStarts = forecastBucketStarts(granularity: granularity, from: start)
        guard let rangeStart = bucketStarts.first,
              let lastBucket = bucketStarts.last,
              let rangeEnd = forecastRangeEnd(granularity: granularity, lastBucketStart: lastBucket) else {
            return .empty(granularity: granularity)
        }
        var byBucket: [Date: (income: Decimal, expense: Decimal)] = Dictionary(
            uniqueKeysWithValues: bucketStarts.map { ($0, (.zero, .zero)) }
        )
        let projectedItems = projectedRecurringItems(transactions: transactions, start: rangeStart, end: rangeEnd)
        for item in projectedItems {
            appendForecastAmount(
                date: item.date,
                entryType: item.entryType,
                amount: item.amount,
                granularity: granularity,
                store: &byBucket
            )
        }

        let points = bucketStarts.map { bucketStart in
            let values = byBucket[bucketStart] ?? (.zero, .zero)
            return RecurringForecastTrendPoint(
                periodStart: bucketStart,
                income: values.income,
                expense: values.expense
            )
        }

        let totalIncome = points.reduce(Decimal.zero) { $0 + $1.income }
        let totalExpense = points.reduce(Decimal.zero) { $0 + $1.expense }
        return RecurringForecastTrend(
            granularity: granularity,
            points: points,
            totalIncome: totalIncome,
            totalExpense: totalExpense,
            net: totalIncome - totalExpense
        )
    }

    func recurringForecastDrillDown(
        transactions: [Transaction],
        granularity: ForecastGranularity,
        selectedDate: Date,
        referenceDate: Date = .now
    ) -> RecurringForecastDrillDown? {
        let start = calendar.startOfDay(for: referenceDate)
        let bucketStarts = forecastBucketStarts(granularity: granularity, from: start)
        guard let overallStart = bucketStarts.first,
              let lastBucket = bucketStarts.last,
              let overallEnd = forecastRangeEnd(granularity: granularity, lastBucketStart: lastBucket) else {
            return nil
        }

        let periodStart = normalizeForecastBucketStart(selectedDate, granularity: granularity)
        guard bucketStarts.contains(periodStart),
              let periodEnd = forecastRangeEnd(granularity: granularity, lastBucketStart: periodStart) else {
            return nil
        }

        let projectedItems = projectedRecurringItems(transactions: transactions, start: overallStart, end: overallEnd)
        let scoped = projectedItems.filter { item in
            let day = calendar.startOfDay(for: item.date)
            return day >= periodStart && day <= periodEnd
        }
        let incomeItems = scoped
            .filter { $0.entryType == .income }
            .sorted { $0.amount > $1.amount }
        let expenseItems = scoped
            .filter { $0.entryType == .expense }
            .sorted { $0.amount > $1.amount }

        return RecurringForecastDrillDown(
            granularity: granularity,
            periodStart: periodStart,
            periodEnd: periodEnd,
            incomeItems: incomeItems,
            expenseItems: expenseItems
        )
    }

    private func monthlyAggregates(months: [Date], transactions: [Transaction], start: Date, end: Date) -> [MonthlyAggregate] {
        let scoped = transactions.filter { tx in
            tx.date >= start && tx.date <= end && (tx.entryType == .income || tx.entryType == .expense)
        }

        let grouped = Dictionary(grouping: scoped) { tx in
            monthStart(for: tx.date)
        }

        return months.map { month in
            let monthly = grouped[month] ?? []
            let income = monthly.filter { $0.entryType == .income }.reduce(Decimal.zero) { $0 + $1.amount }
            let expense = monthly.filter { $0.entryType == .expense }.reduce(Decimal.zero) { $0 + $1.amount }
            return MonthlyAggregate(month: month, income: income, expense: expense)
        }
    }

    private func monthlyNetWorth(months: [Date], accounts: [Account], transactions: [Transaction]) -> [MonthlyNetWorthPoint] {
        let sortedTransactions = transactions.sorted { $0.date < $1.date }
        var index = 0
        var runningBalances: [UUID: Decimal] = Dictionary(uniqueKeysWithValues: accounts.map { ($0.id, $0.openingBalance) })

        var result: [MonthlyNetWorthPoint] = []
        for month in months {
            guard let monthEnd = calendar.date(byAdding: DateComponents(month: 1, day: -1), to: monthStart(for: month)) else { continue }

            while index < sortedTransactions.count && sortedTransactions[index].date <= monthEnd {
                let tx = sortedTransactions[index]
                let accountId = tx.account.id
                let accountType = tx.account.type
                let current = runningBalances[accountId] ?? tx.account.openingBalance
                runningBalances[accountId] = current + AccountingEngine.effect(entryType: tx.entryType, accountType: accountType, amount: tx.amount)
                index += 1
            }

            let assetTotal = accounts
                .filter { $0.type == .asset }
                .reduce(Decimal.zero) { $0 + (runningBalances[$1.id] ?? $1.openingBalance) }
            let liabilityTotal = accounts
                .filter { $0.type == .liability }
                .reduce(Decimal.zero) { $0 + (runningBalances[$1.id] ?? $1.openingBalance) }

            result.append(MonthlyNetWorthPoint(month: month, netWorth: assetTotal - liabilityTotal))
        }

        return result
    }

    private func topCategories(from transactions: [Transaction], total: Decimal) -> [CategoryTotal] {
        categoryTotals(from: transactions, total: total, limit: 5)
    }

    private func categoryTotals(from transactions: [Transaction], total: Decimal, limit: Int?) -> [CategoryTotal] {
        guard total > 0 else { return [] }
        let grouped = Dictionary(grouping: transactions) { tx in
            CategoryKey(
                categoryId: tx.category?.id,
                name: tx.category?.name ?? "Uncategorized",
                iconName: tx.category?.iconName ?? "questionmark.circle"
            )
        }

        let totals: [CategoryTotal] = grouped
            .map { key, value in
                let sum = value.reduce(Decimal.zero) { $0 + $1.amount }
                let percentage = (NSDecimalNumber(decimal: sum).doubleValue / NSDecimalNumber(decimal: total).doubleValue) * 100.0
                return CategoryTotal(categoryId: key.categoryId, categoryName: key.name, iconName: key.iconName, total: sum, percentage: percentage)
            }
            .sorted { $0.total > $1.total }
        if let limit {
            return Array(totals.prefix(limit))
        }
        return totals
    }

    private func postedNonReversed(_ transactions: [Transaction]) -> [Transaction] {
        transactions.filter { $0.status == .posted }
    }

    private func categoryMatches(tx: Transaction, category: CategoryTotal) -> Bool {
        if let categoryId = category.categoryId {
            return tx.category?.id == categoryId
        }
        return tx.category == nil && category.categoryName == "Uncategorized"
    }

    private func topPayees(from transactions: [Transaction]) -> [PayeeTotal] {
        let grouped = Dictionary(grouping: transactions) { tx in
            tx.payee?.name ?? "No Payee"
        }

        return grouped
            .map { payee, rows in
                PayeeTotal(
                    payeeName: payee,
                    total: rows.reduce(Decimal.zero) { $0 + $1.amount },
                    count: rows.count
                )
            }
            .sorted { $0.total > $1.total }
    }

    private func futureOccurrences(
        from anchorDate: Date,
        frequency: RepeatFrequency,
        repeatEndDate: Date?,
        start: Date,
        end: Date
    ) -> [Date] {
        guard frequency != .never else { return [] }

        var result: [Date] = []
        var cursor = calendar.startOfDay(for: anchorDate)
        let startDay = calendar.startOfDay(for: start)
        let configuredEndDay = repeatEndDate.map { calendar.startOfDay(for: $0) }
        let endDay = min(calendar.startOfDay(for: end), configuredEndDay ?? calendar.startOfDay(for: end))
        if cursor > endDay { return [] }

        var safety = 0
        while safety < 1000 {
            safety += 1
            guard let next = nextOccurrence(after: cursor, frequency: frequency) else { break }
            let normalized = calendar.startOfDay(for: next)
            if normalized > endDay { break }
            if normalized >= startDay {
                result.append(normalized)
            }
            cursor = normalized
        }

        return result
    }

    private func projectedRecurringItems(
        transactions: [Transaction],
        start: Date,
        end: Date
    ) -> [RecurringForecastItem] {
        let recurringBase = postedNonReversed(transactions)
            .filter { tx in
                (tx.entryType == .income || tx.entryType == .expense) && tx.repeatFrequency != .never
            }
        let grouped = Dictionary(grouping: recurringBase) { tx in tx.recurrenceId ?? tx.id }

        let windowStartDay = calendar.startOfDay(for: start)
        let windowEndDay = calendar.startOfDay(for: end)
        var items: [RecurringForecastItem] = []

        for (_, series) in grouped {
            guard let anchor = series.max(by: { $0.date < $1.date }) else { continue }
            let anchorDay = calendar.startOfDay(for: anchor.date)
            let seriesEndDay = anchor.repeatEndDate.map { calendar.startOfDay(for: $0) }
            let title = anchor.payee?.name ?? anchor.category?.name ?? (anchor.entryType == .income ? "Recurring Income" : "Recurring Expense")

            if series.count == 1 &&
                anchorDay >= windowStartDay &&
                anchorDay <= windowEndDay &&
                (seriesEndDay.map { anchorDay <= $0 } ?? true) {
                items.append(
                    RecurringForecastItem(
                        id: "\(anchor.id.uuidString)|\(anchorDay.timeIntervalSince1970)",
                        date: anchorDay,
                        entryType: anchor.entryType,
                        amount: anchor.amount,
                        title: title,
                        accountName: anchor.account.name,
                        frequency: anchor.repeatFrequency
                    )
                )
            }

            let dates = futureOccurrences(
                from: anchor.date,
                frequency: anchor.repeatFrequency,
                repeatEndDate: anchor.repeatEndDate,
                start: start,
                end: end
            )
            for date in dates {
                items.append(
                    RecurringForecastItem(
                        id: "\(anchor.id.uuidString)|\(date.timeIntervalSince1970)",
                        date: date,
                        entryType: anchor.entryType,
                        amount: anchor.amount,
                        title: title,
                        accountName: anchor.account.name,
                        frequency: anchor.repeatFrequency
                    )
                )
            }
        }

        return items
    }

    private func forecastBucketStarts(granularity: ForecastGranularity, from start: Date) -> [Date] {
        switch granularity {
        case .weekly:
            let first = weekStart(for: start)
            return (0..<12).compactMap { calendar.date(byAdding: .weekOfYear, value: $0, to: first) }
        case .monthly:
            let first = monthStart(for: start)
            return (0..<12).compactMap { calendar.date(byAdding: .month, value: $0, to: first) }
        case .yearly:
            let first = yearStart(for: start)
            return (0..<5).compactMap { calendar.date(byAdding: .year, value: $0, to: first) }
        }
    }

    private func forecastRangeEnd(granularity: ForecastGranularity, lastBucketStart: Date) -> Date? {
        switch granularity {
        case .weekly:
            return calendar.date(byAdding: .day, value: 6, to: weekStart(for: lastBucketStart))
        case .monthly:
            return calendar.date(byAdding: DateComponents(month: 1, day: -1), to: monthStart(for: lastBucketStart))
        case .yearly:
            return calendar.date(byAdding: DateComponents(year: 1, day: -1), to: yearStart(for: lastBucketStart))
        }
    }

    private func appendForecastAmount(
        date: Date,
        entryType: EntryType,
        amount: Decimal,
        granularity: ForecastGranularity,
        store: inout [Date: (income: Decimal, expense: Decimal)]
    ) {
        let bucketStart: Date
        switch granularity {
        case .weekly:
            bucketStart = weekStart(for: date)
        case .monthly:
            bucketStart = monthStart(for: date)
        case .yearly:
            bucketStart = yearStart(for: date)
        }

        guard var values = store[bucketStart] else { return }
        if entryType == .income {
            values.income += amount
        } else if entryType == .expense {
            values.expense += amount
        }
        store[bucketStart] = values
    }

    private func normalizeForecastBucketStart(_ date: Date, granularity: ForecastGranularity) -> Date {
        switch granularity {
        case .weekly:
            return weekStart(for: date)
        case .monthly:
            return monthStart(for: date)
        case .yearly:
            return yearStart(for: date)
        }
    }

    private func nextOccurrence(after date: Date, frequency: RepeatFrequency) -> Date? {
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

    func monthStart(for date: Date) -> Date {
        let components = calendar.dateComponents([.year, .month], from: date)
        return calendar.date(from: components) ?? date
    }

    private func weekStart(for date: Date) -> Date {
        let components = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
        return calendar.date(from: components) ?? date
    }

    private func yearStart(for date: Date) -> Date {
        let components = calendar.dateComponents([.year], from: date)
        return calendar.date(from: components) ?? date
    }

    private func monthsInRange(start: Date, end: Date) -> [Date] {
        var months: [Date] = []
        var cursor = monthStart(for: start)
        let final = monthStart(for: end)

        while cursor <= final {
            months.append(cursor)
            guard let next = calendar.date(byAdding: .month, value: 1, to: cursor) else { break }
            cursor = next
        }

        return months
    }
}
