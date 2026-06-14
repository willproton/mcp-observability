/**
 * Obsidian Markdown Exporter — writes MCP trace logs as Obsidian-compatible markdown files.
 *
 * Configuration (env vars):
 *   OBSIDIAN_VAULT_PATH=/Users/xxx/ObsidianVault/MCP-Logs
 *   OBSIDIAN_TEMPLATE=daily-note  (optional: "daily-note" | "trace-log" | "summary")
 *
 * Each trace becomes a separate markdown note with YAML frontmatter,
 * wiki-links between related traces, and dataview-compatible fields.
 */

import type { Exporter } from "./base";
import type { TraceEvent } from "../store";
import fs from "fs";
import path from "path";

const OBSIDIAN_VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || "";
const OBSIDIAN_TEMPLATE = process.env.OBSIDIAN_TEMPLATE || "trace-log";

export class ObsidianExporter implements Exporter {
  readonly name = "obsidian";

  private enabled = false;
  private vaultPath = "";
  // Buffer events per trace for writing complete notes
  private traceBuffers = new Map<string, TraceEvent[]>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  async initialize(): Promise<void> {
    if (!OBSIDIAN_VAULT_PATH) {
      console.log("[exporter:obsidian] Not configured (set OBSIDIAN_VAULT_PATH to enable)");
      return;
    }

    this.vaultPath = OBSIDIAN_VAULT_PATH;
    if (!fs.existsSync(this.vaultPath)) {
      fs.mkdirSync(this.vaultPath, { recursive: true });
    }

    this.enabled = true;
    this.flushTimer = setInterval(() => this.flush(), 15_000);
    console.log(`[exporter:obsidian] Initialized → ${this.vaultPath}`);
  }

  async export(event: TraceEvent): Promise<void> {
    if (!this.enabled) return;

    // Collect events by trace
    const buffer = this.traceBuffers.get(event.trace_id) || [];
    buffer.push(event);
    this.traceBuffers.set(event.trace_id, buffer);

    // Write immediately for error events (don't wait for flush)
    if (event.type === "error") {
      await this.writeTraceNote(event.trace_id, buffer);
    }
  }

  async flush(): Promise<void> {
    for (const [traceId, events] of this.traceBuffers.entries()) {
      await this.writeTraceNote(traceId, events);
    }
    this.traceBuffers.clear();
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flush();
  }

  health(): { ok: boolean; message?: string } {
    if (!this.enabled) return { ok: true, message: "Obsidian exporter disabled (OBSIDIAN_VAULT_PATH not set)" };
    return { ok: true, message: `active → ${this.vaultPath}` };
  }

  private async writeTraceNote(traceId: string, events: TraceEvent[]): Promise<void> {
    if (events.length === 0) return;

    // Sort by timestamp
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];
    const durationMs = new Date(lastEvent.timestamp).getTime() - new Date(firstEvent.timestamp).getTime();
    const dateStr = firstEvent.timestamp.slice(0, 10);
    const timeStr = firstEvent.timestamp.slice(11, 19).replace(/:/g, "-");

    // Infer primary activity
    const skills = new Set<string>();
    const servers = new Set<string>();
    const tools = new Set<string>();
    let mcpCallCount = 0;
    let fileAccessCount = 0;
    let errorCount = 0;

    for (const e of events) {
      servers.add(e.server_name);
      if (e.tool_name) tools.add(e.tool_name);
      for (const s of e.metadata?.skill_tags || []) skills.add(s);
      if (e.type === "mcp_call") mcpCallCount++;
      if (e.type === "file_access") fileAccessCount++;
      if (e.type === "error") errorCount++;
    }

    const filename = `MCP-Trace-${dateStr}-${timeStr}-${traceId.slice(0, 8)}.md`;
    const filePath = path.join(this.vaultPath, filename);

    if (OBSIDIAN_TEMPLATE === "daily-note") {
      // Append to daily note instead of separate trace file
      const dailyFile = path.join(this.vaultPath, `MCP-Daily-${dateStr}.md`);
      const entry = this.buildDailyNoteEntry(traceId, events, durationMs, [...skills], [...servers], [...tools], mcpCallCount, errorCount);
      fs.appendFileSync(dailyFile, entry, "utf-8");
      return;
    }

    // Build full trace note
    const content = this.buildTraceNote(
      traceId, events, durationMs, [...skills], [...servers], [...tools],
      mcpCallCount, fileAccessCount, errorCount
    );

    fs.writeFileSync(filePath, content, "utf-8");
    this.traceBuffers.delete(traceId);
  }

  private buildTraceNote(
    traceId: string,
    events: TraceEvent[],
    durationMs: number,
    skills: string[],
    servers: string[],
    tools: string[],
    mcpCallCount: number,
    fileAccessCount: number,
    errorCount: number,
  ): string {
    const first = events[0];
    const last = events[events.length - 1];

    const lines: string[] = [
      "---",
      `trace_id: "${traceId}"`,
      `date: ${first.timestamp.slice(0, 10)}`,
      `start_time: "${first.timestamp}"`,
      `end_time: "${last.timestamp}"`,
      `duration_ms: ${durationMs}`,
      `event_count: ${events.length}`,
      `mcp_calls: ${mcpCallCount}`,
      `file_accesses: ${fileAccessCount}`,
      `errors: ${errorCount}`,
      `servers: [${servers.map((s) => `"${s}"`).join(", ")}]`,
      `tools: [${tools.map((t) => `"${t}"`).join(", ")}]`,
      `skills: [${skills.map((s) => `"${s}"`).join(", ")}]`,
      "tags: [mcp-observability]",
      "---",
      "",
      `# 🔍 MCP Trace \`${traceId.slice(0, 8)}...\``,
      "",
      `> **${new Date(first.timestamp).toLocaleString()}** · ${durationMs}ms · ${events.length} events · ${errorCount > 0 ? "⚠️ " + errorCount + " errors" : "✅ clean"}`,
      "",
      "## Overview",
      "",
      "| Metric | Value |",
      "|--------|-------|",
      `| Duration | ${durationMs}ms |`,
      `| MCP Calls | ${mcpCallCount} |`,
      `| File Accesses | ${fileAccessCount} |`,
      `| Errors | ${errorCount} |`,
      `| Servers | ${servers.join(", ")} |`,
      `| Skills Inferred | ${skills.join(", ") || "—"} |`,
      "",
      "## Event Timeline",
      "",
      "| # | Time | Type | Server | Tool | Dir | Duration |",
      "|---|------|------|--------|------|-----|----------|",
    ];

    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const time = e.timestamp.slice(11, 23).replace("T", " ");
      const typeIcon = this.typeIcon(e.type);
      const tool = e.tool_name || "—";
      const dir = e.direction === "request" ? "→" : "←";
      const dur = e.metadata?.duration_ms ? `${e.metadata.duration_ms}ms` : "—";
      const skillSuffix = (e.metadata?.skill_tags?.length || 0) > 0
        ? ` 🔖${e.metadata!.skill_tags!.join("+")}`
        : "";

      lines.push(`| ${i + 1} | ${time} | ${typeIcon} ${e.type} | ${e.server_name} | ${tool} | ${dir} | ${dur}${skillSuffix} |`);
    }

    lines.push("");
    lines.push("## Event Details");
    lines.push("");

    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      lines.push(`### ${i + 1}. ${this.typeIcon(e.type)} ${e.tool_name || e.type}`);
      lines.push("");
      lines.push(`- **Span**: \`${e.span_id}\``);
      lines.push(`- **Server**: ${e.server_name}`);
      lines.push(`- **Direction**: ${e.direction}`);
      lines.push(`- **Transport**: ${e.metadata?.transport || "unknown"}`);
      if (e.metadata?.skill_tags?.length) {
        lines.push(`- **Skills**: ${e.metadata.skill_tags.map((s) => `[[skill-${s}]]`).join(", ")}`);
      }
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(e.payload, null, 2));
      lines.push("```");
      lines.push("");
    }

    // Related traces (wiki-links)
    const relatedTraces = this.findRelatedTraces(traceId);
    if (relatedTraces.length > 0) {
      lines.push("## Related Traces");
      lines.push("");
      for (const rt of relatedTraces) {
        lines.push(`- [[${rt}]]`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private buildDailyNoteEntry(
    traceId: string,
    events: TraceEvent[],
    durationMs: number,
    skills: string[],
    servers: string[],
    tools: string[],
    mcpCallCount: number,
    errorCount: number,
  ): string {
    const first = events[0];
    const timeLabel = first.timestamp.slice(11, 19);
    const statusIcon = errorCount > 0 ? "⚠️" : "✅";

    return [
      "",
      `## ${statusIcon} ${timeLabel} — MCP Trace ${traceId.slice(0, 8)}`,
      "",
      `- **Duration**: ${durationMs}ms · **Calls**: ${mcpCallCount} · **Servers**: ${servers.join(", ")}`,
      `- **Tools**: ${tools.join(", ")}`,
      `- **Skills**: ${skills.join(", ") || "—"}`,
      "",
    ].join("\n");
  }

  private typeIcon(type: string): string {
    switch (type) {
      case "mcp_call": return "📤";
      case "mcp_response": return "📥";
      case "skill_inferred": return "🔖";
      case "file_access": return "📁";
      case "reasoning": return "🧠";
      case "output": return "💬";
      case "error": return "❌";
      default: return "•";
    }
  }

  /** Find related traces by scanning existing note filenames */
  private findRelatedTraces(_currentTraceId: string): string[] {
    if (!this.vaultPath || !fs.existsSync(this.vaultPath)) return [];
    try {
      const files = fs.readdirSync(this.vaultPath).filter((f) => f.startsWith("MCP-Trace-") && f.endsWith(".md"));
      return files.map((f) => f.replace(".md", "")).slice(-5); // Last 5 traces as related
    } catch {
      return [];
    }
  }
}
