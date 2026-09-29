-- =============================================================================
-- 1. TABLES
-- =============================================================================

create table public.player_profiles (
  player_id uuid primary key,
  username text not null,
  username_set_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,16}$')
);

create unique index idx_player_profiles_username
  on public.player_profiles (username);

alter table public.player_profiles enable row level security;

create policy "player_profiles_public_read"
  on public.player_profiles for select
  using (true);

create table public.leaderboard_scores (
  player_id uuid not null references public.player_profiles (player_id) on delete cascade,
  username text not null,
  game_id text not null check (game_id in ('traffic', 'coffee', 'compile-run')),
  score integer not null check (score >= 1 and score < 10000000),
  updated_at timestamptz not null default now(),
  primary key (player_id, game_id)
);

create index idx_leaderboard_game_score
  on public.leaderboard_scores (game_id, score desc);

alter table public.leaderboard_scores enable row level security;

create policy "leaderboard_public_read"
  on public.leaderboard_scores for select
  using (true);

-- =============================================================================
-- 3. RPC FUNCTIONS
-- =============================================================================

create function public.check_username_available(
  p_username text,
  p_player_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_username text;
  v_owner uuid;
begin
  v_username := lower(trim(p_username));
  if v_username !~ '^[a-z0-9_]{3,16}$' then
    return false;
  end if;

  select player_id into v_owner
  from public.player_profiles
  where username = v_username;

  if v_owner is null then
    return true;
  end if;

  return p_player_id is not null and v_owner = p_player_id;
end;
$$;

grant execute on function public.check_username_available(text, uuid) to anon;

create function public.claim_username(
  p_player_id uuid,
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_existing public.player_profiles%rowtype;
  v_eligible_at timestamptz;
begin
  v_username := lower(trim(p_username));

  if v_username !~ '^[a-z0-9_]{3,16}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_format');
  end if;

  select * into v_existing
  from public.player_profiles
  where player_id = p_player_id;

  if v_existing.player_id is null then
    if exists (
      select 1 from public.player_profiles where username = v_username
    ) then
      return jsonb_build_object('ok', false, 'error', 'taken');
    end if;

    insert into public.player_profiles (player_id, username)
    values (p_player_id, v_username);

    return jsonb_build_object(
      'ok', true,
      'username', v_username,
      'username_set_at', now()
    );
  end if;

  if v_existing.username = v_username then
    return jsonb_build_object(
      'ok', true,
      'username', v_username,
      'username_set_at', v_existing.username_set_at
    );
  end if;

  v_eligible_at := v_existing.username_set_at + interval '30 days';
  if now() < v_eligible_at then
    return jsonb_build_object(
      'ok', false,
      'error', 'cooldown',
      'eligible_at', v_eligible_at
    );
  end if;

  if exists (
    select 1 from public.player_profiles
    where username = v_username and player_id <> p_player_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'taken');
  end if;

  update public.player_profiles
  set username = v_username,
      username_set_at = now()
  where player_id = p_player_id;

  update public.leaderboard_scores
  set username = v_username
  where player_id = p_player_id;

  return jsonb_build_object(
    'ok', true,
    'username', v_username,
    'username_set_at', now()
  );
end;
$$;

grant execute on function public.claim_username(uuid, text) to anon;

create function public.submit_leaderboard_score(
  p_player_id uuid,
  p_game_id text,
  p_score integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  if p_game_id not in ('traffic', 'coffee', 'compile-run') then
    raise exception 'invalid game_id';
  end if;
  if p_score < 1 or p_score >= 10000000 then
    raise exception 'invalid score';
  end if;

  select username into v_username
  from public.player_profiles
  where player_id = p_player_id;

  if v_username is null then
    raise exception 'username_not_registered';
  end if;

  insert into public.leaderboard_scores (player_id, username, game_id, score, updated_at)
  values (p_player_id, v_username, p_game_id, p_score, now())
  on conflict (player_id, game_id) do update
    set score = greatest(public.leaderboard_scores.score, excluded.score),
        username = excluded.username,
        updated_at = now();
end;
$$;

grant execute on function public.submit_leaderboard_score(uuid, text, integer) to anon;
