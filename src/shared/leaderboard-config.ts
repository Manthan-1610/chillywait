/** Supabase REST endpoint — set at build time via .env (see .env.example). */
export const LEADERBOARD_SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export const LEADERBOARD_SUPABASE_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export function isLeaderboardConfigured(): boolean {
  return LEADERBOARD_SUPABASE_URL.length > 0 && LEADERBOARD_SUPABASE_KEY.length > 0;
}
