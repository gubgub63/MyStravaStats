import Foundation

public struct Prediction: Codable {
  public var central: Double, low: Double, high: Double, references: Int, extrapolated: Bool
}
public struct FieldEstimate: Codable {
  public var rank: Int, lowRank: Int, highRank: Int, finishers: Int, utmb: Double?, itra: Double?
}
public struct LevelEstimate: Codable {
  public var value: Double, low: Double?, high: Double?, method: String, references: Int
}
public enum TrailMath {
  public static var today: String { dateString(Date()) }
  public static func date(_ text: String) -> Date? {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone(secondsFromGMT: 0)
    f.dateFormat = "yyyy-MM-dd"
    f.isLenient = false
    return f.date(from: text)
  }
  public static func dateString(_ date: Date) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone(secondsFromGMT: 0)
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: date)
  }
  public static func effort(_ km: Double, _ ascent: Double) -> Double { km + ascent / 100 }
  public static func parseDuration(_ value: String) -> Double? {
    let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard text.range(of: #"^\d{1,3}:\d{2}(:\d{2})?$"#, options: .regularExpression) != nil else {
      return nil
    }
    let parts = text.split(separator: ":").compactMap { Double($0) }
    let seconds = parts[0] * 3600 + parts[1] * 60 + (parts.count > 2 ? parts[2] : 0)
    return parts[1] < 60 && (parts.count < 3 || parts[2] < 60) && seconds > 0 ? seconds : nil
  }
  public static func duration(_ seconds: Double?) -> String {
    guard let s = seconds, s.isFinite else { return "—" }
    let n = Int((s / 60).rounded())
    return String(format: "%d h %02d", n / 60, n % 60)
  }
  public static func durationInput(_ seconds: Double?) -> String {
    guard let s = seconds else { return "" }
    let n = Int(s.rounded())
    return String(format: "%d:%02d:%02d", n / 3600, n / 60 % 60, n % 60)
  }
  public static func pace(_ seconds: Double, _ km: Double) -> String {
    guard km > 0 else { return "—" }
    let s = Int((seconds / km).rounded())
    return String(format: "%d:%02d /km", s / 60, s % 60)
  }
  public static func difficulty(_ race: TrailRace) -> Double {
    min(
      100,
      (40 * log1p(effort(race.distanceKm, race.ascentM) / 30) + 0.35 * (race.track?.slopeIndex ?? 0)
        + 5 * Double(race.terrain ?? 0)).rounded())
  }
  static func median(_ values: [Double]) -> Double {
    let a = values.sorted()
    return a.count % 2 == 1 ? a[a.count / 2] : (a[a.count / 2 - 1] + a[a.count / 2]) / 2
  }
  public static func predict(
    _ race: TrailRace, _ results: [TrailResult], today: String = TrailMath.today
  ) -> Prediction? {
    guard let date = date(today) else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    var components = calendar.dateComponents([.year, .month, .day], from: date)
    components.year = components.year! - 3
    let cutoff = dateString(calendar.date(from: components)!)
    let refs = Array(
      results.filter {
        $0.status == "finished" && ($0.seconds ?? 0) > 0 && $0.date <= today && $0.date >= cutoff
      }.sorted { $0.date > $1.date }.prefix(3))
    guard !refs.isEmpty else { return nil }
    let target = effort(race.distanceKm, race.ascentM)
    let estimates = refs.map { r in
      r.seconds! * pow(target / effort(r.distanceKm, r.ascentM), 1.06)
        * (race.terrain != nil && r.terrain != nil
          ? (1 + 0.06 * Double(race.terrain!)) / (1 + 0.06 * Double(r.terrain!)) : 1)
    }
    let central = median(estimates)
    let extrapolated = refs.contains {
      let ratio = target / effort($0.distanceKm, $0.ascentM)
      return ratio > 2 || ratio < 0.5
    }
    let spread = max(extrapolated ? 0.35 : 0.2, estimates.map { abs($0 / central - 1) }.max() ?? 0)
    return Prediction(
      central: central, low: max(central * 0.3, central * (1 - spread)),
      high: central * (1 + spread), references: refs.count, extrapolated: extrapolated)
  }
  public static func comparable(_ race: TrailRace) -> Bool {
    (race.fieldDistanceKm == nil || abs(race.distanceKm / race.fieldDistanceKm! - 1) <= 0.05)
      && (race.fieldAscentM == nil
        || abs(race.ascentM - race.fieldAscentM!) <= max(100, race.fieldAscentM! * 0.1))
  }
  public static func field(_ seconds: Double, _ rows: [Finisher]) -> FieldEstimate? {
    guard seconds > 0, !rows.isEmpty else { return nil }
    func rank(_ t: Double) -> Int { 1 + rows.filter { $0.seconds < t }.count }
    func score(_ key: KeyPath<Finisher, Double?>) -> Double? {
      let known = rows.filter {
        ($0[keyPath: key] ?? 0) > 0 && abs(log($0.seconds / seconds)) < log(1.5)
      }
      return known.count >= 3
        ? min(1000, (median(known.map { $0.seconds * $0[keyPath: key]! }) / seconds).rounded())
        : nil
    }
    return FieldEstimate(
      rank: rank(seconds), lowRank: rank(seconds * 0.9), highRank: rank(seconds * 1.1),
      finishers: rows.count, utmb: score(\.utmb), itra: score(\.itra))
  }
  public static func level(
    _ race: TrailRace, _ results: [TrailResult], _ profile: TrailProfile, itra: Bool = false,
    today: String = TrailMath.today
  ) -> LevelEstimate? {
    guard let target = race.targetSeconds, target > 0, target.isFinite else { return nil }
    let key: KeyPath<Finisher, Double?> = itra ? \.itra : \.utmb
    if comparable(race), let field = field(target, race.field),
      let calibrated = (itra ? field.itra : field.utmb)
    {
      return LevelEstimate(
        value: calibrated, low: nil, high: nil, method: "historical",
        references: race.field.filter {
          ($0[keyPath: key] ?? 0) > 0 && abs(log($0.seconds / target)) < log(1.5)
        }.count)
    }
    guard let baseline = (itra ? profile.itra : profile.utmb), baseline > 0, baseline <= 1000,
      let prediction = predict(race, results, today: today)
    else { return nil }
    func clamp(_ t: Double) -> Double { max(0, min(1000, (baseline * t / target).rounded())) }
    return LevelEstimate(
      value: clamp(prediction.central), low: clamp(prediction.low), high: clamp(prediction.high),
      method: "personal", references: prediction.references)
  }
  public static func haversine(_ a: TrackPoint, _ b: TrackPoint) -> Double {
    let rad = Double.pi / 180
    let v =
      pow(sin((b.lat - a.lat) * rad / 2), 2) + cos(a.lat * rad) * cos(b.lat * rad)
      * pow(sin((b.lon - a.lon) * rad / 2), 2)
    return 6_371_000 * 2 * asin(sqrt(min(1, v)))
  }
  public static func analyze(
    _ points: [TrackPoint], filename: String = "trace.gpx", source: String = ""
  ) throws -> TrackAnalysis {
    guard (2...200000).contains(points.count),
      points.allSatisfy({
        $0.lat.isFinite && $0.lon.isFinite && $0.elevation.isFinite && abs($0.lat) <= 90
          && abs($0.lon) <= 180 && (-500...10000).contains($0.elevation)
      })
    else { throw TrailError.invalid("Coordonnées, altitudes ou nombre de points invalides.") }
    var total = 0.0
    var ascent = 0.0
    var descent = 0.0
    var steep = 0.0
    var steepDown = 0.0
    var window = 0.0
    var anchor = points[0]
    var profile = [ProfilePoint(points[0], km: 0)]
    let step = max(1, Int(ceil(Double(points.count) / 600)))
    func close(_ point: TrackPoint) {
      guard window > 0 else { return }
      let dz = point.elevation - anchor.elevation
      let grade = dz / window
      if abs(dz) >= 3 {
        ascent += max(0, dz)
        descent += max(0, -dz)
      }
      if abs(grade) > 0.15 { steep += window }
      if grade < -0.2 { steepDown += window }
      window = 0
      anchor = point
    }
    for i in 1..<points.count {
      let p = points[i]
      let prev = points[i - 1]
      if p.segment != prev.segment {
        close(prev)
        anchor = p
      } else {
        let d = haversine(prev, p)
        if d > 5000 { throw TrailError.invalid("Saut GPS de plus de 5 km.") }
        total += d
        window += d
        if window >= 30 { close(p) }
      }
      if i % step == 0 || i == points.count - 1 || p.segment != prev.segment {
        profile.append(ProfilePoint(p, km: total / 1000))
      }
    }
    close(points.last!)
    guard total >= 100, total <= 1_000_000, profile.count <= 700 else {
      throw TrailError.invalid(
        "La trace doit mesurer entre 100 m et 1 000 km, sans fragmentation excessive.")
    }
    return TrackAnalysis(
      distanceKm: total / 1000, ascentM: ascent.rounded(), descentM: descent.rounded(),
      steepFraction: steep / total, steepDescentFraction: steepDown / total,
      slopeIndex: (100 * (0.65 * steep / total + 0.35 * steepDown / total)).rounded(),
      points: points.count, profile: profile, filename: filename,
      fetchedAt: ISO8601DateFormatter().string(from: Date()), source: source)
  }
}
