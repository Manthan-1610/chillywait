import { SELECTORS, THINKING_PHRASES } from '../../config/selectors';
import type { GenerationState } from '../../shared/constants';
import {
  isVisible,
  observeDom,
  queryAnyVisible,
  textIncludesAny,
} from './utils';
import type { PlatformDetector } from './types';

function isSendDisabledWithLoading(): boolean {
  const sendButtons = document.querySelectorAll(
    'button[aria-label*="Send"], button.send-button, mat-icon[data-mat-icon-name="send"]',
  );
  for (const btn of sendButtons) {
    const button = btn.closest('button') ?? btn;
    if (!(button instanceof HTMLButtonElement)) continue;
    if (!button.disabled) continue;
    const panel = document.querySelector(
      'model-response, .response-container, message-content',
    );
    if (panel && textIncludesAny(panel, THINKING_PHRASES)) return true;
    if (queryAnyVisible(SELECTORS.gemini.streaming)) return true;
  }
  return false;
}

function isGenerating(): GenerationState {
  if (queryAnyVisible(SELECTORS.gemini.stopButton)) return 'generating';
  if (queryAnyVisible(SELECTORS.gemini.streaming)) return 'generating';
  if (isSendDisabledWithLoading()) return 'generating';

  const root =
    document.querySelector('.conversation-container') ??
    document.querySelector('main') ??
    document.body;

  if (textIncludesAny(root, THINKING_PHRASES)) {
    const busy = root.querySelector('[aria-busy="true"]');
    if (busy && isVisible(busy)) return 'generating';
  }

  return 'idle';
}

export function createGeminiDetector(): PlatformDetector {
  let callback: ((state: GenerationState) => void) | null = null;
  let observer: MutationObserver | null = null;
  let pollId: ReturnType<typeof setInterval> | null = null;
  let last: GenerationState = 'idle';

  const emit = (state: GenerationState) => {
    if (state !== last) {
      last = state;
      callback?.(state);
    }
  };

  const check = () => emit(isGenerating());

  return {
    id: 'gemini',
    start() {
      last = 'idle';
      observer = observeDom(check);
      pollId = setInterval(check, 500);
      check();
    },
    stop() {
      observer?.disconnect();
      if (pollId) clearInterval(pollId);
      observer = null;
      pollId = null;
    },
    onStateChange(cb) {
      callback = cb;
    },
    checkNow: isGenerating,
  };
}
