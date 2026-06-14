"use client";

import type { TraceEvent, TraceSummary } from "@/lib/types";
import { EVENT_COLORS, EVENT_LABELS } from "@/lib/types";

interface Props {
  traces: TraceSummary[];
  onSelectSpan: (spanId: string) => void;
}

export function Timeline({ traces, onSelectSpan }: Props) {
  if (traces.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--overlay1)" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📡</div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Waiting for MCP events...</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>
          Start Claude Code to see MCP activity in real-time
        </div>
      </div>
    );
  }

  // Find global time bounds
  const allStart = Math.min(...traces.map((t) => new Date(t.start_time).getTime()));
  const allEnd = Math.max(...traces.map((t) => new Date(t.end_time).getTime()));
  const totalDuration = Math.max(allEnd - allStart, 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Time axis */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "var(--overlay1)",
          padding: "0 4px 8px",
          fontFamily: "var(--font-mono)",
        }}
      >
        <span>{new Date(allStart).toLocaleTimeString()}</span>
        <span>{totalDuration}ms total</span>
        <span>{new Date(allEnd).toLocaleTimeString()}</span>
      </div>

      {traces.map((trace) => {
        const traceStart = new Date(trace.start_time).getTime();
        const left = ((traceStart - allStart) / totalDuration) * 100;
        const width = Math.max((trace.duration_ms / totalDuration) * 100, 1);

        return (
          <div key={trace.trace_id} className="animate-in" style={{ marginBottom: 6 }}>
            {/* Trace header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 0",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              <span style={{ color: "var(--overlay1)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
                {trace.trace_id.slice(0, 12)}...
              </span>
              <span style={{ color: "var(--subtext0)" }}>
                {trace.event_count} events · {trace.duration_ms}ms
              </span>
            </div>

            {/* Trace bar */}
            <div
              style={{
                position: "relative",
                height: 28,
                background: "var(--surface0)",
                borderRadius: "var(--radius)",
                overflow: "hidden",
              }}
            >
              {/* Overall trace range indicator */}
              <div
                style={{
                  position: "absolute",
                  left: `${left}%`,
                  width: `${width}%`,
                  height: "100%",
                  background: "var(--surface1)",
                  opacity: 0.4,
                }}
              />

              {/* Individual event spans */}
              {trace.events.map((event) => {
                const evtStart = new Date(event.timestamp).getTime();
                const evtLeft = ((evtStart - allStart) / totalDuration) * 100;
                const color = EVENT_COLORS[event.type] || "var(--overlay0)";

                return (
                  <div
                    key={event.span_id}
                    onClick={() => onSelectSpan(event.span_id)}
                    title={`${EVENT_LABELS[event.type] || event.type}: ${event.tool_name || ""} (${event.server_name})`}
                    style={{
                      position: "absolute",
                      left: `${evtLeft}%`,
                      top: 2,
                      width: 6,
                      height: 24,
                      background: color,
                      borderRadius: 2,
                      cursor: "pointer",
                      transition: "transform 0.1s, box-shadow 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "scaleY(1.1)";
                      e.currentTarget.style.boxShadow = `0 0 8px ${color}`;
                      e.currentTarget.style.zIndex = "10";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "";
                      e.currentTarget.style.boxShadow = "";
                      e.currentTarget.style.zIndex = "";
                    }}
                  />
                );
              })}
            </div>

            {/* Event type legend for this trace */}
            <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              {[...new Set(trace.events.map((e) => e.type))].map((type) => (
                <span
                  key={type}
                  className="event-badge"
                  style={{
                    background: `${EVENT_COLORS[type]}22`,
                    color: EVENT_COLORS[type],
                    border: `1px solid ${EVENT_COLORS[type]}44`,
                  }}
                >
                  {EVENT_LABELS[type] || type}
                </span>
              ))}
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          padding: "12px 0 0",
          borderTop: "1px solid var(--surface0)",
          marginTop: 8,
        }}
      >
        {Object.entries(EVENT_COLORS).map(([type, color]) => (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
            <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
            <span style={{ color: "var(--subtext0)" }}>{EVENT_LABELS[type] || type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
