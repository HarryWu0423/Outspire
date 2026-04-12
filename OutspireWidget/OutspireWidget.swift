import SwiftUI
import WidgetKit

struct SmallClassWidget: Widget {
    let kind = "SmallClassWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ClassWidgetProvider()) { entry in
            SmallWidgetView(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Class")
        .description("Current or upcoming class countdown")
        .supportedFamilies([.systemSmall])
        .contentMarginsDisabled()
    }
}
