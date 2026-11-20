// Röbel "Diese Woche" home-screen widget.
//
// Reads the payload the app writes into the shared App Group (key "widget.events.v1",
// shape: EventsPayload in apps/expo/lib/widget-content.ts): date block + title +
// time · place per row. The app reloads the timeline after every sync.
import SwiftUI
import WidgetKit

private let appGroup = "group.com.maxbrych.roebelonchain.widgets"
private let eventsKey = "widget.events.v1"
private let eventsURL = URL(string: "roebel://events")!

struct WidgetEvent: Decodable, Identifiable {
  let id: String
  let title: String
  let weekday: String
  let day: String
  let time: String?
  let location: String
  let url: String
}

struct EventsPayload: Decodable {
  let v: Int
  let events: [WidgetEvent]
}

private func loadEvents() -> [WidgetEvent] {
  guard
    let raw = UserDefaults(suiteName: appGroup)?.string(forKey: eventsKey),
    let data = raw.data(using: .utf8),
    let payload = try? JSONDecoder().decode(EventsPayload.self, from: data)
  else { return [] }
  return payload.events
}

struct EventsEntry: TimelineEntry {
  let date: Date
  let events: [WidgetEvent]
}

struct EventsProvider: TimelineProvider {
  func placeholder(in context: Context) -> EventsEntry {
    EventsEntry(date: Date(), events: [])
  }

  func getSnapshot(in context: Context, completion: @escaping (EventsEntry) -> Void) {
    completion(EventsEntry(date: Date(), events: loadEvents()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<EventsEntry>) -> Void) {
    completion(Timeline(entries: [EventsEntry(date: Date(), events: loadEvents())], policy: .never))
  }
}

struct EventRowView: View {
  let event: WidgetEvent

  private var meta: String {
    [event.time ?? "", event.location].filter { !$0.isEmpty }.joined(separator: " · ")
  }

  var body: some View {
    HStack(spacing: 10) {
      VStack(spacing: 0) {
        Text(event.weekday).font(.system(size: 10, weight: .semibold))
        Text(event.day).font(.system(size: 16, weight: .bold))
      }
      .foregroundColor(Color("$accent"))
      .frame(width: 40, height: 40)
      .background(Color("$accent").opacity(0.12))
      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

      VStack(alignment: .leading, spacing: 1) {
        Text(event.title)
          .font(.system(size: 13, weight: .semibold))
          .foregroundColor(Color("widgetText"))
          .lineLimit(1)
        if !meta.isEmpty {
          Text(meta)
            .font(.system(size: 11))
            .foregroundColor(.secondary)
            .lineLimit(1)
        }
      }
      Spacer(minLength: 0)
    }
  }
}

struct EventsWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: EventsEntry

  private var maxRows: Int {
    switch family {
    case .systemLarge: return 6
    case .systemMedium: return 2
    default: return 2
    }
  }

  var body: some View {
    if entry.events.isEmpty {
      Text("Diese Woche keine Events")
        .font(.system(size: 13, weight: .semibold))
        .foregroundColor(.secondary)
        .multilineTextAlignment(.center)
        .widgetURL(eventsURL)
    } else {
      VStack(alignment: .leading, spacing: 8) {
        Link(destination: eventsURL) {
          Text(family == .systemSmall ? "Diese Woche" : "Diese Woche in Röbel")
            .font(.system(size: 14, weight: .bold))
            .foregroundColor(Color("widgetText"))
        }
        ForEach(entry.events.prefix(maxRows)) { event in
          if family == .systemSmall {
            EventRowView(event: event)
          } else {
            Link(destination: URL(string: event.url) ?? eventsURL) { EventRowView(event: event) }
          }
        }
        Spacer(minLength: 0)
      }
      .widgetURL(family == .systemSmall ? eventsURL : nil)
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
    .configurationDisplayName("Diese Woche")
    .description("Die Events dieser Woche in Röbel.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
