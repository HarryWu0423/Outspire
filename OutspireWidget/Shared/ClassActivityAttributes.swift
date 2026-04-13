import ActivityKit
import Foundation

struct ClassActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        enum Phase: String, Codable, Hashable {
            case upcoming
            case ongoing
            case ending
            case breakTime = "break"
            case event
            case done
        }

        var dayKey: String
        var phase: Phase
        var title: String
        var subtitle: String
        var rangeStart: Date
        var rangeEnd: Date
        var nextTitle: String?
        var sequence: Int
    }

    var startDate: Date
}
