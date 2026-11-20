// Every Röbel home-screen widget of this extension (see expo-target.config.js).
import SwiftUI
import WidgetKit

@main
struct RoebelWidgets: WidgetBundle {
  var body: some Widget {
    MiniAppsWidget()
    LunchWidget()
    EventsWidget()
  }
}
