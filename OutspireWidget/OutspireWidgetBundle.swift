import SwiftUI
import WidgetKit

@main
struct OutspireWidgetBundle: WidgetBundle {
    var body: some Widget {
        SmallClassWidget()
        MediumTimelineWidget()
        OutspireWidgetLiveActivity()
    }
}
