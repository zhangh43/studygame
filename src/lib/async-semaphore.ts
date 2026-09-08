export class AsyncSemaphore {
  private activeCount = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("Semaphore limit must be a positive integer");
  }

  get active(): number { return this.activeCount; }
  get pending(): number { return this.waiters.length; }
  get available(): boolean { return this.activeCount < this.limit; }

  async acquire(): Promise<() => void> {
    if (this.available) {
      this.activeCount += 1;
    } else {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) next();
      else this.activeCount -= 1;
    };
  }
}
