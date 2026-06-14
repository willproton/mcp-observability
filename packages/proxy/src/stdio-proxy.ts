/**
 * Stdio Proxy — transparently proxies MCP traffic between Claude Code (via stdio)
 * and a real MCP server (via child process stdin/stdout).
 *
 * Architecture:
 *   Claude Code ──stdin──▶ Proxy ──stdin──▶ Real MCP (child process)
 *   Claude Code ◀──stdout── Proxy ◀──stdout── Real MCP (child process)
 *                          │
 *                    POST /api/events
 *                          │
 *                    Event Server
 */

import { spawn, ChildProcess } from "child_process";
import { Tracer } from "./tracer";
import { Reporter, ProxyEvent } from "./reporter";

// JSON-RPC 2.0 message types
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface CliConfig {
  name: string;
  targetCommand: string;
  targetArgs: string[];
  traceId: string;
  eventServer: string;
}

export async function createStdioProxy(config: CliConfig): Promise<void> {
  const tracer = new Tracer(config.traceId);
  const reporter = new Reporter(config.name, config.eventServer);

  // Spawn the real MCP server
  const childProcess: ChildProcess = spawn(config.targetCommand, config.targetArgs, {
    stdio: ["pipe", "pipe", "inherit"], // stderr inherited for debugging
    env: { ...process.env },
  });

  if (!childProcess.stdin || !childProcess.stdout) {
    console.error("[proxy] Failed to create child process stdio streams");
    process.exit(1);
  }

  // Track pending requests for duration calculation
  const pendingRequests = new Map<string | number, { startTime: number; method: string; params?: Record<string, unknown> }>();

  // Buffer for partial JSON-RPC messages
  let inboundBuffer = "";
  let outboundBuffer = "";

  // ── Forward from child (real MCP) → Claude Code ──
  childProcess.stdout.on("data", (data: Buffer) => {
    outboundBuffer += data.toString();

    // Parse complete JSON-RPC messages (delimited by newlines)
    const lines = outboundBuffer.split("\n");
    outboundBuffer = lines.pop() || ""; // Keep incomplete last line

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg: JsonRpcResponse = JSON.parse(line);

        // Calculate duration
        const pending = pendingRequests.get(msg.id);
        const durationMs = pending ? Date.now() - pending.startTime : undefined;
        pendingRequests.delete(msg.id);

        // Determine tool name from the pending request
        const toolName = pending?.method || undefined;

        // Report MCP response event
        const event: ProxyEvent = {
          trace_id: tracer.traceId,
          span_id: `${tracer.traceId}-${msg.id}`,
          timestamp: new Date().toISOString(),
           type: "mcp_response",
          server_name: config.name,
          tool_name: toolName,
          direction: "response",
          payload: msg.result !== undefined ? { result: msg.result } : { error: msg.error },
          metadata: {
            transport: "stdio",
            duration_ms: durationMs,
          },
        };

        // Infer file_access from filesystem server
        if (config.name === "filesystem" && toolName) {
          const fileAccessEvent: ProxyEvent = {
            ...event,
            span_id: `${event.span_id}-file`,
            type: "file_access",
            parent_span_id: event.span_id,
            tool_name: toolName,
          };
          reporter.report(fileAccessEvent);
        }

        // Infer reasoning from sequential-thinking
        if (toolName === "sequentialthinking") {
          const reasoningEvent: ProxyEvent = {
            ...event,
            span_id: `${event.span_id}-reason`,
            type: "reasoning",
            parent_span_id: event.span_id,
          };
          reporter.report(reasoningEvent);
        }

        reporter.report(event);
      } catch {
        // Non-JSON line (e.g., log output from stderr redirection), skip
      }
    }

    // Forward to Claude Code
    process.stdout.write(data);
  });

  // Handle child process exit
  childProcess.on("exit", (code) => {
    reporter.flush();
    reporter.destroy();
    console.error(`[proxy] Child process exited with code ${code}`);
  });

  childProcess.on("error", (err) => {
    const errorEvent: ProxyEvent = {
      trace_id: tracer.traceId,
      span_id: `${tracer.traceId}-error`,
      timestamp: new Date().toISOString(),
      type: "error",
      server_name: config.name,
      direction: "response",
      payload: { error: err.message },
      metadata: { transport: "stdio" },
    };
    reporter.report(errorEvent);
    reporter.flush();
    reporter.destroy();
    process.exit(1);
  });

  // ── Forward from Claude Code (stdin) → child process ──
  process.stdin.on("data", (data: Buffer) => {
    inboundBuffer += data.toString();
    const lines = inboundBuffer.split("\n");
    inboundBuffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg: JsonRpcRequest = JSON.parse(line);

        if (msg.method && msg.id !== undefined) {
          // Track this request for duration calculation
          pendingRequests.set(msg.id, {
            startTime: Date.now(),
            method: msg.method,
            params: msg.params,
          });

          // Determine tool name from method
          let toolName = msg.method;
          if (msg.method === "tools/call" && msg.params?.name) {
            toolName = msg.params.name as string;
          }

          // Report MCP call event
          const event: ProxyEvent = {
            trace_id: tracer.traceId,
            span_id: `${tracer.traceId}-${msg.id}`,
            timestamp: new Date().toISOString(),
            type: "mcp_call",
            server_name: config.name,
            tool_name: toolName,
            direction: "request",
            payload: msg.params || {},
            metadata: {
              transport: "stdio",
            },
          };
          reporter.report(event);
        }
      } catch {
        // Non-JSON, skip
      }
    }

    // Forward to real MCP server
    childProcess.stdin!.write(data);
  });

  // Handle stdin close
  process.stdin.on("end", () => {
    childProcess.stdin?.end();
    reporter.flush();
    reporter.destroy();
  });

  // Handle signals
  process.on("SIGINT", () => {
    childProcess.kill();
    reporter.flush();
    reporter.destroy();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    childProcess.kill();
    reporter.flush();
    reporter.destroy();
    process.exit(0);
  });
}
