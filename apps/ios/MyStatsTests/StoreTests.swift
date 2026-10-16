import AuthenticationServices
import MyStatsCore
import SwiftData
import XCTest

@testable import MyStats

@MainActor final class StoreTests: XCTestCase {
  func context() throws -> ModelContainer {
    try ModelContainer(
      for: SavedWorkspace.self,
      configurations: ModelConfiguration(isStoredInMemoryOnly: true, cloudKitDatabase: .none))
  }
  func preferences() -> UserDefaults {
    let name = "myStats.tests." + UUID().uuidString
    let prefs = UserDefaults(suiteName: name)!
    prefs.set("https://test.example.invalid", forKey: "server")
    return prefs
  }
  func sample() -> Season {
    var s = Season()
    s.profile.firstname = "Test"
    s.profile.utmb = 600
    var r = TrailRace()
    r.name = "Objectif"
    r.distanceKm = 100
    r.ascentM = 6000
    r.targetSeconds = 61200
    s.races = [r]
    s.observeIndexes()
    return s
  }
  func testOfflineCommitAndRestartRetainsSeason() throws {
    let container = try context()
    let prefs = preferences()
    let store = SeasonStore(
      context: container.mainContext, preferences: prefs, monitorNetwork: false)
    let season = sample()
    store.commit(season)
    let restarted = SeasonStore(
      context: container.mainContext, preferences: prefs, monitorNetwork: false)
    XCTAssertEqual(restarted.season, season)
    XCTAssertEqual(restarted.syncStatus, "En attente")
  }
  func testProfilesStayIsolatedWhenServerChanges() throws {
    let container = try context()
    let prefs = preferences()
    let store = SeasonStore(
      context: container.mainContext, preferences: prefs, monitorNetwork: false)
    let season = sample()
    store.commit(season)
    store.changeServer("https://other.example.invalid")
    XCTAssertTrue(store.season.races.isEmpty)
    store.changeServer("https://test.example.invalid")
    XCTAssertEqual(store.season, season)
  }
  func testInvalidImportDoesNotReplaceSavedSeason() throws {
    let container = try context()
    let store = SeasonStore(
      context: container.mainContext, preferences: preferences(), monitorNetwork: false)
    let valid = sample()
    store.commit(valid)
    var invalid = valid
    invalid.races[0].distanceKm = -1
    store.commit(invalid)
    XCTAssertEqual(store.season, valid)
    XCTAssertFalse(store.message.isEmpty)
  }
  func testCorruptStorageIsNotOverwritten() throws {
    let container = try context()
    let prefs = preferences()
    let original = Data("invalid".utf8)
    container.mainContext.insert(
      SavedWorkspace(scope: "https://test.example.invalid|local", payload: original))
    try container.mainContext.save()
    let store = SeasonStore(
      context: container.mainContext, preferences: prefs, monitorNetwork: false)
    store.commit(sample())
    XCTAssertEqual(
      try container.mainContext.fetch(FetchDescriptor<SavedWorkspace>()).first?.payload, original)
  }
  func testAutomaticBackupCanBeRestored() throws {
    let container = try context()
    let store = SeasonStore(
      context: container.mainContext, preferences: preferences(), monitorNetwork: false)
    let original = sample()
    store.commit(original)
    store.archiveCurrent()
    var changed = original
    changed.profile.utmb = 650
    store.commit(changed)
    let copy = try XCTUnwrap(store.localCopies().first)
    store.commit(copy.season)
    XCTAssertEqual(store.season, original)
  }
  func testHTTPSAndLoopbackValidation() {
    XCTAssertNoThrow(try APIClient.server("https://stats.example.org"))
    XCTAssertThrowsError(try APIClient.server("http://stats.example.org"))
    XCTAssertThrowsError(try APIClient.server("https://a:b@stats.example.org"))
    XCTAssertThrowsError(try APIClient.server("https://stats.example.org/api"))
    #if DEBUG
      for host in ["10.0.0.1", "172.16.0.1", "172.31.255.254", "192.168.1.102"] {
        XCTAssertNoThrow(try APIClient.server("http://\(host):3001"), host)
      }
    #else
      XCTAssertThrowsError(try APIClient.server("http://192.168.1.102:3001"))
    #endif
    for host in [
      "172.15.0.1", "172.32.0.1", "192.169.1.1", "8.8.8.8", "0.0.0.0", "192.168.1.256",
      "192.168.1.example.org",
    ] {
      XCTAssertThrowsError(try APIClient.server("http://\(host):3001"), host)
    }
    #if DEBUG && targetEnvironment(simulator)
      XCTAssertNoThrow(try APIClient.server("http://localhost:3001"))
    #else
      XCTAssertThrowsError(try APIClient.server("http://localhost:3001"))
    #endif
  }
  func testBrowserCancellationIsDistinctFromAuthenticationFailure() {
    let cancelled = NSError(
      domain: ASWebAuthenticationSessionErrorDomain,
      code: ASWebAuthenticationSessionError.canceledLogin.rawValue)
    XCTAssertTrue(NativeAuth.browserError(cancelled) is CancellationError)
    let invalidContext = NSError(
      domain: ASWebAuthenticationSessionErrorDomain,
      code: ASWebAuthenticationSessionError.presentationContextInvalid.rawValue)
    let failure = NativeAuth.browserError(invalidContext)
    XCTAssertFalse(failure is CancellationError)
    XCTAssertTrue(failure.localizedDescription.contains("fenêtre de connexion"))
    XCTAssertFalse(NativeAuth.browserError(NSError(domain: "Other", code: 1)) is CancellationError)
    XCTAssertFalse(NativeAuth.browserError(nil) is CancellationError)
  }
  func testSavingCourseScoreWithoutRewritingIndexHistory() throws {
    let container = try context()
    let store = SeasonStore(
      context: container.mainContext, preferences: preferences(), monitorNetwork: false)
    store.commit(sample())
    var result = TrailResult()
    result.name = "Course terminée"
    result.date = "2026-06-12"
    result.distanceKm = 30
    result.ascentM = 1000
    result.seconds = 10800
    store.saveResult(result)
    let history = store.season.indexHistory
    let feedbackBefore = store.savedFeedback
    result.utmb = 642
    store.saveResult(result)
    XCTAssertEqual(store.season.results.first(where: { $0.id == result.id })?.utmb, 642)
    XCTAssertEqual(store.season.indexHistory, history)
    XCTAssertEqual(store.savedFeedback, feedbackBefore + 1)
    var invalid = store.season
    invalid.results[0].distanceKm = -1
    XCTAssertFalse(store.commit(invalid))
    XCTAssertEqual(store.savedFeedback, feedbackBefore + 1)
  }
  func testAPIUsesBearerAndDecodesConflict() async throws {
    let expected = sample()
    let transport: APITransport = { request in
      XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test")
      let workspace: [String: Any] = [
        "revision": 2, "season": try JSONSerialization.jsonObject(with: expected.encoded()),
        "updatedAt": NSNull(),
      ]
      return (
        try JSONSerialization.data(withJSONObject: ["message": "Conflit", "workspace": workspace]),
        HTTPURLResponse(url: request.url!, statusCode: 409, httpVersion: nil, headerFields: nil)!
      )
    }
    let api = APIClient(
      baseURL: URL(string: "https://test.example.invalid")!, token: "test", transport: transport)
    do {
      _ = try await api.request("/api/v1/season")
      XCTFail("Expected conflict")
    } catch let error as APIError {
      XCTAssertEqual(error.status, 409)
      XCTAssertEqual(error.workspace?.revision, 2)
      XCTAssertEqual(error.workspace?.season, expected)
    }
  }
}

private final class MemoryVault: SessionStorage {
  var token: String? = "test-token"
  func read(_ server: String) -> String? { token }
  func save(_ token: String?, server: String) throws { self.token = token }
}
private actor FakeSyncServer {
  var revision = 0
  var season: Season?
  var offline = false
  func setOffline(_ value: Bool) { offline = value }
  func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
    if offline { throw URLError(.notConnectedToInternet) }
    var status = 200
    var body: [String: Any]
    if request.url!.path == "/api/v1/session" {
      body = ["athlete": ["id": 42, "firstname": "Test", "lastname": "Runner"]]
    } else if request.httpMethod == "PUT" {
      let input = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
      if input["revision"] as? Int != revision {
        status = 409
        body = ["message": "Conflit", "workspace": try workspace()]
      } else {
        season = try Season.decode(JSONSerialization.data(withJSONObject: input["season"]!))
        revision += 1
        body = try workspace()
      }
    } else {
      body = try workspace()
    }
    return (
      try JSONSerialization.data(withJSONObject: body),
      HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
    )
  }
  func workspace() throws -> [String: Any] {
    [
      "revision": revision,
      "season": try season.map { try JSONSerialization.jsonObject(with: $0.encoded()) } ?? NSNull(),
      "updatedAt": NSNull(),
    ]
  }
}
extension StoreTests {
  func testTwoDevicesResolveConflictWithoutLosingDraft() async throws {
    let containerA = try context()
    let containerB = try context()
    let prefs = preferences()
    let server = FakeSyncServer()
    let vault = MemoryVault()
    let a = SeasonStore(
      context: containerA.mainContext, preferences: prefs,
      transport: { try await server.respond($0) }, vault: vault, monitorNetwork: false)
    let b = SeasonStore(
      context: containerB.mainContext, preferences: prefs,
      transport: { try await server.respond($0) }, vault: vault, monitorNetwork: false)
    await a.resume()
    await b.resume()
    var first = sample()
    first.races[0].name = "Premier appareil"
    a.commit(first)
    await a.synchronize()
    var second = sample()
    second.races[0].name = "Second appareil"
    b.commit(second)
    await b.synchronize()
    XCTAssertNotNil(b.conflict)
    XCTAssertEqual(b.season.races.first?.name, "Second appareil")
    await b.resolve(useLocal: true)
    XCTAssertNil(b.conflict)
    await a.synchronize()
    XCTAssertEqual(a.season.races.first?.name, "Second appareil")
  }
  func testAnonymousSeasonNeedsExplicitImportAfterLogin() async throws {
    let container = try context()
    let prefs = preferences()
    let server = FakeSyncServer()
    let vault = MemoryVault()
    let store = SeasonStore(
      context: container.mainContext, preferences: prefs,
      transport: { try await server.respond($0) }, vault: vault, monitorNetwork: false)
    let expected = sample()
    store.commit(expected)
    await store.resume()
    XCTAssertNotNil(store.migration)
    XCTAssertEqual(store.season, expected)
    let before = try await server.workspace()
    XCTAssertEqual(before["revision"] as? Int, 0)
    await store.resolve(useLocal: true)
    XCTAssertNil(store.migration)
    let after = try await server.workspace()
    XCTAssertEqual(after["revision"] as? Int, 1)
  }
  func testOfflineChangesSurviveRestartThenUpload() async throws {
    let container = try context()
    let prefs = preferences()
    let server = FakeSyncServer()
    let vault = MemoryVault()
    let store = SeasonStore(
      context: container.mainContext, preferences: prefs,
      transport: { try await server.respond($0) }, vault: vault, monitorNetwork: false)
    await store.resume()
    await server.setOffline(true)
    let expected = sample()
    store.commit(expected)
    await store.synchronize()
    XCTAssertTrue(store.syncStatus.contains("En attente"))
    let restarted = SeasonStore(
      context: container.mainContext, preferences: prefs,
      transport: { try await server.respond($0) }, vault: vault, monitorNetwork: false)
    XCTAssertEqual(restarted.season, expected)
    await server.setOffline(false)
    await restarted.resume()
    XCTAssertEqual(restarted.syncStatus, "Synchronisé")
    let saved = try await server.workspace()
    XCTAssertEqual(saved["revision"] as? Int, 1)
  }
}
