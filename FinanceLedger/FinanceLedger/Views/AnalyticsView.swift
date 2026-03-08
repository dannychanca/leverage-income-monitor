import SwiftUI
import SwiftData
import Charts

struct AnalyticsView: View {
    @Query(sort: [SortDescriptor(\Account.sortOrder), SortDescriptor(\Account.name)])
    private var accounts: [Account]

    @Query(sort: [SortDescriptor(\Transaction.date)])
    private var transactions: [Transaction]

    @StateObject private var viewModel = AnalyticsViewModel()
    @State private var selectedChartMonth: Date?
    @State private var showCustomRangeSheet = false
    @State private var draftCustomStart = Date.now
    @State private var draftCustomEnd = Date.now

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    periodSelector
                    summaryCards
                    incomeExpenseChartCard
                    netWorthChartCard
                }
                .padding(16)
            }
            .background(LinearGradient(colors: [Color.black, Color(.sRGB, red: 0.05, green: 0.07, blue: 0.12, opacity: 1)], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
            .navigationTitle("Analytics")
            .task(id: dataFingerprint) {
                viewModel.updateData(accounts: accounts, transactions: transactions)
            }
            .sheet(item: $viewModel.selectedDrillDown) { detail in
                MonthDrillDownSheet(detail: detail, allTransactions: transactions)
            }
            .sheet(item: $viewModel.selectedPeriodBreakdown) { detail in
                PeriodCategoryBreakdownSheet(detail: detail, allTransactions: transactions)
            }
        }
    }

    private var dataFingerprint: String {
        "a\(accounts.count)-t\(transactions.count)-\(accounts.map(\.updatedAt).max()?.timeIntervalSince1970 ?? 0)-\(transactions.map(\.updatedAt).max()?.timeIntervalSince1970 ?? 0)"
    }

    private var periodSelector: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Picker("Period", selection: Binding(
                    get: { viewModel.selectedPeriod == .custom ? .oneMonth : viewModel.selectedPeriod },
                    set: { viewModel.setPeriod($0) }
                )) {
                    ForEach(AnalyticsPeriod.presetCases) { period in
                        Text(period.title).tag(period)
                    }
                }
                .pickerStyle(.segmented)

                Button {
                    draftCustomStart = viewModel.customStartDate
                    draftCustomEnd = viewModel.customEndDate
                    showCustomRangeSheet = true
                } label: {
                    Text("Custom")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(viewModel.isCustomPeriod ? .white : .blue)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            Capsule(style: .continuous)
                                .fill(viewModel.isCustomPeriod ? Color.blue : Color.white.opacity(0.1))
                        )
                }
            }

            if viewModel.isCustomPeriod {
                Text(viewModel.customRangeTitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .sheet(isPresented: $showCustomRangeSheet) {
            CustomRangeSheet(
                startDate: $draftCustomStart,
                endDate: $draftCustomEnd,
                onApply: {
                    viewModel.setCustomRange(start: draftCustomStart, end: draftCustomEnd)
                    showCustomRangeSheet = false
                }
            )
        }
    }

    private var summaryCards: some View {
        HStack(spacing: 12) {
            Button {
                viewModel.openPeriodBreakdown(.income)
            } label: {
                SummaryCard(title: "Total Income", amount: viewModel.totalIncome, color: .green)
            }
            .buttonStyle(.plain)

            Button {
                viewModel.openPeriodBreakdown(.expense)
            } label: {
                SummaryCard(title: "Total Expenses", amount: viewModel.totalExpense, color: .red)
            }
            .buttonStyle(.plain)

            SummaryCard(title: "Net Income", amount: viewModel.netIncome, color: .blue)
        }
    }

    private var incomeExpenseChartCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Income vs Expense")
                .font(.headline)
                .foregroundStyle(.white)

            Chart {
                ForEach(viewModel.monthlyAggregates) { month in
                    incomeExpenseBarMarks(for: month)
                }
            }
            .frame(height: 240)
            .chartXAxis {
                AxisMarks(values: .stride(by: .month, count: axisMonthStride)) { value in
                    AxisValueLabel(format: .dateTime.month(.abbreviated).year(.twoDigits))
                        .foregroundStyle(.secondary)
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading) {
                    AxisGridLine().foregroundStyle(.white.opacity(0.08))
                    AxisValueLabel().foregroundStyle(.secondary)
                }
            }
            .chartXSelection(value: $selectedChartMonth)
            .onChange(of: selectedChartMonth) { _, value in
                viewModel.selectMonth(value)
            }
            .animation(.easeInOut(duration: 0.25), value: monthlyChartAnimationKey)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.08))
                .shadow(color: .black.opacity(0.3), radius: 10, x: 0, y: 5)
        )
    }

    private var netWorthChartCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Net Worth Trend")
                .font(.headline)
                .foregroundStyle(.white)

            Chart {
                ForEach(viewModel.netWorthPoints) { point in
                    AreaMark(
                        x: .value("Month", point.month, unit: .month),
                        y: .value("Net Worth", NSDecimalNumber(decimal: point.netWorth).doubleValue)
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(LinearGradient(colors: [Color.blue.opacity(0.28), .clear], startPoint: .top, endPoint: .bottom))

                    LineMark(
                        x: .value("Month", point.month, unit: .month),
                        y: .value("Net Worth", NSDecimalNumber(decimal: point.netWorth).doubleValue)
                    )
                    .interpolationMethod(.catmullRom)
                    .lineStyle(StrokeStyle(lineWidth: 3))
                    .foregroundStyle(.blue)

                    PointMark(
                        x: .value("Month", point.month, unit: .month),
                        y: .value("Net Worth", NSDecimalNumber(decimal: point.netWorth).doubleValue)
                    )
                    .symbolSize(45)
                    .foregroundStyle(.blue)
                }
            }
            .frame(height: 220)
            .chartXAxis {
                AxisMarks(values: .stride(by: .month, count: axisMonthStride)) { value in
                    AxisValueLabel(format: .dateTime.month(.abbreviated).year(.twoDigits))
                        .foregroundStyle(.secondary)
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading) {
                    AxisGridLine().foregroundStyle(.white.opacity(0.08))
                    AxisValueLabel().foregroundStyle(.secondary)
                }
            }
            .animation(.easeInOut(duration: 0.25), value: netWorthAnimationKey)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.08))
                .shadow(color: .black.opacity(0.3), radius: 10, x: 0, y: 5)
        )
    }

    private var axisMonthStride: Int {
        let count = viewModel.monthlyAggregates.count
        if count > 24 { return 3 }
        if count > 12 { return 2 }
        return 1
    }

    private var monthlyChartAnimationKey: String {
        "\(periodAnimationKey)-\(viewModel.monthlyAggregates.count)-\(decimalKey(viewModel.totalIncome))-\(decimalKey(viewModel.totalExpense))"
    }

    private var netWorthAnimationKey: String {
        let last = viewModel.netWorthPoints.last?.netWorth ?? .zero
        return "\(periodAnimationKey)-\(viewModel.netWorthPoints.count)-\(decimalKey(last))"
    }

    private var periodAnimationKey: String {
        if viewModel.isCustomPeriod {
            return "\(viewModel.selectedPeriod.rawValue)-\(viewModel.customStartDate.timeIntervalSince1970)-\(viewModel.customEndDate.timeIntervalSince1970)"
        }
        return viewModel.selectedPeriod.rawValue
    }

    @ChartContentBuilder
    private func incomeExpenseBarMarks(for month: MonthlyAggregate) -> some ChartContent {
        BarMark(
            x: .value("Month", month.month, unit: .month),
            y: .value("Amount", NSDecimalNumber(decimal: month.income).doubleValue)
        )
        .position(by: .value("Type", "Income"))
        .foregroundStyle(Color.green.opacity(opacityForMonth(month.month)))

        BarMark(
            x: .value("Month", month.month, unit: .month),
            y: .value("Amount", NSDecimalNumber(decimal: month.expense).doubleValue)
        )
        .position(by: .value("Type", "Expense"))
        .foregroundStyle(Color.red.opacity(opacityForMonth(month.month)))
    }

    private func opacityForMonth(_ month: Date) -> Double {
        guard let selectedChartMonth else { return 0.95 }
        return Calendar.current.isDate(month, equalTo: selectedChartMonth, toGranularity: .month) ? 0.95 : 0.35
    }

    private func decimalKey(_ value: Decimal) -> String {
        NSDecimalNumber(decimal: value).stringValue
    }
}

private struct CustomRangeSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var startDate: Date
    @Binding var endDate: Date
    let onApply: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("Start Date", selection: $startDate, displayedComponents: .date)
                DatePicker("End Date", selection: $endDate, displayedComponents: .date)
            }
            .scrollContentBackground(.hidden)
            .background(LinearGradient(colors: [Color.black, Color(.sRGB, red: 0.05, green: 0.07, blue: 0.12, opacity: 1)], startPoint: .top, endPoint: .bottom))
            .navigationTitle("Custom Period")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Apply") { onApply() }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

private struct SummaryCard: View {
    let title: String
    let amount: Decimal
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(MoneyFormatter.currency(amount, code: "SGD"))
                .font(.headline.weight(.bold))
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.65)
            Text("For Selected Period")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.08))
                .shadow(color: .black.opacity(0.26), radius: 8, x: 0, y: 4)
        )
    }
}

private struct MonthDrillDownSheet: View {
    let detail: MonthlyDrillDown
    let allTransactions: [Transaction]
    @Environment(\.dismiss) private var dismiss
    @State private var selectedCategoryDetail: CategoryTransactionDrillDown?
    private let service = AnalyticsService()

    var body: some View {
        NavigationStack {
            List {
                Section("Summary") {
                    row("Total Income", amount: detail.totalIncome, color: .green)
                    row("Total Expenses", amount: detail.totalExpense, color: .red)
                    row("Net Income", amount: detail.netIncome, color: .blue)
                }

                Section("Top Expense Categories") {
                    if detail.breakdown.topExpenseCategories.isEmpty {
                        Text("No expense data")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(detail.breakdown.topExpenseCategories) { item in
                            categoryRow(item, entryType: .expense)
                        }
                    }
                }

                Section("Top Income Categories") {
                    if detail.breakdown.topIncomeCategories.isEmpty {
                        Text("No income data")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(detail.breakdown.topIncomeCategories) { item in
                            categoryRow(item, entryType: .income)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(LinearGradient(colors: [Color.black, Color(.sRGB, red: 0.05, green: 0.07, blue: 0.12, opacity: 1)], startPoint: .top, endPoint: .bottom))
            .navigationTitle(detail.month.formatted(.dateTime.month(.wide).year()))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .sheet(item: $selectedCategoryDetail) { detail in
            CategoryTransactionDetailSheet(detail: detail, allTransactions: allTransactions)
        }
    }

    private func row(_ label: String, amount: Decimal, color: Color) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(MoneyFormatter.currency(amount, code: "SGD"))
                .foregroundStyle(color)
                .fontWeight(.semibold)
        }
    }

    private func categoryRow(_ item: CategoryTotal, entryType: EntryType) -> some View {
        Button {
            selectedCategoryDetail = service.categoryDrillDown(
                month: detail.month,
                category: item,
                entryType: entryType,
                transactions: allTransactions
            )
        } label: {
            HStack(spacing: 10) {
                if item.iconName.count == 1 {
                    Text(item.iconName)
                } else {
                    Image(systemName: item.iconName)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.categoryName)
                    Text("\(item.percentage, specifier: "%.1f")%")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(MoneyFormatter.currency(item.total, code: "SGD"))
                    .fontWeight(.semibold)
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct CategoryTransactionDetailSheet: View {
    let detail: CategoryTransactionDrillDown
    let allTransactions: [Transaction]
    @Environment(\.dismiss) private var dismiss
    @State private var editingTransaction: Transaction?

    var body: some View {
        NavigationStack {
            List {
                Section("Category Total") {
                    HStack(spacing: 10) {
                        if detail.iconName.count == 1 {
                            Text(detail.iconName)
                        } else {
                            Image(systemName: detail.iconName)
                        }
                        Text(detail.categoryName)
                        Spacer()
                        Text(MoneyFormatter.currency(detail.total, code: "SGD"))
                            .foregroundStyle(detail.entryType == .income ? .green : .red)
                            .fontWeight(.semibold)
                    }
                }

                Section("Transactions") {
                    if detail.transactions.isEmpty {
                        Text("No transactions")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(detail.transactions) { tx in
                            Button {
                                editingTransaction = allTransactions.first(where: { $0.id == tx.id })
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack {
                                        Text(tx.payeeName)
                                            .fontWeight(.semibold)
                                        Spacer()
                                        Text(MoneyFormatter.currency(tx.amount, code: "SGD"))
                                            .foregroundStyle(detail.entryType == .income ? .green : .red)
                                    }
                                    HStack {
                                        Text(tx.date.formatted(.dateTime.day().month(.abbreviated).year()))
                                        Text("•")
                                        Text(tx.accountName)
                                    }
                                    .font(.caption)
                                    .foregroundStyle(.secondary)

                                    if !tx.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                        Text(tx.notes)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                            .padding(.vertical, 2)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(LinearGradient(colors: [Color.black, Color(.sRGB, red: 0.05, green: 0.07, blue: 0.12, opacity: 1)], startPoint: .top, endPoint: .bottom))
            .navigationTitle(detail.categoryName)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .sheet(item: $editingTransaction) { tx in
            TransactionEditorSheet(defaultAccount: tx.account, editing: tx)
        }
    }
}

private struct PeriodCategoryBreakdownSheet: View {
    let detail: PeriodCategoryBreakdown
    let allTransactions: [Transaction]
    @Environment(\.dismiss) private var dismiss
    @State private var selectedPayeeBreakdown: CategoryPayeeBreakdown?
    private let service = AnalyticsService()

    var body: some View {
        NavigationStack {
            List {
                Section("Summary") {
                    HStack {
                        Text(detail.entryType == .income ? "Total Income" : "Total Expenses")
                        Spacer()
                        Text(MoneyFormatter.currency(detail.total, code: "SGD"))
                            .foregroundStyle(detail.entryType == .income ? .green : .red)
                            .fontWeight(.semibold)
                    }
                    Text("\(detail.rangeStart.formatted(.dateTime.day().month(.abbreviated).year())) - \(detail.rangeEnd.formatted(.dateTime.day().month(.abbreviated).year()))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("By Category") {
                    if detail.categories.isEmpty {
                        Text("No data")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(detail.categories) { category in
                            Button {
                                selectedPayeeBreakdown = service.categoryPayeeBreakdown(
                                    entryType: detail.entryType,
                                    category: category,
                                    start: detail.rangeStart,
                                    end: detail.rangeEnd,
                                    transactions: allTransactions
                                )
                            } label: {
                                HStack(spacing: 10) {
                                    if category.iconName.count == 1 {
                                        Text(category.iconName)
                                    } else {
                                        Image(systemName: category.iconName)
                                    }

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(category.categoryName)
                                        Text("\(category.percentage, specifier: "%.1f")%")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Text(MoneyFormatter.currency(category.total, code: "SGD"))
                                        .fontWeight(.semibold)
                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(LinearGradient(colors: [Color.black, Color(.sRGB, red: 0.05, green: 0.07, blue: 0.12, opacity: 1)], startPoint: .top, endPoint: .bottom))
            .navigationTitle(detail.entryType == .income ? "Income Breakdown" : "Expense Breakdown")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .sheet(item: $selectedPayeeBreakdown) { payee in
            CategoryPayeeBreakdownSheet(detail: payee, allTransactions: allTransactions)
        }
    }
}

private struct CategoryPayeeBreakdownSheet: View {
    let detail: CategoryPayeeBreakdown
    let allTransactions: [Transaction]
    @Environment(\.dismiss) private var dismiss
    @State private var selectedPayeeTransactions: PayeeTransactionDrillDown?
    private let service = AnalyticsService()

    private var categoryKey: CategoryTotal {
        CategoryTotal(
            categoryId: detail.categoryId,
            categoryName: detail.categoryName,
            iconName: detail.iconName,
            total: detail.total,
            percentage: 100
        )
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Category Total") {
                    HStack {
                        if detail.iconName.count == 1 {
                            Text(detail.iconName)
                        } else {
                            Image(systemName: detail.iconName)
                        }
                        Text(detail.categoryName)
                        Spacer()
                        Text(MoneyFormatter.currency(detail.total, code: "SGD"))
                            .foregroundStyle(detail.entryType == .income ? .green : .red)
                            .fontWeight(.semibold)
                    }
                }

                Section("By Payee") {
                    if detail.payees.isEmpty {
                        Text("No payee data")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(detail.payees) { payee in
                            Button {
                                selectedPayeeTransactions = service.payeeTransactionDrillDown(
                                    entryType: detail.entryType,
                                    category: categoryKey,
                                    payeeName: payee.payeeName,
                                    start: detail.rangeStart,
                                    end: detail.rangeEnd,
                                    transactions: allTransactions
                                )
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(payee.payeeName)
                                        Text("\(payee.count) transaction\(payee.count == 1 ? "" : "s")")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Text(MoneyFormatter.currency(payee.total, code: "SGD"))
                                        .fontWeight(.semibold)
                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(LinearGradient(colors: [Color.black, Color(.sRGB, red: 0.05, green: 0.07, blue: 0.12, opacity: 1)], startPoint: .top, endPoint: .bottom))
            .navigationTitle(detail.categoryName)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .sheet(item: $selectedPayeeTransactions) { detail in
            PayeeTransactionDrillDownSheet(detail: detail, allTransactions: allTransactions)
        }
    }
}

private struct PayeeTransactionDrillDownSheet: View {
    let detail: PayeeTransactionDrillDown
    let allTransactions: [Transaction]
    @Environment(\.dismiss) private var dismiss
    @State private var editingTransaction: Transaction?

    var body: some View {
        NavigationStack {
            List {
                Section("Summary") {
                    HStack {
                        Text(detail.payeeName)
                        Spacer()
                        Text(MoneyFormatter.currency(detail.total, code: "SGD"))
                            .foregroundStyle(detail.entryType == .income ? .green : .red)
                            .fontWeight(.semibold)
                    }
                }

                Section("Transactions") {
                    if detail.transactions.isEmpty {
                        Text("No transactions")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(detail.transactions) { tx in
                            Button {
                                editingTransaction = allTransactions.first(where: { $0.id == tx.id })
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack {
                                        Text(tx.date.formatted(.dateTime.day().month(.abbreviated).year()))
                                        Spacer()
                                        Text(MoneyFormatter.currency(tx.amount, code: "SGD"))
                                            .foregroundStyle(detail.entryType == .income ? .green : .red)
                                    }
                                    HStack {
                                        Text(tx.accountName)
                                        if !tx.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                            Text("•")
                                            Text(tx.notes)
                                        }
                                    }
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(LinearGradient(colors: [Color.black, Color(.sRGB, red: 0.05, green: 0.07, blue: 0.12, opacity: 1)], startPoint: .top, endPoint: .bottom))
            .navigationTitle(detail.payeeName)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .sheet(item: $editingTransaction) { tx in
            TransactionEditorSheet(defaultAccount: tx.account, editing: tx)
        }
    }
}
