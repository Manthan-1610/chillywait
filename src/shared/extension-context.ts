import { DEFAULT_SETTINGS, type ChillYWaitSettings } from './constants';
import { ensureProfileSettings } from './profile';

export const EXTENSION_VERSION = '1.6.4';

export function isExtensionContextValid(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

export function safeRuntimeUrl(path: string): string | null {
  if (!isExtensionContextValid()) return null;
  try {
    return chrome.runtime.getURL(path);
  } catch {
    return null;
  }
}

export function getExtensionVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return EXTENSION_VERSION;
  }
}

export async function safeStorageGet(
  keys: Partial<ChillYWaitSettings>,
): Promise<Partial<ChillYWaitSettings>> {
  if (!isExtensionContextValid()) return {};
  try {
    return (await chrome.storage.sync.get(keys)) as Partial<ChillYWaitSettings>;
  } catch {
    return {};
  }
}

export async function safeStorageSet(
  values: Partial<ChillYWaitSettings>,
): Promise<boolean> {
  if (!isExtensionContextValid()) return false;
  try {
    await chrome.storage.sync.set(values);
    return true;
  } catch {
    return false;
  }
}

export function safeAddMessageListener(
  listener: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => boolean | void,
): boolean {
  if (!isExtensionContextValid()) return false;
  try {
    chrome.runtime.onMessage.addListener(listener);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveMessageListener(
  listener: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => boolean | void,
): void {
  try {
    chrome.runtime.onMessage.removeListener(listener);
  } catch {
    // extension already unloaded
  }
}

export function onSettingsChangedSafe(
  callback: (settings: ChillYWaitSettings) => void,
): () => void {
  if (!isExtensionContextValid()) return () => undefined;

  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== 'sync') return;
    if (!isExtensionContextValid()) return;
    if (Object.keys(changes).some((k) => k in DEFAULT_SETTINGS)) {
      void getSettingsSafe().then(callback);
    }
  };

  try {
    chrome.storage.onChanged.addListener(listener);
  } catch {
    return () => undefined;
  }

  return () => {
    try {
      chrome.storage.onChanged.removeListener(listener);
    } catch {
      // ignore
    }
  };
}

export async function getSettingsSafe(): Promise<ChillYWaitSettings> {
  const result = await safeStorageGet(DEFAULT_SETTINGS);
  const merged = { ...DEFAULT_SETTINGS, ...result };
  // Drop legacy ChatGPT/Claude site flags from older installs.
  const ensured = ensureProfileSettings({
    ...merged,
    enabledSites: {
      gemini: Boolean(
        (result.enabledSites as { gemini?: boolean } | undefined)?.gemini ??
          DEFAULT_SETTINGS.enabledSites.gemini,
      ),
    },
  });
  if (!result.playerId) {
    await safeStorageSet({
      playerId: ensured.playerId,
    });
  }
  return ensured;
}
