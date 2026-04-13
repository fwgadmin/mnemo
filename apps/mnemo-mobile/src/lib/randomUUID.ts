/**
 * RFC 4122 UUID v4 without native modules. Avoids ExpoCrypto / getRandomValues setup in dev clients.
 * Randomness is `Math.random()` — acceptable for local note ids before Turso sync.
 */
export function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
