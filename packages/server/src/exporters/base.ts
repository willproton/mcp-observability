/**
 * Exporter base interface — pluggable export targets for MCP observability events.
 *
 * To add a new exporter:
 * 1. Implement the Exporter interface
 * 2. Register it in exporters/index.ts
 * 3. It will receive every event automatically
 */

import type { TraceEvent } from "../store";

export interface Exporter {
  /** Unique identifier for this exporter */
  readonly name: string;

  /** Called once when the server starts */
  initialize?(): Promise<void>;

  /** Called for every ingested event (non-blocking) */
  export(event: TraceEvent): Promise<void>;

  /** Called periodically to flush batched events */
  flush?(): Promise<void>;

  /** Called on server shutdown */
  shutdown?(): Promise<void>;

  /** Exporter health status */
  health?(): { ok: boolean; message?: string };
}

export interface ExporterConfig {
  enabled: boolean;
  [key: string]: unknown;
}
