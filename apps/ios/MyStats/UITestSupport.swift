#if DEBUG
  import Foundation
  import MyStatsCore
  import SwiftUI

  /// Synthetic data for simulator UI tests only. No production account or network is used.
  @MainActor final class UITestBackend {
    var season = Season()
    var revision = 1
    init() {
      season.profile.firstname = "Camille"
      season.profile.utmb = 587
      season.observeIndexes()
      let year = Calendar.current.component(.year, from: Date())
      for (offset, value) in [560.0, 590.0].enumerated() {
        var result = TrailResult()
        result.id = "ui-result-\(offset)"
        result.name = "Trail de référence \(offset + 1)"
        result.date = "\(year)-0\(offset + 5)-12"
        result.distanceKm = 30
        result.ascentM = 1200
        result.seconds = 14400
        result.utmb = value
        result.itra = value - 10
        season.results.append(result)
      }
    }
    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
      let url = request.url!
      let body: [String: Any]
      switch url.path {
      case "/api/v1/session":
        body = ["athlete": ["id": 999, "firstname": "Camille", "lastname": "Démo"]]
      case "/api/v1/season":
        if request.httpMethod == "PUT", let data = request.httpBody,
          let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let incoming = payload["season"]
        {
          season = try Season.decode(JSONSerialization.data(withJSONObject: incoming))
          revision += 1
        }
        body = [
          "revision": revision, "season": try JSONSerialization.jsonObject(with: season.encoded()),
          "updatedAt": NSNull(),
        ]
      case "/api/dashboard": body = dashboard()
      default:
        return (
          Data("{\"message\":\"Source indisponible dans le test.\"}".utf8),
          HTTPURLResponse(url: url, statusCode: 404, httpVersion: nil, headerFields: nil)!
        )
      }
      return (
        try JSONSerialization.data(withJSONObject: body),
        HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!
      )
    }
    private func dashboard() -> [String: Any] {
      let date = TrailMath.today
      let summary: [String: Any] = [
        "distanceKm": 550, "elevationGainM": 11000, "movingTimeSeconds": 198000,
        "activityCount": 55,
      ]
      let activities: [[String: Any]] = (1...55).map { index in
        [
          "id": index, "name": "Sortie trail \(index)", "sportType": "TrailRun",
          "startDate": date + "T08:00:00Z", "localDate": date + "T10:00:00", "distanceKm": 10,
          "elevationGainM": 200, "movingTimeSeconds": 3600,
        ]
      }
      return [
        "athlete": ["id": 999, "firstname": "Camille"], "summary": summary,
        "weekly": [
          [
            "week": date, "distanceKm": 550, "elevationGainM": 11000, "movingTimeSeconds": 198000,
            "activityCount": 55,
          ]
        ],
        "sports": [
          ["sport": "TrailRun", "count": 55, "distanceKm": 550, "movingTimeSeconds": 198000]
        ],
        "recentActivities": activities,
        "running": [
          "count": 55, "distanceKm": 550, "elevationGainM": 11000, "movingTimeSeconds": 198000,
          "longestRunKm": 10, "highestElevationM": 200,
        ],
        "fetchedAt": date, "cacheExpiresAt": date, "partial": false, "days": 90,
      ]
    }
  }
  struct UITestVault: SessionStorage {
    func read(_ server: String) -> String? { "ui-test-session" }
    func save(_ token: String?, server: String) throws {}
  }
  struct UITestTraits: ViewModifier {
    func body(content: Content) -> some View {
      if ProcessInfo.processInfo.arguments.contains("--ui-tests") {
        content
          .preferredColorScheme(
            ProcessInfo.processInfo.arguments.contains("--ui-dark") ? .dark : .light
          )
          .dynamicTypeSize(
            ProcessInfo.processInfo.arguments.contains("--ui-large-text") ? .accessibility5 : .large
          )
      } else {
        content
      }
    }
  }
#endif
