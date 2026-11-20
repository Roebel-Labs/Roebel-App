// Röbel "Mini Apps" home-screen widget.
//
// Reads the payload the app writes into the shared App Group (key "widget.payload.v1",
// see apps/expo/lib/widget-payload.ts for the shape) and draws the same tiles as the
// Mini-Apps section on Erkunden: rounded icon, name below. The recently opened apps
// come first, the store tile ("Mini-Apps entdecken") is always last. Grid and icon size
// follow miniAppsGrid in apps/expo/lib/widget-layout.ts: few items grow to fill the
// widget, many shrink into a grid. The timeline never refreshes itself — the app reloads
// it after every sync (ExtensionStorage.reloadWidget).
import SwiftUI
import UIKit
import WidgetKit

private let appGroup = "group.com.maxbrych.roebelonchain.widgets"
private let payloadKey = "widget.payload.v1"
private let storeURL = URL(string: "roebel://mini-apps")!

struct WidgetApp: Decodable, Identifiable {
  let slug: String
  let name: String
  let color: String?
  let icon: String?
  let unread: Bool
  let url: String
  var id: String { slug }
}

struct WidgetPayload: Decodable {
  let v: Int
  let apps: [WidgetApp]
}

struct MiniAppsEntry: TimelineEntry {
  let date: Date
  let apps: [WidgetApp]
}

private func loadApps() -> [WidgetApp] {
  guard
    let raw = UserDefaults(suiteName: appGroup)?.string(forKey: payloadKey),
    let data = raw.data(using: .utf8),
    let payload = try? JSONDecoder().decode(WidgetPayload.self, from: data)
  else { return [] }
  return payload.apps
}

/// Widget gallery content (real Röbel mini apps, bundled icons) when no payload exists yet.
private let sampleApps: [WidgetApp] = [
  ("roebel-wertstoffhof-abfalltouren", "ABFALLzeiten", "previewAppAbfall"),
  ("buergerbus-roebel", "Bürgerbus Röbel", "previewAppBus"),
  ("stadtfuehrung-roebel-mueritz", "Stadtführung", "previewAppStadt"),
  ("roebel-quiz", "Röbel-Quiz", "previewAppQuiz"),
  ("roebel-verwaltung-politik", "Verwaltung & Politik", "previewAppPolitik"),
  ("roebel-sitzungen-store-v3", "Ausschuss-Sitzungen", "previewAppSitzungen"),
  ("mueritzphone", "MüritzPhone", "previewAppPhone"),
].map { slug, name, asset in
  WidgetApp(slug: slug, name: name, color: "#00498B", icon: "asset:\(asset)", unread: false, url: "roebel://mini-apps")
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> MiniAppsEntry {
    MiniAppsEntry(date: Date(), apps: sampleApps)
  }

  func getSnapshot(in context: Context, completion: @escaping (MiniAppsEntry) -> Void) {
    let apps = loadApps()
    completion(MiniAppsEntry(date: Date(), apps: context.isPreview && apps.isEmpty ? sampleApps : apps))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<MiniAppsEntry>) -> Void) {
    completion(Timeline(entries: [MiniAppsEntry(date: Date(), apps: loadApps())], policy: .never))
  }
}

private extension Color {
  init?(hex: String?) {
    guard var s = hex?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return nil }
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
    self.init(
      red: Double((v >> 16) & 0xFF) / 255,
      green: Double((v >> 8) & 0xFF) / 255,
      blue: Double(v & 0xFF) / 255
    )
  }
}

/// Same look as AppIcon in components/miniapp/MiniAppCard.tsx: 24 % corner radius,
/// primary color behind the icon, first letter when there is no icon.
struct AppIconView: View {
  let app: WidgetApp
  let size: CGFloat

  var body: some View {
    ZStack(alignment: .topTrailing) {
      ZStack {
        Color(hex: app.color) ?? Color("widgetTileFallback")
        if let img = widgetImage(app.icon, maxSide: 192) {
          Image(uiImage: img).resizable().scaledToFill()
        } else {
          Text(String(app.name.prefix(1)).uppercased())
            .font(.system(size: size * 0.4, weight: .bold))
            .foregroundColor(.white)
        }
      }
      .frame(width: size, height: size)
      .clipShape(RoundedRectangle(cornerRadius: size * 0.24, style: .continuous))

      if app.unread {
        Circle()
          .fill(Color(red: 1, green: 0.231, blue: 0.188))
          .frame(width: max(8, size * 0.2), height: max(8, size * 0.2))
          .overlay(Circle().stroke(Color("$widgetBackground"), lineWidth: 2))
          .offset(x: size * 0.08, y: -size * 0.08)
      }
    }
    .frame(width: size, height: size)
  }
}

struct TileLabel: View {
  let text: String
  var size: CGFloat = 11
  var body: some View {
    Text(text)
      .font(.system(size: size, weight: .medium))
      .foregroundColor(Color("widgetText"))
      .lineLimit(1)
      .truncationMode(.tail)
  }
}

struct AppTile: View {
  let app: WidgetApp
  let size: CGFloat
  let label: CGFloat?
  var body: some View {
    VStack(spacing: 4) {
      AppIconView(app: app, size: size)
      if let label { TileLabel(text: app.name, size: label) }
    }
  }
}

struct StoreTile: View {
  let size: CGFloat
  let label: CGFloat?
  let text: String
  var body: some View {
    VStack(spacing: 4) {
      Image("storeIcon").resizable().scaledToFit().frame(width: size, height: size)
      if let label { TileLabel(text: text, size: label) }
    }
  }
}

/// Port of miniAppsGrid (apps/expo/lib/widget-layout.ts) for the inner widget size.
struct MiniAppsGrid {
  let cols: Int
  let rows: Int
  let icon: CGFloat
  let labels: Bool
  let labelSize: CGFloat
  let apps: Int

  init(appCount: Int, size: CGSize) {
    let w = max(0, size.width)
    let h = max(0, size.height)
    let labels = h >= 58
    let maxCols = min(6, max(1, Int(w / (labels ? 60 : 52))))
    let maxRows = min(4, max(1, Int(h / (labels ? 60 : 44))))
    let apps = min(max(0, appCount), maxCols * maxRows - 1)
    let items = apps + 1
    let below: CGFloat = labels ? 24 : 6
    var best = (cols: 1, rows: 1, icon: CGFloat(-1))
    for cols in 1...max(1, min(items, maxCols)) {
      let rows = Int(ceil(Double(items) / Double(cols)))
      if rows > maxRows { continue }
      let icon = min(w / CGFloat(cols) - 12, h / CGFloat(rows) - below)
      if icon > best.icon + 0.5 { best = (cols, rows, icon) }
    }
    self.cols = best.cols
    self.rows = best.rows
    self.icon = min(84, max(24, best.icon.rounded(.down)))
    self.labels = labels
    self.labelSize = self.icon >= 64 ? 13 : 11
    self.apps = apps
  }
}

struct MiniAppsWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: MiniAppsEntry

  private enum Slot: Identifiable {
    case app(WidgetApp)
    case store
    var id: String {
      switch self {
      case .app(let a): return a.slug
      case .store: return "__store"
      }
    }
  }

  var body: some View {
    GeometryReader { geo in
      let grid = MiniAppsGrid(appCount: entry.apps.count, size: geo.size)
      let slots: [Slot] = entry.apps.prefix(grid.apps).map { Slot.app($0) } + [.store]
      let colWidth = geo.size.width / CGFloat(grid.cols)
      let rowHeight = geo.size.height / CGFloat(grid.rows)
      VStack(spacing: 0) {
        ForEach(0..<grid.rows, id: \.self) { r in
          HStack(spacing: 0) {
            ForEach(slots[min(slots.count, r * grid.cols)..<min(slots.count, r * grid.cols + grid.cols)]) { slot in
              tile(slot, grid: grid, colWidth: colWidth).frame(width: colWidth, height: rowHeight)
            }
          }
          .frame(maxWidth: .infinity)
        }
      }
      .frame(width: geo.size.width, height: geo.size.height)
    }
    // Small widgets have a single tap target: open the store.
    .widgetURL(family == .systemSmall || entry.apps.isEmpty ? storeURL : nil)
  }

  @ViewBuilder
  private func tile(_ slot: Slot, grid: MiniAppsGrid, colWidth: CGFloat) -> some View {
    let label: CGFloat? = grid.labels ? grid.labelSize : nil
    switch slot {
    case .app(let app):
      if family == .systemSmall {
        AppTile(app: app, size: grid.icon, label: label)
      } else {
        Link(destination: URL(string: app.url) ?? storeURL) { AppTile(app: app, size: grid.icon, label: label) }
      }
    case .store:
      let text = grid.apps == 0 || colWidth >= 120 ? "Mini-Apps entdecken" : "Entdecken"
      if family == .systemSmall {
        StoreTile(size: grid.icon, label: label, text: text)
      } else {
        Link(destination: storeURL) { StoreTile(size: grid.icon, label: label, text: text) }
      }
    }
  }
}

struct MiniAppsWidget: Widget {
  let kind = "MiniApps"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      MiniAppsWidgetView(entry: entry)
        .containerBackground(Color("$widgetBackground"), for: .widget)
    }
    .configurationDisplayName("Mini Apps")
    .description("Deine zuletzt geöffneten Mini Apps auf einen Blick.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .systemExtraLarge])
  }
}
