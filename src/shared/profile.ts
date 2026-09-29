import { DEFAULT_SETTINGS, type ChillYWaitSettings } from './constants';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;
export const USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** @deprecated use username fields */
export const DISPLAY_NAME_MIN = USERNAME_MIN;
export const DISPLAY_NAME_MAX = USERNAME_MAX;

export function generatePlayerId(): string {
  return crypto.randomUUID();
}

/** Lowercase alphanumeric + underscore only. */
export function sanitizeUsername(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, USERNAME_MAX);
}

export function isValidUsername(name: string): boolean {
  const clean = sanitizeUsername(name);
  return (
    clean.length >= USERNAME_MIN &&
    clean.length <= USERNAME_MAX &&
    /^[a-z0-9_]+$/.test(clean)
  );
}

export function canChangeUsername(usernameSetAt: number, now = Date.now()): boolean {
  if (!usernameSetAt) return true;
  return now - usernameSetAt >= USERNAME_CHANGE_COOLDOWN_MS;
}

export function msUntilUsernameChange(usernameSetAt: number, now = Date.now()): number {
  if (!usernameSetAt) return 0;
  const remaining = USERNAME_CHANGE_COOLDOWN_MS - (now - usernameSetAt);
  return Math.max(0, remaining);
}

export function formatCooldownRemaining(ms: number): string {
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days <= 1) return '1 day';
  return `${days} days`;
}

/** @deprecated */
export const sanitizeDisplayName = sanitizeUsername;
/** @deprecated */
export const isValidDisplayName = isValidUsername;

function migrateLegacyDisplayName(settings: Partial<ChillYWaitSettings>): {
  username: string;
  usernameSetAt: number;
} {
  const legacy = (settings as { displayName?: string }).displayName;
  const username = settings.username || (legacy ? sanitizeUsername(legacy) : '');
  const usernameSetAt = settings.usernameSetAt ?? 0;
  return { username, usernameSetAt };
}

/** Ensure every install has a stable player id. Username must be claimed separately. */
export function ensureProfileSettings(
  settings: Partial<ChillYWaitSettings>,
): ChillYWaitSettings {
  const base = { ...DEFAULT_SETTINGS, ...settings };
  const { username, usernameSetAt } = migrateLegacyDisplayName(base);
  return {
    ...base,
    playerId: base.playerId || generatePlayerId(),
    username: isValidUsername(username) ? sanitizeUsername(username) : '',
    usernameSetAt,
    leaderboardOptIn: base.leaderboardOptIn ?? false,
  };
}

export function hasRegisteredUsername(
  settings: Pick<ChillYWaitSettings, 'username' | 'usernameSetAt'>,
): boolean {
  return isValidUsername(settings.username) && settings.usernameSetAt > 0;
}
