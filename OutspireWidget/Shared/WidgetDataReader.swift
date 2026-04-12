import Foundation

/// Read-only access to App Group UserDefaults for the widget extension.
/// Write operations are in the main app's WidgetDataManager.
enum WidgetDataReader {
    private static let suiteName = "group.dev.wrye.Outspire"

    private static var shared: UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    static func readTimetable() -> [[String]] {
        guard let data = shared?.data(forKey: "widgetTimetable"),
              let timetable = try? JSONDecoder().decode([[String]].self, from: data)
        else { return [] }
        return timetable
    }

    static func readAuthState() -> Bool {
        shared?.bool(forKey: "widgetAuthState") ?? false
    }

    static func readHolidayMode() -> (enabled: Bool, hasEndDate: Bool, endDate: Date) {
        let enabled = shared?.bool(forKey: "widgetHolidayMode") ?? false
        let hasEndDate = shared?.bool(forKey: "widgetHolidayHasEndDate") ?? false
        let endDate = shared?.object(forKey: "widgetHolidayEndDate") as? Date ?? Date()
        return (enabled, hasEndDate, endDate)
    }
}
