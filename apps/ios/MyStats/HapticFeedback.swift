import SwiftUI

private struct AppHapticFeedback<Value: Equatable>: ViewModifier {
  @AppStorage("hapticsEnabled") private var enabled = true
  let feedback: SensoryFeedback
  let trigger: Value
  func body(content: Content) -> some View {
    content.sensoryFeedback(feedback, trigger: trigger) { _, _ in enabled }
  }
}
extension View {
  func appFeedback<Value: Equatable>(_ feedback: SensoryFeedback, trigger: Value) -> some View {
    modifier(AppHapticFeedback(feedback: feedback, trigger: trigger))
  }
}
