"use client";

interface Props {
  connected: boolean;
  eventCount: number;
}

export function LiveStatus({ connected, eventCount }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span className={`status-dot ${connected ? "connected" : "disconnected"}`} />
      <span className="status-text">
        {connected ? "Live" : "Offline"}
        {connected && (
          <span style={{ marginLeft: 4, fontFamily: "var(--font-mono)", fontSize: 11 }}>
            ({eventCount} events)
          </span>
        )}
      </span>
    </div>
  );
}
