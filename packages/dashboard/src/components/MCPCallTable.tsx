"use client";

import type { TraceEvent } from "@/lib/types";
import { EVENT_COLORS, EVENT_LABELS } from "@/lib/types";

interface Props {
  events: TraceEvent[];
  onSelectSpan: (spanId: string) => void;
}

export function MCPCallTable({ events, onSelectSpan }: Props) {
  if (events.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--overlay1)" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📡</div>
        <div>No events yet</div>
      </div>
    );
  }

  return (
    <div style={{ overflow: "auto", maxHeight: "100%" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 60 }}>#</th>
            <th style={{ width: 80 }}>Type</th>
            <th style={{ width: 100 }}>Server</th>
            <th>Tool</th>
            <th style={{ width: 60 }}>Dir</th>
            <th style={{ width: 80 }}>Duration</th>
            <th style={{ width: 180 }}>Time</th>
          </tr>
        </thead>
        <tbody>
          {events
            .slice()
            .reverse()
            .map((event, i) => (
              <tr
                key={event.span_id}
                onClick={() => onSelectSpan(event.span_id)}
                style={{ cursor: "pointer" }}
              >
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--overlay1)" }}>
                  {events.length - i}
                </td>
                <td>
                  <span
                    className="event-badge"
                    style={{
                      background: `${EVENT_COLORS[event.type]}22`,
                      color: EVENT_COLORS[event.type],
                    }}
                  >
                    {EVENT_LABELS[event.type] || event.type}
                  </span>
                </td>
                <td style={{ color: "var(--subtext0)" }}>{event.server_name}</td>
                <td>
                  <code style={{ fontSize: 11, color: "var(--sky)" }}>
                    {event.tool_name || "-"}
                  </code>
                </td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--overlay1)" }}>
                  {event.direction === "request" ? "→" : "←"}
                </td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--subtext0)" }}>
                  {event.metadata?.duration_ms ? `${event.metadata.duration_ms}ms` : "-"}
                </td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--overlay1)" }}>
                  {new Date(event.timestamp).toLocaleTimeString()}.{new Date(event.timestamp).getMilliseconds().toString().padStart(3, "0")}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
