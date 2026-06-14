/**
 * HTTP Proxy — reverse-proxies MCP traffic for HTTP-based MCP servers.
 *
 * Architecture:
 *   Claude Code ──HTTP──▶ Proxy (localhost:<port>) ──HTTP──▶ Real MCP Server (<target-url>)
 *                                │
 *                          POST /api/events
 *                                │
 *                          Event Server
 */

import http from "http";
import https from "https";
import { Tracer } from "./tracer";
import { Reporter, ProxyEvent } from "./reporter";

interface HttpProxyConfig {
  name: string;
  targetUrl: string;
  port: number;
  traceId: string;
  eventServer: string;
}

export async function createHttpProxy(config: HttpProxyConfig): Promise<void> {
  const tracer = new Tracer(config.traceId);
  const reporter = new Reporter(config.name, config.eventServer);

  const parsedUrl = new URL(config.targetUrl);
  const isHttps = parsedUrl.protocol === "https:";
  const transport = isHttps ? https : http;

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const startTime = Date.now();
      let parsedBody: Record<string, unknown> = {};

      try {
        parsedBody = JSON.parse(body);
      } catch {
        // Non-JSON body
      }

      // Extract JSON-RPC method
      const method = (parsedBody as Record<string, unknown>)?.method as string | undefined;
      const msgId = (parsedBody as Record<string, unknown>)?.id as string | number | undefined;

      // Determine tool name
      let toolName = method;
      if (method === "tools/call" && (parsedBody as Record<string, unknown>)?.params) {
        const params = (parsedBody as Record<string, unknown>).params as Record<string, unknown>;
        toolName = params?.name as string || method;
      }

      // Report request event
      if (method) {
        const requestEvent: ProxyEvent = {
          trace_id: tracer.traceId,
          span_id: `${tracer.traceId}-${msgId || "notification"}`,
          timestamp: new Date().toISOString(),
          type: "mcp_call",
          server_name: config.name,
          tool_name: toolName,
          direction: "request",
          payload: parsedBody,
          metadata: { transport: "http" },
        };
        reporter.report(requestEvent);
      }

      // Forward to real MCP server
      const proxyReq = transport.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname + parsedUrl.search,
          method: req.method,
          headers: {
            ...req.headers,
            host: parsedUrl.hostname,
          },
        },
        (proxyRes) => {
          let responseBody = "";
          proxyRes.on("data", (chunk) => (responseBody += chunk));
          proxyRes.on("end", () => {
            let responseParsed: Record<string, unknown> = {};
            try {
              responseParsed = JSON.parse(responseBody);
            } catch {
              // Non-JSON response
            }

            // Report response event
            if (msgId !== undefined) {
              const durationMs = Date.now() - startTime;
              const responseEvent: ProxyEvent = {
                trace_id: tracer.traceId,
                span_id: `${tracer.traceId}-${msgId}`,
                timestamp: new Date().toISOString(),
                type: "mcp_response",
                server_name: config.name,
                tool_name: toolName,
                direction: "response",
                payload: responseParsed,
                metadata: {
                  transport: "http",
                  duration_ms: durationMs,
                },
              };
              reporter.report(responseEvent);
            }

            // Send response back to Claude Code
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
            res.end(responseBody);
          });
        }
      );

      proxyReq.on("error", (err) => {
        const errorEvent: ProxyEvent = {
          trace_id: tracer.traceId,
          span_id: `${tracer.traceId}-error`,
          timestamp: new Date().toISOString(),
          type: "error",
          server_name: config.name,
          direction: "response",
          payload: { error: err.message },
          metadata: { transport: "http" },
        };
        reporter.report(errorEvent);

        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Proxy error", message: err.message }));
      });

      if (body) {
        proxyReq.write(body);
      }
      proxyReq.end();
    });
  });

  server.listen(config.port, () => {
    console.error(`[http-proxy:${config.name}] Listening on http://localhost:${config.port} → ${config.targetUrl}`);
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    reporter.flush();
    reporter.destroy();
    server.close();
  });
}
