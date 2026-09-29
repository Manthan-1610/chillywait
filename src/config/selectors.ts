import type { PlatformId } from '../shared/constants';

export const SELECTORS = {
  gemini: {
    stopButton: [
      'button[aria-label*="Stop"]',
      'button[mattooltip*="Stop"]',
      'button.stop',
    ],
    streaming: [
      '.response-container .loading',
      'model-response [class*="loading"]',
      'message-content [class*="partial"]',
      '.markdown-main-panel [aria-busy="true"]',
    ],
    thinking: [
      '[class*="thinking"]',
      '[aria-busy="true"]',
    ],
    complete: [
      'button[aria-label*="Good response"]',
      'button[aria-label*="Share"]',
      'button[aria-label*="Redo"]',
    ],
  },
} as const satisfies Record<
  PlatformId,
  {
    stopButton: string[];
    streaming: string[];
    thinking: string[];
    complete: string[];
  }
>;

export const THINKING_PHRASES = [
  'thinking',
  'reasoning',
  'processing',
  'working on it',
  'generating',
];

export const NETWORK_URL_PATTERNS: Record<PlatformId, RegExp[]> = {
  gemini: [
    /StreamGenerate/i,
    /\/BardChatUi\/data\/.*generate/i,
    /generateContent.*alt=sse/i,
  ],
};
