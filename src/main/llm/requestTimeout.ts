export const LLM_REQUEST_TIMEOUT_MS = 60_000;

export async function fetchLlm(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(LLM_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (
      (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) ||
      (error instanceof Error && /timed?\s*out|timeout|abort/i.test(`${error.name} ${error.message}`))
    ) {
      throw new Error(`LLM request timed out after ${LLM_REQUEST_TIMEOUT_MS / 1000} seconds`);
    }
    throw error;
  }
}
