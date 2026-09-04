import { safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const ENCRYPTED_PREFIX = 'mnemo-safe-storage:v1:';

export function isProtectedSecret(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

/** Protect a secret for this OS user when Electron's credential encryption is available. */
export function protectSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || isProtectedSecret(trimmed) || !safeStorage.isEncryptionAvailable()) return trimmed;
  return `${ENCRYPTED_PREFIX}${safeStorage.encryptString(trimmed).toString('base64')}`;
}

/** Decode an at-rest value. Invalid or machine-bound ciphertext is treated as unavailable. */
export function unprotectSecret(value: string): string {
  if (!isProtectedSecret(value)) return value;
  if (!safeStorage.isEncryptionAvailable()) return '';
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64'));
  } catch {
    return '';
  }
}

/** JSON credential files are always private even where OS encryption is unavailable. */
export function writePrivateJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Windows and some filesystems do not expose POSIX permission bits.
  }
}
