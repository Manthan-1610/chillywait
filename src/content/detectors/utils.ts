import type { PlatformId } from '../../shared/constants';
import { PLATFORM_HOSTS } from '../../shared/constants';

export function detectPlatform(hostname: string): PlatformId | null {
  for (const [id, hosts] of Object.entries(PLATFORM_HOSTS) as [
    PlatformId,
    string[],
  ][]) {
    if (hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`))) {
      return id;
    }
  }
  return null;
}

export function queryFirst(selectors: string[]): Element | null {
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      if (el) return el;
    } catch {
      // invalid selector
    }
  }
  return null;
}

export function queryAnyVisible(selectors: string[]): Element | null {
  for (const selector of selectors) {
    try {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (isVisible(node)) return node;
      }
    } catch {
      // invalid selector
    }
  }
  return null;
}

export function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function textIncludesAny(
  root: ParentNode,
  phrases: string[],
): boolean {
  const text = root.textContent?.toLowerCase() ?? '';
  return phrases.some((p) => text.includes(p.toLowerCase()));
}

export function observeDom(
  callback: () => void,
  root: ParentNode = document.body,
): MutationObserver {
  const observer = new MutationObserver(() => callback());
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
  return observer;
}

export function onSpaNavigation(callback: () => void): () => void {
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);

  history.pushState = (...args) => {
    origPush(...args);
    callback();
  };
  history.replaceState = (...args) => {
    origReplace(...args);
    callback();
  };

  window.addEventListener('popstate', callback);

  return () => {
    history.pushState = origPush;
    history.replaceState = origReplace;
    window.removeEventListener('popstate', callback);
  };
}
