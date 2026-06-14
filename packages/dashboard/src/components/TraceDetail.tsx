"use client";

import type { TraceSummary } from "@/lib/types";
import { EVENT_COLORS, EVENT_LABELS } from "@/lib/types";

interface Props {
  trace: TraceSummary | null;
  selectedSpanId: string | null;
}

export function TraceDetail({ trace, selectedSpanId }: Props) {
  if (!trace) {
    return (
      <>
        <div className="panel-header">Event Detail</div>
        <div style={{ padding: 24, textAlign: "center", color: "var(--overlay1)", fontSize: 12 }}>
          Click an event in the Timeline to see details
        </div>
      </>
    );
  }

  const selectedEvent = trace.events.find((e) => e.span_id === selectedSpanId);

  return (
    <>
      <div className="panel-header">
        Event Detail ·{" "}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--overlay0)" }}>
          {trace.trace_id.slice(0, 16)}...
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Trace summary */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 4,
            fontSize: 11,
            padding: "8px",
            background: "var(--surface0)",
            borderRadius: "var(--radius)",
          }}
        >
          <div>
            <span style={{ color: "var(--overlay1)" }}>Events: </span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{trace.event_count}</span>
          </div>
          <div>
            <span style={{ color: "var(--overlay1)" }}>Duration: </span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{trace.duration_ms}ms</span>
          </div>
          <div>
            <span style={{ color: "var(--overlay1)" }}>Start: </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>
              {new Date(trace.start_time).toLocaleTimeString()}
            </span>
          </div>
          <div>
            <span style={{ color: "var(--overlay1)" }}>End: </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>
              {new Date(trace.end_time).toLocaleTimeString()}
            </span>
          </div>
        </div>

        {/* Selected event detail */}
        {selectedEvent ? (
          <div
            style={{
              padding: "8px",
              border: `1px solid ${EVENT_COLORS[selectedEvent.type]}44`,
              borderRadius: "var(--radius)",
              background: `${EVENT_COLORS[selectedEvent.type]}11`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span
                className="event-badge"
                style={{
                  background: `${EVENT_COLORS[selectedEvent.type]}22`,
                  color: EVENT_COLORS[selectedEvent.type],
                }}
              >
                {EVENT_LABELS[selectedEvent.type] || selectedEvent.type}
              </span>
              <span style={{ fontSize: 11, color: "var(--subtext0)" }}>
                {selectedEvent.direction === "request" ? "→" : "←"} {selectedEvent.server_name}
              </span>
              {selectedEvent.metadata?.duration_ms && (
                <span style={{ fontSize: 10, color: "var(--overlay1)", fontFamily: "var(--font-mono)" }}>
                  {selectedEvent.metadata.duration_ms}ms
                </span>
              )}
            </div>

            {selectedEvent.tool_name && (
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: "var(--overlay1)" }}>Tool: </span>
                <code style={{ fontSize: 11, color: "var(--sky)" }}>{selectedEvent.tool_name}</code>
              </div>
            )}

            {selectedEvent.metadata?.skill_tags && selectedEvent.metadata.skill_tags.length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                {selectedEvent.metadata.skill_tags.map((tag) => (
                  <span
                    key={tag}
                    className="event-badge"
                    style={{ background: `${EVENT_COLORS.skill_inferred}22`, color: EVENT_COLORS.skill_inferred }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <details style={{ marginTop: 6 }}>
              <summary style={{ fontSize: 10, color: "var(--overlay1)", cursor: "pointer" }}>Payload</summary>
              <pre
                style={{
                  marginTop: 4,
                  padding: 8,
                  background: "var(--crust)",
                  borderRadius: "var(--radius)",
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text)",
                  overflow: "auto",
                  maxHeight: 200,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {JSON.stringify(selectedEvent.payload, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "var(--overlay1)", padding: "8px 0" }}>
            Click an event marker to view details
          </div>
        )}

        {/* Event list in this trace */}
        <div style={{ fontSize: 11 }}>
          <div style={{ color: "var(--overlay1)", marginBottom: 4, fontWeight: 600 }}>All Events</div>
          {trace.events.map((event, i) => (
            <div
              key={event.span_id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 6px",
                borderBottom: "1px solid var(--surface0)",
                background: event.span_id === selectedSpanId ? "var(--surface0)" : "transparent",
                borderRadius: 3,
              }}
            >
              <span style={{ color: "var(--overlay1)", fontSize: 10, fontFamily: "var(--font-mono)", minWidth: 20 }}>
                #{i + 1}
              </span>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: EVENT_COLORS[event.type],
                  flexShrink: 0,
                }}
              />
              <span style={{ color: "var(--subtext0)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {event.tool_name || event.type}
              </span>
              <span style={{ color: "var(--overlay0)", fontSize: 10, fontFamily: "var(--font-mono)" }}>
                {event.metadata?.duration_ms ? `${event.metadata.duration_ms}ms` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
