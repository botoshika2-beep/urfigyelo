create table if not exists public.urfigyelo_scores (
  name_key text primary key check (char_length(name_key) between 2 and 16),
  player_name text not null check (char_length(player_name) between 2 and 16),
  level integer not null check (level between 1 and 10000),
  updated_at timestamptz not null default now()
);

alter table public.urfigyelo_scores enable row level security;
grant select, insert, update on public.urfigyelo_scores to anon;

create policy "Anyone can read the public leaderboard"
  on public.urfigyelo_scores for select to anon using (true);
create policy "Anyone can add a leaderboard score"
  on public.urfigyelo_scores for insert to anon with check (true);
create policy "Anyone can update a leaderboard score"
  on public.urfigyelo_scores for update to anon using (true) with check (true);
