// Röbel "Events" home-screen widget (kind "EventsThisWeek", kept from the former
// "Diese Woche" widget so placed widgets survive the update).
//
// Reads the payload the app writes into the shared App Group (key "widget.events.v1",
// shape: EventsPayload in apps/expo/lib/widget-content.ts). Layout per family, as on
// Android (apps/expo/widgets/content-widgets.tsx):
//   - systemSmall: photo of the next event, red date line, two-line title
//   - systemMedium: "Events in Röbel" + as many rows as fit
//   - systemLarge / ExtraLarge: header + hero card of the next event + rows that fit
// WidgetKit cannot scroll, so the rows are counted to fit — never a half row.
import SwiftUI
import UIKit
import WidgetKit

private let eventsKey = "widget.events.v1"
private let eventsURL = URL(string: "roebel://events")!

struct WidgetEvent: Decodable, Identifiable {
  let id: String
  let title: String
  let weekday: String
  let day: String
  /// Missing in payloads of app versions before the responsive widgets.
  let month: String?
  let time: String?
  let location: String
  /// Base64 JPEG (first event only) or "asset:<name>" (gallery sample).
  let image: String?
  let url: String

  /// "Mo. 12.10 · 19:00" — eventDateLine in apps/expo/lib/widget-layout.ts.
  var dateLine: String {
    let date = month.map { "\(weekday). \(day).\($0)" } ?? "\(weekday). \(day)."
    guard let time, !time.isEmpty else { return date }
    return "\(date) · \(time)"
  }

  /// "19:00 · Venue"
  var metaLine: String {
    [time ?? "", location].filter { !$0.isEmpty }.joined(separator: " · ")
  }

  var link: URL { URL(string: url) ?? eventsURL }
}

struct EventsPayload: Decodable {
  let v: Int
  let place: String?
  let events: [WidgetEvent]
}

struct EventsEntry: TimelineEntry {
  let date: Date
  let place: String
  let events: [WidgetEvent]
}

private func loadEvents() -> EventsEntry {
  guard
    let raw = UserDefaults(suiteName: widgetAppGroup)?.string(forKey: eventsKey),
    let data = raw.data(using: .utf8),
    let payload = try? JSONDecoder().decode(EventsPayload.self, from: data)
  else { return EventsEntry(date: Date(), place: "Röbel", events: []) }
  return EventsEntry(date: Date(), place: payload.place ?? "Röbel", events: payload.events)
}

/// Widget gallery content (real Röbel events, bundled photo) when no payload exists yet.
private let sampleEvents = EventsEntry(
  date: Date(),
  place: "Röbel",
  events: [
    WidgetEvent(id: "s1", title: "Jubiläumskonzert", weekday: "Fr", day: "20", month: "11", time: "19:00",
                location: "Marienkirche Röbel", image: "asset:previewEvent", url: "roebel://events"),
    WidgetEvent(id: "s2", title: "16. Herbst-Volleyball-Turnier", weekday: "Sa", day: "21", month: "11", time: "09:00",
                location: "Gotthunskamp", image: nil, url: "roebel://events"),
    WidgetEvent(id: "s3", title: "Infoabend Röbel App", weekday: "Mi", day: "25", month: "11", time: "18:00",
                location: "Jugendhaus Röbel", image: nil, url: "roebel://events"),
    WidgetEvent(id: "s4", title: "Röwelscher Wiehnachtsmarkt", weekday: "Fr", day: "27", month: "11", time: "13:00",
                location: "Marktplatz Röbel", image: nil, url: "roebel://events"),
    WidgetEvent(id: "s5", title: "Weihnachtsbasteln für Kinder", weekday: "Fr", day: "27", month: "11", time: "14:00",
                location: "Stadtbibliothek Röbel/Müritz", image: nil, url: "roebel://events"),
    WidgetEvent(id: "s6", title: "Weihnachtskonzert der Blaskapelle Röbel", weekday: "Sa", day: "5", month: "12", time: "15:30",
                location: "Schule am Gotthunskamp", image: nil, url: "roebel://events"),
  ]
)

struct EventsProvider: TimelineProvider {
  func placeholder(in context: Context) -> EventsEntry { sampleEvents }

  func getSnapshot(in context: Context, completion: @escaping (EventsEntry) -> Void) {
    let entry = loadEvents()
    completion(context.isPreview && entry.events.isEmpty ? sampleEvents : entry)
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<EventsEntry>) -> Void) {
    completion(Timeline(entries: [loadEvents()], policy: .never))
  }
}

// MARK: - Pieces

private let rowHeight: CGFloat = 52
private let rowGap: CGFloat = 12
private let headerHeight: CGFloat = 28
private let headerGap: CGFloat = 12
/// Longest side the hero / 2×2 photo is decoded at (sharp on 3× screens).
private let heroMaxSide: CGFloat = 900

/// Calendar tile: bordered rounded square, weekday on a grey band at the top ("MI"),
/// the day big below ("14"). `solid` = white tile on top of a photo (hero card).
struct DateTileView: View {
  let event: WidgetEvent
  var size: CGFloat = 52
  var solid = false

  var body: some View {
    let radius = size * 0.22
    let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
    VStack(spacing: 0) {
      Text(event.weekday.uppercased())
        .font(.system(size: size * 0.21, weight: .medium))
        .foregroundColor(solid ? Color(white: 0.22) : Color("widgetSub"))
        .frame(maxWidth: .infinity)
        .frame(height: size * 0.36)
        .background(solid ? Color(white: 0.95) : Color("widgetBand"))
      Text(event.day)
        .font(.system(size: size * 0.4, weight: .semibold))
        .foregroundColor(solid ? .black : Color("widgetText"))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .frame(width: size, height: size)
    .background(solid ? Color.white : Color("$widgetBackground"))
    .clipShape(shape)
    .overlay(shape.stroke(solid ? Color.white : Color("widgetBorder"), lineWidth: 1))
  }
}

/// The event photo filling its frame without stretching: a flyer (clearly narrower than
/// the frame, usually A4) is shown whole over a blurred copy of itself, as in the app;
/// anything else is centre-cropped.
struct EventPhotoView: View {
  let image: UIImage

  var body: some View {
    GeometryReader { geo in
      let aspect = image.size.height > 0 ? image.size.width / image.size.height : 1
      let boxAspect = geo.size.height > 0 ? geo.size.width / geo.size.height : 1
      if aspect < boxAspect * 0.8 {
        ZStack {
          Image(uiImage: image).resizable().scaledToFill()
            .frame(width: geo.size.width, height: geo.size.height)
            .blur(radius: 18)
            .clipped()
          Color.black.opacity(0.22)
          Image(uiImage: image).resizable().scaledToFit()
            .frame(width: geo.size.width, height: geo.size.height)
        }
      } else {
        Image(uiImage: image).resizable().scaledToFill()
          .frame(width: geo.size.width, height: geo.size.height)
          .clipped()
      }
    }
  }
}

struct EventRowView: View {
  let event: WidgetEvent

  var body: some View {
    HStack(spacing: 14) {
      DateTileView(event: event, size: rowHeight)
      VStack(alignment: .leading, spacing: 3) {
        Text(event.title)
          .font(.system(size: 16, weight: .medium))
          .foregroundColor(Color("widgetText"))
          .lineLimit(1)
        if !event.metaLine.isEmpty {
          Text(event.metaLine)
            .font(.system(size: 13))
            .foregroundColor(Color("widgetSub"))
            .lineLimit(1)
        }
      }
      Spacer(minLength: 0)
    }
    .frame(height: rowHeight)
  }
}

/// Photo of the next event, dark gradient, white title + "Venue · 19:00", date tile top right.
struct EventHeroView: View {
  let event: WidgetEvent

  private var meta: String {
    [event.location, event.time ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
  }

  var body: some View {
    GeometryReader { geo in
      ZStack(alignment: .bottomLeading) {
        if let img = widgetImage(event.image, maxSide: heroMaxSide) {
          EventPhotoView(image: img)
        } else {
          Color("$accent")
        }
        LinearGradient(colors: [.clear, .black.opacity(0.75)], startPoint: .top, endPoint: .bottom)
        VStack(alignment: .leading, spacing: 3) {
          Text(event.title)
            .font(.system(size: 18, weight: .semibold))
            .foregroundColor(.white)
            .lineLimit(2)
          if !meta.isEmpty {
            Text(meta)
              .font(.system(size: 13))
              .foregroundColor(.white.opacity(0.88))
              .lineLimit(1)
          }
        }
        .padding(14)
      }
      .frame(width: geo.size.width, height: geo.size.height)
      .overlay(alignment: .topTrailing) {
        DateTileView(event: event, size: 46, solid: true).padding(10)
      }
      .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
  }
}

// MARK: - Layouts

struct EventsWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: EventsEntry

  var body: some View {
    if let first = entry.events.first {
      switch family {
      case .systemSmall:
        compact(first)
      case .systemMedium:
        list(hero: false)
      default:
        list(hero: true)
      }
    } else {
      Text("Keine anstehenden Events")
        .font(.system(size: 13, weight: .medium))
        .foregroundColor(Color("widgetSub"))
        .multilineTextAlignment(.center)
        .widgetURL(eventsURL)
    }
  }

  /// 2×2: photo (badge top right), red date line, two-line title. One tap target.
  private func compact(_ event: WidgetEvent) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      ZStack {
        Color("widgetTileFallback")
        if let img = widgetImage(event.image, maxSide: heroMaxSide) {
          EventPhotoView(image: img)
        } else {
          DateTileView(event: event, size: 52)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay(alignment: .topTrailing) { AppBadge(size: 20).padding(6) }

      Text(event.dateLine)
        .font(.system(size: 11, weight: .medium))
        .foregroundColor(Color("widgetRed"))
        .lineLimit(1)
        .padding(.top, 6)
      Text(event.title)
        .font(.system(size: 13, weight: .semibold))
        .foregroundColor(Color("widgetText"))
        .lineLimit(2)
        .fixedSize(horizontal: false, vertical: true)
    }
    .widgetURL(event.link)
  }

  private func header() -> some View {
    Link(destination: eventsURL) {
      HStack {
        Text("Events in \(entry.place)")
          .font(.system(size: 18, weight: .medium))
          .foregroundColor(Color("widgetText"))
          .lineLimit(1)
        Spacer(minLength: 4)
        AppBadge(size: 26)
      }
      .frame(height: headerHeight)
    }
  }

  /// Header, optional hero card, then exactly the rows that fit. The hero takes the
  /// space the rows leave (at least 110 pt), so nothing is cut and nothing gapes.
  private func list(hero: Bool) -> some View {
    GeometryReader { geo in
      let space = geo.size.height - headerHeight - headerGap
      let rowsAvailable = hero ? space - 110 - rowGap : space
      let rowEvents = hero ? Array(entry.events.dropFirst()) : entry.events
      let count = min(rowEvents.count, widgetRowsThatFit(rowsAvailable, rowHeight: rowHeight, gap: rowGap))
      let rowsBlock = count > 0 ? CGFloat(count) * rowHeight + CGFloat(count - 1) * rowGap : 0
      let heroHeight = min(220, space - (count > 0 ? rowsBlock + rowGap : 0))

      VStack(alignment: .leading, spacing: 0) {
        header().padding(.bottom, headerGap)
        if hero, let first = entry.events.first {
          Link(destination: first.link) { EventHeroView(event: first) }
            .frame(height: heroHeight)
            .padding(.bottom, count > 0 ? rowGap : 0)
        }
        VStack(spacing: rowGap) {
          ForEach(rowEvents.prefix(count)) { event in
            Link(destination: event.link) { EventRowView(event: event) }
          }
        }
        Spacer(minLength: 0)
      }
    }
  }
}

struct EventsWidget: Widget {
  let kind = "EventsThisWeek"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: EventsProvider()) { entry in
      EventsWidgetView(entry: entry)
        .containerBackground(Color("$widgetBackground"), for: .widget)
    }
    .configurationDisplayName("Events")
    .description("Die nächsten Events in Röbel.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .systemExtraLarge])
  }
}
