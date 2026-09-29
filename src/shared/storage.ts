import type { ChillYWaitSettings } from './constants';
import {
  getSettingsSafe,
  onSettingsChangedSafe,
  safeStorageSet,
} from './extension-context';

export async function getSettings(): Promise<ChillYWaitSettings> {
  return getSettingsSafe();
}

export async function saveSettings(
  partial: Partial<ChillYWaitSettings>,
): Promise<void> {
  await safeStorageSet(partial);
}

export function onSettingsChanged(
  callback: (settings: ChillYWaitSettings) => void,
): () => void {
  return onSettingsChangedSafe(callback);
}
