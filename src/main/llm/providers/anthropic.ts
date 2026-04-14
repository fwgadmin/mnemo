export async function summarizeAnthropic(opts: {
  baseUrl: string;
  model: string;
  apiKey: string;
  system: string;
  user: string;
}): Promise<string> {
  const key = opts.apiKey.trim();
  if (!key) throw new Error('Anthropic API key is required');
  let b = opts.baseUrl.trim().replace(/\/$/, '');
  if (!b) b = 'https://api.anthropic.com';
  const url = b.endsWith('/v1/messages') ? b : `${b}/v1/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 4096,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Anthropic HTTP ${res.status}${t ? `: ${t.slice(0, 400)}` : ''}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    error?: { message?: string };
  };
  if (data.error?.message) throw new Error(data.error.message);
  const block = data.content?.find(c => c.type === 'text');
  const text = block?.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Empty response from Anthropic');
  }
  return text.trim();
}
