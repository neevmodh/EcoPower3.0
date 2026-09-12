// Flushes at 500 rows or 200ms, whichever comes first — the shape #15
// specifies. Generic over the row type so it can batch meter_readings rows,
// quarantine rows, or rollover events with the same mechanism.

export interface BatcherOptions<T> {
  maxRows?: number;
  maxWaitMs?: number;
  flush: (rows: T[]) => Promise<void>;
  onError?: (err: unknown, rows: T[]) => void;
}

export class Batcher<T> {
  private readonly maxRows: number;
  private readonly maxWaitMs: number;
  private readonly flushFn: (rows: T[]) => Promise<void>;
  private readonly onError?: (err: unknown, rows: T[]) => void;

  private buffer: T[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: BatcherOptions<T>) {
    this.maxRows = options.maxRows ?? 500;
    this.maxWaitMs = options.maxWaitMs ?? 200;
    this.flushFn = options.flush;
    this.onError = options.onError;
  }

  add(row: T): void {
    this.buffer.push(row);
    if (this.buffer.length >= this.maxRows) {
      this.flush();
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.maxWaitMs);
    }
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.buffer.length === 0) return;

    const rows = this.buffer;
    this.buffer = [];
    this.flushFn(rows).catch((err) => {
      if (this.onError) this.onError(err, rows);
      else console.error("batch flush failed:", err);
    });
  }

  get pending(): number {
    return this.buffer.length;
  }
}
