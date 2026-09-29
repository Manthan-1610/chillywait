import type { OverlayMessage } from './constants';
import { isExtensionContextValid } from './extension-context';

export function postToOverlay(
  iframe: HTMLIFrameElement,
  message: OverlayMessage,
): void {
  iframe.contentWindow?.postMessage(message, '*');
}

export function onOverlayMessage(
  callback: (message: OverlayMessage) => void,
): () => void {
  const handler = (event: MessageEvent) => {
    const data = event.data as OverlayMessage;
    if (!data || typeof data !== 'object' || !('type' in data)) return;
    callback(data);
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

export async function sendToActiveTab(message: { type: string }): Promise<void> {
  if (!isExtensionContextValid()) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, message).catch(() => undefined);
    }
  } catch {
    // extension context invalidated
  }
}
