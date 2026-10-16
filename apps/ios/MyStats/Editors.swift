import MyStatsCore
import SwiftUI

let terrainLabels = [
  "Non renseigné", "Roulant", "Sentier facile", "Mixte / irrégulier", "Rocheux / technique",
  "Très technique",
]
struct RaceEditor: View {
  @Environment(SeasonStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State var race: TrailRace
  @State private var kilometers = ""
  @State private var ascent = ""
  @State private var time = ""
  @State private var error = ""
  @State private var remove = false
  var body: some View {
    NavigationStack {
      Form {
        Section("Course") {
          TextField("Nom", text: $race.name).accessibilityIdentifier("race.name")
          DatePicker(
            "Date",
            selection: Binding(
              get: { TrailMath.date(race.date) ?? Date() },
              set: { race.date = TrailMath.dateString($0) }), displayedComponents: .date)
          LabeledContent("Distance (km)") {
            TextField("km", text: $kilometers).accessibilityIdentifier(
              "race.distance"
            ).keyboardType(.decimalPad)
              .multilineTextAlignment(.trailing)
          }
          LabeledContent("Dénivelé positif (m)") {
            TextField("D+", text: $ascent).accessibilityIdentifier(
              "race.ascent"
            ).keyboardType(.decimalPad)
              .multilineTextAlignment(.trailing)
          }
          Picker("Priorité", selection: $race.priority) {
            Text("A · Principale").tag("A")
            Text("B · Préparation").tag("B")
            Text("C · Plaisir").tag("C")
          }
          Picker(
            "Terrain",
            selection: Binding(
              get: { (race.terrain ?? -1) + 1 }, set: { race.terrain = $0 == 0 ? nil : $0 - 1 })
          ) { ForEach(0..<terrainLabels.count, id: \.self) { Text(terrainLabels[$0]).tag($0) } }
        }
        Section("Objectif") {
          TextField("Temps écoulé : H:MM:SS", text: $time).accessibilityIdentifier("race.target")
            .keyboardType(.numbersAndPunctuation)
          Text("Temps écoulé, pauses comprises.").font(.caption).foregroundStyle(.secondary)
          TextField("Lien source HTTPS", text: $race.source).keyboardType(.URL)
            .textInputAutocapitalization(.never)
          TextField("Notes", text: $race.notes, axis: .vertical).lineLimit(3...8)
        }
        if !error.isEmpty { Text(error).foregroundStyle(.red) }
        if store.season.races.contains(where: { $0.id == race.id }) {
          Section { Button("Supprimer la course", role: .destructive) { remove = true } }
        }
      }.navigationTitle("Ton objectif").toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) { Button("Enregistrer") { save() } }
      }
      .onAppear {
        time = TrailMath.durationInput(race.targetSeconds)
        kilometers = race.distanceKm > 0 ? race.distanceKm.formatted(.number.grouping(.never)) : ""
        ascent = race.ascentM > 0 ? race.ascentM.formatted(.number.grouping(.never)) : ""
      }
      .confirmationDialog(
        "Supprimer cet objectif ?", isPresented: $remove, titleVisibility: .visible
      ) {
        Button("Supprimer", role: .destructive) {
          var next = store.season
          next.races.removeAll { $0.id == race.id }
          if store.commit(next) { dismiss() }
        }
      }
    }
    .appFeedback(.error, trigger: error)
  }
  func save() {
    do {
      race.distanceKm = try routeNumber(kilometers)
      race.ascentM =
        ascent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0 : try routeNumber(ascent)
    } catch {
      self.error = error.localizedDescription
      return
    }
    race.targetSeconds =
      time.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      ? nil : TrailMath.parseDuration(time)
    if !time.isEmpty && race.targetSeconds == nil {
      error = "Utilise H:MM ou H:MM:SS, par exemple 17:00:00."
      return
    }
    do {
      var next = store.season
      if let i = next.races.firstIndex(where: { $0.id == race.id }) {
        next.races[i] = race
      } else {
        next.races.append(race)
      }
      try next.validate()
      if store.commit(next) { dismiss() }
    } catch { self.error = error.localizedDescription }
  }
}
func optionalScore(_ value: String) throws -> Double? {
  let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
  if text.isEmpty { return nil }
  guard let number = Double(text.replacingOccurrences(of: ",", with: ".")), number.isFinite,
    (0...1000).contains(number)
  else { throw TrailError.invalid("Les index doivent être compris entre 0 et 1 000.") }
  return number
}

func routeNumber(_ text: String) throws -> Double {
  guard
    let value = Double(
      text.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")),
    value.isFinite
  else { throw TrailError.invalid("Renseigne une distance et un dénivelé valides.") }
  return value
}
