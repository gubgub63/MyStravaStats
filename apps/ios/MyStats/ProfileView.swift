import MyStatsCore
import SwiftUI
import UniformTypeIdentifiers

struct JSONDocument: FileDocument {
  static var readableContentTypes: [UTType] { [.json] }
  var data: Data
  init(data: Data) { self.data = data }
  init(configuration: ReadConfiguration) throws {
    data = configuration.file.regularFileContents ?? Data()
  }
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
    FileWrapper(regularFileWithContents: data)
  }
}
struct ProfileView: View {
  @Environment(SeasonStore.self) private var store
  @State private var server = ""
  @State private var firstname = ""
  @State private var lastname = ""
  @State private var utmb = ""
  @State private var itra = ""
  @State private var itraURL = ""
  @State private var matches: [RunnerMatch] = []
  @State private var searching = false
  @State private var lookupMessage = ""
  @State private var importing = false
  @State private var exporting = false
  @State private var pendingImport: Season?
  @State private var document = JSONDocument(data: Data())
  @State private var confirmImport = false
  @State private var confirmDisconnect = false
  @State private var lastLookup = ""
  @AppStorage("hapticsEnabled") private var hapticsEnabled = true
  var body: some View {
    List {
      Section("Connexion et serveur") {
        if store.authenticated {
          Label(
            "Connecté : \(store.athlete?.firstname ?? "") \(store.athlete?.lastname ?? "")",
            systemImage: "checkmark.shield")
          Text(store.server).font(.caption).foregroundStyle(.secondary)
          Button("Se déconnecter") { Task { await store.logout() } }
          Button("Révoquer l’accès Strava", role: .destructive) { confirmDisconnect = true }
        } else {
          TextField("https://stats.exemple.fr", text: $server).keyboardType(.URL)
            .textInputAutocapitalization(.never).autocorrectionDisabled()
          Button("Enregistrer le serveur") { store.changeServer(server) }
          Button("Se connecter avec Strava") { Task { await store.login() } }.disabled(
            store.server.isEmpty || store.busy)
        }
        Text(
          "Les jetons Strava restent sur ton serveur. La session iPhone est conservée dans le Trousseau."
        ).font(.caption).foregroundStyle(.secondary)
        #if DEBUG
          Text(
            "En Wi-Fi local, utilise http:// suivi de l’adresse IP du Mac et :3001. Garde les deux appareils sur le même réseau et le serveur démarré."
          )
          .font(.caption).foregroundStyle(.secondary)
        #endif
      }
      SyncSection()
      Section("Ton profil trail") {
        TextField("Prénom", text: $firstname).textContentType(.givenName)
        TextField("Nom", text: $lastname).textContentType(.familyName)
        Button(searching ? "Recherche UTMB…" : "Rechercher mon profil UTMB") {
          Task { await lookup(force: true) }
        }.disabled(searching || firstname.isEmpty || lastname.isEmpty || store.server.isEmpty)
        if !lookupMessage.isEmpty {
          Text(lookupMessage).font(.footnote).foregroundStyle(.secondary)
        }
        ForEach(matches) { r in
          Button {
            Task { await select(r) }
          } label: {
            VStack(alignment: .leading) {
              Text(r.fullname)
              Text("\(r.nationality) · \(r.ageGroup) · UTMB \(r.ip.map{String(Int($0))} ?? "—")")
                .font(.caption)
            }
          }
        }
        LabeledContent(
          "Index UTMB actuel", value: store.season.profile.utmb.map { String(Int($0)) } ?? "—")
        TextField("Index UTMB manuel", text: $utmb).keyboardType(.decimalPad)
        TextField("Index ITRA manuel", text: $itra).keyboardType(.decimalPad)
        TextField("Source ITRA HTTPS", text: $itraURL).keyboardType(.URL)
          .textInputAutocapitalization(.never)
        Button("Enregistrer le profil") { saveProfile() }
        if let url = URL(string: store.season.profile.utmbUrl), url.scheme == "https" {
          Link("Voir mon profil UTMB officiel", destination: url)
        }
        Link(
          "Recherche ITRA officielle",
          destination: URL(string: "https://itra.run/Runners/FindARunner")!)
        Text(
          "L’accès automatisé à ITRA n’est pas disponible. Renseigne l’index publié ; UTMB n’est jamais converti en ITRA."
        ).font(.caption).foregroundStyle(.secondary)
        if !store.season.profile.checkedAt.isEmpty {
          Text("UTMB synchronisé : \(store.season.profile.checkedAt.prefix(10))").font(.caption)
        }
      }
      Section("Sauvegardes") {
        Button("Importer une sauvegarde JSON") { importing = true }
        Button("Exporter ma saison") {
          do {
            document = JSONDocument(data: try store.season.encoded())
            exporting = true
          } catch { store.message = error.localizedDescription }
        }
        ShareLink(
          "Partager ma sauvegarde",
          item: JSONTransfer(data: (try? store.season.encoded()) ?? Data()),
          preview: SharePreview("Saison myStats"))
        NavigationLink("Copies locales conservées") { LocalBackupsView() }
        Text(
          "L’import remplace la saison courante après confirmation. Les fichiers web version 1 sont compatibles."
        ).font(.caption).foregroundStyle(.secondary)
      }
      Section("Préférences") {
        Toggle("Retours haptiques", isOn: $hapticsEnabled)
        Text(
          "Un retour discret pour les sélections et les sauvegardes réussies. Il suit les réglages système de ton iPhone."
        ).font(.caption).foregroundStyle(.secondary)
      }
      Section("À propos") {
        Link(
          "Code source et licence MIT",
          destination: URL(string: "https://github.com/gubgub63/MyStravaStats")!)
        Text(
          "Les projections myStats sont des heuristiques non validées. Elles ne constituent pas des scores officiels UTMB ou ITRA. Les informations de terrain, les conditions et la fatigue peuvent changer fortement le résultat."
        ).font(.footnote).foregroundStyle(.secondary)
      }
    }.navigationTitle("Ton profil")
      .onAppear {
        server = store.server
        readProfile()
      }
      .onChange(of: store.season.profile) { _, _ in readProfile() }
      .task(id: firstname + "|" + lastname) {
        guard !firstname.isEmpty, !lastname.isEmpty, !store.server.isEmpty else { return }
        do {
          try await Task.sleep(for: .milliseconds(900))
          await lookup(force: false)
        } catch {}
      }
      .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
        do {
          let data = try readFile(result.get(), max: 15 * 1024 * 1024)
          pendingImport = try Season.decode(data)
          confirmImport = true
        } catch { store.message = error.localizedDescription }
      }
      .fileExporter(
        isPresented: $exporting, document: document, contentType: .json,
        defaultFilename: "myStats-saison"
      ) { result in
        if case .failure(let error) = result { store.message = error.localizedDescription }
      }
      .sheet(isPresented: $confirmImport) {
        if let incoming = pendingImport {
          NavigationStack {
            List {
              Section("Fichier à importer") { SummarySeason(season: incoming) }
              Section {
                Button("Remplacer ma saison par ce fichier") {
                  store.archiveCurrent()
                  store.commit(incoming)
                  pendingImport = nil
                  confirmImport = false
                }
                Button("Annuler", role: .cancel) { confirmImport = false }
              }
            }.navigationTitle("Importer la saison")
          }
        }
      }
      .confirmationDialog(
        "Révoquer l’accès Strava sur tous tes appareils ?", isPresented: $confirmDisconnect,
        titleVisibility: .visible
      ) {
        Button("Révoquer l’accès", role: .destructive) {
          Task { await store.logout(disconnect: true) }
        }
      }
  }
  func readProfile() {
    let p = store.season.profile
    firstname = p.firstname
    lastname = p.lastname
    utmb = p.utmb.map { String(Int($0)) } ?? ""
    itra = p.itra.map { String(Int($0)) } ?? ""
    itraURL = p.itraUrl
  }
  func saveProfile() {
    do {
      var next = store.season
      next.profile.firstname = firstname
      next.profile.lastname = lastname
      next.profile.utmb = try optionalScore(utmb)
      next.profile.itra = try optionalScore(itra)
      next.profile.itraUrl = itraURL
      try next.validate()
      store.commit(next)
    } catch { store.message = error.localizedDescription }
  }
  func normalize(_ s: String) -> String {
    s.folding(
      options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "fr_FR")
    ).split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
  }
  func lookup(force: Bool) async {
    let identity = firstname + "|" + lastname
    guard !firstname.isEmpty, !lastname.isEmpty, force || identity != lastLookup else { return }
    searching = true
    defer { searching = false }
    do {
      let rows = try await store.searchRunner(firstname: firstname, lastname: lastname)
      guard !Task.isCancelled, identity == firstname + "|" + lastname else { return }
      lastLookup = identity
      let exact = rows.filter {
        normalize($0.fullname) == normalize(firstname + " " + lastname)
          || normalize($0.fullname) == normalize(lastname + " " + firstname)
      }
      if exact.count == 1 {
        try await store.importRunner(
          exact[0], firstname: firstname, lastname: lastname,
          isCurrent: { identity == firstname + "|" + lastname })
        matches = []
        lookupMessage = "Index et résultats UTMB synchronisés."
      } else {
        matches = rows
        lookupMessage =
          rows.isEmpty
          ? "Aucun profil trouvé. Vérifie le nom ou renseigne tes résultats manuellement."
          : "Choisis ton profil pour éviter les homonymes."
      }
    } catch { if !Task.isCancelled { lookupMessage = error.localizedDescription } }
  }
  func select(_ runner: RunnerMatch) async {
    let identity = firstname + "|" + lastname
    searching = true
    defer { searching = false }
    do {
      try await store.importRunner(
        runner, firstname: firstname, lastname: lastname,
        isCurrent: { identity == firstname + "|" + lastname })
      matches = []
      lookupMessage = "Index et résultats UTMB synchronisés."
    } catch { lookupMessage = error.localizedDescription }
  }
}
struct LocalBackupsView: View {
  @Environment(SeasonStore.self) private var store
  @State private var copies: [LocalCopy] = []
  @State private var selected: LocalCopy?
  var body: some View {
    List {
      if copies.isEmpty { Text("Aucune autre copie conservée.") }
      ForEach(copies) { copy in
        Button {
          selected = copy
        } label: {
          VStack(alignment: .leading) {
            Text(copy.title)
            Text("\(copy.season.races.count) objectifs · \(copy.season.results.count) résultats")
              .font(.caption)
          }
        }
      }
    }.navigationTitle("Copies locales").onAppear { copies = store.localCopies() }.sheet(
      item: $selected
    ) { copy in
      NavigationStack {
        List {
          SummarySeason(season: copy.season)
          Button("Restaurer cette copie") {
            store.archiveCurrent()
            store.commit(copy.season)
            selected = nil
          }
          Button("Annuler") { selected = nil }
        }.navigationTitle("Vérifier avant restauration")
      }
    }
  }
}

struct JSONTransfer: Transferable {
  let data: Data
  static var transferRepresentation: some TransferRepresentation {
    DataRepresentation(exportedContentType: .json) { $0.data }.suggestedFileName(
      "myStats-saison.json")
  }
}
