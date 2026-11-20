// Röbel "Mittagstisch" home-screen widget.
//
// Reads the payload the app writes into the shared App Group (key "widget.lunch.v1",
// shape: LunchPayload in apps/expo/lib/widget-content.ts). One page per restaurant;
// the ‹ › buttons (iOS 17 interactive widget, LunchStepIntent) step through them and
// keep the page in the App Group. The app reloads the timeline after every sync.
import AppIntents
import SwiftUI
import UIKit
import WidgetKit

private let appGroup = "group.com.maxbrych.roebelonchain.widgets"
private let lunchKey = "widget.lunch.v1"
private let lunchPageKey = "widget.lunch.page.ios.v1"
private let lunchURL = URL(string: "roebel://explore")!

struct LunchDish: Decodable, Identifiable {
  let id: String
  let name: String
  let price: String?
  let day: String
  let image: String?
  let url: String
}

struct LunchRestaurant: Decodable {
  let name: String
  let dishes: [LunchDish]
}

struct LunchPayload: Decodable {
  let v: Int
  let restaurants: [LunchRestaurant]
}

private func loadLunch() -> [LunchRestaurant] {
  guard
    let raw = UserDefaults(suiteName: appGroup)?.string(forKey: lunchKey),
    let data = raw.data(using: .utf8),
    let payload = try? JSONDecoder().decode(LunchPayload.self, from: data)
  else { return [] }
  return payload.restaurants
}

private func storedPage() -> Int {
  UserDefaults(suiteName: appGroup)?.integer(forKey: lunchPageKey) ?? 0
}

/// ‹ (-1) / › (+1): wraps around; the widget reloads after perform().
struct LunchStepIntent: AppIntent {
  static var title: LocalizedStringResource = "Restaurant wechseln"
  static var isDiscoverable: Bool = false

  @Parameter(title: "Schritt") var step: Int

  init() { step = 1 }
  init(step: Int) { self.step = step }

  func perform() async throws -> some IntentResult {
    let count = loadLunch().count
    if count > 0 {
      let current = storedPage()
      let base = (current >= 0 && current < count) ? current : 0
      let next = ((base + step) % count + count) % count
      UserDefaults(suiteName: appGroup)?.set(next, forKey: lunchPageKey)
    }
    return .result()
  }
}

struct LunchEntry: TimelineEntry {
  let date: Date
  let restaurants: [LunchRestaurant]
  let page: Int
}

/// Widget gallery content (a real Röbel Mittagstisch, bundled photos) when no payload exists yet.
private let sampleLunch = LunchEntry(
  date: Date(),
  restaurants: [
    LunchRestaurant(name: "Bistro zur Waage", dishes: [
      LunchDish(id: "s1", name: "Hackbraten mit Salzkartoffeln u. Speckbohnen", price: "7,50 €", day: "Heute",
                image: "asset:previewDish1", url: "roebel://explore"),
      LunchDish(id: "s2", name: "Kartoffelsuppe mit Bockwurst", price: "7,50 €", day: "Heute",
                image: "asset:previewDish2", url: "roebel://explore"),
      LunchDish(id: "s3", name: "Hamburger Schnitzel mit Bratkartoffeln", price: "7,50 €", day: "Morgen",
                image: "asset:previewDish3", url: "roebel://explore"),
      LunchDish(id: "s4", name: "Spaghetti mit Schinken-Tomatensahnesoße", price: "7,50 €", day: "Morgen",
                image: "asset:previewDish4", url: "roebel://explore"),
    ]),
    LunchRestaurant(name: "Müritz Terrasse", dishes: []),
    LunchRestaurant(name: "Delizia", dishes: []),
  ],
  page: 0
)

struct LunchProvider: TimelineProvider {
  private func entry() -> LunchEntry {
    LunchEntry(date: Date(), restaurants: loadLunch(), page: storedPage())
  }

  func placeholder(in context: Context) -> LunchEntry { sampleLunch }

  func getSnapshot(in context: Context, completion: @escaping (LunchEntry) -> Void) {
    let e = entry()
    completion(context.isPreview && e.restaurants.isEmpty ? sampleLunch : e)
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<LunchEntry>) -> Void) {
    completion(Timeline(entries: [entry()], policy: .never))
  }
}

struct DishTileView: View {
  let dish: LunchDish

  private var meta: String {
    [dish.day, dish.price ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      GeometryReader { geo in
        ZStack {
          Color("widgetTileFallback")
          if let img = widgetImage(dish.image) {
            Image(uiImage: img).resizable().scaledToFill()
          }
        }
        .frame(width: geo.size.width, height: geo.size.height)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      }
      Text(dish.name)
        .font(.system(size: 12, weight: .semibold))
        .foregroundColor(Color("widgetText"))
        .lineLimit(1)
      if !meta.isEmpty {
        Text(meta)
          .font(.system(size: 11))
            .foregroundColor(Color("widgetSub"))
          .lineLimit(1)
      }
    }
  }
}

struct LunchWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: LunchEntry

  /// Same as lunchLayout in apps/expo/lib/widget-layout.ts: small 1 photo, medium 2,
  /// large 2 × 2, extra large (iPad) 3 × 2.
  private var columns: Int {
    switch family {
    case .systemSmall: return 1
    case .systemExtraLarge: return 3
    default: return 2
    }
  }
  private var rows: Int { family == .systemLarge || family == .systemExtraLarge ? 2 : 1 }

  var body: some View {
    if entry.restaurants.isEmpty {
      Text("Heute kein Mittagstisch")
        .font(.system(size: 13, weight: .semibold))
        .foregroundColor(Color("widgetSub"))
        .multilineTextAlignment(.center)
        .widgetURL(lunchURL)
    } else {
      let idx = (entry.page >= 0 && entry.page < entry.restaurants.count) ? entry.page : 0
      let r = entry.restaurants[idx]
      VStack(alignment: .leading, spacing: 6) {
        header(r.name, idx: idx, count: entry.restaurants.count)
        grid(Array(r.dishes.prefix(columns * rows)))
      }
      .widgetURL(family == .systemSmall ? URL(string: r.dishes.first?.url ?? "") ?? lunchURL : nil)
    }
  }

  private func header(_ name: String, idx: Int, count: Int) -> some View {
    HStack(alignment: .center, spacing: 4) {
      Link(destination: lunchURL) {
        Text(name)
          .font(.system(size: 14, weight: .semibold))
          .foregroundColor(Color("widgetText"))
          .lineLimit(1)
      }
      Spacer(minLength: 4)
      if count > 1 { pager(idx: idx, count: count) }
    }
    .frame(height: 24)
  }

  /// ‹ 1/3 › — chevrons black (light) / white (dark), the counter centred between them.
  private func pager(idx: Int, count: Int) -> some View {
    HStack(alignment: .center, spacing: 2) {
      Button(intent: LunchStepIntent(step: -1)) {
        Image(systemName: "chevron.left")
          .font(.system(size: 13, weight: .bold))
          .frame(width: 24, height: 24)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .foregroundColor(Color("widgetArrow"))
      Text("\(idx + 1)/\(count)")
        .font(.system(size: 11, weight: .medium))
        .foregroundColor(Color("widgetSub"))
        .frame(height: 24)
      Button(intent: LunchStepIntent(step: 1)) {
        Image(systemName: "chevron.right")
          .font(.system(size: 13, weight: .bold))
          .frame(width: 24, height: 24)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .foregroundColor(Color("widgetArrow"))
    }
  }

  private func grid(_ dishes: [LunchDish]) -> some View {
    VStack(spacing: 8) {
      ForEach(0..<rows, id: \.self) { r in
        HStack(spacing: 8) {
          ForEach(0..<columns, id: \.self) { c in
            let i = r * columns + c
            if i < dishes.count {
              if family == .systemSmall {
                DishTileView(dish: dishes[i])
              } else {
                Link(destination: URL(string: dishes[i].url) ?? lunchURL) { DishTileView(dish: dishes[i]) }
              }
            } else {
              Color.clear
            }
          }
        }
      }
    }
  }
}

struct LunchWidget: Widget {
  let kind = "Mittagstisch"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LunchProvider()) { entry in
      LunchWidgetView(entry: entry)
        .containerBackground(Color("$widgetBackground"), for: .widget)
    }
    .configurationDisplayName("Mittagstisch")
    .description("Heutige Gerichte der Röbeler Restaurants.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .systemExtraLarge])
  }
}
