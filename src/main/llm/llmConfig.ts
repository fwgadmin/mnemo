import * as fs from 'fs';
import * as path from 'path';
import type { LlmProfile, LlmSettingsFile } from '../../shared/types';
import { DEFAULT_USER_GUARDRAILS } from '../../shared/llmGuardrails';
import { isValidProviderKind } from '../../shared/llmProfile';

const MAX_PROFILES = 32;
const MAX_URL = 2048;
const MAX_MODEL = 512;
const MAX_NAME = 120;
const MAX_GUARDRAILS = 12000;
const MAX_KEY = 8192;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveLlmConfigPath(userData: string): string {
  return path.join(userData, 'llm-config.json');
}

function trimStr(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function sanitizeProfile(raw: unknown): LlmProfile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && UUID_RE.test(o.id) ? o.id : '';
  if (!id) return null;
  const providerKind = o.providerKind;
  if (!isValidProviderKind(providerKind)) return null;
  const baseUrl = trimStr(o.baseUrl, MAX_URL);
  const model = trimStr(o.model, MAX_MODEL);
  if (!baseUrl || !model) return null;
  const name = trimStr(o.name, MAX_NAME);
  const apiKey = trimStr(o.apiKey, MAX_KEY);
  return {
    id,
    providerKind,
    baseUrl,
    model,
    name: name || undefined,
    apiKey: apiKey || undefined,
  };
}

export function sanitizeLlmSettings(raw: unknown): LlmSettingsFile {
  const out: LlmSettingsFile = { profiles: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;

  if (Array.isArray(o.profiles)) {
    for (const p of o.profiles) {
      const sp = sanitizeProfile(p);
      if (sp && out.profiles.length < MAX_PROFILES) out.profiles.push(sp);
    }
  }
  if (typeof o.defaultLlmProfileId === 'string' && UUID_RE.test(o.defaultLlmProfileId.trim())) {
    out.defaultLlmProfileId = o.defaultLlmProfileId.trim();
  }
  if (typeof o.enableCopyPasteSummary === 'boolean') {
    out.enableCopyPasteSummary = o.enableCopyPasteSummary;
  }
  if (typeof o.guardrailsPrompt === 'string') {
    const g = o.guardrailsPrompt.slice(0, MAX_GUARDRAILS);
    out.guardrailsPrompt = g;
  }
  return out;
}

export function readLlmConfig(userData: string): LlmSettingsFile {
  const fp = resolveLlmConfigPath(userData);
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf-8')) as unknown;
    return sanitizeLlmSettings(raw);
  } catch {
    return { profiles: [] };
  }
}

export function writeLlmConfig(userData: string, settings: LlmSettingsFile): void {
  const cleaned = sanitizeLlmSettings(settings);
  const fp = resolveLlmConfigPath(userData);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(cleaned, null, 2), 'utf-8');
}

export function effectiveGuardrails(settings: LlmSettingsFile): string {
  const g = settings.guardrailsPrompt?.trim();
  if (g) return g;
  return DEFAULT_USER_GUARDRAILS;
}
