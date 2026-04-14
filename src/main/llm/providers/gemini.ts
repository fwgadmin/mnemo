export async function summarizeGemini(opts: {
  baseUrl: string;
  model: string;
  apiKey: string;
  system: string;
  user: string;
}): Promise<string> {
  const key = opts.apiKey.trim();
  if (!key) throw new Error('Gemini API key is required');
  let model = opts.model.trim();
  if (model.startsWith('models/')) model = model.slice('models/'.length);
  const b = opts.baseUrl.trim().replace(/\/$/, '');
  const url =
    b && !/^https?:\/\/generativelanguage\.googleapis\.com/i.test(b)
      ? `${b.replace(/\/$/, '')}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
      : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.user }] }],
      generationConfig: { temperature: 0.3 },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}${t ? `: ${t.slice(0, 400)}` : ''}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (data.error?.message) throw new Error(data.error.message);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Empty response from Gemini');
  }
  return text.trim();
}
