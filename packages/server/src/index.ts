import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import fs from "fs";
import os from "os";
import { EventStore } from "./store";
import { createRoutes } from "./routes";
import { createWebSocketServer } from "./websocket";
import { ExporterManager } from "./exporters";

const PORT = parseInt(process.env.PORT || "3100", 10);
const LOG_DIR = process.env.LOG_DIR || path.join(os.homedir(), ".claude", "logs", "mcp-observability");

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const server = http.createServer(app);
const store = new EventStore(LOG_DIR);
const wss = createWebSocketServer(server, store);
const exporterManager = new ExporterManager();

// Mount REST API
app.use("/api", createRoutes(store, wss, exporterManager));

// Health check (includes exporter status)
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    eventCount: store.size(),
    wsClients: wss.clients.size,
    exporters: exporterManager.getHealth(),
    timestamp: new Date().toISOString(),
  });
});

// Start server
async function start() {
  await exporterManager.initializeAll();

  server.listen(PORT, () => {
    console.log(`\n🔍 MCP Observability Event Server`);
    console.log(`   HTTP:  http://localhost:${PORT}`);
    console.log(`   WS:    ws://localhost:${PORT}`);
    console.log(`   Logs:  ${LOG_DIR}\n`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

// Graceful shutdown
async function shutdown() {
  console.log("\nShutting down...");
  await exporterManager.shutdownAll();
  store.flush();
  wss.close();
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
