import type { LlmProfile } from '../../shared/types';
import { summarizeOpenAiCompatibleChat } from './providers/openaiCompatible';
import { summarizeOllama } from './providers/ollama';
import { summarizeAnthropic } from './providers/anthropic';
import { summarizeGemini } from './providers/gemini';
import { FORMATTED_SUMMARY_MARKDOWN_HINT, SUMMARIZATION_MANDATE } from './summarizationMandate';

export async function summarizeWithProfile(opts: {
  profile: LlmProfile;
  guardrailsUser: string;
  textToSummarize: string;
  /** When true, extra system instructions steer toward GFM structure. */
  formattedMarkdown?: boolean;
}): Promise<string> {
  const style = opts.formattedMarkdown
    ? `${opts.guardrailsUser}${FORMATTED_SUMMARY_MARKDOWN_HINT}`
    : opts.guardrailsUser;
  const system = `${SUMMARIZATION_MANDATE}\n\n${style}`;
  const user = opts.textToSummarize;
  switch (opts.profile.providerKind) {
    case 'openai_compatible':
      return summarizeOpenAiCompatibleChat({
        baseUrl: opts.profile.baseUrl,
        model: opts.profile.model,
        apiKey: opts.profile.apiKey,
        system,
        user,
      });
    case 'ollama':
      return summarizeOllama({
        baseUrl: opts.profile.baseUrl,
        model: opts.profile.model,
        system,
        user,
      });
    case 'anthropic':
      return summarizeAnthropic({
        baseUrl: opts.profile.baseUrl,
        model: opts.profile.model,
        apiKey: opts.profile.apiKey ?? '',
        system,
        user,
      });
    case 'google_gemini':
      return summarizeGemini({
        baseUrl: opts.profile.baseUrl,
        model: opts.profile.model,
        apiKey: opts.profile.apiKey ?? '',
        system,
        user,
      });
    default: {
      const _x: never = opts.profile.providerKind;
      throw new Error(`Unknown provider: ${_x}`);
    }
  }
}
