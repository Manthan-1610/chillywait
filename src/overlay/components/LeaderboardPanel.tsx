import { useEffect, useState } from 'preact/hooks';
import type { GameId } from '../../shared/constants';
import { getSettingsSafe } from '../../shared/extension-context';
import { fetchLeaderboard } from '../../shared/leaderboard-client';
import type { LeaderboardEntry } from '../../shared/leaderboard';
import { GAME_LABELS } from '../../shared/leaderboard';

interface LeaderboardPanelProps {
  game: GameId;
  onClose: () => void;
}

export function LeaderboardPanel({ game, onClose }: LeaderboardPanelProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    void (async () => {
      try {
        const settings = await getSettingsSafe();
        if (cancelled) return;
        setPlayerId(settings.playerId);
        setDisplayName(settings.username);

        const res = await fetchLeaderboard(game);
        if (cancelled) return;
        setConfigured(res.configured);
        setEntries(res.entries);
        if ('error' in res && res.error) setError(res.error);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load leaderboard');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [game]);

  return (
    <div class="leaderboard-backdrop" onClick={onClose}>
      <div
        class="leaderboard-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="World leaderboard"
      >
        <div class="leaderboard-header">
          <h2>🌍 WORLD — {GAME_LABELS[game]}</h2>
          <button type="button" class="leaderboard-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {loading && <p class="leaderboard-msg">Loading rankings…</p>}

        {!loading && !configured && (
          <p class="leaderboard-msg">
            Global leaderboard is not configured for this build. Set up Supabase in
            the project README and rebuild.
          </p>
        )}

        {!loading && configured && error && (
          <p class="leaderboard-msg leaderboard-msg--error">{error}</p>
        )}

        {!loading && configured && !error && entries.length === 0 && (
          <p class="leaderboard-msg">No scores yet — be the first!</p>
        )}

        {!loading && entries.length > 0 && (
          <ol class="leaderboard-list">
            {entries.map((entry) => {
              const isYou = entry.player_id === playerId;
              return (
                <li
                  key={`${entry.player_id}-${entry.rank}`}
                  class={`leaderboard-row${isYou ? ' leaderboard-row--you' : ''}`}
                >
                  <span class="lb-rank">#{entry.rank}</span>
                  <span class="lb-name">
                    @{entry.username}
                    {isYou ? ' (you)' : ''}
                  </span>
                  <span class="lb-score">{entry.score}</span>
                </li>
              );
            })}
          </ol>
        )}

        {!loading && configured && (
          <p class="leaderboard-foot">
            Playing as <strong>@{displayName || '…'}</strong>
          </p>
        )}
      </div>
    </div>
  );
}
