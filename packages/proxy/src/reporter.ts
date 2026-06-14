/**
 * Reporter — sends events to the Event Server via HTTP POST.
 * Non-blocking: uses fire-and-forget POST with error logging only.
 */

const EVENT_SERVER_URL = process.env.MCP_OBSERVABILITY_SERVER || "http://localhost:3100";

export interface ProxyEvent {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  timestamp: string;
  type: "mcp_call" | "mcp_response" | "file_access" | "reasoning" | "output" | "error";
  server_name: string;
  tool_name?: string;
  direction: "request" | "response";
  payload: Record<string, unknown>;
  metadata: {
    transport: "stdio" | "http";
    duration_ms?: number;
  };
}

export class Reporter {
  private serverUrl: string;
  private serverName: string;
  private pending: ProxyEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly FLUSH_INTERVAL_MS = 1000;

  constructor(serverName: string, serverUrl?: string) {
    this.serverName = serverName;
    this.serverUrl = serverUrl || EVENT_SERVER_URL;

    // Periodically flush events
    this.flushTimer = setInterval(() => this.flush(), this.FLUSH_INTERVAL_MS);
  }

  report(event: ProxyEvent): void {
    this.pending.push(event);

    // Flush immediately if batch is full
    if (this.pending.length >= this.BATCH_SIZE) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.pending.length === 0) return;

    const batch = this.pending.splice(0);
    const payload = JSON.stringify(batch);

    try {
      const response = await fetch(`${this.serverUrl}/api/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.error(`[reporter:${this.serverName}] Event Server returned ${response.status}`);
      }
    } catch (err) {
      // Non-blocking: just log errors
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("fetch")) {
        console.error(`[reporter:${this.serverName}] Failed to send events: ${msg}`);
      }
    }
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush();
  }
}
