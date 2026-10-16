import MyStatsCore
import SwiftUI

struct ActivityRow: View {
  let activity: Activity
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(activity.name).font(.headline).foregroundStyle(.primary)
      Text("\(dateLabel) · \(sportLabel)").font(.caption).foregroundStyle(.secondary)
      Text(
        "\(activity.distanceKm.formatted(.number.precision(.fractionLength(1)))) km · \(activity.elevationGainM.formatted(.number.precision(.fractionLength(0)))) m D+ · \(TrailMath.duration(activity.movingTimeSeconds))"
      )
      .font(.subheadline).monospacedDigit().foregroundStyle(.primary)
    }
    .padding(.vertical, 4)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("activity.\(activity.id)")
  }
  private var dateLabel: String {
    TrailMath.date(String(activity.localDate.prefix(10)))?.formatted(
      .dateTime.day().month(.abbreviated).year()) ?? String(activity.localDate.prefix(10))
  }
  private var sportLabel: String {
    switch activity.sportType {
    case "Run": return "Course à pied"
    case "TrailRun": return "Trail"
    case "VirtualRun": return "Course virtuelle"
    case "Ride": return "Vélo"
    case "Walk": return "Marche"
    case "Hike": return "Randonnée"
    default: return activity.sportType
    }
  }
}

struct RecentActivitiesSection: View {
  let activities: [Activity]
  var body: some View {
    Section {
      if activities.isEmpty {
        Text("Aucune activité sur cette période pour ce sport.").foregroundStyle(.secondary)
      }
      ForEach(activities.prefix(5)) { ActivityRow(activity: $0) }
      if activities.count > 5 {
        NavigationLink {
          ActivitiesView(activities: activities)
        } label: {
          Label("Voir les \(activities.count) activités", systemImage: "list.bullet")
        }.accessibilityIdentifier("activities.all")
      }
    } header: {
      Text("Activités récentes")
    } footer: {
      if activities.count > 5 {
        Text("Les 5 dernières activités. Les statistiques portent sur toute la période.")
      }
    }
  }
}

struct ActivitiesView: View {
  let activities: [Activity]
  @State private var query = ""
  @State private var page = 0
  private let pageSize = 20
  private var filtered: [Activity] {
    query.isEmpty ? activities : activities.filter { $0.name.localizedStandardContains(query) }
  }
  private var pageCount: Int { max(1, (filtered.count + pageSize - 1) / pageSize) }
  private var currentPage: Int { min(page, pageCount - 1) }
  var body: some View {
    List {
      Section {
        if filtered.isEmpty {
          ContentUnavailableView.search(text: query)
        } else {
          ForEach(filtered.dropFirst(currentPage * pageSize).prefix(pageSize)) {
            ActivityRow(activity: $0)
          }
        }
      } header: {
        Text("\(filtered.count) activités · page \(currentPage + 1) sur \(pageCount)")
          .accessibilityIdentifier("activities.page")
      }
    }
    .id(currentPage)
    .navigationTitle("Tes activités").navigationBarTitleDisplayMode(.inline)
    .searchable(text: $query, prompt: "Rechercher une activité")
    .scrollDismissesKeyboard(.interactively)
    .onChange(of: query) { _, _ in page = 0 }
    .appFeedback(.selection, trigger: page)
    .safeAreaInset(edge: .bottom) {
      if pageCount > 1 {
        HStack {
          Button {
            page = currentPage - 1
          } label: {
            Label("Précédent", systemImage: "chevron.left").frame(maxWidth: .infinity)
          }.disabled(currentPage == 0)
          Button {
            page = currentPage + 1
          } label: {
            Label("Suivant", systemImage: "chevron.right").frame(maxWidth: .infinity)
          }.disabled(currentPage + 1 >= pageCount)
        }
        .buttonStyle(.bordered).controlSize(.large).padding()
        .background(.bar)
      }
    }
  }
}
