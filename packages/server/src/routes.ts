import { Router, Request, Response } from "express";
import { EventStore } from "./store";
import { inferSkills } from "./inferrer";
import { ExporterManager } from "./exporters";
import { WebSocketServer } from "ws";

export function createRoutes(
  store: EventStore,
  wss: WebSocketServer,
  exporterManager: ExporterManager,
): Router {
  const router = Router();

  // POST /api/events — receive events from MCP proxy (supports single event or batch array)
  router.post("/events", (req: Request, res: Response) => {
    const body = req.body;
    const events = Array.isArray(body) ? body : [body];
    let accepted = 0;

    for (const event of events) {
      if (!event.trace_id || !event.type) {
        continue; // Skip invalid events
      }

      // Infer skills for this event
      if (event.type === "mcp_call" || event.type === "mcp_response") {
        const skills = inferSkills(event.server_name, event.tool_name, event.payload);
        event.metadata = event.metadata || {};
        event.metadata.skill_tags = skills;
      }

      store.push(event);
      accepted++;

      // Forward to exporters (n8n, LangSmith, Obsidian)
      exporterManager.export(event);

      // Broadcast to all WebSocket clients
      const message = JSON.stringify(event);
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(message);
        }
      });

      // Also emit skill_inferred events if skills were found
      const skills = event.metadata?.skill_tags || [];
      for (const skill of skills) {
        const skillEvent: import("./store").TraceEvent = {
          trace_id: event.trace_id,
          span_id: event.span_id + "-skill",
          parent_span_id: event.span_id,
          timestamp: new Date().toISOString(),
          type: "skill_inferred",
          server_name: event.server_name,
          direction: "response",
          payload: {
            skill,
            confidence: 0.85,
            source: "tool_name_pattern",
          },
          metadata: {
            transport: event.metadata?.transport || "stdio",
          },
        };
        store.push(skillEvent);
        exporterManager.export(skillEvent);
        wss.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify(skillEvent));
          }
        });
      }
    }

    res.status(201).json({ ok: true, accepted });
  });

  // GET /api/events — query events
  router.get("/events", (req: Request, res: Response) => {
    const since = req.query.since as string | undefined;
    const limitParam = req.query.limit as string | undefined;
    const limit = parseInt(limitParam || "100") || 100;
    const events = store.query(since, Math.min(limit, 1000));
    res.json(events);
  });

  // GET /api/traces/:traceId — get a specific trace
  router.get("/traces/:traceId", (req: Request, res: Response) => {
    const traceId = req.params.traceId as string;
    const events = store.getTrace(traceId);
    if (events.length === 0) {
      return res.status(404).json({ error: "Trace not found" });
    }

    // Sort by timestamp
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Calculate trace duration
    const firstTs = new Date(events[0].timestamp).getTime();
    const lastTs = new Date(events[events.length - 1].timestamp).getTime();

    res.json({
      trace_id: req.params.traceId,
      event_count: events.length,
      duration_ms: lastTs - firstTs,
      start_time: events[0].timestamp,
      end_time: events[events.length - 1].timestamp,
      events,
    });
  });

  // GET /api/stats — aggregate statistics
  router.get("/stats", (_req: Request, res: Response) => {
    res.json(store.getStats());
  });

  // DELETE /api/events — clear all events (for testing)
  router.delete("/events", (_req: Request, res: Response) => {
    store.flush();
    res.json({ ok: true, message: "Events cleared (in-memory). Log files preserved." });
  });

  return router;
}
