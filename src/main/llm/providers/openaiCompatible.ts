export async function summarizeOpenAiCompatibleChat(opts: {
  baseUrl: string;
  model: string;
  apiKey?: string;
  system: string;
  user: string;
}): Promise<string> {
  const url = chatCompletionsUrl(opts.baseUrl);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (opts.apiKey?.trim()) {
    headers.Authorization = `Bearer ${opts.apiKey.trim()}`;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenAI-compatible HTTP ${res.status}${t ? `: ${t.slice(0, 400)}` : ''}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; text?: string }>;
    error?: { message?: string };
  };
  if (data.error?.message) throw new Error(data.error.message);
  const content = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Empty response from model');
  }
  return content.trim();
}

function chatCompletionsUrl(baseUrl: string): string {
  const b = baseUrl.trim().replace(/\/$/, '');
  if (/\/chat\/completions$/i.test(b)) return b;
  if (/\/v1$/i.test(b)) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
}
