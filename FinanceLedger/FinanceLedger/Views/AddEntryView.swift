import SwiftUI
import SwiftData
import PhotosUI
import UIKit

struct TransactionEditorSheet: View {
    let defaultAccount: Account
    let editing: Transaction?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context

    @Query(sort: [SortDescriptor(\Account.sortOrder), SortDescriptor(\Account.name)])
    private var accounts: [Account]

    @Query(sort: [SortDescriptor(\Category.name)])
    private var categories: [Category]

    @Query(sort: [SortDescriptor(\Payee.lastUsedAt, order: .reverse), SortDescriptor(\Payee.name)])
    private var payees: [Payee]

    @State private var mode: TransactionMode = .expense
    @State private var selectedAccountId: UUID?
    @State private var selectedToAccountId: UUID?
    @State private var selectedCategoryId: UUID?
    @State private var payeeName: String = ""
    @State private var amountText: String = ""
    @State private var date: Date = .now
    @State private var notes: String = ""
    @State private var cleared: Bool = true
    @State private var repeatFrequency: RepeatFrequency = .never
    @State private var repeatEndDate: Date?
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var photoData: Data?

    @State private var showCategoryManager = false
    @State private var showPayeeManager = false
    @State private var showRepeatSheet = false
    @State private var showNotesSheet = false

    init(defaultAccount: Account, editing: Transaction?) {
        self.defaultAccount = defaultAccount
        self.editing = editing
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(colors: [Color.black, Color(.sRGB, red: 0.05, green: 0.07, blue: 0.12, opacity: 1)], startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 14) {
                        topPanel
                        if mode != .transfer && !payeeSuggestions.isEmpty {
                            payeeSuggestionsRow
                        }
                        detailsPanel
                        actionPanel

                        if let photoData, let image = UIImage(data: photoData) {
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFit()
                                .frame(maxHeight: 220)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .padding(.horizontal, 14)
                        }

                        if editing != nil {
                            Button("Delete Transaction", role: .destructive) {
                                if let editing {
                                    try? Repository.deleteTransaction(editing, context: context)
                                }
                                dismiss()
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                        }

                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                }
            }
            .navigationBarHidden(true)
            .task {
                hydrateInitialState()
            }
            .onChange(of: payeeName) { _, newValue in
                guard mode != .transfer else { return }
                let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { return }
                guard let matched = payees.first(where: { $0.name.caseInsensitiveCompare(trimmed) == .orderedSame }) else { return }
                applyDefaultCategory(for: matched)
            }
            .onChange(of: selectedPhotoItem) { _, newItem in
                guard let newItem else { return }
                Task {
                    if let data = try? await newItem.loadTransferable(type: Data.self) {
                        await MainActor.run {
                            photoData = data
                        }
                    }
                }
            }
            .sheet(isPresented: $showCategoryManager) {
                NavigationStack {
                    CategoryManagerView()
                }
            }
            .sheet(isPresented: $showPayeeManager) {
                NavigationStack {
                    PayeeManagerView()
                }
            }
            .sheet(isPresented: $showRepeatSheet) {
                RepeatSettingsSheet(
                    frequency: $repeatFrequency,
                    endDate: $repeatEndDate
                )
            }
            .sheet(isPresented: $showNotesSheet) {
                NotesEditorSheet(notes: $notes)
            }
        }
    }

    private var topPanel: some View {
        VStack(spacing: 16) {
            HStack {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.title2)
                        .foregroundStyle(.white)
                }

                Spacer()

                Picker("Type", selection: $mode) {
                    ForEach(TransactionMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 320)

                Spacer()

                Button {
                    save()
                } label: {
                    Image(systemName: "checkmark")
                        .font(.title2)
                        .foregroundStyle(canSave ? .white : .gray)
                }
                .disabled(!canSave)
            }

            HStack(alignment: .center, spacing: 12) {
                ZStack {
                    Circle().fill(Color.white.opacity(0.15)).frame(width: 52, height: 52)
                    if headerIconName.count == 1 {
                        Text(headerIconName)
                            .font(.title2)
                    } else {
                        Image(systemName: headerIconName)
                            .font(.title3.weight(.bold))
                            .foregroundStyle(mode.tint)
                    }
                }

                VStack(alignment: .leading, spacing: 4) {
                    if mode == .transfer {
                        Text("Transfer")
                            .font(.headline)
                            .foregroundStyle(.white)
                    } else {
                        TextField("Payee", text: $payeeName)
                            .font(.headline)
                            .foregroundStyle(.white)
                    }

                    if mode != .transfer {
                        Menu {
                            Button("None") { selectedCategoryId = nil }
                            ForEach(filteredCategories) { category in
                                Button {
                                    selectedCategoryId = category.id
                                } label: {
                                    Label(category.name, systemImage: category.iconName)
                                }
                            }
                            Divider()
                            Button("Manage Categories") { showCategoryManager = true }
                        } label: {
                            HStack(spacing: 6) {
                                Text(selectedCategory?.name ?? "Category")
                                    .foregroundStyle(.white.opacity(0.8))
                                Image(systemName: "chevron.down")
                                    .font(.caption)
                                    .foregroundStyle(.white.opacity(0.7))
                            }
                        }
                    }
                }

                TextField("0.00", text: $amountText)
                    .font(.system(size: 42, weight: .bold, design: .rounded))
                    .foregroundStyle(.white.opacity(0.85))
                    .multilineTextAlignment(.trailing)
                    .keyboardType(.decimalPad)
                    .lineLimit(1)
                    .minimumScaleFactor(0.55)
                    .allowsTightening(true)
                    .frame(maxWidth: 210)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color.white.opacity(0.11))
        )
    }

    private var payeeSuggestionsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                ForEach(payeeSuggestions, id: \.id) { payee in
                    Button(payee.name) {
                        payeeName = payee.name
                        applyDefaultCategory(for: payee)
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(.horizontal, 4)
        }
    }

    private var detailsPanel: some View {
        VStack(spacing: 0) {
            detailRow(icon: "calendar", title: "Date") {
                DatePicker("", selection: $date, displayedComponents: [.date])
                    .labelsHidden()
                    .tint(.white)
            }

            if mode == .transfer {
                detailRow(icon: "arrow.up.arrow.down", title: "From") {
                    Menu {
                        ForEach(availableAccounts) { account in
                            Button(account.name) { selectedAccountId = account.id }
                        }
                    } label: {
                        Text(selectedAccount?.name ?? "Select")
                            .foregroundStyle(.white)
                    }
                }
                detailRow(icon: "arrow.left.arrow.right", title: "To") {
                    Menu {
                        ForEach(transferToAccounts) { account in
                            Button(account.name) { selectedToAccountId = account.id }
                        }
                    } label: {
                        Text(selectedToAccount?.name ?? "Select")
                            .foregroundStyle(.white)
                    }
                }
            } else {
                detailRow(icon: "creditcard", title: "Account") {
                    Menu {
                        ForEach(availableAccounts) { account in
                            Button(account.name) { selectedAccountId = account.id }
                        }
                    } label: {
                        Text(selectedAccount?.name ?? "Select")
                            .foregroundStyle(.white)
                    }
                }

                detailRow(icon: "person", title: "Payee List") {
                    Button("Manage") {
                        showPayeeManager = true
                    }
                    .foregroundStyle(.white)
                }
            }

            detailRow(icon: "doc.badge.checkmark", title: "Cleared") {
                Toggle("", isOn: $cleared)
                    .labelsHidden()
                    .tint(.green)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.black.opacity(0.28))
        )
    }

    private var actionPanel: some View {
        HStack {
            Button {
                showRepeatSheet = true
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                    Text(repeatLabel)
                        .font(.caption2)
                }
                .foregroundStyle(.white.opacity(0.75))
                .frame(maxWidth: .infinity)
            }

            PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                VStack(spacing: 4) {
                    Image(systemName: "camera")
                    Text(photoData == nil ? "Photo" : "Change")
                        .font(.caption2)
                }
                .foregroundStyle(.white.opacity(0.75))
                .frame(maxWidth: .infinity)
            }

            Button {
                showNotesSheet = true
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: "note.text")
                    Text(notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Notes" : "Edit")
                        .font(.caption2)
                }
                .foregroundStyle(.white.opacity(0.75))
                .frame(maxWidth: .infinity)
            }
        }
        .font(.title2)
        .padding(.top, 6)
    }

    private func detailRow(icon: String, title: String, @ViewBuilder trailing: () -> some View) -> some View {
        HStack {
            Label(title, systemImage: icon)
                .foregroundStyle(.white.opacity(0.88))
            Spacer()
            trailing()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1)
        }
    }

    private var availableAccounts: [Account] {
        accounts.filter { !$0.isArchived }
    }

    private var transferToAccounts: [Account] {
        let fromId = selectedAccountId
        return availableAccounts.filter { $0.id != fromId }
    }

    private var filteredCategories: [Category] {
        categories.filter { category in
            if category.isArchived { return false }
            if mode == .income {
                return category.kind == .income || category.kind == .both
            }
            if mode == .expense {
                return category.kind == .expense || category.kind == .both
            }
            return false
        }
    }

    private var payeeSuggestions: [Payee] {
        guard !payeeName.isEmpty else { return Array(payees.prefix(6)) }
        let needle = payeeName.lowercased()
        return payees.filter { $0.name.lowercased().contains(needle) }.prefix(6).map { $0 }
    }

    private var canSave: Bool {
        guard decimalAmount > 0 else { return false }
        guard selectedAccount != nil else { return false }

        if mode == .transfer {
            guard selectedToAccount != nil else { return false }
            guard selectedToAccount?.id != selectedAccount?.id else { return false }
        }

        return true
    }

    private var decimalAmount: Decimal {
        Decimal(string: amountText.replacingOccurrences(of: ",", with: "")) ?? 0
    }

    private var selectedAccount: Account? {
        accounts.first(where: { $0.id == selectedAccountId })
    }

    private var selectedToAccount: Account? {
        accounts.first(where: { $0.id == selectedToAccountId })
    }

    private var selectedCategory: Category? {
        categories.first(where: { $0.id == selectedCategoryId })
    }

    private func hydrateInitialState() {
        if let editing {
            amountText = NSDecimalNumber(decimal: editing.amount).stringValue
            date = editing.date
            notes = editing.notes
            cleared = editing.cleared
            repeatFrequency = editing.repeatFrequency
            repeatEndDate = editing.repeatEndDate
            photoData = editing.photoData

            if editing.entryType == .transferIn || editing.entryType == .transferOut {
                mode = .transfer
                if editing.entryType == .transferOut {
                    selectedAccountId = editing.account.id
                    selectedToAccountId = editing.transferAccountId
                } else {
                    selectedAccountId = editing.transferAccountId
                    selectedToAccountId = editing.account.id
                }
            } else {
                mode = editing.entryType == .income ? .income : .expense
                selectedAccountId = editing.account.id
                selectedCategoryId = editing.category?.id
                payeeName = editing.payee?.name ?? ""
            }
        } else {
            mode = .expense
            selectedAccountId = defaultAccount.id
            selectedToAccountId = availableAccounts.first(where: { $0.id != defaultAccount.id })?.id
            date = .now
            cleared = true
            repeatFrequency = .never
            repeatEndDate = nil
            photoData = nil
        }
    }

    private func save() {
        guard let account = selectedAccount else { return }

        do {
            if mode == .transfer {
                guard let toAccount = selectedToAccount else { return }
                try Repository.createTransfer(
                    editingLeg: editing,
                    fromAccount: account,
                    toAccount: toAccount,
                    amount: decimalAmount,
                    date: date,
                    notes: notes,
                    cleared: cleared,
                    repeatFrequency: repeatFrequency,
                    repeatEndDate: repeatEndDate,
                    photoData: photoData,
                    context: context
                )
            } else {
                let type: EntryType = mode == .income ? .income : .expense
                try Repository.upsertTransaction(
                    editing: editing,
                    account: account,
                    entryType: type,
                    amount: decimalAmount,
                    date: date,
                    notes: notes,
                    cleared: cleared,
                    repeatFrequency: repeatFrequency,
                    repeatEndDate: repeatEndDate,
                    photoData: photoData,
                    category: selectedCategory,
                    payeeName: payeeName,
                    context: context
                )
            }
            dismiss()
        } catch {
            assertionFailure("Failed saving transaction: \(error)")
        }
    }

    private func applyDefaultCategory(for payee: Payee) {
        guard let category = payee.defaultCategory else { return }
        guard filteredCategories.contains(where: { $0.id == category.id }) else { return }
        selectedCategoryId = category.id
    }

    private var headerIconName: String {
        guard mode != .transfer else { return mode.iconName }
        return selectedCategory?.iconName ?? mode.iconName
    }

    private var repeatLabel: String {
        guard repeatFrequency != .never else { return "Repeat" }
        guard let repeatEndDate else { return repeatFrequency.title }
        return "\(repeatFrequency.title) • Ends \(repeatEndDate.formatted(.dateTime.day().month(.abbreviated).year()))"
    }
}

private struct RepeatSettingsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var frequency: RepeatFrequency
    @Binding var endDate: Date?
    @State private var hasEndDate = false
    private var effectiveEndDate: Binding<Date> {
        Binding(
            get: { endDate ?? Date.now },
            set: { endDate = $0 }
        )
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Frequency") {
                    ForEach(RepeatFrequency.allCases) { value in
                        Button {
                            frequency = value
                        } label: {
                            HStack {
                                Text(value.title)
                                    .foregroundStyle(.white)
                                Spacer()
                                if frequency == value {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(.white)
                                }
                            }
                        }
                    }
                }

                if frequency != .never {
                    Section("End Date") {
                        Toggle("Set End Date", isOn: $hasEndDate)
                            .onChange(of: hasEndDate) { _, enabled in
                                if enabled {
                                    endDate = endDate ?? Date.now
                                } else {
                                    endDate = nil
                                }
                            }

                        if hasEndDate {
                            DatePicker(
                                "Repeat Until",
                                selection: effectiveEndDate,
                                displayedComponents: [.date]
                            )
                            .tint(.white)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(LinearGradient(colors: [Color.black, Color(.sRGB, red: 0.05, green: 0.07, blue: 0.12, opacity: 1)], startPoint: .top, endPoint: .bottom))
            .navigationTitle("Repeat")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "chevron.down")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .task {
            hasEndDate = endDate != nil
        }
        .onChange(of: frequency) { _, value in
            if value == .never {
                hasEndDate = false
                endDate = nil
            }
        }
    }
}

private struct NotesEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var notes: String

    var body: some View {
        NavigationStack {
            VStack {
                TextEditor(text: $notes)
                    .padding(8)
                    .background(Color.white.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .padding()
            }
            .background(LinearGradient(colors: [Color.black, Color(.sRGB, red: 0.05, green: 0.07, blue: 0.12, opacity: 1)], startPoint: .top, endPoint: .bottom))
            .navigationTitle("Notes")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

enum TransactionMode: String, CaseIterable, Identifiable {
    case expense
    case income
    case transfer

    var id: String { rawValue }

    var title: String {
        switch self {
        case .expense: return "Expense"
        case .income: return "Income"
        case .transfer: return "Transfer"
        }
    }

    var iconName: String {
        switch self {
        case .expense: return "fork.knife"
        case .income: return "banknote.fill"
        case .transfer: return "arrow.left.arrow.right"
        }
    }

    var tint: Color {
        switch self {
        case .expense: return .orange
        case .income: return .green
        case .transfer: return .blue
        }
    }
}

struct AccountEditorSheet: View {
    let account: Account?
    let defaultType: AccountType
    let defaultSubtype: String
    let defaultIssuer: CardIssuer?
    let defaultLast4: String

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context

    @Query(sort: [SortDescriptor(\Account.sortOrder), SortDescriptor(\Account.name)])
    private var allAccounts: [Account]
    @Query(sort: [SortDescriptor(\AccountSubtypeOption.sortOrder), SortDescriptor(\AccountSubtypeOption.name)])
    private var subtypeOptions: [AccountSubtypeOption]

    @State private var name = ""
    @State private var type: AccountType = .asset
    @State private var subtype = "bank"
    @State private var newSubtypeOption = ""
    @State private var subtypeEdits: [UUID: String] = [:]
    @State private var openingBalanceText = "0"
    @State private var currencyCode = "SGD"
    @State private var iconName = "wallet.pass.fill"
    @State private var cardStyle: AccountCardStyle = .ocean
    @State private var isArchived = false
    @State private var issuer: CardIssuer = .other
    @State private var last4 = ""
    @State private var nickname = ""

    init(
        account: Account?,
        defaultType: AccountType = .asset,
        defaultSubtype: String = "bank",
        defaultIssuer: CardIssuer? = nil,
        defaultLast4: String = ""
    ) {
        self.account = account
        self.defaultType = defaultType
        self.defaultSubtype = defaultSubtype
        self.defaultIssuer = defaultIssuer
        self.defaultLast4 = defaultLast4
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Basics") {
                    TextField("Name", text: $name)
                    Picker("Type", selection: $type) {
                        ForEach(AccountType.allCases) { t in
                            Text(t.title).tag(t)
                        }
                    }
                    TextField("Subtype", text: $subtype)
                        .textInputAutocapitalization(.never)

                    if !activeSubtypeOptions.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(activeSubtypeOptions) { option in
                                    Button(option.name) {
                                        subtype = option.name
                                    }
                                    .buttonStyle(.bordered)
                                }
                            }
                        }
                    }
                }

                Section("Manage Subtypes") {
                    HStack {
                        TextField("New subtype", text: $newSubtypeOption)
                            .textInputAutocapitalization(.never)
                        Button("Add") {
                            addSubtypeOption()
                        }
                        .disabled(newSubtypeOption.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }

                    ForEach(activeSubtypeOptions) { option in
                        HStack(spacing: 10) {
                            TextField(
                                "Subtype",
                                text: Binding(
                                    get: { subtypeEdits[option.id] ?? option.name },
                                    set: { subtypeEdits[option.id] = $0 }
                                )
                            )
                            .textInputAutocapitalization(.never)

                            Button("Save") {
                                renameSubtypeOption(option)
                            }
                            .buttonStyle(.borderedProminent)
                        }
                        .swipeActions {
                            Button(role: .destructive) {
                                removeSubtypeOption(option)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }

                Section("Balance") {
                    TextField("Opening Balance", text: $openingBalanceText)
                        .keyboardType(.decimalPad)
                    TextField("Currency", text: $currencyCode)
                        .textInputAutocapitalization(.characters)
                    TextField("Icon (SF Symbol or emoji)", text: $iconName)
                }

                Section("Card Color") {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 72, maximum: 96), spacing: 10)], spacing: 10) {
                        ForEach(AccountCardStyle.allCases) { style in
                            Button {
                                cardStyle = style
                            } label: {
                                VStack(spacing: 8) {
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .fill(
                                            LinearGradient(
                                                colors: style.gradientColors,
                                                startPoint: .topLeading,
                                                endPoint: .bottomTrailing
                                            )
                                        )
                                        .frame(height: 34)
                                        .overlay {
                                            if cardStyle == style {
                                                Image(systemName: "checkmark.circle.fill")
                                                    .foregroundStyle(.white)
                                            }
                                        }
                                    Text(style.rawValue.capitalized)
                                        .font(.caption2)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                Section("Card Info (optional)") {
                    Picker("Issuer", selection: $issuer) {
                        ForEach(CardIssuer.allCases) { value in
                            Text(value.rawValue.uppercased()).tag(value)
                        }
                    }
                    TextField("Last 4", text: $last4)
                        .keyboardType(.numberPad)
                    TextField("Nickname", text: $nickname)
                }

                Section {
                    Toggle("Archived", isOn: $isArchived)
                }

                if account != nil {
                    Section {
                        Button("Delete Account", role: .destructive) {
                            if let account {
                                context.delete(account)
                                try? context.save()
                                dismiss()
                            }
                        }
                    }
                }
            }
            .navigationTitle(account == nil ? "Add Account" : "Edit Account")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        save()
                    } label: {
                        Image(systemName: "checkmark")
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .task {
                hydrate()
            }
        }
    }

    private func hydrate() {
        if let account {
            name = account.name
            type = account.type
            subtype = account.subtype
            openingBalanceText = NSDecimalNumber(decimal: account.openingBalance).stringValue
            currencyCode = account.currencyCode
            iconName = account.iconName
            cardStyle = account.cardStyle
            isArchived = account.isArchived
            issuer = account.issuer ?? .other
            last4 = account.cardLast4 ?? ""
            nickname = account.cardNickname ?? ""
        } else {
            type = defaultType
            subtype = defaultSubtype
            issuer = defaultIssuer ?? .other
            last4 = defaultLast4
        }
    }

    private func save() {
        let openingBalance = Decimal(string: openingBalanceText) ?? 0

        if let account {
            account.name = name
            account.type = type
            account.subtype = normalizedSubtype
            account.openingBalance = openingBalance
            account.currencyCode = currencyCode.uppercased()
            account.iconName = iconName
            account.cardStyle = cardStyle
            account.isArchived = isArchived
            account.issuer = last4.isEmpty ? nil : issuer
            account.cardLast4 = last4.isEmpty ? nil : last4
            account.cardNickname = nickname.isEmpty ? nil : nickname
            account.updatedAt = .now
        } else {
            let account = Account(
                name: name,
                type: type,
                subtype: normalizedSubtype,
                openingBalance: openingBalance,
                currencyCode: currencyCode.uppercased(),
                iconName: iconName,
                cardStyle: cardStyle,
                sortOrder: (allAccounts.map(\.sortOrder).max() ?? 0) + 1,
                isArchived: isArchived,
                issuer: last4.isEmpty ? nil : issuer,
                cardLast4: last4.isEmpty ? nil : last4,
                cardNickname: nickname.isEmpty ? nil : nickname
            )
            context.insert(account)
        }

        try? context.save()
        dismiss()
    }

    private var activeSubtypeOptions: [AccountSubtypeOption] {
        subtypeOptions.filter { !$0.isArchived }
    }

    private var normalizedSubtype: String {
        let trimmed = subtype.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "other" : trimmed
    }

    private func addSubtypeOption() {
        let trimmed = newSubtypeOption.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        if let existing = activeSubtypeOptions.first(where: { $0.name.caseInsensitiveCompare(trimmed) == .orderedSame }) {
            subtype = existing.name
            newSubtypeOption = ""
            return
        }

        let option = AccountSubtypeOption(
            name: trimmed,
            sortOrder: (activeSubtypeOptions.map(\.sortOrder).max() ?? 0) + 1
        )
        context.insert(option)
        try? context.save()
        subtype = trimmed
        newSubtypeOption = ""
    }

    private func renameSubtypeOption(_ option: AccountSubtypeOption) {
        let candidate = (subtypeEdits[option.id] ?? option.name).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !candidate.isEmpty else { return }

        if activeSubtypeOptions.contains(where: { $0.id != option.id && $0.name.caseInsensitiveCompare(candidate) == .orderedSame }) {
            return
        }

        let previousName = option.name
        option.name = candidate
        option.updatedAt = .now

        for account in allAccounts where account.subtype.caseInsensitiveCompare(previousName) == .orderedSame {
            account.subtype = candidate
            account.updatedAt = .now
        }

        if subtype.caseInsensitiveCompare(previousName) == .orderedSame {
            subtype = candidate
        }

        subtypeEdits[option.id] = candidate
        try? context.save()
    }

    private func removeSubtypeOption(_ option: AccountSubtypeOption) {
        context.delete(option)
        try? context.save()
    }
}

struct CategoryManagerView: View {
    @Environment(\.modelContext) private var context

    @Query(sort: [SortDescriptor(\Category.name)])
    private var categories: [Category]

    @State private var showAddSheet = false
    @State private var editingCategory: Category?

    var body: some View {
        List {
            Section {
                Button {
                    showAddSheet = true
                } label: {
                    Label("Add Category", systemImage: "plus.circle.fill")
                }
            }

            Section("Existing") {
                ForEach(categories) { category in
                    Button {
                        editingCategory = category
                    } label: {
                        HStack {
                            Image(systemName: category.iconName)
                                .foregroundStyle(.blue)
                            Text(category.name)
                                .foregroundStyle(.primary)
                            Spacer()
                            Text(category.kind.rawValue.capitalized)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                    .swipeActions {
                        Button(role: .destructive) {
                            context.delete(category)
                            try? context.save()
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
        }
        .navigationTitle("Categories")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showAddSheet = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showAddSheet) {
            CategoryEditorSheet(category: nil)
        }
        .sheet(item: $editingCategory) { category in
            CategoryEditorSheet(category: category)
        }
    }
}

private struct CategoryEditorSheet: View {
    let category: Category?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context

    @Query(sort: [SortDescriptor(\Category.name)])
    private var allCategories: [Category]

    @State private var name = ""
    @State private var kind: CategoryKind = .expense
    @State private var iconName = "tag.fill"
    @State private var iconPage = 0

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("Category name", text: $name)
                }

                Section("Type") {
                    Picker("Type", selection: $kind) {
                        Text("Expense").tag(CategoryKind.expense)
                        Text("Income").tag(CategoryKind.income)
                        Text("Both").tag(CategoryKind.both)
                    }
                    .pickerStyle(.segmented)
                }

                Section("Icon") {
                    TabView(selection: $iconPage) {
                        ForEach(Array(categoryIconPages.enumerated()), id: \.offset) { index, page in
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 5), spacing: 14) {
                                ForEach(page, id: \.self) { icon in
                                    Button {
                                        iconName = icon
                                    } label: {
                                        ZStack {
                                            Circle()
                                                .fill(iconName == icon ? Color.blue : Color.white.opacity(0.08))
                                                .frame(width: 42, height: 42)
                                            Image(systemName: icon)
                                                .foregroundStyle(iconName == icon ? .white : .primary)
                                        }
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.vertical, 8)
                            .tag(index)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .always))
                    .frame(height: 250)
                }
            }
            .navigationTitle(category == nil ? "New Category" : "Edit Category")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") { save() }
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .task {
                hydrate()
            }
        }
    }

    private func hydrate() {
        guard let category else { return }
        name = category.name
        kind = category.kind
        iconName = category.iconName
        if let index = categoryIconChoices.firstIndex(of: category.iconName) {
            iconPage = index / categoryIconPageSize
        }
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        if let category {
            category.name = trimmed
            category.kind = kind
            category.iconName = iconName
        } else {
            context.insert(
                Category(
                    name: trimmed,
                    kind: kind,
                    iconName: iconName,
                    sortOrder: (allCategories.map(\.sortOrder).max() ?? 0) + 1
                )
            )
        }

        try? context.save()
        dismiss()
    }
}

private let categoryIconPageSize = 20

private var categoryIconPages: [[String]] {
    stride(from: 0, to: categoryIconChoices.count, by: categoryIconPageSize).map { start in
        let end = min(start + categoryIconPageSize, categoryIconChoices.count)
        return Array(categoryIconChoices[start..<end])
    }
}

private let categoryIconChoices: [String] = [
    "fork.knife", "cart.fill", "gift.fill", "car.fill", "tram.fill",
    "bolt.fill", "drop.fill", "cross.case.fill", "heart.fill", "house.fill",
    "airplane", "bag.fill", "creditcard.fill", "banknote.fill", "building.columns.fill",
    "book.fill", "graduationcap.fill", "wrench.and.screwdriver.fill", "shield.fill", "leaf.fill",
    "pawprint.fill", "gamecontroller.fill", "figure.walk", "ticket.fill", "sparkles"
]

struct PayeeManagerView: View {
    @Environment(\.modelContext) private var context

    @Query(sort: [SortDescriptor(\Payee.lastUsedAt, order: .reverse), SortDescriptor(\Payee.name)])
    private var payees: [Payee]
    @Query(sort: [SortDescriptor(\Category.name)])
    private var categories: [Category]

    @State private var name = ""
    @State private var addDefaultCategoryId: UUID?

    var body: some View {
        List {
            Section("Add") {
                TextField("Payee name", text: $name)
                Picker("Default Category", selection: $addDefaultCategoryId) {
                    Text("None").tag(UUID?.none)
                    ForEach(categories.filter { !$0.isArchived }) { category in
                        Text(category.name).tag(Optional(category.id))
                    }
                }
                Button("Add Payee") {
                    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !trimmed.isEmpty else { return }
                    let defaultCategory = categories.first(where: { $0.id == addDefaultCategoryId })
                    context.insert(Payee(name: trimmed, lastUsedAt: .now, defaultCategory: defaultCategory))
                    try? context.save()
                    name = ""
                    addDefaultCategoryId = nil
                }
            }

            Section("Existing") {
                ForEach(payees) { payee in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(payee.name)
                        Picker(
                            "Default Category",
                            selection: Binding(
                                get: { payee.defaultCategory?.id },
                                set: { newValue in
                                    payee.defaultCategory = categories.first(where: { $0.id == newValue })
                                    payee.lastUsedAt = payee.lastUsedAt ?? .now
                                    try? context.save()
                                }
                            )
                        ) {
                            Text("None").tag(UUID?.none)
                            ForEach(categories.filter { !$0.isArchived }) { category in
                                Text(category.name).tag(Optional(category.id))
                            }
                        }
                    }
                    .swipeActions {
                        Button(role: .destructive) {
                            context.delete(payee)
                            try? context.save()
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
        }
        .navigationTitle("Payees")
    }
}
