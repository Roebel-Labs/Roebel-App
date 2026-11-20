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

struct LunchProvider: TimelineProvider {
  private func entry() -> LunchEntry {
    LunchEntry(date: Date(), restaurants: loadLunch(), page: storedPage())
  }

  func placeholder(in context: Context) -> LunchEntry {
    LunchEntry(date: Date(), restaurants: [], page: 0)
  }

  func getSnapshot(in context: Context, completion: @escaping (LunchEntry) -> Void) {
    completion(entry())
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
          if let b64 = dish.image, let data = Data(base64Encoded: b64), let img = UIImage(data: data) {
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
          .foregroundColor(.secondary)
          .lineLimit(1)
      }
    }
  }
}

struct LunchWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: LunchEntry

  private var columns: Int { family == .systemSmall ? 1 : 2 }
  private var rows: Int { family == .systemLarge ? 2 : 1 }

  var body: some View {
    if entry.restaurants.isEmpty {
      Text("Heute kein Mittagstisch")
        .font(.system(size: 13, weight: .semibold))
        .foregroundColor(.secondary)
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
    HStack(spacing: 4) {
      Link(destination: lunchURL) {
        Text(name)
          .font(.system(size: 14, weight: .bold))
          .foregroundColor(Color("widgetText"))
          .lineLimit(1)
      }
      Spacer(minLength: 4)
      if count > 1 {
        Button(intent: LunchStepIntent(step: -1)) {
          Image(systemName: "chevron.left").font(.system(size: 13, weight: .bold))
        }
        .buttonStyle(.plain)
        .foregroundColor(Color("$accent"))
        Text("\(idx + 1)/\(count)")
          .font(.system(size: 11))
          .foregroundColor(.secondary)
        Button(intent: LunchStepIntent(step: 1)) {
          Image(systemName: "chevron.right").font(.system(size: 13, weight: .bold))
        }
        .buttonStyle(.plain)
        .foregroundColor(Color("$accent"))
      }
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
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
