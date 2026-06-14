"use client";

import { useWebSocket } from "@/lib/useWebSocket";
import { Timeline } from "@/components/Timeline";
import { TraceDetail } from "@/components/TraceDetail";
import { MCPCallTable } from "@/components/MCPCallTable";
import { SkillPanel } from "@/components/SkillPanel";
import { LiveStatus } from "@/components/LiveStatus";
import { useState, useMemo } from "react";
import type { TraceEvent } from "@/lib/types";

export default function Home() {
  const { events, connected, clearEvents } = useWebSocket();
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [view, setView] = useState<"timeline" | "table">("timeline");

  // Group events by trace_id
  const traces = useMemo(() => {
    const map = new Map<string, TraceEvent[]>();
    for (const e of events) {
      const arr = map.get(e.trace_id) || [];
      arr.push(e);
      map.set(e.trace_id, arr);
    }
    return [...map.entries()]
      .map(([trace_id, evts]) => {
        evts.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const first = evts[0].timestamp;
        const last = evts[evts.length - 1].timestamp;
        return {
          trace_id,
          event_count: evts.length,
          duration_ms: new Date(last).getTime() - new Date(first).getTime(),
          start_time: first,
          end_time: last,
          events: evts,
        };
      })
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  }, [events]);

  const selectedTrace = selectedSpanId
    ? traces.find((t) => t.events.some((e) => e.span_id === selectedSpanId)) || null
    : null;

  // Aggregate skill stats
  const skillStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const e of events) {
      const tags = e.metadata?.skill_tags || [];
      for (const tag of tags) {
        stats[tag] = (stats[tag] || 0) + 1;
      }
    }
    return stats;
  }, [events]);

  // Aggregate server stats
  const serverStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const e of events) {
      if (e.server_name) {
        stats[e.server_name] = (stats[e.server_name] || 0) + 1;
      }
    }
    return stats;
  }, [events]);

  return (
    <div className="app-shell">
      {/* ── Top Bar ── */}
      <header className="topbar">
        <h1>
          🔍 MCP Observability <span>· Claude Code</span>
        </h1>
        <div className="topbar-right">
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => setView("timeline")}
              style={{
                padding: "4px 12px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--surface1)",
                background: view === "timeline" ? "var(--surface0)" : "transparent",
                color: "var(--text)",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Timeline
            </button>
            <button
              onClick={() => setView("table")}
              style={{
                padding: "4px 12px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--surface1)",
                background: view === "table" ? "var(--surface0)" : "transparent",
                color: "var(--text)",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Table
            </button>
          </div>
          <LiveStatus connected={connected} eventCount={events.length} />
          <button
            onClick={clearEvents}
            style={{
              padding: "4px 12px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--surface1)",
              background: "transparent",
              color: "var(--overlay1)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Clear
          </button>
        </div>
      </header>

      {/* ── Main Grid ── */}
      <div className="main-grid">
        {/* Timeline Panel */}
        <div className="panel panel-timeline">
          <div className="panel-header">Trace Timeline</div>
          {view === "timeline" ? (
            <Timeline traces={traces} onSelectSpan={setSelectedSpanId} />
          ) : (
            <MCPCallTable events={events} onSelectSpan={setSelectedSpanId} />
          )}
        </div>

        {/* Skills Panel */}
        <div className="panel panel-skills">
          <SkillPanel skillStats={skillStats} serverStats={serverStats} />
        </div>

        {/* Detail Panel */}
        <div className="panel panel-detail">
          <TraceDetail trace={selectedTrace} selectedSpanId={selectedSpanId} />
        </div>
      </div>
    </div>
  );
}
