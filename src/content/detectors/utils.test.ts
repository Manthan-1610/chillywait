import { describe, expect, it } from 'vitest';
import { detectPlatform } from './utils';

describe('detectPlatform', () => {
  it('detects gemini host', () => {
    expect(detectPlatform('gemini.google.com')).toBe('gemini');
  });

  it('returns null for unsupported LLM hosts', () => {
    expect(detectPlatform('chatgpt.com')).toBeNull();
    expect(detectPlatform('chat.openai.com')).toBeNull();
    expect(detectPlatform('claude.ai')).toBeNull();
  });

  it('returns null for unknown hosts', () => {
    expect(detectPlatform('example.com')).toBeNull();
  });
});
