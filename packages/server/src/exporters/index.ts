/**
 * Exporter Manager — orchestrates all enabled exporters.
 *
 * Loads exporters based on environment variables.
 * Events are sent to all exporters in parallel (non-blocking).
 */

import type { Exporter } from "./base";
import type { TraceEvent } from "../store";
import { N8nExporter } from "./n8n";
import { LangSmithExporter } from "./langsmith";
import { ObsidianExporter } from "./obsidian";

export class ExporterManager {
  private exporters: Exporter[] = [];

  constructor() {
    // Register all available exporters
    this.exporters = [
      new N8nExporter(),
      new LangSmithExporter(),
      new ObsidianExporter(),
    ];
  }

  async initializeAll(): Promise<void> {
    const results = await Promise.allSettled(
      this.exporters.map((exp) =>
        exp.initialize
          ? exp.initialize().catch((err) => {
              console.error(`[exporter-manager] Failed to initialize ${exp.name}:`, err.message);
            })
          : Promise.resolve()
      )
    );

    const active = this.exporters.filter((_, i) => results[i].status === "fulfilled");
    const activeNames = active.map((e) => e.name).join(", ");
    console.log(`[exporter-manager] ${active.length} exporters loaded: ${activeNames || "none"}`);
  }

  async export(event: TraceEvent): Promise<void> {
    // Fire-and-forget: do not await individual exporters
    for (const exporter of this.exporters) {
      exporter.export(event).catch((err) => {
        if (!String(err.message).includes("fetch")) {
          console.error(`[exporter-manager] ${exporter.name} export failed:`, err.message);
        }
      });
    }
  }

  async flushAll(): Promise<void> {
    await Promise.allSettled(
      this.exporters.map((exp) => (exp.flush ? exp.flush() : Promise.resolve()))
    );
  }

  async shutdownAll(): Promise<void> {
    await Promise.allSettled(
      this.exporters.map((exp) => (exp.shutdown ? exp.shutdown() : Promise.resolve()))
    );
  }

  getHealth(): Record<string, { ok: boolean; message?: string }> {
    const health: Record<string, { ok: boolean; message?: string }> = {};
    for (const exp of this.exporters) {
      health[exp.name] = exp.health ? exp.health() : { ok: true };
    }
    return health;
  }
}
