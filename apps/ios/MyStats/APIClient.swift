import AuthenticationServices
import CryptoKit
import Foundation
import MyStatsCore
import Security

struct APIError: LocalizedError {
  var status: Int, message: String, workspace: Workspace?
  var errorDescription: String? { message }
}
typealias APITransport = (URLRequest) async throws -> (Data, URLResponse)
struct APIClient {
  let baseURL: URL
  var token: String?
  var transport: APITransport? = nil
  static func server(_ text: String) throws -> URL {
    guard let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
      let host = url.host, url.user == nil, url.password == nil, url.query == nil,
      url.fragment == nil, url.path.isEmpty || url.path == "/"
    else { throw TrailError.invalid("Utilise l’adresse du serveur, sans chemin.") }
    let loopback = ["localhost", "127.0.0.1", "::1"].contains(host)
    #if !targetEnvironment(simulator)
      if loopback {
        throw TrailError.invalid(
          "localhost désigne ton iPhone. Utilise l’adresse Wi-Fi du Mac en mode développement, ou l’adresse HTTPS du serveur."
        )
      }
    #endif
    #if DEBUG
      let local = loopback || isPrivateIPv4(host)
    #else
      let local = false
    #endif
    guard url.scheme == "https" || (local && url.scheme == "http") else {
      throw TrailError.invalid(
        "Utilise HTTPS, ou une adresse IP Wi-Fi privée en mode développement.")
    }
    return url
  }
  private static func isPrivateIPv4(_ host: String) -> Bool {
    let parts = host.split(separator: ".", omittingEmptySubsequences: false)
    guard parts.count == 4,
      parts.allSatisfy({ !$0.isEmpty && $0.utf8.allSatisfy({ (48...57).contains($0) }) })
    else { return false }
    let bytes = parts.compactMap { UInt8($0) }
    guard bytes.count == 4 else { return false }
    return bytes[0] == 10 || (bytes[0] == 172 && (16...31).contains(bytes[1]))
      || (bytes[0] == 192 && bytes[1] == 168)
  }
  func request(_ path: String, method: String = "GET", body: Data? = nil) async throws -> Data {
    guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL, url.host == baseURL.host
    else { throw TrailError.invalid("Adresse invalide.") }
    var request = URLRequest(
      url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 60)
    request.httpMethod = method
    request.httpBody = body
    if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
    if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    let data: Data
    let response: URLResponse
    do {
      if let transport {
        (data, response) = try await transport(request)
      } else {
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.urlCache = nil
        let session = URLSession(configuration: config)
        defer { session.finishTasksAndInvalidate() }
        (data, response) = try await session.data(for: request)
      }
    } catch let error as URLError {
      let message: String
      switch error.code {
      case .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed:
        message =
          "Impossible de joindre \(baseURL.absoluteString). Vérifie que le serveur est démarré. En Wi-Fi local, garde le Mac allumé et les deux appareils sur le même réseau, puis autorise l’accès au réseau local dans Réglages → myStats."
      case .notConnectedToInternet, .networkConnectionLost:
        message =
          "La connexion réseau est indisponible. Ta saison reste conservée sur cet appareil."
      case .timedOut:
        message = "Le serveur met trop de temps à répondre. Réessaie dans un instant."
      default:
        message =
          "La connexion au serveur a échoué. Vérifie son adresse et les autorisations réseau de myStats."
      }
      throw APIError(status: 0, message: message, workspace: nil)
    }
    guard let http = response as? HTTPURLResponse else {
      throw TrailError.invalid("Réponse serveur invalide.")
    }
    guard (200...299).contains(http.statusCode) else {
      struct Problem: Decodable {
        var message: String?
        var workspace: Workspace?
      }
      let problem = try? JSONDecoder().decode(Problem.self, from: data)
      throw APIError(
        status: http.statusCode,
        message: problem?.message ?? "Le serveur est indisponible (\(http.statusCode)).",
        workspace: problem?.workspace)
    }
    return data
  }
  func get<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T {
    try JSONDecoder().decode(type, from: await request(path))
  }
  func send<T: Decodable, B: Encodable>(
    _ path: String, method: String = "POST", body: B, as type: T.Type = T.self
  ) async throws -> T {
    try JSONDecoder().decode(
      type, from: await request(path, method: method, body: JSONEncoder().encode(body)))
  }
  static func query(_ path: String, _ values: [String: String]) -> String {
    var c = URLComponents()
    c.path = path
    c.queryItems = values.sorted { $0.key < $1.key }.map {
      URLQueryItem(name: $0.key, value: $0.value)
    }
    return c.string!
  }
}
enum SessionVault {
  static func read(_ server: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "myStats.session",
      kSecAttrAccount as String: server, kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data
    else { return nil }
    return String(data: data, encoding: .utf8)
  }
  static func save(_ token: String?, server: String) throws {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "myStats.session",
      kSecAttrAccount as String: server,
    ]
    let removed = SecItemDelete(query as CFDictionary)
    guard removed == errSecSuccess || removed == errSecItemNotFound else {
      throw TrailError.invalid("Le Trousseau est inaccessible.")
    }
    if let token {
      var value = query
      value[kSecValueData as String] = Data(token.utf8)
      value[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      guard SecItemAdd(value as CFDictionary, nil) == errSecSuccess else {
        throw TrailError.invalid("Impossible de conserver la connexion dans le Trousseau.")
      }
    }
  }
}
@MainActor final class NativeAuth: NSObject, ASWebAuthenticationPresentationContextProviding {
  private var session: ASWebAuthenticationSession?
  static func browserError(_ error: Error?) -> Error {
    let failure = error as NSError?
    if failure?.domain == ASWebAuthenticationSessionErrorDomain {
      switch failure?.code {
      case ASWebAuthenticationSessionError.canceledLogin.rawValue:
        return CancellationError()
      case ASWebAuthenticationSessionError.presentationContextNotProvided.rawValue,
        ASWebAuthenticationSessionError.presentationContextInvalid.rawValue:
        return TrailError.invalid(
          "La fenêtre de connexion ne peut pas s’ouvrir. Reviens dans myStats et réessaie.")
      default: break
      }
    }
    return TrailError.invalid("La connexion Strava n’a pas pu aboutir. Réessaie dans un instant.")
  }
  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
      .first(where: { $0.isKeyWindow }) ?? ASPresentationAnchor()
  }
  func login(_ client: APIClient) async throws -> String {
    var random = [UInt8](repeating: 0, count: 32)
    guard SecRandomCopyBytes(kSecRandomDefault, random.count, &random) == errSecSuccess else {
      throw TrailError.invalid("Impossible de préparer la connexion.")
    }
    func base64(_ bytes: Data) -> String {
      bytes.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(
        of: "/", with: "_"
      ).replacingOccurrences(of: "=", with: "")
    }
    let verifier = base64(Data(random))
    let challenge = base64(Data(SHA256.hash(data: Data(verifier.utf8))))
    struct Start: Encodable { var challenge: String }
    struct Started: Decodable { var authorizationUrl: String, state: String }
    let start: Started = try await client.send(
      "/api/v1/auth/start", body: Start(challenge: challenge))
    guard let url = URL(string: start.authorizationUrl), url.scheme == "https",
      url.host == "www.strava.com"
    else { throw TrailError.invalid("Adresse de connexion Strava invalide.") }
    defer { session = nil }
    let callback: URL = try await withCheckedThrowingContinuation { continuation in
      session = ASWebAuthenticationSession(url: url, callbackURLScheme: "mystats") {
        callback, error in
        if let callback {
          continuation.resume(returning: callback)
        } else {
          continuation.resume(throwing: Self.browserError(error))
        }
      }
      session?.presentationContextProvider = self
      if session?.start() != true {
        session = nil
        continuation.resume(throwing: TrailError.invalid("Impossible d’ouvrir Strava."))
      }
    }
    let parts = URLComponents(url: callback, resolvingAgainstBaseURL: false)
    func value(_ key: String) -> String? {
      parts?.queryItems?.first(where: { $0.name == key })?.value
    }
    guard callback.scheme == "mystats", callback.host == "auth", callback.path == "/callback",
      value("state") == start.state
    else { throw TrailError.invalid("La réponse de connexion est invalide.") }
    if value("error") != nil {
      throw TrailError.invalid(
        "Strava n’a pas autorisé la connexion. Réessaie en autorisant la lecture des activités.")
    }
    guard let code = value("code") else { throw TrailError.invalid("Code de connexion manquant.") }
    struct Exchange: Encodable { var code: String, verifier: String }
    struct Login: Decodable { var token: String, expiresIn: Int }
    let login: Login = try await client.send(
      "/api/v1/auth/exchange", body: Exchange(code: code, verifier: verifier))
    return login.token
  }
}

protocol SessionStorage {
  func read(_ server: String) -> String?
  func save(_ token: String?, server: String) throws
}
struct KeychainSessionStorage: SessionStorage {
  func read(_ server: String) -> String? { SessionVault.read(server) }
  func save(_ token: String?, server: String) throws {
    try SessionVault.save(token, server: server)
  }
}
