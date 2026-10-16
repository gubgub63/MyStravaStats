import Foundation
import MyStatsCore
import Network
import Observation
import SwiftData

@Model final class SavedWorkspace {
  @Attribute(.unique) var scope: String
  var payload: Data
  init(scope: String, payload: Data) {
    self.scope = scope
    self.payload = payload
  }
}
private struct LocalState: Codable {
  var season: Season
  var revision: Int
  var dirty: Bool
  var attached: Bool
}
@MainActor @Observable final class SeasonStore {
  private(set) var season = Season()
  private(set) var athlete: Athlete?
  private(set) var authenticated = false
  var server: String
  var message = ""
  var syncStatus = "Sur cet iPhone"
  var conflict: Workspace?
  var migration: Workspace?
  var busy = false
  private(set) var savedFeedback = 0
  private(set) var dashboard: Dashboard?
  private var revision = 0
  private var dirty = false
  private var attached = false
  private var generation = 0
  private var token: String?
  private var scope = ""
  private var syncing = false
  private var context: ModelContext
  private var syncTask: Task<Void, Never>?
  private var monitor = NWPathMonitor()
  private let auth = NativeAuth()
  @ObservationIgnored private let vault: any SessionStorage
  @ObservationIgnored private let preferences: UserDefaults
  @ObservationIgnored private let transport: APITransport?
  private var storageReadable = true
  private var hasLocalDocument = false
  var client: APIClient {
    get throws {
      try APIClient(baseURL: APIClient.server(server), token: token, transport: transport)
    }
  }
  init(
    context: ModelContext, preferences: UserDefaults = .standard, transport: APITransport? = nil,
    vault: any SessionStorage = KeychainSessionStorage(), monitorNetwork: Bool = true
  ) {
    self.vault = vault
    self.preferences = preferences
    self.transport = transport
    self.context = context
    let configuredServer =
      Bundle.main.object(forInfoDictionaryKey: "MyStatsServerURL") as? String ?? ""
    let savedServer = preferences.string(forKey: "server")
    // An old localhost setting cannot work on a physical iPhone; use the build default instead.
    server =
      savedServer.flatMap { (try? APIClient.server($0)) != nil ? $0 : nil } ?? configuredServer
    token = vault.read(server)
    if let data = preferences.data(forKey: "athlete:" + server) {
      athlete = try? JSONDecoder().decode(Athlete.self, from: data)
    }
    loadLocal()
    monitor.pathUpdateHandler = { [weak self] path in
      if path.status == .satisfied { Task { @MainActor in await self?.resume() } }
    }
    if monitorNetwork { monitor.start(queue: DispatchQueue(label: "myStats.network")) }
  }
  private func loadLocal() {
    scope = server + "|" + (athlete.map { String($0.id) } ?? "local")
    let key = scope
    season = Season()
    revision = 0
    dirty = false
    attached = false
    storageReadable = true
    hasLocalDocument = false
    do {
      if let record = try context.fetch(
        FetchDescriptor<SavedWorkspace>(predicate: #Predicate { $0.scope == key })
      ).first {
        hasLocalDocument = true
        let saved = try JSONDecoder().decode(LocalState.self, from: record.payload)
        try saved.season.validate()
        season = saved.season
        revision = saved.revision
        dirty = saved.dirty
        attached = saved.attached
      } else {
        season = Season()
        season.profile.firstname = athlete?.firstname ?? ""
        season.profile.lastname = athlete?.lastname ?? ""
        revision = 0
        dirty = false
        attached = false
      }
      syncStatus = dirty ? "En attente" : "Sur cet iPhone"
    } catch {
      storageReadable = false
      message = "La sauvegarde locale est illisible. Elle n’a pas été remplacée."
    }
  }
  private func persist() throws {
    guard storageReadable else {
      throw TrailError.invalid(
        "La sauvegarde précédente est illisible. Exporte tes nouvelles données avant de continuer.")
    }
    let key = scope
    let data = try JSONEncoder().encode(
      LocalState(season: season, revision: revision, dirty: dirty, attached: attached))
    if let record = try context.fetch(
      FetchDescriptor<SavedWorkspace>(predicate: #Predicate { $0.scope == key })
    ).first {
      record.payload = data
    } else {
      context.insert(SavedWorkspace(scope: key, payload: data))
    }
    try context.save()
  }
  @discardableResult func commit(_ next: Season) -> Bool {
    var next = next
    if next.profile != season.profile { next.observeIndexes() }
    do {
      try next.validate()
      season = next
      dirty = true
      generation += 1
      try persist()
      syncStatus = "En attente"
      schedule()
      savedFeedback += 1
      return true
    } catch {
      message =
        "\(error.localizedDescription) Exporte ta saison avant de fermer si le stockage est plein."
      return false
    }
  }
  func changeServer(_ value: String) {
    guard !authenticated else {
      message = "Déconnecte-toi avant de changer de serveur."
      return
    }
    do {
      let url = try APIClient.server(value)
      server = url.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
      preferences.set(server, forKey: "server")
      token = vault.read(server)
      athlete = nil
      if let data = preferences.data(forKey: "athlete:" + server) {
        athlete = try? JSONDecoder().decode(Athlete.self, from: data)
      }
      dashboard = nil
      conflict = nil
      migration = nil
      loadLocal()
      Task { await resume() }
    } catch { message = error.localizedDescription }
  }
  func login() async {
    guard !busy else { return }
    busy = true
    defer { busy = false }
    do {
      let value = try await auth.login(client)
      try vault.save(value, server: server)
      token = value
      await resume()
    } catch is CancellationError {
      // Closing the system browser is an ordinary cancellation, not an application error.
    } catch { message = error.localizedDescription }
  }
  func resume() async {
    guard token != nil else { return }
    do {
      struct Session: Decodable { var athlete: Athlete }
      let session: Session = try await client.get("/api/v1/session")
      if athlete?.id != session.athlete.id {
        let anonymous = athlete == nil && dirty ? season : nil
        athlete = session.athlete
        dashboard = nil
        generation += 1
        loadLocal()
        if !hasLocalDocument, let anonymous {
          season = anonymous
          dirty = true
          attached = false
          try persist()
        }
      }
      athlete = session.athlete
      authenticated = true
      preferences.set(
        try JSONEncoder().encode(session.athlete), forKey: "athlete:" + server)
      await synchronize()
    } catch { handle(error) }
  }
  private func schedule() {
    syncTask?.cancel()
    syncTask = Task {
      try? await Task.sleep(for: .milliseconds(900))
      if !Task.isCancelled { await synchronize() }
    }
  }
  private func handle(_ error: Error) {
    if let e = error as? APIError, e.status == 401 {
      authenticated = false
      dashboard = nil
      token = nil
      try? vault.save(nil, server: server)
      syncStatus = "Reconnecte-toi pour synchroniser"
    } else {
      syncStatus = "En attente · réseau indisponible"
    }
    message = error.localizedDescription
  }
  func synchronize() async {
    guard authenticated, storageReadable, !syncing, conflict == nil, migration == nil else {
      return
    }
    syncing = true
    defer { syncing = false }
    let requestedScope = scope
    do {
      let remote: Workspace = try await client.get("/api/v1/season")
      guard scope == requestedScope else { return }
      if !attached && dirty {
        migration = remote
        syncStatus = "Saison locale à importer"
        return
      }
      if !dirty {
        if let value = remote.season {
          try value.validate()
          season = value
        }
        revision = remote.revision
        attached = true
        try persist()
        syncStatus = "Synchronisé"
        return
      }
      if revision != remote.revision {
        conflict = remote
        syncStatus = "Conflit à résoudre"
        return
      }
      try await upload(base: remote.revision)
    } catch let e as APIError where e.status == 409 {
      conflict = e.workspace
      syncStatus = "Conflit à résoudre"
    } catch { handle(error) }
  }
  private func upload(base: Int) async throws {
    let snapshot = season
    let version = generation
    let requestedScope = scope
    let payload = try JSONSerialization.data(withJSONObject: [
      "revision": base, "season": JSONSerialization.jsonObject(with: snapshot.encoded()),
    ])
    let saved = try JSONDecoder().decode(
      Workspace.self, from: await client.request("/api/v1/season", method: "PUT", body: payload))
    guard requestedScope == scope else { return }
    revision = saved.revision
    attached = true
    dirty = generation != version
    try persist()
    syncStatus = dirty ? "En attente" : "Synchronisé"
    if dirty { schedule() }
  }
  func resolve(useLocal: Bool) async {
    guard let remote = conflict ?? migration, !syncing else { return }
    syncing = true
    defer { syncing = false }
    do {
      if useLocal {
        try await upload(base: remote.revision)
      } else {
        // Preserve the local version as a separate record before replacement.
        context.insert(
          SavedWorkspace(
            scope: scope + "|backup|" + UUID().uuidString,
            payload: try JSONEncoder().encode(
              LocalState(season: season, revision: revision, dirty: dirty, attached: attached))))
        try context.save()
        season = remote.season ?? Season()
        revision = remote.revision
        attached = true
        dirty = false
        generation += 1
        try persist()
        syncStatus = "Synchronisé"
      }
      conflict = nil
      migration = nil
    } catch let e as APIError where e.status == 409 {
      conflict = e.workspace
      migration = nil
      syncStatus = "Conflit à résoudre"
    } catch { handle(error) }
  }
  func logout(disconnect: Bool = false) async {
    guard !busy else { return }
    busy = true
    defer { busy = false }
    do {
      let data = try await client.request(
        disconnect ? "/api/v1/auth/disconnect" : "/api/v1/auth/logout", method: "POST")
      if disconnect, let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
        object["revoked"] as? Bool == false
      {
        message =
          "Session supprimée. Révoque aussi l’accès dans les réglages Strava : leur service n’a pas confirmé la révocation."
      }
    } catch {
      message =
        "Déconnecté sur cet iPhone. Le serveur n’a pas confirmé la révocation ; retire l’accès depuis Strava si nécessaire."
    }
    do { try vault.save(nil, server: server) } catch { message = error.localizedDescription }
    syncTask?.cancel()
    token = nil
    authenticated = false
    dashboard = nil
    syncStatus = "Sur cet iPhone · déconnecté"
  }
  @discardableResult func loadDashboard(days: Int = 90, from: String? = nil, to: String? = nil)
    async -> Bool
  {
    do {
      var query = ["days": String(days)]
      if let from, let to { query = ["from": from, "to": to] }
      dashboard = try await client.get(APIClient.query("/api/dashboard", query))
      return true
    } catch {
      handle(error)
      return false
    }
  }
  func searchRunner(firstname: String, lastname: String) async throws -> [RunnerMatch] {
    struct Response: Decodable { var runners: [RunnerMatch] }
    let response: Response = try await client.get(
      APIClient.query("/api/trail/runners", ["firstname": firstname, "lastname": lastname]))
    return response.runners
  }
  func importRunner(
    _ runner: RunnerMatch, firstname: String, lastname: String, isCurrent: () -> Bool = { true }
  ) async throws {
    let requestedScope = scope
    let data: RunnerResponse = try await client.get(
      APIClient.query("/api/trail/runners", ["uri": runner.uri]))
    guard !Task.isCancelled, requestedScope == scope, isCurrent() else { throw CancellationError() }
    var next = season
    next.profile.firstname = firstname
    next.profile.lastname = lastname
    next.profile.utmb = data.utmb
    next.profile.utmbUrl = data.source
    next.profile.checkedAt = data.checkedAt
    var rows = Dictionary(uniqueKeysWithValues: next.results.map { ($0.id, $0) })
    for var row in data.results {
      if let previous = rows[row.id] {
        row.itra = previous.itra
        row.terrain = previous.terrain
      }
      rows[row.id] = row
    }
    next.results = rows.values.sorted { $0.date > $1.date }
    commit(next)
  }
  func saveRace(_ race: TrailRace) {
    var next = season
    if let i = next.races.firstIndex(where: { $0.id == race.id }) {
      next.races[i] = race
    } else {
      next.races.append(race)
    }
    commit(next)
  }
  func saveResult(_ result: TrailResult) {
    var next = season
    if let i = next.results.firstIndex(where: { $0.id == result.id }) {
      next.results[i] = result
    } else {
      next.results.append(result)
    }
    commit(next)
  }
}

struct LocalCopy: Identifiable {
  var id: String
  var title: String
  var season: Season
}
extension SeasonStore {
  func archiveCurrent() {
    do {
      context.insert(
        SavedWorkspace(
          scope: scope + "|backup|" + UUID().uuidString,
          payload: try JSONEncoder().encode(
            LocalState(season: season, revision: revision, dirty: dirty, attached: attached))))
      try context.save()
    } catch {
      message = "La copie locale n’a pas pu être conservée : \(error.localizedDescription)"
    }
  }
  func localCopies() -> [LocalCopy] {
    do {
      return try context.fetch(FetchDescriptor<SavedWorkspace>()).filter {
        $0.scope.hasPrefix(scope + "|backup|") || $0.scope == server + "|local" && $0.scope != scope
      }.compactMap { row in
        guard let local = try? JSONDecoder().decode(LocalState.self, from: row.payload) else {
          return nil
        }
        return LocalCopy(
          id: row.scope,
          title: row.scope.contains("|backup|")
            ? "Version conservée · \(local.season.profile.firstname) \(local.season.profile.lastname)"
            : "Saison sans connexion", season: local.season)
      }
    } catch {
      message = error.localizedDescription
      return []
    }
  }
}
