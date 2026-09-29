import { describe, expect, it } from 'vitest';
import {
  canChangeUsername,
  ensureProfileSettings,
  formatCooldownRemaining,
  hasRegisteredUsername,
  isValidUsername,
  msUntilUsernameChange,
  sanitizeUsername,
  USERNAME_CHANGE_COOLDOWN_MS,
} from './profile';
import { DEFAULT_SETTINGS } from './constants';

describe('sanitizeUsername', () => {
  it('lowercases and strips invalid characters', () => {
    expect(sanitizeUsername('  Pixel_Rider!  ')).toBe('pixel_rider');
  });

  it('caps length at 16', () => {
    expect(sanitizeUsername('abcdefghijklmnopqrstuvwxyz')).toHaveLength(16);
  });
});

describe('isValidUsername', () => {
  it('accepts 3–16 char usernames', () => {
    expect(isValidUsername('abc')).toBe(true);
    expect(isValidUsername('pixel_rider99')).toBe(true);
  });

  it('rejects too short names', () => {
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('')).toBe(false);
  });
});

describe('username change cooldown', () => {
  const now = Date.UTC(2026, 5, 1);

  it('allows change after 30 days', () => {
    const setAt = now - USERNAME_CHANGE_COOLDOWN_MS - 1;
    expect(canChangeUsername(setAt, now)).toBe(true);
    expect(msUntilUsernameChange(setAt, now)).toBe(0);
  });

  it('blocks change within 30 days', () => {
    const setAt = now - 5 * 24 * 60 * 60 * 1000;
    expect(canChangeUsername(setAt, now)).toBe(false);
    expect(msUntilUsernameChange(setAt, now)).toBeGreaterThan(0);
  });

  it('formats remaining days', () => {
    expect(formatCooldownRemaining(3 * 24 * 60 * 60 * 1000)).toBe('3 days');
    expect(formatCooldownRemaining(12 * 60 * 60 * 1000)).toBe('1 day');
  });
});

describe('ensureProfileSettings', () => {
  it('creates player id but not username when missing', () => {
    const result = ensureProfileSettings({
      ...DEFAULT_SETTINGS,
      playerId: '',
      username: '',
    });
    expect(result.playerId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(result.username).toBe('');
    expect(hasRegisteredUsername(result)).toBe(false);
  });

  it('preserves existing username', () => {
    const result = ensureProfileSettings({
      ...DEFAULT_SETTINGS,
      playerId: '11111111-1111-1111-1111-111111111111',
      username: 'testplayer',
      usernameSetAt: 1_700_000_000_000,
      leaderboardOptIn: true,
    });
    expect(result.username).toBe('testplayer');
    expect(result.usernameSetAt).toBe(1_700_000_000_000);
    expect(hasRegisteredUsername(result)).toBe(true);
  });

  it('migrates legacy displayName as draft only (not registered)', () => {
    const result = ensureProfileSettings({
      ...DEFAULT_SETTINGS,
      displayName: 'LegacyName',
    } as Partial<typeof DEFAULT_SETTINGS>);
    expect(result.username).toBe('legacyname');
    expect(result.usernameSetAt).toBe(0);
    expect(hasRegisteredUsername(result)).toBe(false);
  });
});
