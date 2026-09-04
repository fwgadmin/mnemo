export interface HttpSessionResource {
  close(): void | Promise<void>;
}

interface Entry<T extends HttpSessionResource> {
  value: T;
  lastActiveAt: number;
}

/** Bounded, idle-expiring registry shared by HTTP transport implementations. */
export class HttpSessionRegistry<T extends HttpSessionResource> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(
    readonly maxSessions: number,
    readonly idleTimeoutMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  add(id: string, value: T): boolean {
    this.sweep();
    if (!id || this.entries.has(id) || this.entries.size >= this.maxSessions) return false;
    this.entries.set(id, { value, lastActiveAt: this.now() });
    return true;
  }

  get(id: string): T | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      void this.remove(id).catch(() => {});
      return undefined;
    }
    entry.lastActiveAt = this.now();
    return entry.value;
  }

  /** Forget an entry whose underlying transport has already closed. */
  forget(id: string): void {
    this.entries.delete(id);
  }

  async remove(id: string): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.entries.delete(id);
    await entry.value.close();
    return true;
  }

  sweep(): void {
    for (const [id, entry] of this.entries) {
      if (this.isExpired(entry)) void this.remove(id).catch(() => {});
    }
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.entries.keys()].map(id => this.remove(id)));
  }

  private isExpired(entry: Entry<T>): boolean {
    return this.now() - entry.lastActiveAt >= this.idleTimeoutMs;
  }
}
