import { DEFAULT_SETTINGS } from '../shared/constants';
import { ensureProfileSettings } from '../shared/profile';
import type { GameId } from '../shared/constants';
import { getSettingsSafe } from '../shared/extension-context';
import {
  fetchGlobalLeaderboard,
  submitGlobalScore,
  wakeLeaderboard,
} from '../shared/leaderboard-api';
import { isLeaderboardConfigured } from '../shared/leaderboard-config';
import type { LeaderboardPeriod } from '../shared/leaderboard';
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

  if (message?.type === 'leaderboard_wake') {
    void (async () => {
      const configured = isLeaderboardConfigured();
      if (!configured) {
        sendResponse({ ok: false, configured: false });
        return;
      }
      try {
        const ok = await wakeLeaderboard();
        sendResponse({ ok, configured: true, waking: !ok });
      } catch (err) {
        sendResponse({
          ok: false,
          configured: true,
          waking: true,
          error: err instanceof Error ? err.message : 'wake failed',
        });
      }
    })();
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
        const period = (message.period as LeaderboardPeriod) || 'all';
        const result = await fetchGlobalLeaderboard(message.game as GameId, period);
        sendResponse({
          ok: true,
          entries: result.entries,
          configured: true,
          period: result.period,
          day: result.day,
          waking: result.waking,
        });
      } catch (err) {
        sendResponse({
          ok: true,
          entries: [],
          configured: true,
          waking: true,
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
        const result = await submitGlobalScore(
          message.game as GameId,
          Number(message.score),
          settings.playerId,
          Number(message.durationMs ?? 0),
          message.seed != null ? Number(message.seed) : undefined,
        );
        sendResponse({
          ok: result.submitted,
          submitted: result.submitted,
          configured: true,
          waking: result.waking,
          error: result.error,
        });
      } catch (err) {
        sendResponse({
          ok: false,
          configured: true,
          waking: true,
          error: err instanceof Error ? err.message : 'submit failed',
        });
      }
    })();
    return true;
  }

  return false;
});

export {};
