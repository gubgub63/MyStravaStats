import Charts
import MapKit
import MyStatsCore
import SwiftUI
import UniformTypeIdentifiers

struct SeasonView: View {
  @Environment(SeasonStore.self) private var store
  @State private var year = Calendar.current.component(.year, from: Date()) + 1
  @State private var newRace = false
  @State private var search = false
  private var initialRace: TrailRace {
    var race = TrailRace()
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    var components = calendar.dateComponents([.year, .month, .day], from: Date())
    components.year = year
    race.date = TrailMath.dateString(calendar.date(from: components) ?? Date())
    return race
  }
  private var races: [TrailRace] {
    store.season.races.filter { $0.date.hasPrefix(String(year)) }.sorted { $0.date < $1.date }
  }
  var body: some View {
    List {
      Section {
        Picker("Saison", selection: $year) {
          ForEach(
            Array(
              Set(
                store.season.races.map { Int($0.date.prefix(4)) ?? year } + [
                  year, Calendar.current.component(.year, from: Date()),
                  Calendar.current.component(.year, from: Date()) + 1,
                ])
            ).sorted(), id: \.self
          ) { Text(String($0)).tag($0) }
        }
        HStack {
          Metric(
            title: "Courses principales", value: String(races.filter { $0.priority == "A" }.count))
          Metric(
            title: "Au programme",
            value: String(format: "%.0f", races.reduce(0) { $0 + $1.distanceKm }), unit: "km")
        }
      }
      SyncSection()
      Section("Tes objectifs") {
        if races.isEmpty {
          ContentUnavailableView(
            "La saison se dessine ici", systemImage: "mountain.2",
            description: Text(
              "Ajoute deux ou trois courses principales et tes courses de préparation."))
        }
        ForEach(races) { r in
          NavigationLink {
            RaceDetail(id: r.id)
          } label: {
            VStack(alignment: .leading, spacing: 6) {
              HStack {
                Text(r.name).font(.headline)
                Spacer()
                Text(r.priority).font(.caption.bold()).foregroundStyle(.teal)
              }
              Text("\(r.date) · \(r.distanceKm.formatted()) km · \(r.ascentM.formatted()) m D+")
                .font(.subheadline).foregroundStyle(.secondary)
              if r.targetSeconds != nil {
                Text("Objectif \(TrailMath.duration(r.targetSeconds))").font(.caption)
              }
            }
          }
        }
        Button("Ajouter une course", systemImage: "plus") { newRace = true }
        Button("Rechercher une course", systemImage: "magnifyingglass") { search = true }
      }
    }.navigationTitle("Ta saison").sheet(isPresented: $newRace) { RaceEditor(race: initialRace) }
      .sheet(isPresented: $search) { CatalogSearch() }
  }
}
struct CatalogSearch: View {
  @Environment(SeasonStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var query = ""
  @State private var rows: [CatalogRace] = []
  @State private var loading = false
  @State private var selected: TrailRace?
  @State private var error = ""
  var body: some View {
    NavigationStack {
      List {
        Section {
          TextField("UTLAC, lac de Côme…", text: $query).submitLabel(.search).onSubmit {
            Task { await search() }
          }
          Button("Rechercher") { Task { await search() } }.disabled(loading)
        }
        if loading { ProgressView("Recherche…") }
        if !error.isEmpty { Text(error).foregroundStyle(.red) }
        ForEach(rows) { r in
          Button {
            Task { await load(r.id) }
          } label: {
            VStack(alignment: .leading) {
              Text("\(r.name) · \(r.format) km")
              Text(r.location).font(.caption).foregroundStyle(.secondary)
            }
          }.disabled(loading)
        }
        Section {
          Text(
            "Le catalogue connecté couvre les formats UTLAC. Tu peux saisir les autres courses manuellement."
          ).font(.footnote).foregroundStyle(.secondary)
        }
      }.navigationTitle("Trouver une course").toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } }
      }.sheet(item: $selected) { RaceEditor(race: $0) }
    }
  }
  func search() async {
    loading = true
    defer { loading = false }
    do {
      struct Response: Decodable { var races: [CatalogRace] }
      let response: Response = try await store.client.get(
        APIClient.query("/api/trail/races", ["q": query]))
      rows = response.races
      error = rows.isEmpty ? "Aucune course trouvée. La saisie manuelle reste disponible." : ""
    } catch { self.error = error.localizedDescription }
  }
  func load(_ id: String) async {
    loading = true
    defer { loading = false }
    do {
      let data: CatalogDetail = try await store.client.get(
        APIClient.query("/api/trail/races", ["id": id]))
      var r = TrailRace()
      r.catalogId = data.id
      r.name = data.name
      r.date = data.date
      r.distanceKm = data.distanceKm
      r.ascentM = data.ascentM
      r.cutoffHours = data.cutoffHours
      r.source = data.source
      r.organizerTerrain = data.terrainDescription
      r.sourceCheckedAt = data.checkedAt
      selected = r
    } catch { self.error = error.localizedDescription }
  }
}
struct RaceDetail: View {
  @Environment(SeasonStore.self) private var store
  let id: String
  @State private var editing = false
  @State private var importing = false
  @State private var importKind = "gpx"
  @State private var loading = false
  @State private var error = ""
  private var race: TrailRace? { store.season.races.first { $0.id == id } }
  var body: some View {
    Group {
      if let r = race {
        List {
          Section {
            Text(r.name).font(.title2.bold())
            Text("\(r.date) · priorité \(r.priority)").foregroundStyle(.secondary)
            HStack {
              Metric(title: "Distance", value: r.distanceKm.formatted(), unit: "km")
              Metric(title: "Dénivelé", value: r.ascentM.formatted(), unit: "m D+")
            }
            if let cutoff = r.cutoffHours {
              LabeledContent("Barrière finale", value: "\(cutoff.formatted()) h")
            }
            if let url = URL(string: r.source), url.scheme == "https" {
              Link("Source organisateur", destination: url)
            }
          }
          Section("Ton scénario") {
            if let target = r.targetSeconds {
              Metric(title: "Temps écoulé visé", value: TrailMath.duration(target))
              LabeledContent("Allure moyenne", value: TrailMath.pace(target, r.distanceKm))
              LabeledContent(
                "Vitesse",
                value: String(
                  format: "%.2f km/h · %.3f km/min", r.distanceKm / (target / 3600),
                  r.distanceKm / (target / 60)))
            } else {
              Text("Renseigne un temps cible pour estimer l’allure et la place.")
            }
            if let p = TrailMath.predict(r, store.season.results) {
              LabeledContent("Projection personnelle", value: TrailMath.duration(p.central))
              Text(
                "Fourchette indicative : \(TrailMath.duration(p.low)) – \(TrailMath.duration(p.high)) · \(p.references) résultats de référence."
              ).font(.footnote)
            } else {
              Text(
                "Ajoute un résultat terminé récent, avec temps, distance et D+, ou importe ton profil UTMB."
              ).font(.footnote)
            }
            if TrailMath.comparable(r), let t = r.targetSeconds, let f = TrailMath.field(t, r.field)
            {
              LabeledContent("Place historique", value: "\(f.rank) / \(f.finishers)")
              Text(
                "\(r.fieldLabel) · plage \(f.lowRank)–\(f.highRank) avec ±10 % de temps. Le peloton futur peut être différent."
              ).font(.footnote)
            } else if !r.field.isEmpty {
              Label(
                "Parcours différent : comparaison historique suspendue.",
                systemImage: "exclamationmark.triangle")
            }
            ForEach([false, true], id: \.self) { itra in
              if let level = TrailMath.level(
                r, store.season.results, store.season.profile, itra: itra)
              {
                LabeledContent(
                  "Niveau \(itra ? "ITRA" : "UTMB") estimé", value: String(Int(level.value)))
                Text(
                  level.method == "personal"
                    ? "Équivalent personnel indicatif, \(Int(level.low ?? 0))–\(Int(level.high ?? 0)). Ce n’est ni un score officiel ni un futur index général."
                    : "Calibrage empirique à partir de scores historiques publiés, pas un index officiel."
                ).font(.caption).foregroundStyle(.secondary)
              } else {
                LabeledContent("Niveau \(itra ? "ITRA" : "UTMB")", value: "Données insuffisantes")
              }
            }
          }
          Section("Difficulté et parcours") {
            LabeledContent("Difficulté myStats", value: "\(Int(TrailMath.difficulty(r))) / 100")
            Text(
              "Modèle indicatif non validé. Sans GPX ou terrain, l’estimation est partielle. Le GPX ne décrit pas la nature du sol."
            ).font(.caption).foregroundStyle(.secondary)
            if !r.organizerTerrain.isEmpty { Text(r.organizerTerrain).font(.footnote) }
            if let t = r.track {
              LabeledContent(
                "Mesure GPX", value: String(format: "%.1f km · %.0f m D+", t.distanceKm, t.ascentM))
              if abs(t.distanceKm / r.distanceKm - 1) > 0.05
                || abs(t.ascentM - r.ascentM) > max(100, r.ascentM * 0.1)
              {
                Label(
                  "Écart avec les valeurs organisateur. Vérifie l’édition de la trace.",
                  systemImage: "exclamationmark.triangle"
                ).font(.footnote)
              }
              Map {
                ForEach(Array(Set(t.profile.map(\.segment))).sorted(), id: \.self) { segment in
                  MapPolyline(
                    coordinates: t.profile.filter { $0.segment == segment }.map {
                      CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon)
                    }
                  ).stroke(.teal, lineWidth: 3)
                }
              }.frame(height: 220).clipShape(RoundedRectangle(cornerRadius: 12)).accessibilityLabel(
                "Tracé de la course")
              Chart(Array(t.profile.enumerated()), id: \.offset) { _, p in
                LineMark(
                  x: .value("Kilomètres", p.km), y: .value("Altitude en mètres", p.elevation),
                  series: .value("Segment", p.segment))
              }.frame(height: 150).accessibilityLabel("Profil altimétrique du parcours")
            }
            Button("Importer un GPX") {
              importKind = "gpx"
              importing = true
            }
            if r.catalogId != nil {
              Button("Récupérer le GPX organisateur") { Task { await fetchGPX(r) } }.disabled(
                loading)
            }
          }
          Section("Classement de référence") {
            if !r.field.isEmpty {
              Text("\(r.field.count) finishers · \(r.fieldLabel)")
              if let url = URL(string: r.fieldSource), url.scheme == "https" {
                Link("Source du classement", destination: url)
              }
            }
            if r.catalogId == "utlac-120" {
              Button("Charger le classement UTLAC 2026") { Task { await history(r) } }.disabled(
                loading)
            }
            Button("Importer un CSV de classement") {
              importKind = "csv"
              importing = true
            }
            ShareLink(
              "Modèle CSV", item: CSVTransfer(text: "time,utmb,itra,status\n"),
              preview: SharePreview("Classement de référence"))
            Text("Colonnes : time (H:MM:SS), utmb, itra, status. Les abandons DNF sont exclus.")
              .font(.caption).foregroundStyle(.secondary)
          }
          if !r.notes.isEmpty { Section("Notes") { Text(r.notes) } }
          if loading { ProgressView("Chargement…") }
          if !error.isEmpty { Text(error).foregroundStyle(.red) }
        }.sheet(isPresented: $editing) { RaceEditor(race: r) }.toolbar {
          Button("Modifier") { editing = true }
        }
      } else {
        ContentUnavailableView("Course supprimée", systemImage: "mountain.2")
      }
    }
    .navigationTitle("Objectif").navigationBarTitleDisplayMode(.inline)
    .fileImporter(
      isPresented: $importing,
      allowedContentTypes: importKind == "gpx"
        ? [.xml, UTType(filenameExtension: "gpx") ?? .xml] : [.commaSeparatedText, .plainText]
    ) { result in
      do {
        let url = try result.get()
        let data = try readFile(url, max: importKind == "gpx" ? 20 * 1024 * 1024 : 5 * 1024 * 1024)
        guard var r = race else { return }
        if importKind == "gpx" {
          r.track = try TrailImport.gpx(data, filename: url.lastPathComponent)
        } else {
          r.field = try TrailImport.csv(String(decoding: data, as: UTF8.self))
          r.fieldLabel = url.lastPathComponent
          r.fieldSource = ""
          r.fieldEdition = nil
          r.fieldDistanceKm = r.distanceKm
          r.fieldAscentM = r.ascentM
        }
        store.saveRace(r)
      } catch { self.error = error.localizedDescription }
    }
  }
  func history(_ race: TrailRace) async {
    loading = true
    defer { loading = false }
    do {
      let h: HistoryResponse = try await store.client.get(
        APIClient.query("/api/trail/history", ["id": race.catalogId ?? ""]))
      guard var r = self.race else { return }
      r.field = h.field
      r.fieldLabel = h.label
      r.fieldSource = h.source
      r.fieldEdition = h.year
      r.fieldDistanceKm = h.distanceKm
      r.fieldAscentM = h.ascentM
      store.saveRace(r)
    } catch { self.error = error.localizedDescription }
  }
  func fetchGPX(_ race: TrailRace) async {
    loading = true
    defer { loading = false }
    do {
      let data = try await store.client.request(
        APIClient.query("/api/trail/gpx", ["id": race.catalogId ?? ""]))
      let track = try TrailImport.gpx(data, filename: "UTLAC.gpx", source: race.source)
      guard var current = self.race else { return }
      current.track = track
      store.saveRace(current)
    } catch { self.error = error.localizedDescription }
  }
}
func readFile(_ url: URL, max: Int) throws -> Data {
  let access = url.startAccessingSecurityScopedResource()
  defer { if access { url.stopAccessingSecurityScopedResource() } }
  let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
  guard size <= max else { throw TrailError.invalid("Fichier trop volumineux.") }
  let data = try Data(contentsOf: url)
  guard data.count <= max else { throw TrailError.invalid("Fichier trop volumineux.") }
  return data
}
struct CSVTransfer: Transferable {
  let text: String
  static var transferRepresentation: some TransferRepresentation {
    DataRepresentation(exportedContentType: .commaSeparatedText) { Data($0.text.utf8) }
      .suggestedFileName("classement.csv")
  }
}
