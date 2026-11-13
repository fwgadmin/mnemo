import { randomUUID } from 'crypto';
import * as path from 'path';

interface Capability {
  filePath: string;
  ownerId: number;
  expiresAt: number;
}

export class FileCapabilityStore {
  private readonly entries = new Map<string, Capability>();

  constructor(
    private readonly ttlMs = 30 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  grant(filePath: string, ownerId: number): string {
    this.prune();
    const id = randomUUID();
    this.entries.set(id, {
      filePath: path.resolve(filePath),
      ownerId,
      expiresAt: this.now() + this.ttlMs,
    });
    return id;
  }

  resolve(id: unknown, ownerId: number): string | null {
    if (typeof id !== 'string') return null;
    const entry = this.entries.get(id);
    if (!entry || entry.ownerId !== ownerId || entry.expiresAt <= this.now()) {
      if (entry?.expiresAt && entry.expiresAt <= this.now()) this.entries.delete(id);
      return null;
    }
    entry.expiresAt = this.now() + this.ttlMs;
    return entry.filePath;
  }

  revokeOwner(ownerId: number): void {
    for (const [id, entry] of this.entries) {
      if (entry.ownerId === ownerId) this.entries.delete(id);
    }
  }

  revokeAll(): void {
    this.entries.clear();
  }

  private prune(): void {
    const now = this.now();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(id);
    }
  }
}

export function pathIsInside(rootPath: string, candidatePath: string): boolean {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
