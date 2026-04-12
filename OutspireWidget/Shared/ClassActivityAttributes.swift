import ActivityKit
import Foundation

struct ClassActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var className: String
        var roomNumber: String
        var status: Status
        var periodStart: Date
        var periodEnd: Date
        var nextClassName: String?

        enum Status: String, Codable {
            case ongoing
            case ending
            case upcoming
            case `break`
            case event
        }
    }

    var startDate: Date
}
