import { v4 as uuid } from "uuid";

/**
 * Trace context — manages trace_id and span_id for each proxied interaction.
 */
export class Tracer {
  readonly traceId: string;

  constructor(traceId?: string) {
    this.traceId = traceId || `trace-${uuid()}`;
  }

  /** Create a new span within this trace */
  newSpan(): string {
    return `span-${uuid()}`;
  }

  /** Generate a unique correlation id for request-response pairing */
  correlationId(): string {
    return uuid();
  }
}
