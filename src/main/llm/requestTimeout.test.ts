import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLlm, LLM_REQUEST_TIMEOUT_MS } from './requestTimeout';

afterEach(() => vi.unstubAllGlobals());

describe('fetchLlm', () => {
  it('attaches a timeout signal to outbound requests', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await fetchLlm('https://example.test', { method: 'POST' });
    expect(LLM_REQUEST_TIMEOUT_MS).toBe(60_000);
  });

  it('returns a clear error when the timeout aborts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')));
    await expect(fetchLlm('https://example.test', {})).rejects.toThrow(
      'LLM request timed out after 60 seconds',
    );
  });
});
