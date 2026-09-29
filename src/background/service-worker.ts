import { DEFAULT_SETTINGS } from '../shared/constants';
import { ensureProfileSettings } from '../shared/profile';
import type { GameId } from '../shared/constants';
import { getSettingsSafe } from '../shared/extension-context';
import {
  fetchGlobalLeaderboard,
  submitGlobalScore,
} from '../shared/leaderboard-api';
import { isLeaderboardConfigured } from '../shared/leaderboard-config';
import { hasRegisteredUsername } from '../shared/profile';
import { checkUsernameAvailable, claimUsername as claimUsernameApi } from '../shared/username-api';

const LOCAL_RESET_KEY = 'chillywait_local_reset';
/** One-time wipe of this browser's ChillYWait profile and scores. */
const LOCAL_RESET_TOKEN = '2026-09-29';

let storageReady: Promise<void> | null = null;

function ensureStorage(): Promise<void> {
  if (!storageReady) {
    storageReady = (async () => {
      const stamp = await chrome.storage.local.get(LOCAL_RESET_KEY);
      if (stamp[LOCAL_RESET_KEY] !== LOCAL_RESET_TOKEN) {
        await chrome.storage.sync.clear();
        await chrome.storage.local.clear();
        await chrome.storage.sync.set(ensureProfileSettings({ ...DEFAULT_SETTINGS }));
        await chrome.storage.local.set({ [LOCAL_RESET_KEY]: LOCAL_RESET_TOKEN });
        return;
      }
      const existing = await chrome.storage.sync.get(null);
      await chrome.storage.sync.set(
        ensureProfileSettings({ ...DEFAULT_SETTINGS, ...existing }),
      );
    })();
  }
  return storageReady;
}

void ensureStorage();

chrome.runtime.onInstalled.addListener(() => {
  void ensureStorage();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'ping') {
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === 'leaderboard_status') {
    sendResponse({ configured: isLeaderboardConfigured() });
    return true;
  }

  if (message?.type === 'username_check') {
    void (async () => {
      const configured = isLeaderboardConfigured();
      if (!configured) {
        sendResponse({ available: false, configured: false });
        return;
      }
      const settings = await getSettingsSafe();
      try {
        const available = await checkUsernameAvailable(
          String(message.username),
          settings.playerId,
        );
        sendResponse({ available, configured: true });
      } catch {
        sendResponse({ available: false, configured: true });
      }
    })();
    return true;
  }

  if (message?.type === 'username_claim') {
    void (async () => {
      const configured = isLeaderboardConfigured();
      if (!configured) {
        sendResponse({ ok: false, error: 'invalid_format', configured: false });
        return;
      }
      const settings = await getSettingsSafe();
      try {
        const result = await claimUsernameApi(settings.playerId, String(message.username));
        if (result.ok) {
          const usernameSetAt = new Date(result.username_set_at).getTime();
          await chrome.storage.sync.set({
            username: result.username,
            usernameSetAt,
          });
        }
        sendResponse({ ...result, configured: true });
      } catch {
        sendResponse({ ok: false, error: 'invalid_format', configured: true });
      }
    })();
    return true;
  }

  if (message?.type === 'leaderboard_fetch') {
    void (async () => {
      const configured = isLeaderboardConfigured();
      if (!configured) {
        sendResponse({ ok: true, entries: [], configured: false });
        return;
      }
      try {
        const entries = await fetchGlobalLeaderboard(message.game as GameId);
        sendResponse({ ok: true, entries, configured: true });
      } catch (err) {
        sendResponse({
          ok: true,
          entries: [],
          configured: true,
          error: err instanceof Error ? err.message : 'fetch failed',
        });
      }
    })();
    return true;
  }

  if (message?.type === 'leaderboard_submit') {
    void (async () => {
      const configured = isLeaderboardConfigured();
      if (!configured) {
        sendResponse({ ok: false, configured: false, error: 'not configured' });
        return;
      }

      const settings = await getSettingsSafe();
      if (!settings.leaderboardOptIn) {
        sendResponse({ ok: true, submitted: false, configured: true });
        return;
      }

      if (!settings.playerId || !hasRegisteredUsername(settings)) {
        sendResponse({ ok: false, configured: true, error: 'username required' });
        return;
      }

      try {
        const submitted = await submitGlobalScore(
          message.game as GameId,
          Number(message.score),
          settings.playerId,
        );
        sendResponse({ ok: submitted, submitted, configured: true });
      } catch (err) {
        sendResponse({
          ok: false,
          configured: true,
          error: err instanceof Error ? err.message : 'submit failed',
        });
      }
    })();
    return true;
  }

  return false;
});

export {};
