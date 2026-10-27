/**
 * Settings > AI & keys model: provider presets, the AI mode derived from settings, and the status line.
 * The API key is write-only: it is typed, sent once and dropped; only `hasKey` + `keyLast4` come back.
 */
import type { AiMode } from '@/api/types';
import type { AiProvider, AiSettings } from '@kestrel/shared';

export type KeyProvider = Exclude<AiProvider, 'default'>;

export interface ProviderPreset {
  label: string;
  baseUrl: string;
  /** Placeholder only: users type the model their account has. */
  modelHint: string;
  keyHint: string;
  /** Self-hosted servers often run without a key. */
  keyOptional?: boolean;
}

export const PROVIDER_PRESETS: Record<KeyProvider, ProviderPreset> = {
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', modelHint: 'gpt-4o-mini', keyHint: 'sk-…' },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelHint: 'gemini-2.0-flash',
    keyHint: 'AIza…',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelHint: 'meta-llama/llama-3.1-8b-instruct',
    keyHint: 'sk-or-…',
  },
  ollama: {
    label: 'Ollama (self-hosted)',
    baseUrl: 'http://localhost:11434/v1',
    modelHint: 'llama3.1',
    keyHint: 'Optional',
    keyOptional: true,
  },
  custom: { label: 'Custom (OpenAI-compatible)', baseUrl: '', modelHint: 'model-name', keyHint: 'Your key' },
};

export const KEY_PROVIDERS = Object.keys(PROVIDER_PRESETS) as KeyProvider[];

export function isKeyProvider(p: AiProvider): p is KeyProvider {
  return p !== 'default';
}

/** The user-facing choice the settings amount to. */
export function aiModeOf(ai: Pick<AiSettings, 'enabled' | 'provider'>): AiMode {
  if (!ai.enabled) return 'off';
  return ai.provider === 'default' ? 'beacon' : 'byok';
}

export function providerLabel(p: AiProvider): string {
  return p === 'default' ? 'Beacon (Meta Model API)' : PROVIDER_PRESETS[p].label;
}

/** "sk-…3f9a"-style masked key: never more than the last four characters (USERFLOW §5.2). */
export function maskedKey(last4: string | null): string {
  return last4 ? `••••${last4}` : '••••';
}

export interface AiStatus {
  tone: 'on' | 'pending' | 'off';
  text: string;
}

/** The one-line status (`settings-ai-status`). AI-off uses copy #19 verbatim. */
export function aiStatus(ai: AiSettings): AiStatus {
  if (!ai.enabled) {
    return { tone: 'off', text: 'AI is off. Scores use embeddings and rules only; tailoring tips are hidden.' };
  }
  if (ai.provider === 'default') {
    return ai.consentGivenAt
      ? { tone: 'on', text: "Beacon's AI is on. It uses Meta's Model API." }
      : { tone: 'pending', text: "Beacon's AI is on for listings only. Agree below to let it read your resume." };
  }
  if (!ai.hasKey && ai.provider !== 'ollama') {
    return { tone: 'pending', text: 'Add your key to use your own provider. Until then Beacon runs without AI.' };
  }
  const model = ai.model ? ` · ${ai.model}` : '';
  return { tone: 'on', text: `Using your own key: ${PROVIDER_PRESETS[ai.provider].label}${model}.` };
}

/** Validation for the key form. `null` means valid. */
export function validateKeyForm(input: {
  provider: KeyProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  hasKey: boolean;
}): { baseUrl?: string; apiKey?: string; model?: string } | null {
  const errors: { baseUrl?: string; apiKey?: string; model?: string } = {};
  const url = input.baseUrl.trim();
  if (!url) errors.baseUrl = 'Add the provider’s base URL.';
  else {
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) errors.baseUrl = 'Use an http(s) URL.';
    } catch {
      errors.baseUrl = 'That isn’t a URL. It usually ends in /v1.';
    }
  }
  if (input.model.trim().length > 120) errors.model = 'Model names are 120 characters or fewer.';
  const key = input.apiKey.trim();
  const keyNeeded = !input.hasKey && !PROVIDER_PRESETS[input.provider].keyOptional;
  if (key && (key.length < 8 || key.length > 512)) errors.apiKey = 'Keys are 8 to 512 characters.';
  else if (!key && keyNeeded) errors.apiKey = 'Paste your API key.';
  return Object.keys(errors).length > 0 ? errors : null;
}
