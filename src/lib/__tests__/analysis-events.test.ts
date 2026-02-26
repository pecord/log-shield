import { describe, it, expect, vi } from "vitest";
import { AnalysisEventBus } from "../analysis-events";

describe("AnalysisEventBus", () => {
  it("delivers events to subscribers", () => {
    const bus = new AnalysisEventBus();
    const listener = vi.fn();

    bus.subscribe("upload-1", listener);
    bus.emit("upload-1", { status: "ANALYZING" });

    expect(listener).toHaveBeenCalledWith({ status: "ANALYZING" });
  });

  it("does not deliver events after unsubscribe", () => {
    const bus = new AnalysisEventBus();
    const listener = vi.fn();

    bus.subscribe("upload-1", listener);
    bus.unsubscribe("upload-1", listener);
    bus.emit("upload-1", { status: "COMPLETED" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("isolates events by uploadId", () => {
    const bus = new AnalysisEventBus();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    bus.subscribe("upload-1", listener1);
    bus.subscribe("upload-2", listener2);
    bus.emit("upload-1", { id: 1 });

    expect(listener1).toHaveBeenCalledWith({ id: 1 });
    expect(listener2).not.toHaveBeenCalled();
  });

  it("supports multiple subscribers for the same uploadId", () => {
    const bus = new AnalysisEventBus();
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    bus.subscribe("upload-1", listenerA);
    bus.subscribe("upload-1", listenerB);
    bus.emit("upload-1", { x: 42 });

    expect(listenerA).toHaveBeenCalledWith({ x: 42 });
    expect(listenerB).toHaveBeenCalledWith({ x: 42 });
  });

  it("unsubscribing one listener does not affect others", () => {
    const bus = new AnalysisEventBus();
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    bus.subscribe("upload-1", listenerA);
    bus.subscribe("upload-1", listenerB);
    bus.unsubscribe("upload-1", listenerA);
    bus.emit("upload-1", { y: 99 });

    expect(listenerA).not.toHaveBeenCalled();
    expect(listenerB).toHaveBeenCalledWith({ y: 99 });
  });
});
