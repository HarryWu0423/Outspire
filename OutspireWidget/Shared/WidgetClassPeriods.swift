import Foundation

/// Minimal class periods definition for the widget extension.
/// Mirrors ClassPeriodsManager from the main app.
enum WidgetClassPeriods {
    struct Period {
        let number: Int
        let startTime: Date
        let endTime: Date
    }

    static var today: [Period] {
        let calendar = Calendar.current
        let now = Date()

        let times: [(Int, Int, Int, Int, Int)] = [
            (1, 8, 15, 8, 55),
            (2, 9, 5, 9, 45),
            (3, 9, 55, 10, 35),
            (4, 10, 50, 11, 30),
            (5, 11, 40, 12, 20),
            (6, 13, 30, 14, 10),
            (7, 14, 20, 15, 0),
            (8, 15, 10, 15, 50),
            (9, 15, 50, 16, 30),
        ]

        return times.map { (num, sh, sm, eh, em) in
            let start = calendar.date(bySettingHour: sh, minute: sm, second: 0, of: now)!
            let end = calendar.date(bySettingHour: eh, minute: em, second: 0, of: now)!
            return Period(number: num, startTime: start, endTime: end)
        }
    }
}
