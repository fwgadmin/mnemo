/** Shared MCP argument helpers for note-targeting tools. */
import { z } from 'zod';
import type { INoteStore } from '../../shared/types';

/** Shape for tools: pass exactly one of `id` or `ref` (validated in handler; MCP SDK needs a raw Zod shape). */
export const idOrRefShape = {
  id: z.string().optional(),
  ref: z.number().int().positive().optional(),
};

export function idOrRefError(args: { id?: string; ref?: number }): string | null {
  const hasId = args.id != null && args.id.length > 0;
  const hasRef = args.ref != null;
  if (hasId === hasRef) return 'Provide exactly one of id or ref';
  return null;
}

export async function resolveToNoteId(
  store: INoteStore,
  args: { id?: string; ref?: number },
  tenantId: string,
): Promise<{ ok: true; id: string } | { ok: false; text: string }> {
  const hasId = args.id != null && args.id.length > 0;
  const hasRef = args.ref != null;
  if (hasId === hasRef) {
    return { ok: false, text: 'Provide exactly one of id or ref' };
  }
  if (hasId) {
    const n = await store.read(args.id!);
    if (!n) return { ok: false, text: `Note ${args.id} not found` };
    return { ok: true, id: n.id };
  }
  const n = await store.readByRef(args.ref!, tenantId);
  if (!n) return { ok: false, text: `No note with ref ${args.ref}` };
  return { ok: true, id: n.id };
}

