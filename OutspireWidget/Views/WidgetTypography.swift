import SwiftUI

enum WidgetFont {
    /// Style A -- countdown digits
    /// Base: 32px / Semibold / tabular-nums / -1pt tracking
    static func number(size: CGFloat = 32) -> Font {
        .system(size: size, weight: .semibold, design: .rounded)
            .monospacedDigit()
    }

    /// Style B -- class/event name
    /// Base: 17px / Bold / -0.2pt tracking
    static func title(size: CGFloat = 17) -> Font {
        .system(size: size, weight: .bold, design: .rounded)
    }

    /// Style C -- labels, rooms, time ranges
    /// Base: 11px / Semibold / 0.5pt tracking
    static func caption(size: CGFloat = 11) -> Font {
        .system(size: size, weight: .semibold, design: .rounded)
    }
}

extension View {
    func numberStyle(size: CGFloat = 32) -> some View {
        self.font(WidgetFont.number(size: size))
            .tracking(-1)
    }

    func titleStyle(size: CGFloat = 17) -> some View {
        self.font(WidgetFont.title(size: size))
            .tracking(-0.2)
    }

    func captionStyle(size: CGFloat = 11) -> some View {
        self.font(WidgetFont.caption(size: size))
            .tracking(0.5)
    }
}
