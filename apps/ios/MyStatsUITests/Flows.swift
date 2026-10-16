import XCTest

final class Flows: XCTestCase {
  @MainActor func capture(_ app: XCUIApplication, name: String) {
    let image = XCTAttachment(screenshot: app.screenshot())
    image.name = name
    image.lifetime = .keepAlways
    add(image)
  }
  @MainActor func testActivitiesAreDisclosedProgressively() throws {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-tests", "--ui-fixtures"]
    app.launch()
    XCTAssertTrue(app.staticTexts["Bonjour Camille."].waitForExistence(timeout: 5))
    capture(app, name: "Dashboard clair")
    let all = app.buttons["activities.all"]
    for _ in 0..<8 {
      if all.isHittable { break }
      app.swipeUp()
    }
    XCTAssertTrue(all.exists)
    XCTAssertTrue(app.descendants(matching: .any)["activity.5"].exists)
    XCTAssertFalse(app.descendants(matching: .any)["activity.6"].exists)
    capture(app, name: "Aperçu limité à cinq activités")
    all.tap()
    XCTAssertTrue(app.staticTexts["55 activités · page 1 sur 3"].waitForExistence(timeout: 3))
    app.buttons["Suivant"].tap()
    XCTAssertTrue(app.staticTexts["55 activités · page 2 sur 3"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.descendants(matching: .any)["activity.21"].exists)
    XCTAssertFalse(app.descendants(matching: .any)["activity.1"].exists)
    capture(app, name: "Activités page deux")

  }
  @MainActor func testDarkAndAccessibleLayouts() throws {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-tests", "--ui-fixtures", "--ui-dark"]
    app.launch()
    XCTAssertTrue(app.staticTexts["Bonjour Camille."].waitForExistence(timeout: 5))
    capture(app, name: "Dashboard sombre")
    app.tabBars.buttons["Saison"].tap()
    capture(app, name: "Saison sombre")
    app.terminate()
    app.launchArguments.append("--ui-large-text")
    app.launch()
    XCTAssertTrue(app.staticTexts["Bonjour Camille."].waitForExistence(timeout: 5))
    capture(app, name: "Dashboard texte accessible")
    app.tabBars.buttons["Saison"].tap()
    capture(app, name: "Saison texte accessible")
    XCUIDevice.shared.orientation = .landscapeLeft
    capture(app, name: "Saison paysage texte accessible")
    XCUIDevice.shared.orientation = .portrait
  }
  @MainActor func testCreateRaceAndInspectTargetOffline() throws {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-tests"]
    app.launch()
    app.tabBars.buttons["Saison"].tap()
    app.buttons["Ajouter une course"].tap()
    let name = app.textFields["race.name"]
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.tap()
    name.typeText("Objectif iPhone")
    let distance = app.textFields["race.distance"]
    distance.tap()
    distance.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 8) + "100")
    let ascent = app.textFields["race.ascent"]
    ascent.tap()
    ascent.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 8) + "6000")
    app.swipeUp()
    let target = app.textFields["race.target"]
    XCTAssertTrue(target.waitForExistence(timeout: 3))
    target.tap()
    target.typeText("17:00:00")
    app.buttons["Enregistrer"].tap()
    let course = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Objectif iPhone"))
      .firstMatch
    XCTAssertTrue(course.waitForExistence(timeout: 5))
    course.tap()
    XCTAssertTrue(app.staticTexts["Ton scénario"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["17 h 00"].exists)
    XCTAssertTrue(
      app.descendants(matching: .any).matching(
        NSPredicate(format: "label CONTAINS %@", "10:12 /km")
      ).firstMatch.exists)
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = "Course iPhone hors ligne"
    attachment.lifetime = .keepAlways
    add(attachment)
    app.tabBars.buttons["Profil"].tap()
    XCTAssertTrue(app.buttons["Enregistrer le serveur"].waitForExistence(timeout: 3))
  }
}
