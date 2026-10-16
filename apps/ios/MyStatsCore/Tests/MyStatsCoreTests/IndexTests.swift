import XCTest

@testable import MyStatsCore

final class IndexTests: XCTestCase {
  func testObservationsDoNotBecomeRaceScoresAndRemainDated() throws {
    var season = Season()
    season.profile.utmb = 587
    season.observeIndexes(date: "2026-10-14")
    season.observeIndexes(date: "2026-10-14")
    XCTAssertEqual(season.indexHistory.count, 1)
    XCTAssertEqual(season.indexHistory[0].value, 587)
    XCTAssertTrue(season.results.isEmpty)
    season.profile.utmb = 600
    season.observeIndexes(date: "2026-11-14")
    XCTAssertEqual(season.indexHistory.count, 2)
    XCTAssertEqual(try Season.decode(season.encoded()).indexHistory, season.indexHistory)
  }
}
