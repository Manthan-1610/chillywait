import type { PlatformId } from '../../shared/constants';
import { NETWORK_URL_PATTERNS } from '../../config/selectors';

/** Hostnames allowed for generation URL matching (never third-party ad/analytics). */
const ALLOWED_API_HOSTS: Record<PlatformId, RegExp[]> = {
  gemini: [/^(gemini\.google\.com)$/i],
};

function platformForHost(hostname: string): PlatformId | null {
  for (const [platform, patterns] of Object.entries(ALLOWED_API_HOSTS) as [
    PlatformId,
    RegExp[],
  ][]) {
    if (patterns.some((p) => p.test(hostname))) return platform;
  }
  return null;
}

export function detectPlatformFromUrl(url: string): PlatformId | null {
  try {
    const { hostname } = new URL(url, 'https://example.com');
    return platformForHost(hostname);
  } catch {
    return null;
  }
}

/**
 * Only match LLM generation endpoints on known API hosts.
 * Unmatched URLs (ads, analytics, doubleclick, etc.) pass through untouched.
 */
export function isGenerationUrl(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://example.com');
    const platform = platformForHost(parsed.hostname);
    if (!platform) return false;

    return NETWORK_URL_PATTERNS[platform].some((pattern) => pattern.test(url));
  } catch {
    return false;
  }
}

export function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return String(input);
}
