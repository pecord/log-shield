import { EventEmitter } from "events";

/**
 * In-process event bus for streaming analysis progress to SSE clients.
 * Uses the same globalThis singleton pattern as prisma.ts to survive
 * HMR in development.
 */
export class AnalysisEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  emit(uploadId: string, payload: unknown): void {
    this.emitter.emit(uploadId, payload);
  }

  subscribe(uploadId: string, listener: (payload: unknown) => void): void {
    this.emitter.on(uploadId, listener);
  }

  unsubscribe(uploadId: string, listener: (payload: unknown) => void): void {
    this.emitter.off(uploadId, listener);
  }
}

const globalForEvents = globalThis as unknown as {
  analysisEvents: AnalysisEventBus | undefined;
};

export const analysisEvents =
  globalForEvents.analysisEvents ?? new AnalysisEventBus();

if (process.env.NODE_ENV !== "production")
  globalForEvents.analysisEvents = analysisEvents;
