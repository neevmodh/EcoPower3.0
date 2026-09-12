import { describe, expect, it, vi } from "vitest";
import { Batcher } from "./batcher";

describe("Batcher", () => {
  it("flushes immediately once maxRows is reached, without waiting for the timer", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const batcher = new Batcher<number>({ maxRows: 3, maxWaitMs: 10_000, flush });
    batcher.add(1);
    batcher.add(2);
    batcher.add(3);
    await vi.waitFor(() => expect(flush).toHaveBeenCalledTimes(1));
    expect(flush).toHaveBeenCalledWith([1, 2, 3]);
  });

  it("flushes after maxWaitMs even with fewer than maxRows buffered", async () => {
    vi.useFakeTimers();
    const flush = vi.fn().mockResolvedValue(undefined);
    const batcher = new Batcher<number>({ maxRows: 500, maxWaitMs: 200, flush });
    batcher.add(1);
    batcher.add(2);
    expect(flush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(flush).toHaveBeenCalledWith([1, 2]);
    vi.useRealTimers();
  });

  it("does not flush an empty buffer", () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const batcher = new Batcher<number>({ flush });
    batcher.flush();
    expect(flush).not.toHaveBeenCalled();
  });

  it("starts a fresh buffer after each flush — no double-delivery of already-flushed rows", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const batcher = new Batcher<number>({ maxRows: 2, maxWaitMs: 10_000, flush });
    batcher.add(1);
    batcher.add(2);
    await vi.waitFor(() => expect(flush).toHaveBeenCalledTimes(1));
    batcher.add(3);
    batcher.add(4);
    await vi.waitFor(() => expect(flush).toHaveBeenCalledTimes(2));
    expect(flush).toHaveBeenNthCalledWith(2, [3, 4]);
  });

  it("calls onError rather than throwing when the flush function rejects", async () => {
    const onError = vi.fn();
    const flush = vi.fn().mockRejectedValue(new Error("db down"));
    const batcher = new Batcher<number>({ maxRows: 1, maxWaitMs: 10_000, flush, onError });
    batcher.add(1);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][1]).toEqual([1]);
  });
});
