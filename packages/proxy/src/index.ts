#!/usr/bin/env node
/**
 * MCP Observable Proxy — intercepts and traces MCP traffic
 *
 * Usage:
 *   node dist/index.js --name <server-name> --target-command <cmd> --target-args <arg1,arg2,...>
 *
 * For stdio MCP servers:
 *   Claude Code config: "command": "node", "args": ["proxy/dist/index.js", "--name", "filesystem", "--target-command", "npx", "--target-args", "-y,@modelcontextprotocol/server-filesystem,/path/to/dir"]
 *
 * For HTTP MCP servers:
 *   node dist/index.js --name <name> --http-proxy --target-url <url> --port <port>
 */

import { createStdioProxy } from "./stdio-proxy";
import { createHttpProxy } from "./http-proxy";
import { v4 as uuid } from "uuid";

interface CliArgs {
  name: string;
  targetCommand?: string;
  targetArgs: string[];
  httpProxy: boolean;
  targetUrl?: string;
  port: number;
  eventServer: string;
  traceId?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    name: "",
    targetArgs: [],
    httpProxy: false,
    port: 3101,
    eventServer: process.env.MCP_OBSERVABILITY_SERVER || "http://localhost:3100",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--name":
        result.name = args[++i];
        break;
      case "--target-command":
        result.targetCommand = args[++i];
        break;
      case "--target-args":
        result.targetArgs = args[++i].split(",");
        break;
      case "--http-proxy":
        result.httpProxy = true;
        break;
      case "--target-url":
        result.targetUrl = args[++i];
        break;
      case "--port":
        result.port = parseInt(args[++i], 10);
        break;
      case "--event-server":
        result.eventServer = args[++i];
        break;
      case "--trace-id":
        result.traceId = args[++i];
        break;
    }
  }

  if (!result.name) {
    console.error("Error: --name is required");
    process.exit(1);
  }

  if (!result.httpProxy && !result.targetCommand) {
    console.error("Error: --target-command is required for stdio proxy mode");
    process.exit(1);
  }

  if (result.httpProxy && !result.targetUrl) {
    console.error("Error: --target-url is required for HTTP proxy mode");
    process.exit(1);
  }

  // Generate trace_id if not provided
  result.traceId = result.traceId || `trace-${uuid()}`;

  return result;
}

async function main() {
  const config = parseArgs();

  console.error(`[mcp-proxy:${config.name}] Starting (trace: ${config.traceId})...`);

  if (config.httpProxy) {
    await createHttpProxy({
      name: config.name,
      targetUrl: config.targetUrl!,
      port: config.port,
      traceId: config.traceId!,
      eventServer: config.eventServer,
    });
  } else {
    await createStdioProxy({
      name: config.name,
      targetCommand: config.targetCommand!,
      targetArgs: config.targetArgs,
      traceId: config.traceId!,
      eventServer: config.eventServer,
    });
  }
}

main().catch((err) => {
  console.error(`[mcp-proxy] Fatal error:`, err);
  process.exit(1);
});
