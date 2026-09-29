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

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.sync.get(null, (existing) => {
    const merged = ensureProfileSettings({ ...DEFAULT_SETTINGS, ...existing });
    void chrome.storage.sync.set(merged);
  });
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
