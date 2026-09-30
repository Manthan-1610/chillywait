import { useEffect, useRef, useState } from 'preact/hooks';
import type { ActivationMode, ChillYWaitSettings, PlatformId } from '../shared/constants';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { getSettings, saveSettings } from '../shared/storage';
import { sendToActiveTab } from '../shared/messaging';
import { getExtensionVersion, isExtensionContextValid } from '../shared/extension-context';
import { getLeaderboardStatus } from '../shared/leaderboard-client';
import {
  canChangeUsername,
  formatCooldownRemaining,
  hasRegisteredUsername,
  isValidUsername,
  msUntilUsernameChange,
  sanitizeUsername,
  USERNAME_MAX,
  USERNAME_MIN,
} from '../shared/profile';
import { checkUsername, claimUsername } from '../shared/username-client';

const SITE_LABELS: Record<PlatformId, string> = {
  gemini: 'Gemini',
};

type AvailState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export function Popup() {
  const [settings, setSettings] = useState<ChillYWaitSettings>(DEFAULT_SETTINGS);
  const [version] = useState(() => getExtensionVersion());
  const [needsReload, setNeedsReload] = useState(!isExtensionContextValid());
  const [leaderboardConfigured, setLeaderboardConfigured] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [availState, setAvailState] = useState<AvailState>('idle');
  const [formError, setFormError] = useState('');
  const [claiming, setClaiming] = useState(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasUsername = hasRegisteredUsername(settings);
  const changeAllowed = canChangeUsername(settings.usernameSetAt);

  useEffect(() => {
    if (!isExtensionContextValid()) {
      setNeedsReload(true);
      return;
    }
    void getSettings()
      .then((s) => {
        setSettings(s);
        setUsernameDraft(s.username || '');
      })
      .catch(() => setNeedsReload(true));
    void getLeaderboardStatus()
      .then((s) => setLeaderboardConfigured(s.configured))
      .catch(() => setLeaderboardConfigured(false));
  }, []);

  const update = async (partial: Partial<ChillYWaitSettings>) => {
    if (!isExtensionContextValid()) {
      setNeedsReload(true);
      return;
    }
    const next = { ...settings, ...partial };
    setSettings(next);
    await saveSettings(partial);
  };

  const scheduleAvailabilityCheck = (raw: string) => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    const clean = sanitizeUsername(raw);
    if (!isValidUsername(clean)) {
      setAvailState(clean.length === 0 ? 'idle' : 'invalid');
      return;
    }
    if (hasUsername && clean === settings.username) {
      setAvailState('available');
      return;
    }
    setAvailState('checking');
    checkTimer.current = setTimeout(() => {
      void checkUsername(clean)
        .then((res) => {
          if (!res.configured) {
            setAvailState('idle');
            return;
          }
          setAvailState(res.available ? 'available' : 'taken');
        })
        .catch(() => setAvailState('idle'));
    }, 400);
  };

  const handleUsernameInput = (raw: string) => {
    setUsernameDraft(raw);
    setFormError('');
    scheduleAvailabilityCheck(raw);
  };

  const handleClaimUsername = async () => {
    const clean = sanitizeUsername(usernameDraft);
    if (!isValidUsername(clean)) {
      setFormError(`${USERNAME_MIN}–${USERNAME_MAX} chars: letters, numbers, underscore`);
      return;
    }
    if (hasUsername && !changeAllowed) {
      setFormError(
        `Username can be changed in ${formatCooldownRemaining(msUntilUsernameChange(settings.usernameSetAt))}`,
      );
      return;
    }
    if (availState !== 'available' && clean !== settings.username) {
      setFormError(availState === 'taken' ? 'Username is already taken' : 'Check availability first');
      return;
    }

    setClaiming(true);
    setFormError('');
    try {
      const result = await claimUsername(clean);
      if (!result.ok) {
        if (result.error === 'taken') setFormError('Username is already taken');
        else if (result.error === 'cooldown') {
          setFormError('You can only change your username once every 30 days');
        } else setFormError('Invalid username format');
        return;
      }
      const usernameSetAt = new Date(result.username_set_at).getTime();
      await update({ username: result.username, usernameSetAt });
      setUsernameDraft(result.username);
      setAvailState('available');
    } catch {
      setFormError('Could not claim username — try again');
    } finally {
      setClaiming(false);
    }
  };

  const toggleSite = (site: PlatformId) => {
    void update({
      enabledSites: {
        ...settings.enabledSites,
        [site]: !settings.enabledSites[site],
      },
    });
  };

  const availLabel = () => {
    if (availState === 'checking') return 'Checking…';
    if (availState === 'available') return '✓ Available';
    if (availState === 'taken') return '✗ Taken';
    if (availState === 'invalid') return 'Invalid format';
    return '';
  };

  return (
    <div class="popup">
      <h1>ChillYWait</h1>
      <p class="subtitle">Play while your LLM thinks</p>
      <p class="version">v{version} · arcade v1.6.10</p>

      {needsReload && (
        <p class="reload-notice">
          Extension was updated. Close this popup, refresh your LLM tab, then try
          again.
        </p>
      )}

      <section class="profile-section">
        <h2 class="section-title">Player profile</h2>

        {hasUsername ? (
          <p class="current-username">
            Signed in as <strong>@{settings.username}</strong>
          </p>
        ) : (
          <p class="field-hint field-hint--warn">Choose a unique username to play on leaderboards.</p>
        )}

        <div class="field">
          <label for="username">
            {hasUsername ? 'Change username' : 'Username'}
          </label>
          <div class="name-row">
            <input
              id="username"
              type="text"
              maxLength={USERNAME_MAX}
              value={usernameDraft}
              disabled={hasUsername && !changeAllowed}
              onInput={(e) => handleUsernameInput((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleClaimUsername();
              }}
              placeholder="pixel_rider"
              autoComplete="off"
              spellcheck={false}
            />
          </div>
          <div class="username-meta">
            <span
              class={`avail-badge avail-${availState}`}
              aria-live="polite"
            >
              {availLabel()}
            </span>
            <span class="field-hint">a–z, 0–9, underscore</span>
          </div>
          {formError && <p class="field-error">{formError}</p>}
          {hasUsername && !changeAllowed && (
            <p class="field-hint">
              Next change in{' '}
              {formatCooldownRemaining(msUntilUsernameChange(settings.usernameSetAt))}
            </p>
          )}
          {(!hasUsername || changeAllowed) && (
            <button
              type="button"
              class="btn btn-secondary"
              disabled={
                claiming ||
                !isValidUsername(sanitizeUsername(usernameDraft)) ||
                (availState !== 'available' &&
                  sanitizeUsername(usernameDraft) !== settings.username)
              }
              onClick={() => void handleClaimUsername()}
            >
              {claiming
                ? 'Saving…'
                : hasUsername
                  ? 'Update username'
                  : 'Claim username'}
            </button>
          )}
        </div>

        <label class="site-toggle leaderboard-opt">
          <input
            type="checkbox"
            checked={settings.leaderboardOptIn}
            disabled={!leaderboardConfigured || !hasUsername}
            onChange={() =>
              void update({ leaderboardOptIn: !settings.leaderboardOptIn })
            }
          />
          Share my best scores on the world leaderboard
        </label>
        {!leaderboardConfigured && (
          <p class="field-hint field-hint--warn">
            Leaderboard backend not configured in this build.
          </p>
        )}
        {leaderboardConfigured && !hasUsername && (
          <p class="field-hint">Claim a username above to enable leaderboard sharing.</p>
        )}
        {leaderboardConfigured && hasUsername && settings.leaderboardOptIn && (
          <p class="field-hint">Tap 🌍 in-game to view world rankings.</p>
        )}
      </section>

      <div class="field">
        <label for="activation">Activation mode</label>
        <select
          id="activation"
          value={settings.activationMode}
          onChange={(e) =>
            void update({
              activationMode: (e.target as HTMLSelectElement)
                .value as ActivationMode,
            })
          }
        >
          <option value="threshold">After delay (recommended)</option>
          <option value="immediate">Immediately when thinking starts</option>
        </select>
      </div>

      {settings.activationMode === 'threshold' && (
        <div class="field">
          <label for="delay">Delay before popup: {settings.delaySeconds}s</label>
          <input
            id="delay"
            type="range"
            min={3}
            max={30}
            value={settings.delaySeconds}
            onInput={(e) =>
              void update({
                delaySeconds: Number((e.target as HTMLInputElement).value),
              })
            }
          />
          <div class="delay-value">3–30 seconds</div>
        </div>
      )}

      <div class="field">
        <label>Enabled sites</label>
        <div class="sites">
          {(Object.keys(SITE_LABELS) as PlatformId[]).map((site) => (
            <label class="site-toggle" key={site}>
              <input
                type="checkbox"
                checked={settings.enabledSites[site]}
                onChange={() => toggleSite(site)}
              />
              {SITE_LABELS[site]}
            </label>
          ))}
        </div>
      </div>

      <button
        class="btn btn-primary"
        type="button"
        onClick={() => void sendToActiveTab({ type: 'manual_open' })}
      >
        Open games on current tab
      </button>

      <label class="debug-toggle site-toggle">
        <input
          type="checkbox"
          checked={settings.debug}
          onChange={() => void update({ debug: !settings.debug })}
        />
        Debug logging
      </label>
    </div>
  );
}
