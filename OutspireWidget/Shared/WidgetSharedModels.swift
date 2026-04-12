import Foundation

struct ScheduledClass: Codable, Hashable, Identifiable {
    var id: Int { periodNumber }
    let periodNumber: Int
    let className: String
    let roomNumber: String
    let teacherName: String
    let startTime: Date
    let endTime: Date
    let isSelfStudy: Bool
}

enum WidgetClassStatus: String, Codable {
    case ongoing
    case ending
    case upcoming
    case `break`
    case event
    case completed
    case noClasses
    case notAuthenticated
    case holiday
}
