export async function summarizeOllama(opts: {
  baseUrl: string;
  model: string;
  system: string;
  user: string;
}): Promise<string> {
  const b = opts.baseUrl.trim().replace(/\/$/, '');
  const url = b.endsWith('/api/chat') ? b : `${b}/api/chat`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      stream: false,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Ollama HTTP ${res.status}${t ? `: ${t.slice(0, 400)}` : ''}`);
  }
  const data = (await res.json()) as { message?: { content?: string }; response?: string };
  const content = data.message?.content ?? data.response;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Empty response from Ollama');
  }
  return content.trim();
}
