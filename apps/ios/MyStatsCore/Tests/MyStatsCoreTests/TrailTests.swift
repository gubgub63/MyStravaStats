import XCTest

@testable import MyStatsCore

final class TrailTests: XCTestCase {
  struct Fixture: Decodable {
    var today: String, season: Season, expected: [String: Double], points: [TrackPoint],
      trackExpected: [String: Double], field: [Finisher], fieldExpected: [String: Double],
      csv: String
  }
  func fixture() throws -> Fixture {
    try JSONDecoder().decode(
      Fixture.self,
      from: Data(
        contentsOf: Bundle.module.url(
          forResource: "trail-v1", withExtension: "json", subdirectory: "Fixtures")!))
  }
  func testRacePhotoSurvivesSyncRoundTrip() throws {
    var season = try fixture().season
    XCTAssertNil(season.races[0].photo)
    season.races[0].photo = "data:image/jpeg;base64,/9j/2Q=="
    let restored = try Season.decode(season.encoded())
    XCTAssertEqual(restored.races[0].photo, season.races[0].photo)
    season.races[0].photo = "data:image/svg+xml;base64,AAAA"
    XCTAssertThrowsError(try season.encoded())
  }
  func testSharedPredictionParity() throws {
    let f = try fixture()
    let r = f.season.races[0]
    let e = f.expected
    XCTAssertEqual(TrailMath.effort(r.distanceKm, r.ascentM), e["effort"])
    XCTAssertEqual(TrailMath.difficulty(r), e["difficulty"])
    XCTAssertEqual(r.targetSeconds! / r.distanceKm, e["paceSecondsPerKm"])
    let p = try XCTUnwrap(TrailMath.predict(r, f.season.results, today: f.today))
    XCTAssertEqual(p.central, e["prediction"]!, accuracy: 0.000001)
    XCTAssertEqual(p.low, e["low"]!, accuracy: 0.000001)
    XCTAssertEqual(p.high, e["high"]!, accuracy: 0.000001)
    let level = try XCTUnwrap(
      TrailMath.level(r, f.season.results, f.season.profile, today: f.today))
    XCTAssertEqual(level.value, e["level"])
    XCTAssertEqual(level.low, e["lowLevel"])
    XCTAssertEqual(level.high, e["highLevel"])
    XCTAssertNil(TrailMath.level(r, f.season.results, f.season.profile, itra: true, today: f.today))
  }
  func testSharedGPXAndRankingParity() throws {
    let f = try fixture()
    let t = try TrailMath.analyze(f.points)
    XCTAssertEqual(t.distanceKm, f.trackExpected["distanceKm"]!, accuracy: 0.000001)
    XCTAssertEqual(t.ascentM, 40)
    XCTAssertEqual(t.descentM, 0)
    XCTAssertEqual(t.slopeIndex, 0)
    let rows = try TrailImport.csv(f.csv)
    XCTAssertEqual(rows, f.field)
    let rank = try XCTUnwrap(TrailMath.field(61200, rows))
    XCTAssertEqual(rank.rank, 3)
    XCTAssertEqual(rank.lowRank, 1)
    XCTAssertEqual(rank.highRank, 4)
    XCTAssertEqual(rank.utmb, 618)
    XCTAssertNil(rank.itra)
  }
  func testOldBackupsAndExplicitNullsRoundTrip() throws {
    let f = try fixture()
    var object = try JSONSerialization.jsonObject(with: f.season.encoded()) as! [String: Any]
    var races = object["races"] as! [[String: Any]]
    for key in [
      "fieldSource", "fieldEdition", "fieldDistanceKm", "fieldAscentM", "organizerTerrain",
      "sourceCheckedAt",
    ] { races[0].removeValue(forKey: key) }
    object["races"] = races
    let imported = try Season.decode(JSONSerialization.data(withJSONObject: object))
    XCTAssertEqual(imported.races[0].fieldSource, "")
    XCTAssertNil(imported.races[0].fieldEdition)
    let round = try JSONSerialization.jsonObject(with: imported.encoded()) as! [String: Any]
    XCTAssertTrue((round["profile"] as! [String: Any])["itra"] is NSNull)
    XCTAssertTrue(((round["races"] as! [[String: Any]])[0])["track"] is NSNull)
    XCTAssertEqual(try Season.decode(imported.encoded()), imported)
  }
  func testInvalidBackupsAndDuplicateIDsAreRejected() throws {
    var s = try fixture().season
    s.version = 99
    XCTAssertThrowsError(try s.validate())
    s.version = 1
    s.results.append(s.results[0])
    XCTAssertThrowsError(try s.validate())
    s = try fixture().season
    s.profile.itra = 1001
    XCTAssertThrowsError(try s.validate())
    s = try fixture().season
    s.races[0].date = "2027-02-30"
    XCTAssertThrowsError(try s.validate())
  }
  func testDNFAndOldResultsDoNotCreatePrediction() throws {
    let f = try fixture()
    var rows = f.season.results
    rows[0].status = "dnf"
    XCTAssertNil(TrailMath.predict(f.season.races[0], rows, today: f.today))
    rows[0].status = "finished"
    rows[0].date = "2020-01-01"
    XCTAssertNil(TrailMath.predict(f.season.races[0], rows, today: f.today))
  }
  func testMismatchedCourseSuppressesHistoricalScore() throws {
    let f = try fixture()
    var r = f.season.races[0]
    r.field = f.field
    r.fieldDistanceKm = 50
    XCTAssertFalse(TrailMath.comparable(r))
    XCTAssertEqual(
      TrailMath.level(r, f.season.results, f.season.profile, today: f.today)?.method, "personal")
    r.fieldDistanceKm = r.distanceKm
    XCTAssertEqual(
      TrailMath.level(r, f.season.results, f.season.profile, today: f.today)?.method, "historical")
  }
  func testGPXParsingAndDangerousXMLRejection() throws {
    let points = (0..<5).map {
      "<trkpt lat='\(45+Double($0)*0.001)' lon='9'><ele>\(100+$0*10)</ele></trkpt>"
    }.joined()
    let t = try TrailImport.gpx(
      Data("<gpx><trk><trkseg>\(points)</trkseg></trk></gpx>".utf8), filename: "test.gpx")
    XCTAssertEqual(t.points, 5)
    XCTAssertEqual(t.ascentM, 40)
    XCTAssertThrowsError(
      try TrailImport.gpx(
        Data("<!DOCTYPE gpx [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><gpx/>".utf8),
        filename: "bad.gpx"))
    XCTAssertThrowsError(
      try TrailImport.gpx(
        Data("<gpx><trk><trkseg><trkpt lat='45' lon='9'/></trkseg></trk></gpx>".utf8),
        filename: "missing.gpx"))
    var broken = try fixture().points
    broken[1].lat = 46
    XCTAssertThrowsError(try TrailMath.analyze(broken))
  }
  func testCSVAndDurationValidation() throws {
    XCTAssertEqual(TrailMath.parseDuration("17:00"), 61200)
    XCTAssertNil(TrailMath.parseDuration("17:65:00"))
    XCTAssertNil(TrailMath.parseDuration("0:00"))
    XCTAssertThrowsError(try TrailImport.csv("time,utmb\n17:00:00,1001"))
    XCTAssertThrowsError(try TrailImport.csv("time\n\"17:00:00"))
    XCTAssertThrowsError(try TrailImport.csv("time,status\n,dnf"))
  }
  func testLeapYearReferenceBoundaryMatchesWeb() throws {
    let f = try fixture()
    var result = f.season.results[0]
    result.date = "2021-02-28"
    XCTAssertNil(TrailMath.predict(f.season.races[0], [result], today: "2024-02-29"))
  }
}
