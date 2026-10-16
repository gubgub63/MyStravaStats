# myStats for iPhone

Native SwiftUI, Swift Charts, MapKit, SwiftData and Keychain; iOS 17+. No WebView, paid SDK, iCloud entitlement or embedded Strava secret. MIT, in the same repository as the web application.

## Install on your iPhone

1. Open `apps/ios/MyStats.xcodeproj` in Xcode 16 or newer. The shared scheme is **MyStats**; the local `MyStatsCore` package resolves automatically.
2. In Xcode → Settings → Accounts, add your Apple Account. In **MyStats → Signing & Capabilities**, choose your Personal Team. If necessary choose an available bundle identifier (for example your own reverse-domain identifier).
3. Connect and unlock your iPhone; trust the Mac and enable Developer Mode if iOS requests it. Select that iPhone as the run destination and choose Run.
4. In **Profil**, enter your own server’s HTTPS origin, save it, then connect Strava. Configure hosting using `docs/ios-and-sync.md`, or use its private Wi-Fi instructions for a Debug build on the same network as the Mac. An ordinary `localhost` URL on the iPhone refers to the phone, not your Mac.
5. Export your season from the existing website and import the JSON in **Profil**; check the preview before replacement. You can instead use the web migration prompt to send the local season to the server, then synchronize the iPhone.

Apple’s free Personal Team requires rebuilding/reinstalling after the provisioning profile expires (currently seven days). Keep the app installed when reinstalling to retain its local data, and export a backup first. TestFlight is an optional later distribution step and requires Apple Developer Program membership. No personal team or signing credentials are checked into this repository.

The Debug target's **Build Settings → User-Defined → MYSTATS_SERVER_URL** defaults to `http://192.168.1.102:3001` for the current local Wi-Fi setup. It fills the Profile server field automatically, including when a physical iPhone still has an unusable localhost setting. A valid server already saved in the app remains preferred. Change this build setting if the Mac's address changes; Release has no local server default and requires HTTPS.

## Features

- Dashboard: Strava periods/custom dates, sport filter, weekly chart, running statistics and current UTMB/ITRA indices. The preview shows five recent activities; the full list has search and twenty rows per page. Statistics continue to use the full period.
- Season: A/B/C races, manual editing, UTLAC catalog lookup, targets, personal time projections, historical ranking and supplier-specific equivalent levels.
- Route: import GPX from Files or retrieve the organizer’s GPX, segmented map, elevation profile, organizer/GPX discrepancy warnings and partial difficulty model.
- Optional native haptics for tab/filter selection and successful local saves or manual refresh, configurable under Profile → Preferences. Feedback confirms persistence, not just a button tap; Simulator tests do not verify the physical vibration.
- Profile: debounced exact-name UTMB lookup, explicit selection of homonyms, results deduplication, manual ITRA, export/share/restore JSON and retained local copies.
- Offline season editing and calculations. Strava and external searches require network access. No activity data is persisted to SwiftData.

Data is isolated by server and Strava athlete. The local snapshot includes its acknowledged server revision and unsent-change state. Initial local-season upload is explicit. Concurrent edits preserve the local draft and require comparing versions before replacement. Lost network responses can produce a conflict on retry; they never silently overwrite the server. Copies retained before replacement are accessible in Profile.

## Validate

```sh
swift test --package-path apps/ios/MyStatsCore
xcodebuild -project apps/ios/MyStats.xcodeproj -scheme MyStats \
  -destination 'platform=iOS Simulator,name=YOUR_AVAILABLE_IPHONE' \
  -derivedDataPath /tmp/mystats-ios CODE_SIGNING_ALLOWED=NO test
```

If your command-line tools point at CommandLineTools rather than Xcode, prefix commands with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`. `xcrun simctl list devices available` lists simulator names. No signing is needed for simulator tests. The native tests cover storage, restart, account/server isolation, conflicts, offline retries and request authentication; the core package checks calculation and backup parity.

UI tests use `--ui-tests --ui-fixtures` to load synthetic in-memory data with a stub transport and temporary session vault. This harness is compiled only in Debug and never uses real accounts, Keychain sessions or the network. Appearance/large-text launch flags are scoped to that harness.

Both Info property lists register the fixed `mystats` callback scheme and must retain the same app metadata. Release uses `Info.plist` with HTTPS enforcement; Debug uses `Info-Debug.plist`, which permits HTTP to simulator loopback and RFC1918 private IPv4 networks for local Wi-Fi testing. There is no global insecure-network exception. The bundle has no location permission because it displays imported routes and does not record GPS activity.
