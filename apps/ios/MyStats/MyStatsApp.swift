import MyStatsCore
import SwiftData
import SwiftUI

@main struct MyStatsApp: App {
  private let container: ModelContainer
  @State private var store: SeasonStore
  init() {
    do {
      #if DEBUG
        let testing = ProcessInfo.processInfo.arguments.contains("--ui-tests")
      #else
        let testing = false
      #endif
      container = try ModelContainer(
        for: SavedWorkspace.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: testing, cloudKitDatabase: .none))
      let prefs = testing ? UserDefaults(suiteName: "myStats.ui-tests")! : UserDefaults.standard
      if testing {
        prefs.removePersistentDomain(forName: "myStats.ui-tests")
        prefs.set("", forKey: "server")
      }
      #if DEBUG
        if testing && ProcessInfo.processInfo.arguments.contains("--ui-fixtures") {
          prefs.set("https://ui-tests.example.invalid", forKey: "server")
          let backend = UITestBackend()
          _store = State(
            initialValue: SeasonStore(
              context: container.mainContext, preferences: prefs,
              transport: { try backend.respond($0) }, vault: UITestVault(), monitorNetwork: false))
          return
        }
      #endif
      _store = State(
        initialValue: SeasonStore(
          context: container.mainContext, preferences: prefs, monitorNetwork: !testing))
    } catch {
      fatalError("Impossible d’ouvrir le stockage myStats : \(error.localizedDescription)")
    }
  }
  var body: some Scene {
    WindowGroup {
      #if DEBUG
        RootView().environment(store).modelContainer(container).modifier(UITestTraits())
      #else
        RootView().environment(store).modelContainer(container)
      #endif
    }
  }
}
struct RootView: View {
  @Environment(SeasonStore.self) private var store
  @Environment(\.scenePhase) private var phase
  @State private var selectedTab = 0
  var body: some View {
    @Bindable var store = store
    TabView(selection: $selectedTab) {
      NavigationStack { DashboardView() }.tabItem {
        Label("Tableau de bord", systemImage: "chart.bar.xaxis")
      }.tag(0)
      NavigationStack { SeasonView() }.tabItem { Label("Saison", systemImage: "mountain.2") }.tag(1)
      NavigationStack { ProfileView() }.tabItem {
        Label("Profil", systemImage: "person.crop.circle")
      }.tag(2)
    }
    .tint(.teal)
    .appFeedback(.selection, trigger: selectedTab)
    .appFeedback(.success, trigger: store.savedFeedback)
    .task { await store.resume() }
    .onChange(of: phase) { _, next in if next == .active { Task { await store.resume() } } }
    .alert(
      "myStats",
      isPresented: Binding(get: { !store.message.isEmpty }, set: { if !$0 { store.message = "" } })
    ) {
      Button("OK") { store.message = "" }
    } message: {
      Text(store.message)
    }
  }
}
struct Metric: View {
  var title: String, value: String, unit: String = ""
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title).font(.caption).foregroundStyle(.secondary)
      (Text(value).font(.title2.bold().monospacedDigit())
        + Text(unit.isEmpty ? "" : " \(unit)").font(.caption)).lineLimit(2).minimumScaleFactor(0.8)
    }.frame(maxWidth: .infinity, alignment: .leading).accessibilityElement(children: .combine)
  }
}
struct SyncSection: View {
  @Environment(SeasonStore.self) private var store
  var body: some View {
    Section {
      Label(
        store.syncStatus,
        systemImage: store.conflict == nil
          ? "arrow.triangle.2.circlepath" : "exclamationmark.arrow.triangle.2.circlepath")
      if let remote = store.conflict ?? store.migration {
        Text(
          "Ici : \(store.season.races.count) objectifs, \(store.season.results.count) résultats. Serveur : \(remote.season?.races.count ?? 0) objectifs, \(remote.season?.results.count ?? 0) résultats."
        ).font(.footnote)
        NavigationLink("Comparer les deux versions") { SyncComparison(remote: remote) }
      } else if store.authenticated {
        Button("Synchroniser maintenant") { Task { await store.synchronize() } }
      }
    } footer: {
      Text(
        "Ta saison reste disponible hors ligne. Les recherches et Strava nécessitent une connexion."
      )
    }
  }
}
struct SyncComparison: View {
  @Environment(SeasonStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  let remote: Workspace
  var body: some View {
    List {
      Section("Sur cet iPhone") { SummarySeason(season: store.season) }
      Section("Sur le serveur") {
        if let season = remote.season {
          SummarySeason(season: season)
        } else {
          Text("Aucune saison enregistrée")
        }
      }
      Section {
        Button("Conserver ma version iPhone") {
          Task {
            await store.resolve(useLocal: true)
            dismiss()
          }
        }
        Button("Utiliser la version serveur") {
          Task {
            await store.resolve(useLocal: false)
            dismiss()
          }
        }
      } footer: {
        Text(
          "Un remplacement est explicite. Avant de charger le serveur, une copie de la version iPhone est conservée dans les sauvegardes locales du profil."
        )
      }
    }.navigationTitle("Comparer les saisons")
  }
}
struct SummarySeason: View {
  let season: Season
  var body: some View {
    Text("\(season.profile.firstname) \(season.profile.lastname)")
    Text(
      "UTMB \(season.profile.utmb.map{String(Int($0))} ?? "—") · ITRA \(season.profile.itra.map{String(Int($0))} ?? "—")"
    )
    ForEach(season.races) { r in
      VStack(alignment: .leading) {
        Text(r.name)
        Text("\(r.date) · \(TrailMath.duration(r.targetSeconds))").font(.caption).foregroundStyle(
          .secondary)
      }
    }
    Text("\(season.results.count) résultats")
  }
}
