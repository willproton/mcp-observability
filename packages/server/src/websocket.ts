import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { EventStore } from "./store";

export function createWebSocketServer(server: http.Server, _store: EventStore): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    console.log(`🔌 WebSocket client connected (total: ${wss.clients.size})`);

    // Send a welcome message with current stats
    ws.send(
      JSON.stringify({
        type: "connected",
        message: "Connected to MCP Observability Event Server",
        clientCount: wss.clients.size,
        timestamp: new Date().toISOString(),
      })
    );

    ws.on("close", () => {
      console.log(`🔌 WebSocket client disconnected (total: ${wss.clients.size})`);
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err.message);
    });

    // Ping to keep alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);

    ws.on("close", () => {
      clearInterval(pingInterval);
    });
  });

  return wss;
}
