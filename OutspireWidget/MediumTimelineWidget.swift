import SwiftUI
import WidgetKit

struct MediumTimelineWidget: Widget {
    let kind = "MediumTimelineWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ClassWidgetProvider()) { entry in
            MediumWidgetView(entry: entry)
                .containerBackground(Color(red: 0.11, green: 0.11, blue: 0.12), for: .widget)
        }
        .configurationDisplayName("Today's Schedule")
        .description("Timeline view of today's classes")
        .supportedFamilies([.systemMedium])
        .contentMarginsDisabled()
    }
}
