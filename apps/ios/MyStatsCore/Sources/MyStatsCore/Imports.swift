import Foundation

#if canImport(FoundationXML)
  import FoundationXML
#endif
public enum TrailImport {
  public static func gpx(_ data: Data, filename: String, source: String = "") throws
    -> TrackAnalysis
  {
    guard data.count <= 20 * 1024 * 1024, let text = String(data: data, encoding: .utf8),
      text.range(of: "<!DOCTYPE|<!ENTITY", options: [.regularExpression, .caseInsensitive]) == nil
    else { throw TrailError.invalid("GPX trop volumineux ou XML non pris en charge.") }
    let delegate = GPXReader()
    let parser = XMLParser(data: data)
    parser.shouldProcessNamespaces = true
    parser.shouldResolveExternalEntities = false
    parser.delegate = delegate
    guard parser.parse(), delegate.root == "gpx", delegate.problem == nil else {
      throw delegate.problem ?? TrailError.invalid("Fichier GPX invalide.")
    }
    return try TrailMath.analyze(
      delegate.tracks.isEmpty ? delegate.routes : delegate.tracks, filename: filename,
      source: source)
  }
  public static func csv(_ text: String) throws -> [Finisher] {
    guard text.utf8.count <= 5 * 1024 * 1024 else {
      throw TrailError.invalid("Le CSV dépasse 5 Mo.")
    }
    let first = text.components(separatedBy: .newlines).first ?? ""
    let delimiter: Character =
      first.filter { $0 == ";" }.count > first.filter { $0 == "," }.count ? ";" : ","
    let chars = Array(
      text.replacingOccurrences(of: "\u{FEFF}", with: "").replacingOccurrences(
        of: "\r\n", with: "\n"))
    var rows: [[String]] = []
    var row: [String] = []
    var cell = ""
    var quoted = false
    var i = 0
    func appendCell() {
      row.append(cell.trimmingCharacters(in: .whitespacesAndNewlines))
      cell = ""
    }
    func appendRow() {
      if row.contains(where: { !$0.isEmpty }) { rows.append(row) }
      row = []
    }
    while i < chars.count {
      let c = chars[i]
      if c == "\"" {
        if quoted && i + 1 < chars.count && chars[i + 1] == "\"" {
          cell.append("\"")
          i += 1
        } else {
          quoted.toggle()
        }
      } else if !quoted && (c == delimiter || c == "\n") {
        appendCell()
        if c == "\n" { appendRow() }
      } else {
        cell.append(c)
      }
      i += 1
    }
    guard !quoted else { throw TrailError.invalid("Guillemet CSV non fermé.") }
    appendCell()
    appendRow()
    guard let head = rows.first, rows.count > 1 else {
      throw TrailError.invalid("En-tête et finishers requis.")
    }
    let headers = head.map { $0.lowercased() }
    guard let ti = headers.firstIndex(where: { ["time", "temps", "duration"].contains($0) }) else {
      throw TrailError.invalid("Colonne time requise, au format H:MM:SS.")
    }
    func at(_ row: [String], _ index: Int?) -> String {
      guard let i = index, i < row.count else { return "" }
      return row[i]
    }
    func score(_ row: [String], _ name: String) throws -> Double? {
      let value = at(row, headers.firstIndex(of: name))
      if value.isEmpty { return nil }
      guard let n = Double(value.replacingOccurrences(of: ",", with: ".")), n.isFinite,
        (0...1000).contains(n)
      else { throw TrailError.invalid("Score \(name) invalide.") }
      return n
    }
    var field: [Finisher] = []
    for (offset, row) in rows.dropFirst().enumerated() {
      if ["dnf", "dns", "dsq", "abandon"].contains(
        at(row, headers.firstIndex(of: "status")).lowercased())
      {
        continue
      }
      guard let seconds = TrailMath.parseDuration(at(row, ti)), seconds <= 30 * 86400 else {
        throw TrailError.invalid("Temps invalide à la ligne \(offset+2).")
      }
      field.append(
        try Finisher(seconds: seconds, utmb: score(row, "utmb"), itra: score(row, "itra")))
    }
    guard !field.isEmpty, field.count <= 20000 else {
      throw TrailError.invalid("Classement vide ou trop volumineux.")
    }
    return field
  }
}
private final class GPXReader: NSObject, XMLParserDelegate {
  var tracks: [TrackPoint] = [], routes: [TrackPoint] = [], root = "", problem: Error?
  var segment = -1, point: TrackPoint?, element = "", elevation = "", hasElevation = false,
    inTrack = false, inRoute = false
  func parser(
    _ parser: XMLParser, didStartElement name: String, namespaceURI: String?,
    qualifiedName: String?, attributes: [String: String]
  ) {
    if root.isEmpty { root = name }
    element = name
    if name == "trkseg" || name == "rte" {
      segment += 1
      inTrack = name == "trkseg"
      inRoute = name == "rte"
    }
    if (name == "trkpt" && inTrack) || (name == "rtept" && inRoute) {
      guard let lat = Double(attributes["lat"] ?? ""), let lon = Double(attributes["lon"] ?? "")
      else {
        problem = TrailError.invalid("Coordonnées manquantes.")
        parser.abortParsing()
        return
      }
      point = TrackPoint(lat: lat, lon: lon, elevation: 0, segment: segment)
      hasElevation = false
    }
    if name == "ele" { elevation = "" }
  }
  func parser(_ parser: XMLParser, foundCharacters text: String) {
    if element == "ele" { elevation += text }
  }
  func parser(
    _ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?
  ) {
    if name == "ele", let value = Double(elevation.trimmingCharacters(in: .whitespacesAndNewlines))
    {
      point?.elevation = value
      hasElevation = true
    }
    if name == "trkpt" || name == "rtept", let p = point {
      guard hasElevation else {
        problem = TrailError.invalid("Une altitude est requise pour chaque point.")
        parser.abortParsing()
        return
      }
      if name == "trkpt" { tracks.append(p) } else { routes.append(p) }
      point = nil
      if tracks.count + routes.count > 200000 {
        problem = TrailError.invalid("Plus de 200 000 points.")
        parser.abortParsing()
      }
    }
    if name == "trkseg" { inTrack = false }
    if name == "rte" { inRoute = false }
    element = ""
  }
}
