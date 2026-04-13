import ActivityKit
import Foundation

// NOTE: This file must be kept in sync with OutspireWidget/Shared/ClassActivityAttributes.swift
// Both targets need the same ActivityAttributes definition.

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
