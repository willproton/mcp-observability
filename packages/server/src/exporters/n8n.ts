/**
 * n8n Webhook Exporter — forwards MCP events to n8n webhooks for workflow automation.
 *
 * Configuration (env vars):
 *   N8N_WEBHOOK_URL=https://n8n.example.com/webhook/mcp-observability
 *   N8N_WEBHOOK_AUTH_HEADER=Bearer xxx  (optional)
 *
 * Use cases:
 *   - Trigger Slack notifications on MCP errors
 *   - Auto-create Jira tickets from specific tool calls
 *   - Chain MCP activity into CI/CD pipelines
 *   - Build custom alerting on MCP usage patterns
 */

import type { Exporter } from "./base";
import type { TraceEvent } from "../store";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "";
const N8N_AUTH_HEADER = process.env.N8N_WEBHOOK_AUTH_HEADER || "";

export class N8nExporter implements Exporter {
  readonly name = "n8n";

  private pending: TraceEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly BATCH_SIZE = 20;
  private readonly FLUSH_INTERVAL_MS = 5000;
  private enabled = false;
  private failures = 0;

  async initialize(): Promise<void> {
    if (!N8N_WEBHOOK_URL) {
      console.log("[exporter:n8n] Not configured (set N8N_WEBHOOK_URL to enable)");
      return;
    }

    this.enabled = true;
    this.flushTimer = setInterval(() => this.flush(), this.FLUSH_INTERVAL_MS);
    console.log(`[exporter:n8n] Initialized → ${N8N_WEBHOOK_URL}`);
  }

  async export(event: TraceEvent): Promise<void> {
    if (!this.enabled) return;

    this.pending.push(event);
    if (this.pending.length >= this.BATCH_SIZE) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.pending.length === 0) return;

    const batch = this.pending.splice(0);
    const payload = JSON.stringify({
      source: "mcp-observability",
      timestamp: new Date().toISOString(),
      event_count: batch.length,
      events: batch.map(this.transformEvent),
    });

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (N8N_AUTH_HEADER) {
        headers["Authorization"] = N8N_AUTH_HEADER;
      }

      const response = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers,
        body: payload,
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        this.failures++;
      }
    } catch {
      this.failures++;
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flush();
  }

  health(): { ok: boolean; message?: string } {
    if (!this.enabled) return { ok: true, message: "n8n exporter disabled (N8N_WEBHOOK_URL not set)" };
    if (this.failures > 10) return { ok: false, message: `${this.failures} delivery failures` };
    return { ok: true, message: `active, ${this.failures} failures` };
  }

  /**
   * Transform a TraceEvent into n8n-friendly format.
   * n8n workflows can use the flattened structure directly in nodes.
   */
  private transformEvent(event: TraceEvent): Record<string, unknown> {
    return {
      trace_id: event.trace_id,
      span_id: event.span_id,
      parent_span_id: event.parent_span_id || null,
      timestamp: event.timestamp,
      event_type: event.type,
      server_name: event.server_name,
      tool_name: event.tool_name || null,
      direction: event.direction,
      transport: event.metadata?.transport || "unknown",
      duration_ms: event.metadata?.duration_ms || null,
      skill_tags: event.metadata?.skill_tags || [],
      payload: event.payload,
      // Flattened convenience fields for n8n expression nodes
      _summary: `[${event.type}] ${event.server_name}${event.tool_name ? "/" + event.tool_name : ""} (${event.direction})`,
      _error: event.type === "error" ? JSON.stringify(event.payload) : null,
    };
  }
}
