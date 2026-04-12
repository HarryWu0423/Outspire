import Foundation

struct SchoolCalendar: Codable {
    let school: String
    let academicYear: String
    let semesters: [Semester]
    let specialDays: [SpecialDay]

    struct Semester: Codable {
        let start: String // "YYYY-MM-DD"
        let end: String
    }

    struct SpecialDay: Codable {
        let date: String // "YYYY-MM-DD"
        let type: String // "exam", "event", "notice", "makeup"
        let name: String
        let cancelsClasses: Bool
        let track: String // "all", "ibdp", "alevel"
        let grades: [String] // ["all"] or ["2023", "2024"]
        let followsWeekday: Int? // 1=Mon..5=Fri, for makeup days

        func appliesTo(track userTrack: StudentInfo.Track, entryYear: String) -> Bool {
            let trackMatch = (track == "all" || track == userTrack.rawValue)
            let gradeMatch = grades.contains("all") || grades.contains(entryYear)
            return trackMatch && gradeMatch
        }
    }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    func isInSemester(_ date: Date) -> Bool {
        let dateStr = Self.dateFormatter.string(from: date)
        return semesters.contains { dateStr >= $0.start && dateStr <= $0.end }
    }

    func specialDay(for date: Date, track: StudentInfo.Track, entryYear: String) -> SpecialDay? {
        let dateStr = Self.dateFormatter.string(from: date)
        return specialDays.first { $0.date == dateStr && $0.appliesTo(track: track, entryYear: entryYear) }
    }
}
