import Foundation

public struct Activity: Codable, Identifiable {
  public var id: Int, name: String, sportType: String, startDate: String, localDate: String,
    distanceKm: Double, elevationGainM: Double, movingTimeSeconds: Double
}
public struct Dashboard: Codable {
  public struct Summary: Codable {
    public var distanceKm: Double, elevationGainM: Double, movingTimeSeconds: Double,
      activityCount: Int
  }
  public struct Week: Codable {
    public var week: String, distanceKm: Double, elevationGainM: Double, movingTimeSeconds: Double,
      activityCount: Int
  }
  public struct Sport: Codable {
    public var sport: String, count: Int, distanceKm: Double, movingTimeSeconds: Double
  }
  public struct Running: Codable {
    public var count: Int, distanceKm: Double, elevationGainM: Double, movingTimeSeconds: Double,
      paceSecondsPerKm: Double?, speedKmH: Double?, speedKmMin: Double?, effortPace: Double?,
      longestRunKm: Double, highestElevationM: Double
  }
  public var athlete: Athlete, summary: Summary, weekly: [Week], sports: [Sport],
    recentActivities: [Activity], running: Running, fetchedAt: String, cacheExpiresAt: String,
    partial: Bool, days: Int
}
