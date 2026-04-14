import type { LlmProfile, LlmSettingsFile, LlmProviderKind } from './types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PROVIDERS: readonly LlmProviderKind[] = [
  'openai_compatible',
  'ollama',
  'anthropic',
  'google_gemini',
];

export function isValidProviderKind(v: unknown): v is LlmProviderKind {
  return typeof v === 'string' && (PROVIDERS as readonly string[]).includes(v);
}

/** Whether a profile has the fields required to call that provider. */
export function isProfileComplete(p: LlmProfile): boolean {
  const base = p.baseUrl?.trim() && p.model?.trim();
  if (!base || !UUID_RE.test(p.id)) return false;
  switch (p.providerKind) {
    case 'ollama':
    case 'openai_compatible':
      return true;
    case 'anthropic':
    case 'google_gemini':
      return Boolean(p.apiKey?.trim());
    default:
      return false;
  }
}

/** Pick default profile: explicit id if valid & complete, else first complete profile. */
export function resolveActiveProfile(settings: LlmSettingsFile): LlmProfile | null {
  const list = settings.profiles ?? [];
  const byId = settings.defaultLlmProfileId?.trim();
  if (byId) {
    const found = list.find(pr => pr.id === byId);
    if (found && isProfileComplete(found)) return found;
  }
  for (const pr of list) {
    if (isProfileComplete(pr)) return pr;
  }
  return null;
}

/** Summary context menu entries: feature on and a usable default profile. */
export function shouldShowSummaryMenuItems(settings: LlmSettingsFile): boolean {
  if (!settings.enableCopyPasteSummary) return false;
  return resolveActiveProfile(settings) != null;
}
