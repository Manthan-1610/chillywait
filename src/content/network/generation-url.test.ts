import { describe, expect, it } from 'vitest';
import { isGenerationUrl } from './generation-url';

describe('isGenerationUrl', () => {
  it('rejects third-party ad/analytics URLs', () => {
    expect(
      isGenerationUrl(
        'https://ad.doubleclick.net/ccm/s/collect?auid=123',
      ),
    ).toBe(false);
    expect(
      isGenerationUrl('https://www.google-analytics.com/g/collect?v=2'),
    ).toBe(false);
  });

  it('rejects chatgpt and claude endpoints (unsupported platforms)', () => {
    expect(
      isGenerationUrl(
        'https://chatgpt.com/backend-api/conversation',
      ),
    ).toBe(false);
    expect(
      isGenerationUrl(
        'https://claude.ai/api/organizations/org-1/chat_conversations/abc/completion',
      ),
    ).toBe(false);
  });

  it('accepts gemini StreamGenerate on gemini.google.com', () => {
    expect(
      isGenerationUrl(
        'https://gemini.google.com/_/BardChatUi/data/StreamGenerate?rpc=1',
      ),
    ).toBe(true);
  });

  it('rejects generic batchexecute on unrelated hosts', () => {
    expect(
      isGenerationUrl('https://www.google.com/_/Something/batchexecute'),
    ).toBe(false);
  });
});
