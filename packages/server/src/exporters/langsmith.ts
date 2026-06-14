/**
 * LangSmith Trace Exporter — exports MCP traces in LangSmith-compatible format.
 *
 * Configuration (env vars):
 *   LANGSMITH_ENDPOINT=https://api.smith.langchain.com
 *   LANGSMITH_API_KEY=ls__xxx
 *   LANGSMITH_PROJECT=mcp-observability
 *
 * Compatible with LangSmith's trace ingestion API.
 * Each trace_id maps to a LangSmith "run" tree.
 */

import type { Exporter } from "./base";
import type { TraceEvent } from "../store";

const LANGSMITH_ENDPOINT = process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com";
const LANGSMITH_API_KEY = process.env.LANGSMITH_API_KEY || "";
const LANGSMITH_PROJECT = process.env.LANGSMITH_PROJECT || "mcp-observability";

interface LangSmithRun {
  id: string;
  name: string;
  run_type: "chain" | "tool" | "llm" | "retriever";
  start_time: string;
  end_time?: string;
  inputs: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  error?: string;
  parent_run_id?: string;
  trace_id: string;
  dotted_order?: string;
  tags: string[];
  extra?: Record<string, unknown>;
}

export class LangSmithExporter implements Exporter {
  readonly name = "langsmith";

  private enabled = false;
  private pendingRuns: LangSmithRun[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private requests: Map<string, { method: string; startTime: string }> = new Map();
  private sequenceCounter = 0;

  async initialize(): Promise<void> {
    if (!LANGSMITH_API_KEY) {
      console.log("[exporter:langsmith] Not configured (set LANGSMITH_API_KEY to enable)");
      return;
    }

    this.enabled = true;
    this.flushTimer = setInterval(() => this.flush(), 10_000);

    // Verify connectivity
    try {
      const res = await fetch(`${LANGSMITH_ENDPOINT}/api/v1/sessions`, {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      console.log(`[exporter:langsmith] Initialized → ${LANGSMITH_ENDPOINT} (status: ${res.status})`);
    } catch (err) {
      console.warn(`[exporter:langsmith] Could not reach LangSmith API: ${err instanceof Error ? err.message : String(err)}`);
      console.warn(`[exporter:langsmith] Will retry on flush`);
    }
  }

  async export(event: TraceEvent): Promise<void> {
    if (!this.enabled) return;

    // Track request-response pairing for duration calculation
    if (event.type === "mcp_call" && event.direction === "request" && event.tool_name) {
      this.requests.set(event.span_id, {
        method: event.tool_name,
        startTime: event.timestamp,
      });
    }

    // Create a LangSmith run on mcp_call (request) or standalone events
    if (event.type === "mcp_call" && event.direction === "request") {
      const run = this.eventToRun(event);
      this.pendingRuns.push(run);
    }

    // Update the run on response with outputs/duration
    if (event.type === "mcp_response" || event.type === "error") {
      const pending = this.requests.get(event.span_id);
      // Find and update the matching run
      const run = this.pendingRuns.find((r) => r.id === event.span_id);
      if (run) {
        run.end_time = event.timestamp;
        run.outputs = event.payload;
        if (event.type === "error") {
          run.error = typeof event.payload?.error === "string"
            ? event.payload.error
            : JSON.stringify(event.payload);
        }
        if (pending) {
          run.extra = { ...run.extra, duration_ms: event.metadata?.duration_ms };
        }
      }
    }

    // For file_access, reasoning, skill_inferred — create as child runs
    if (event.type === "file_access" || event.type === "reasoning" || event.type === "skill_inferred") {
      const run = this.eventToRun(event);
      run.parent_run_id = event.parent_span_id || event.span_id.replace(/-file$|-reason$|-skill$/, "");
      this.pendingRuns.push(run);
    }
  }

  async flush(): Promise<void> {
    if (this.pendingRuns.length === 0) return;

    const batch = this.pendingRuns.splice(0);
    const payload = JSON.stringify({
      runs: batch,
      project_name: LANGSMITH_PROJECT,
    });

    try {
      await fetch(`${LANGSMITH_ENDPOINT}/api/v1/runs/batch`, {
        method: "POST",
        headers: this.authHeaders(),
        body: payload,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      // Re-queue on failure (up to 500)
      if (this.pendingRuns.length < 500) {
        this.pendingRuns.push(...batch);
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flush();
  }

  health(): { ok: boolean; message?: string } {
    if (!this.enabled) return { ok: true, message: "LangSmith exporter disabled (LANGSMITH_API_KEY not set)" };
    return { ok: true, message: `active, ${this.pendingRuns.length} pending runs` };
  }

  private eventToRun(event: TraceEvent): LangSmithRun {
    this.sequenceCounter++;
    const name = event.tool_name
      ? `${event.server_name}:${event.tool_name}`
      : `${event.type}:${event.server_name}`;

    return {
      id: event.span_id,
      name,
      run_type: this.inferRunType(event),
      start_time: event.timestamp,
      inputs: event.direction === "request" ? event.payload : {},
      trace_id: event.trace_id,
      dotted_order: `${new Date(event.timestamp).toISOString()}${String(this.sequenceCounter).padStart(6, "0")}`,
      tags: [
        `server:${event.server_name}`,
        `type:${event.type}`,
        `direction:${event.direction}`,
        ...(event.metadata?.skill_tags || []).map((t) => `skill:${t}`),
      ],
      extra: {
        transport: event.metadata?.transport || "unknown",
        mcp_server: event.server_name,
      },
    };
  }

  private inferRunType(event: TraceEvent): LangSmithRun["run_type"] {
    switch (event.type) {
      case "mcp_call":
      case "mcp_response":
        return "tool";
      case "reasoning":
        return "llm";
      case "file_access":
        return "retriever";
      default:
        return "chain";
    }
  }

  private authHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-api-key": LANGSMITH_API_KEY,
    };
  }
}
