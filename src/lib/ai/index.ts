import 'server-only';
import { MockAIProvider } from './mock-provider';
import { AnthropicProvider } from './anthropic-provider';
import type { AIProvider } from './types';

let cached: AIProvider | null = null;

/**
 * Resolves the active provider.
 *
 * `mock` is the default and is a first-class mode, not a stub: every AI surface
 * in the app is fully functional with no API key and no network access.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;

  const configured = (process.env.AI_PROVIDER ?? 'mock').toLowerCase();
  const key = process.env.AI_API_KEY?.trim();

  if (configured === 'anthropic') {
    if (key) {
      cached = new AnthropicProvider(key);
      return cached;
    }
    console.warn('[ai] AI_PROVIDER=anthropic but AI_API_KEY is empty — using the deterministic provider.');
  }

  cached = new MockAIProvider();
  return cached;
}

export function aiProviderName(): string {
  return getAIProvider().name;
}

/** True when a real model is configured; the UI labels output accordingly. */
export function isLiveModel(): boolean {
  return getAIProvider().name !== 'mock';
}

export * from './types';
