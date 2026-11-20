// Röbel "Mini Apps" home-screen widget.
//
// Reads the payload the app writes into the shared App Group (key "widget.payload.v1",
// see apps/expo/lib/widget-payload.ts for the shape) and draws the same tiles as the
// Mini-Apps section on Erkunden: rounded icon, name below, 4-column grid, the last tile
// is "Alle" (store). The timeline never refreshes itself — the app reloads it after
// every sync (ExtensionStorage.reloadWidget).
import SwiftUI
import UIKit
import WidgetKit

private let appGroup = "group.com.maxbrych.roebelonchain.widgets"
private let payloadKey = "widget.payload.v1"
private let storeURL = URL(string: "roebel://mini-apps")!
private let settingsURL = URL(string: "roebel://settings/widget")!

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

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> MiniAppsEntry {
    MiniAppsEntry(date: Date(), apps: [])
  }

  func getSnapshot(in context: Context, completion: @escaping (MiniAppsEntry) -> Void) {
    completion(MiniAppsEntry(date: Date(), apps: loadApps()))
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
        if let b64 = app.icon, let data = Data(base64Encoded: b64), let img = UIImage(data: data) {
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
  var body: some View {
    Text(text)
      .font(.system(size: 11, weight: .medium))
      .foregroundColor(Color("widgetText"))
      .lineLimit(1)
      .truncationMode(.tail)
  }
}

struct AppTile: View {
  let app: WidgetApp
  let size: CGFloat
  var body: some View {
    VStack(spacing: 4) {
      AppIconView(app: app, size: size)
      TileLabel(text: app.name)
    }
  }
}

struct StoreTile: View {
  let size: CGFloat
  var body: some View {
    VStack(spacing: 4) {
      Image("storeIcon").resizable().scaledToFit().frame(width: size, height: size)
      TileLabel(text: "Alle")
    }
  }
}

struct MiniAppsWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: MiniAppsEntry

  private var columns: Int { family == .systemSmall ? 2 : 4 }
  private var rows: Int {
    switch family {
    case .systemLarge: return 4
    default: return 2
    }
  }
  private var iconSize: CGFloat {
    switch family {
    case .systemSmall: return 44
    case .systemLarge: return 54
    default: return 50
    }
  }

  var body: some View {
    if entry.apps.isEmpty {
      VStack(spacing: 8) {
        Image("storeIcon").resizable().scaledToFit().frame(width: 40, height: 40)
        Text("Mini Apps auswählen")
          .font(.system(size: 13, weight: .semibold))
          .foregroundColor(Color("widgetText"))
          .multilineTextAlignment(.center)
      }
      .widgetURL(settingsURL)
    } else {
      grid
    }
  }

  private var grid: some View {
    let slots = columns * rows
    let shown = Array(entry.apps.prefix(slots - 1))
    let layout = Array(repeating: GridItem(.flexible(), spacing: 4), count: columns)
    return VStack {
      LazyVGrid(columns: layout, alignment: .center, spacing: family == .systemLarge ? 10 : 8) {
        ForEach(shown) { app in
          if family == .systemSmall {
            AppTile(app: app, size: iconSize)
          } else {
            Link(destination: URL(string: app.url) ?? storeURL) {
              AppTile(app: app, size: iconSize)
            }
          }
        }
        if family == .systemSmall {
          StoreTile(size: iconSize)
        } else {
          Link(destination: storeURL) { StoreTile(size: iconSize) }
        }
      }
      Spacer(minLength: 0)
    }
    // Small widgets have a single tap target: open the store.
    .widgetURL(family == .systemSmall ? storeURL : nil)
  }
}

@main
struct MiniAppsWidget: Widget {
  let kind = "MiniApps"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      MiniAppsWidgetView(entry: entry)
        .containerBackground(Color("$widgetBackground"), for: .widget)
    }
    .configurationDisplayName("Mini Apps")
    .description("Deine Röbel Mini Apps auf einen Blick.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
