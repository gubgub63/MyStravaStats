import Charts
import MyStatsCore
import SwiftUI

struct DashboardView: View {
  @Environment(SeasonStore.self) private var store
  @State private var days = 90
  @State private var sport = "Tous"
  @State private var custom = false
  @State private var from = Calendar.current.date(byAdding: .day, value: -90, to: Date())!
  @State private var to = Date()
  @State private var loading = false
  @ScaledMetric(relativeTo: .body) private var metricWidth = 140
  @State private var refreshed = 0
  private var activities: [Activity] {
    (store.dashboard?.recentActivities ?? []).filter { sport == "Tous" || $0.sportType == sport }
  }
  var body: some View {
    List {
      Section {
        VStack(alignment: .leading, spacing: 8) {
          Text(store.athlete?.firstname.map { "Bonjour \($0)." } ?? "Ton prochain horizon.").font(
            .title2.bold())
          Text("L’entraînement, au fil des semaines.").foregroundStyle(.secondary)
        }.padding(.vertical, 12)
        LazyVGrid(
          columns: [GridItem(.adaptive(minimum: metricWidth), alignment: .leading)],
          alignment: .leading, spacing: 16
        ) {
          Metric(
            title: "Index UTMB", value: store.season.profile.utmb.map { String(Int($0)) } ?? "—")
          Metric(
            title: "Index ITRA", value: store.season.profile.itra.map { String(Int($0)) } ?? "—")
        }
      }
      if !store.authenticated {
        Section {
          Text(
            "Configure ton serveur et connecte Strava dans Profil pour retrouver tes entraînements."
          )
          Label(
            "Les objectifs et résultats de ta saison restent disponibles sans connexion.",
            systemImage: "mountain.2"
          ).font(.footnote)
        }
      } else {
        Section("Période") {
          Toggle("Dates personnalisées", isOn: $custom)
          if custom {
            DatePicker("Du", selection: $from, in: ...to, displayedComponents: .date)
            DatePicker("Au", selection: $to, in: from...Date(), displayedComponents: .date)
          } else {
            Picker("Période", selection: $days) {
              Text("90 jours").tag(90)
              Text("180 jours").tag(180)
              Text("365 jours").tag(365)
            }
          }
          Picker("Sport", selection: $sport) {
            Text("Tous les sports").tag("Tous")
            ForEach(store.dashboard?.sports.map(\.sport) ?? [], id: \.self) { Text($0).tag($0) }
          }
          Button {
            Task { await refresh(feedback: true) }
          } label: {
            HStack {
              Label(loading ? "Chargement…" : "Actualiser", systemImage: "arrow.clockwise")
              if loading {
                Spacer()
                ProgressView().accessibilityHidden(true)
              }
            }
          }.disabled(loading)
        }
        if let dashboard = store.dashboard {
          let km = activities.reduce(0) { $0 + $1.distanceKm }
          let ascent = activities.reduce(0) { $0 + $1.elevationGainM }
          let seconds = activities.reduce(0) { $0 + $1.movingTimeSeconds }
          Section("Ton activité") {
            LazyVGrid(
              columns: [GridItem(.adaptive(minimum: metricWidth), alignment: .leading)],
              alignment: .leading, spacing: 16
            ) {
              Metric(
                title: "Distance", value: km.formatted(.number.precision(.fractionLength(1))),
                unit: "km")
              Metric(
                title: "Dénivelé", value: ascent.formatted(.number.precision(.fractionLength(0))),
                unit: "m D+")
              Metric(title: "Durée", value: TrailMath.duration(seconds))
              Metric(title: "Activités", value: String(activities.count))
            }
          }
          Section("Distance par semaine") {
            Chart(dashboard.weekly, id: \.week) { week in
              BarMark(
                x: .value("Semaine", TrailMath.date(week.week) ?? Date(), unit: .weekOfYear),
                y: .value("Kilomètres", sport == "Tous" ? week.distanceKm : weeklyKm(week.week)))
            }.chartXAxis { AxisMarks(values: .automatic(desiredCount: 4)) }
              .frame(height: 200).accessibilityLabel(
                "Distance d’entraînement par semaine en kilomètres")
          }
          let runs = activities.filter { ["Run", "TrailRun", "VirtualRun"].contains($0.sportType) }
          let runKm = runs.reduce(0) { $0 + $1.distanceKm }
          let runSeconds = runs.reduce(0) { $0 + $1.movingTimeSeconds }
          let runAscent = runs.reduce(0) { $0 + $1.elevationGainM }
          if !runs.isEmpty {
            Section("Course à pied et trail") {
              LabeledContent("Allure moyenne", value: TrailMath.pace(runSeconds, runKm))
              LabeledContent(
                "Vitesse moyenne",
                value: String(format: "%.2f km/h", runSeconds > 0 ? runKm / (runSeconds / 3600) : 0)
              )
              LabeledContent(
                "Allure effort indicative",
                value: TrailMath.pace(runSeconds, TrailMath.effort(runKm, runAscent)))
              LabeledContent(
                "Plus longue sortie",
                value: String(format: "%.1f km", runs.map(\.distanceKm).max() ?? 0))
              LabeledContent(
                "D+ maximal", value: String(format: "%.0f m", runs.map(\.elevationGainM).max() ?? 0)
              )
              Text("L’allure effort est une estimation myStats, différente du GAP Strava.").font(
                .caption
              ).foregroundStyle(.secondary)
            }
          }
          RecentActivitiesSection(activities: activities)
          if dashboard.partial {
            Section {
              Label(
                "Période partielle : limite de 1 000 activités atteinte.",
                systemImage: "exclamationmark.triangle")
            }
          }
        } else if loading {
          Section { ProgressView("Chargement de tes entraînements…") }
        } else {
          Section {
            ContentUnavailableView(
              "Tes entraînements sont à portée de main", systemImage: "arrow.clockwise",
              description: Text("Touche Actualiser pour charger cette période."))
          }
        }
      }
    }.navigationTitle("myStats").navigationBarTitleDisplayMode(.inline).refreshable {
      await refresh(feedback: true)
    }.task { if store.authenticated && store.dashboard == nil { await refresh() } }
      .onChange(of: store.authenticated) { _, connected in
        if connected && store.dashboard == nil { Task { await refresh() } }
      }
      .appFeedback(.selection, trigger: sport)
      .appFeedback(.success, trigger: refreshed)
  }
  func refresh(feedback: Bool = false) async {
    guard !loading, store.authenticated else { return }
    loading = true
    defer { loading = false }
    if await store.loadDashboard(
      days: days, from: custom ? TrailMath.dateString(from) : nil,
      to: custom ? TrailMath.dateString(to) : nil)
    {
      if feedback { refreshed += 1 }
    }
  }
  func weeklyKm(_ week: String) -> Double {
    guard let start = TrailMath.date(week),
      let end = Calendar.current.date(byAdding: .day, value: 7, to: start)
    else { return 0 }
    let stop = TrailMath.dateString(end)
    return activities.filter { $0.localDate >= week && String($0.localDate.prefix(10)) < stop }
      .reduce(0) { $0 + $1.distanceKm }
  }
}
