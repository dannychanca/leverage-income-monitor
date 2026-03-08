import SwiftUI
import SwiftData

@main
struct FinanceLedgerApp: App {
    @StateObject private var services = AppServices()

    private let container: ModelContainer = {
        let schema = Schema([
            Account.self,
            AccountSubtypeOption.self,
            Category.self,
            Payee.self,
            Transaction.self,
            CardMapping.self
        ])

        let persistentConfiguration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
        do {
            return try ModelContainer(for: schema, configurations: [persistentConfiguration])
        } catch {
            // If a local schema migration fails, fall back to in-memory so the app can launch.
            print("Persistent SwiftData container failed, falling back to in-memory: \(error)")
            do {
                let memoryConfiguration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
                return try ModelContainer(for: schema, configurations: [memoryConfiguration])
            } catch {
                fatalError("Unable to initialize any SwiftData container: \(error)")
            }
        }
    }()

    var body: some Scene {
        WindowGroup {
            MainTabView()
                .modelContainer(container)
                .environmentObject(services)
                .preferredColorScheme(.dark)
                .task {
                    await services.loadImportAddress()
                    do {
                        try Repository.seedIfNeeded(context: container.mainContext)
                    } catch {
                        assertionFailure("Seed failed: \(error)")
                    }
                }
        }
    }
}
