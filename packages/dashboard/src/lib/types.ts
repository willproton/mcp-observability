// Shared types for the Dashboard

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

export interface TraceSummary {
  trace_id: string;
  event_count: number;
  duration_ms: number;
  start_time: string;
  end_time: string;
  events: TraceEvent[];
}

export interface ServerStats {
  total: number;
  byType: Record<string, number>;
  byServer: Record<string, number>;
  recentTraces: string[];
}

export const EVENT_COLORS: Record<string, string> = {
  mcp_call: "#89b4fa",
  mcp_response: "#74c7ec",
  skill_inferred: "#a6e3a1",
  file_access: "#f9e2af",
  reasoning: "#cba6f7",
  output: "#bac2de",
  error: "#f38ba8",
};

export const EVENT_LABELS: Record<string, string> = {
  mcp_call: "MCP Call",
  mcp_response: "MCP Response",
  skill_inferred: "Skill Inferred",
  file_access: "File Access",
  reasoning: "Reasoning",
  output: "Output",
  error: "Error",
};
