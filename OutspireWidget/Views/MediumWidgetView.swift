import SwiftUI
import WidgetKit

struct MediumWidgetView: View {
    let entry: ClassWidgetEntry

    var body: some View {
        switch entry.status {
        case .notAuthenticated:
            mediumPlaceholder("Sign in to see your schedule")
        case .holiday:
            mediumPlaceholder("Holiday — enjoy your day off!")
        case .noClasses, .completed:
            mediumPlaceholder("No more classes today")
        default:
            timelineView
        }
    }

    private var timelineView: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("TODAY")
                        .captionStyle()
                        .foregroundStyle(.white.opacity(0.55))
                        .textCase(.uppercase)

                    Text(dayString)
                        .captionStyle()
                        .foregroundStyle(.white.opacity(0.4))
                }

                Spacer()

                if let cls = entry.currentClass, entry.status == .ongoing || entry.status == .ending {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(timerInterval: cls.startTime ... cls.endTime, countsDown: true)
                            .numberStyle(size: 20)
                            .foregroundStyle(SubjectColors.color(for: cls.className))
                            .tracking(-0.5)

                        Text("REMAINING")
                            .captionStyle()
                            .foregroundStyle(.white.opacity(0.4))
                    }
                }
            }

            Spacer(minLength: 8)

            // Timeline
            VStack(alignment: .leading, spacing: 0) {
                if let current = entry.currentClass {
                    timelineRow(cls: current, isActive: true)
                }

                ForEach(entry.upcomingClasses.prefix(2)) { cls in
                    timelineSeparator()
                    timelineRow(cls: cls, isActive: false)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func timelineRow(cls: ScheduledClass, isActive: Bool) -> some View {
        HStack(spacing: 10) {
            Circle()
                .fill(SubjectColors.color(for: cls.className))
                .frame(width: isActive ? 8 : 6, height: isActive ? 8 : 6)
                .shadow(
                    color: isActive ? SubjectColors.color(for: cls.className).opacity(0.6) : .clear,
                    radius: isActive ? 4 : 0
                )

            Text(cls.className)
                .titleStyle(size: 14)
                .foregroundStyle(isActive ? SubjectColors.color(for: cls.className) : .white.opacity(0.45))
                .lineLimit(1)

            Spacer()

            Text(timeRange(cls))
                .captionStyle()
                .foregroundStyle(.white.opacity(0.4))
        }
        .padding(.vertical, 5)
    }

    private func timelineSeparator() -> some View {
        Rectangle()
            .fill(.white.opacity(0.06))
            .frame(width: 2, height: 5)
            .padding(.leading, 2)
    }

    private func timeRange(_ cls: ScheduledClass) -> String {
        let f = Self.timeFormatter
        return "\(f.string(from: cls.startTime)) – \(f.string(from: cls.endTime))"
    }

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "H:mm"
        return f
    }()

    private var dayString: String {
        let f = DateFormatter()
        f.dateFormat = "EEEE"
        let classCount = (entry.currentClass != nil ? 1 : 0) + entry.upcomingClasses.count
        return "\(f.string(from: entry.date)) · \(classCount) classes"
    }

    private func mediumPlaceholder(_ message: String) -> some View {
        VStack {
            Spacer()
            Text(message)
                .titleStyle(size: 15)
                .foregroundStyle(.white.opacity(0.5))
                .multilineTextAlignment(.center)
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(16)
    }
}
