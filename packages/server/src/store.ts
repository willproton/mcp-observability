import fs from "fs";
import path from "path";

export interface TraceEvent {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  timestamp: string;
  type: "mcp_call" | "mcp_response" | "skill_inferred" | "file_access" | "reasoning" | "output" | "error";
  server_name: string;
  tool_name?: string;
  direction: "request" | "response";
  payload: Record<string, unknown>;
  metadata: {
    transport: "stdio" | "http";
    duration_ms?: number;
    skill_tags?: string[];
  };
}

const MAX_IN_MEMORY = 10_000;

export class EventStore {
  private events: TraceEvent[] = [];
  private logDir: string;
  private currentLogFile: string;
  private writeStream: fs.WriteStream | null = null;

  constructor(logDir: string) {
    this.logDir = logDir;
    this.currentLogFile = path.join(logDir, `events-${new Date().toISOString().slice(0, 10)}.jsonl`);
    this.rotateLogFile();
  }

  private rotateLogFile(): void {
    const today = new Date().toISOString().slice(0, 10);
    const filename = path.join(this.logDir, `events-${today}.jsonl`);

    if (filename !== this.currentLogFile) {
      if (this.writeStream) {
        this.writeStream.end();
      }
      this.currentLogFile = filename;
      this.writeStream = fs.createWriteStream(filename, { flags: "a" });
    }
  }

  push(event: TraceEvent): void {
    // Add to in-memory ring buffer
    this.events.push(event);
    if (this.events.length > MAX_IN_MEMORY) {
      this.events.shift();
    }

    // Persist to file
    this.rotateLogFile();
    if (this.writeStream) {
      this.writeStream.write(JSON.stringify(event) + "\n");
    }
  }

  query(since?: string, limit: number = 100): TraceEvent[] {
    let filtered = this.events;
    if (since) {
      const sinceDate = new Date(since).getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() > sinceDate);
    }
    return filtered.slice(-limit);
  }

  getTrace(traceId: string): TraceEvent[] {
    return this.events.filter((e) => e.trace_id === traceId);
  }

  getStats(): {
    total: number;
    byType: Record<string, number>;
    byServer: Record<string, number>;
    recentTraces: string[];
  } {
    const byType: Record<string, number> = {};
    const byServer: Record<string, number> = {};
    const traceSet = new Set<string>();

    for (const e of this.events) {
      byType[e.type] = (byType[e.type] || 0) + 1;
      byServer[e.server_name] = (byServer[e.server_name] || 0) + 1;
      traceSet.add(e.trace_id);
    }

    return {
      total: this.events.length,
      byType,
      byServer,
      recentTraces: [...traceSet].slice(-20),
    };
  }

  size(): number {
    return this.events.length;
  }

  flush(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }
}
