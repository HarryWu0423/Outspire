import Foundation

struct StudentInfo {
    let entryYear: String
    let classNumber: Int
    let track: Track

    enum Track: String, Codable {
        case ibdp, alevel
    }

    /// Parse WFLA student code: "20238123" / "s20238123" -> entry year 2023, class 1, IBDP
    /// Format: [4 digits year][1 ignored][1 class number][2 seat number]
    init?(userCode: String) {
        let normalizedCode = userCode.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "s", with: "", options: [.caseInsensitive, .anchored])
        guard normalizedCode.count >= 6 else { return nil }

        self.entryYear = String(normalizedCode.prefix(4))
        let classIndex = normalizedCode.index(normalizedCode.startIndex, offsetBy: 5)
        guard let num = Int(String(normalizedCode[classIndex])), num >= 1, num <= 9 else { return nil }
        self.classNumber = num
        self.track = num >= 7 ? .alevel : .ibdp
    }
}
