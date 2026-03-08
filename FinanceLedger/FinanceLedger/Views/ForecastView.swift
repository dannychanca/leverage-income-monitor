import SwiftUI
import SwiftData
import Charts

struct ForecastView: View {
    @Query(sort: [SortDescriptor(\Account.sortOrder), SortDescriptor(\Account.name)])
    private var accounts: [Account]

    @Query(sort: [SortDescriptor(\Transaction.date)])
    private var transactions: [Transaction]

    @StateObject private var viewModel = AnalyticsViewModel()
    @State private var selectedChartDate: Date?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    forecastCard
                }
                .padding(16)
            }
            .background(
                LinearGradient(
                    colors: [Color.black, Color(.sRGB, red: 0.05, green: 0.07, blue: 0.12, opacity: 1)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()
            )
            .navigationTitle("Forecast")
            .task(id: dataFingerprint) {
                viewModel.updateData(accounts: accounts, transactions: transactions)
            }
            .sheet(item: $viewModel.selectedForecastDrillDown) { detail in
                ForecastDrillDownSheet(detail: detail)
            }
        }
    }

    private var dataFingerprint: String {
        "a\(accounts.count)-t\(transactions.count)-\(accounts.map(\.updatedAt).max()?.timeIntervalSince1970 ?? 0)-\(transactions.map(\.updatedAt).max()?.timeIntervalSince1970 ?? 0)"
    }

    private var forecastCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Recurring Forecast")
                    .font(.headline)
                    .foregroundStyle(.white)
                Spacer()
                Picker("Forecast Granularity", selection: Binding(
                    get: { viewModel.selectedForecastGranularity },
                    set: { viewModel.setForecastGranularity($0) }
                )) {
                    ForEach(ForecastGranularity.allCases) { granularity in
                        Text(granularity.title).tag(granularity)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 250)
            }

            Text(subtitleText)
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack(spacing: 10) {
                ForecastMetricBadge(
                    title: "Income",
                    amount: viewModel.recurringForecastTrend.totalIncome,
                    color: .green
                )
                ForecastMetricBadge(
                    title: "Expense",
                    amount: viewModel.recurringForecastTrend.totalExpense,
                    color: .red
                )
                ForecastMetricBadge(
                    title: "Net",
                    amount: viewModel.recurringForecastTrend.net,
                    color: .blue
                )
            }

            Divider()
                .overlay(Color.white.opacity(0.12))

            if viewModel.recurringForecastTrend.points.isEmpty {
                Text("No recurring transactions found for this forecast.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 4)
            } else {
                chartView
                Text("Tap a bar to view recurring income and expense transactions for that period.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.08))
                .shadow(color: .black.opacity(0.3), radius: 10, x: 0, y: 5)
        )
    }

    private var chartView: some View {
        Chart {
            ForEach(viewModel.recurringForecastTrend.points) { point in
                BarMark(
                    x: .value("Period", point.periodStart),
                    y: .value("Net", NSDecimalNumber(decimal: point.net).doubleValue)
                )
                .foregroundStyle(point.net >= 0 ? .green : .red)
                .cornerRadius(4)
            }
        }
        .frame(height: 280)
        .chartXAxis {
            AxisMarks(values: .automatic) { value in
                AxisValueLabel {
                    if let dateValue = value.as(Date.self) {
                        Text(xAxisLabel(for: dateValue))
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading) {
                AxisGridLine().foregroundStyle(.white.opacity(0.08))
                AxisValueLabel().foregroundStyle(.secondary)
            }
        }
        .chartXSelection(value: $selectedChartDate)
        .onChange(of: selectedChartDate) { _, value in
            viewModel.selectForecastPeriod(value)
        }
        .animation(.easeInOut(duration: 0.25), value: chartAnimationKey)
    }

    private var subtitleText: String {
        switch viewModel.selectedForecastGranularity {
        case .weekly:
            return "Projected recurring income/expense trend by week (next 12 weeks)"
        case .monthly:
            return "Projected recurring income/expense trend by month (next 12 months)"
        case .yearly:
            return "Projected recurring income/expense trend by year (next 5 years)"
        }
    }

    private var chartAnimationKey: String {
        let income = NSDecimalNumber(decimal: viewModel.recurringForecastTrend.totalIncome).stringValue
        let expense = NSDecimalNumber(decimal: viewModel.recurringForecastTrend.totalExpense).stringValue
        return "\(viewModel.selectedForecastGranularity.rawValue)-\(viewModel.recurringForecastTrend.points.count)-\(income)-\(expense)"
    }

    private func xAxisLabel(for date: Date) -> String {
        switch viewModel.selectedForecastGranularity {
        case .weekly:
            let end = Calendar.current.date(byAdding: .day, value: 6, to: date) ?? date
            return "\(date.formatted(.dateTime.day().month(.abbreviated))) - \(end.formatted(.dateTime.day().month(.abbreviated)))"
        case .monthly:
            return date.formatted(.dateTime.month(.abbreviated).year(.twoDigits))
        case .yearly:
            return date.formatted(.dateTime.year())
        }
    }
}

private struct ForecastDrillDownSheet: View {
    let detail: RecurringForecastDrillDown
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Summary") {
                    summaryRow("Income", amount: detail.incomeTotal, color: .green)
                    summaryRow("Expense", amount: detail.expenseTotal, color: .red)
                    summaryRow("Net", amount: detail.net, color: detail.net >= 0 ? .green : .red)
                }

                Section("Recurring Income") {
                    if detail.incomeItems.isEmpty {
                        Text("No recurring income in this period")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(detail.incomeItems) { item in
                            recurringRow(item, color: .green)
                        }
                    }
                }

                Section("Recurring Expenses") {
                    if detail.expenseItems.isEmpty {
                        Text("No recurring expenses in this period")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(detail.expenseItems) { item in
                            recurringRow(item, color: .red)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(
                LinearGradient(
                    colors: [Color.black, Color(.sRGB, red: 0.05, green: 0.07, blue: 0.12, opacity: 1)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .navigationTitle(periodTitle)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var periodTitle: String {
        switch detail.granularity {
        case .weekly:
            return "\(detail.periodStart.formatted(.dateTime.day().month(.abbreviated))) - \(detail.periodEnd.formatted(.dateTime.day().month(.abbreviated).year()))"
        case .monthly:
            return detail.periodStart.formatted(.dateTime.month(.wide).year())
        case .yearly:
            return detail.periodStart.formatted(.dateTime.year())
        }
    }

    private func summaryRow(_ title: String, amount: Decimal, color: Color) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(MoneyFormatter.currency(amount, code: "SGD"))
                .foregroundStyle(color)
                .fontWeight(.semibold)
        }
    }

    private func recurringRow(_ item: RecurringForecastItem, color: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "arrow.triangle.2.circlepath")
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .foregroundStyle(.white)
                Text("\(item.date.formatted(.dateTime.day().month(.abbreviated).year())) • \(item.accountName) • \(item.frequency.title)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(MoneyFormatter.currency(item.amount, code: "SGD"))
                .foregroundStyle(color)
                .fontWeight(.semibold)
        }
        .padding(.vertical, 2)
    }
}

private struct ForecastMetricBadge: View {
    let title: String
    let amount: Decimal
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(MoneyFormatter.currency(amount, code: "SGD"))
                .font(.caption.weight(.semibold))
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.white.opacity(0.06))
        )
    }
}
