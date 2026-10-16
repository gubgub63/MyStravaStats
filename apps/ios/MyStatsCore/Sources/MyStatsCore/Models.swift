import Foundation

public struct TrailProfile: Codable, Equatable {
  public var firstname = "", lastname = ""
  public var utmb: Double?, itra: Double?
  public var utmbUrl = "", itraUrl = "", checkedAt = ""
  public init() {}
}
public struct TrailResult: Codable, Identifiable, Equatable {
  public var id = UUID().uuidString, name = "", date = TrailMath.today
  public var distanceKm = 0.0, ascentM = 0.0
  public var seconds: Double?, rank: Int?, finishers: Int?, utmb: Double?, itra: Double?,
    terrain: Int?
  public var status = "finished", source = ""
  public init() {}
}
public struct TrackPoint: Codable, Equatable {
  public var lat: Double, lon: Double, elevation: Double, segment: Int
  public init(lat: Double, lon: Double, elevation: Double, segment: Int = 0) {
    self.lat = lat
    self.lon = lon
    self.elevation = elevation
    self.segment = segment
  }
}
public struct ProfilePoint: Codable, Equatable {
  public var km: Double, elevation: Double, lat: Double, lon: Double, segment: Int
  public init(_ point: TrackPoint, km: Double) {
    self.km = km
    elevation = point.elevation
    lat = point.lat
    lon = point.lon
    segment = point.segment
  }
}
public struct TrackAnalysis: Codable, Equatable {
  public var distanceKm: Double, ascentM: Double, descentM: Double, steepFraction: Double,
    steepDescentFraction: Double, slopeIndex: Double
  public var points: Int, profile: [ProfilePoint], filename: String, fetchedAt: String,
    source: String
}
public struct Finisher: Codable, Equatable {
  public var seconds: Double, utmb: Double?, itra: Double?
  public init(seconds: Double, utmb: Double? = nil, itra: Double? = nil) {
    self.seconds = seconds
    self.utmb = utmb
    self.itra = itra
  }
}
public struct TrailRace: Codable, Identifiable, Equatable {
  public var id = UUID().uuidString, name = "", date = TrailMath.today
  public var distanceKm = 0.0, ascentM = 0.0
  public var priority = "A", notes = "", source = "", fieldLabel = "", fieldSource = "",
    organizerTerrain = "", sourceCheckedAt = ""
  public var targetSeconds: Double?, terrain: Int?, catalogId: String?, track: TrackAnalysis?,
    fieldEdition: Int?, fieldDistanceKm: Double?, fieldAscentM: Double?, cutoffHours: Double?
  public var field: [Finisher] = []
  public init() {}
}
public struct IndexObservation: Codable, Equatable {
  public var date: String, provider: String, value: Double
}
public struct Season: Codable, Equatable {
  public var version = 1, profile = TrailProfile(), results: [TrailResult] = [],
    races: [TrailRace] = []
  public var indexHistory: [IndexObservation] = []
  public init() {}
  private enum CodingKeys: String, CodingKey { case version, profile, results, races, indexHistory }
  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    version = try c.decode(Int.self, forKey: .version)
    profile = try c.decode(TrailProfile.self, forKey: .profile)
    results = try c.decode([TrailResult].self, forKey: .results)
    races = try c.decode([TrailRace].self, forKey: .races)
    indexHistory = try c.decodeIfPresent([IndexObservation].self, forKey: .indexHistory) ?? []
  }
  public mutating func observeIndexes(date: String = TrailMath.today) {
    for (provider, value) in [("utmb", profile.utmb), ("itra", profile.itra)] {
      guard let value else { continue }
      let observation = IndexObservation(date: date, provider: provider, value: value)
      if let i = indexHistory.firstIndex(where: { $0.date == date && $0.provider == provider }) {
        indexHistory[i] = observation
      } else {
        indexHistory.append(observation)
      }
    }
    indexHistory.sort { $0.date < $1.date }
  }
  public static func decode(_ data: Data) throws -> Season {
    guard data.count <= 15 * 1024 * 1024,
      var object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { throw TrailError.invalid("Sauvegarde invalide ou trop volumineuse.") }
    if let races = object["races"] as? [[String: Any]] {
      object["races"] = races.map { row in
        var row = row
        for key in ["fieldSource", "organizerTerrain", "sourceCheckedAt"] where row[key] == nil {
          row[key] = ""
        }
        return row
      }
    }
    let season = try JSONDecoder().decode(
      Season.self, from: JSONSerialization.data(withJSONObject: object))
    try season.validate()
    return season
  }
  public func encoded() throws -> Data {
    try validate()
    var object =
      try JSONSerialization.jsonObject(with: JSONEncoder().encode(self)) as! [String: Any]
    func nullable(_ row: [String: Any], _ keys: [String]) -> [String: Any] {
      var row = row
      for key in keys where row[key] == nil { row[key] = NSNull() }
      return row
    }
    object["profile"] = nullable(object["profile"] as! [String: Any], ["utmb", "itra"])
    object["results"] = (object["results"] as! [[String: Any]]).map {
      nullable($0, ["seconds", "rank", "finishers", "utmb", "itra", "terrain"])
    }
    object["races"] = (object["races"] as! [[String: Any]]).map { input in
      var row = nullable(
        input,
        [
          "targetSeconds", "terrain", "catalogId", "track", "fieldEdition", "fieldDistanceKm",
          "fieldAscentM", "cutoffHours",
        ])
      row["field"] = (row["field"] as! [[String: Any]]).map { nullable($0, ["utmb", "itra"]) }
      return row
    }
    return try JSONSerialization.data(
      withJSONObject: object, options: [.prettyPrinted, .sortedKeys])
  }
  public func validate() throws {
    func validScore(_ score: Double?) -> Bool {
      score == nil || (score!.isFinite && (0...1000).contains(score!))
    }
    func validDate(_ value: String) -> Bool {
      guard value.count == 10,
        value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil,
        let date = TrailMath.date(value)
      else { return false }
      return TrailMath.dateString(date) == value
    }
    func validSource(_ value: String) -> Bool {
      value.count <= 1000 && (value.isEmpty || URL(string: value)?.scheme == "https")
    }
    func validRoute(
      _ name: String, _ date: String, _ distance: Double, _ ascent: Double, _ terrain: Int?
    ) -> Bool {
      !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && name.count <= 250
        && validDate(date) && distance.isFinite && distance > 0 && distance <= 1000
        && ascent.isFinite && (0...100000).contains(ascent)
        && (terrain == nil || (0...4).contains(terrain!))
    }
    func validTime(_ seconds: Double?) -> Bool {
      seconds == nil || (seconds!.isFinite && seconds! > 0 && seconds! <= 30 * 86400)
    }
    guard indexHistory.count <= 20000,
      indexHistory.allSatisfy({
        validDate($0.date) && ["utmb", "itra"].contains($0.provider) && validScore($0.value)
      })
    else { throw TrailError.invalid("Historique d’index invalide.") }
    guard version == 1, results.count <= 1000, races.count <= 100, profile.firstname.count <= 100,
      profile.lastname.count <= 100, profile.checkedAt.count <= 40, validSource(profile.utmbUrl),
      validSource(profile.itraUrl), validScore(profile.utmb), validScore(profile.itra),
      Set(results.map(\.id)).count == results.count, Set(races.map(\.id)).count == races.count
    else { throw TrailError.invalid("Profil, version ou identifiants de sauvegarde invalides.") }
    for r in results {
      guard !r.id.isEmpty, r.id.count <= 200,
        validRoute(r.name, r.date, r.distanceKm, r.ascentM, r.terrain), validTime(r.seconds),
        ["finished", "dnf"].contains(r.status), validScore(r.utmb), validScore(r.itra),
        validSource(r.source), r.rank == nil || r.rank! > 0, r.finishers == nil || r.finishers! > 0
      else { throw TrailError.invalid("Résultat invalide : \(r.name).") }
    }
    for r in races {
      guard !r.id.isEmpty, r.id.count <= 200,
        validRoute(r.name, r.date, r.distanceKm, r.ascentM, r.terrain), validTime(r.targetSeconds),
        ["A", "B", "C"].contains(r.priority), validSource(r.source), validSource(r.fieldSource),
        r.notes.count <= 5000, r.fieldLabel.count <= 250, r.organizerTerrain.count <= 250,
        r.field.count <= 20000,
        r.field.allSatisfy({ validTime($0.seconds) && validScore($0.utmb) && validScore($0.itra) }),
        r.cutoffHours == nil || r.cutoffHours! > 0,
        r.fieldDistanceKm == nil
          || (r.fieldDistanceKm!.isFinite && r.fieldDistanceKm! > 0 && r.fieldDistanceKm! <= 1000),
        r.fieldAscentM == nil
          || (r.fieldAscentM!.isFinite && (0...100000).contains(r.fieldAscentM!))
      else { throw TrailError.invalid("Objectif invalide : \(r.name).") }
      if let t = r.track {
        guard t.distanceKm.isFinite, t.distanceKm > 0, t.distanceKm <= 1000, t.ascentM.isFinite,
          t.ascentM >= 0, t.descentM.isFinite, t.descentM >= 0, (0...1).contains(t.steepFraction),
          (0...1).contains(t.steepDescentFraction), (0...100).contains(t.slopeIndex), t.points >= 2,
          (2...700).contains(t.profile.count), validSource(t.source),
          t.profile.allSatisfy({
            $0.km.isFinite && $0.elevation.isFinite && (-90...90).contains($0.lat)
              && (-180...180).contains($0.lon)
          })
        else { throw TrailError.invalid("Trace invalide.") }
      }
    }
  }
}
public enum TrailError: LocalizedError {
  case invalid(String)
  public var errorDescription: String? {
    if case .invalid(let s) = self { return s }
    return nil
  }
}
public struct Workspace: Codable { public var revision: Int, season: Season?, updatedAt: String? }
public struct Athlete: Codable, Equatable {
  public var id: Int
  public var firstname: String?, lastname: String?, profile: String?
}
public struct RunnerMatch: Codable, Identifiable {
  public var id: Int, fullname: String, uri: String, ip: Double?, nationality: String,
    ageGroup: String
}
public struct RunnerResponse: Codable {
  public var fullname: String, source: String, utmb: Double?, results: [TrailResult],
    checkedAt: String
}
public struct CatalogRace: Codable, Identifiable {
  public var id: String, format: String, name: String, location: String
}
public struct CatalogDetail: Codable {
  public var id: String, name: String, date: String, distanceKm: Double, ascentM: Double,
    cutoffHours: Double?, source: String, gpxUrl: String, terrainDescription: String,
    checkedAt: String
}
public struct HistoryResponse: Codable {
  public var field: [Finisher], label: String, source: String, year: Int, date: String,
    distanceKm: Double, ascentM: Double, fetchedAt: String
}
