/** Local or deployed leaderboard API. Set at build time via .env. */
export const LEADERBOARD_API_URL =
  (import.meta.env.VITE_LEADERBOARD_API_URL as string | undefined)?.replace(/\/$/, '') ??
  '';

export function isLeaderboardConfigured(): boolean {
  return LEADERBOARD_API_URL.length > 0;
}
