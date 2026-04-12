import SwiftUI
import WidgetKit

struct SmallWidgetView: View {
    let entry: ClassWidgetEntry

    var body: some View {
        switch entry.status {
        case .notAuthenticated:
            smallPlaceholder(label: "OUTSPIRE", message: "Sign In", gradient: grayGradient)
        case .holiday:
            smallPlaceholder(label: "HOLIDAY", message: "No Classes", gradient: warmGradient)
        case .noClasses, .completed:
            smallPlaceholder(label: "TODAY", message: "No Classes", gradient: grayGradient)
        case .ongoing, .ending:
            ongoingView
        case .upcoming, .break:
            upcomingView
        case .event:
            smallPlaceholder(label: "TODAY", message: entry.eventName ?? "Event", gradient: purpleGradient)
        }
    }

    private var ongoingView: some View {
        ZStack {
            if let cls = entry.currentClass {
                SubjectColors.gradient(for: cls.className)
            } else {
                grayGradient
            }

            VStack(alignment: .leading, spacing: 0) {
                Text("NOW")
                    .captionStyle()
                    .foregroundStyle(.white.opacity(0.7))
                    .textCase(.uppercase)

                if let cls = entry.currentClass {
                    Text(cls.className)
                        .titleStyle(size: 20)
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .padding(.top, 2)
                }

                Spacer()

                if let cls = entry.currentClass {
                    Text(timerInterval: cls.startTime ... cls.endTime, countsDown: true)
                        .numberStyle(size: 34)
                        .foregroundStyle(.white)
                        .tracking(-1.5)

                    Text(cls.roomNumber.isEmpty ? " " : cls.roomNumber)
                        .captionStyle()
                        .foregroundStyle(.white.opacity(0.55))
                        .padding(.top, 4)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
        }
    }

    private var upcomingView: some View {
        ZStack {
            if let cls = entry.currentClass {
                SubjectColors.gradient(for: cls.className)
            } else {
                grayGradient
            }

            VStack(alignment: .leading, spacing: 0) {
                Text("NEXT")
                    .captionStyle()
                    .foregroundStyle(.white.opacity(0.7))
                    .textCase(.uppercase)

                if let cls = entry.currentClass {
                    Text(cls.className)
                        .titleStyle(size: 20)
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .padding(.top, 2)
                }

                Spacer()

                if let cls = entry.currentClass {
                    let minutesUntil = max(0, Int(cls.startTime.timeIntervalSince(entry.date) / 60))
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        Text("\(minutesUntil)")
                            .numberStyle(size: 34)
                            .foregroundStyle(.white)
                            .tracking(-1.5)
                        Text("min")
                            .titleStyle(size: 20)
                            .foregroundStyle(.white)
                    }

                    Text(cls.roomNumber.isEmpty ? " " : cls.roomNumber)
                        .captionStyle()
                        .foregroundStyle(.white.opacity(0.55))
                        .padding(.top, 4)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
        }
    }

    private func smallPlaceholder(label: String, message: String, gradient: LinearGradient) -> some View {
        ZStack {
            gradient

            VStack(alignment: .leading, spacing: 0) {
                Text(label)
                    .captionStyle()
                    .foregroundStyle(.white.opacity(0.7))
                    .textCase(.uppercase)

                Spacer()

                Text(message)
                    .titleStyle(size: 20)
                    .foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
        }
    }

    private var grayGradient: LinearGradient {
        LinearGradient(colors: [Color.gray.opacity(0.5), Color.gray.opacity(0.3)], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    private var warmGradient: LinearGradient {
        LinearGradient(colors: [Color.orange.opacity(0.6), Color.orange.opacity(0.4)], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    private var purpleGradient: LinearGradient {
        LinearGradient(colors: [Color.purple.opacity(0.6), Color.purple.opacity(0.4)], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}
