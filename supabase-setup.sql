-- Airport Game backend: leaderboard + suggestion box.
-- Paste this whole file into the Supabase SQL Editor and click Run.

create table public.leaderboard (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 20),
  satisfaction int not null check (satisfaction between 0 and 100),
  ops_score int not null check (ops_score between -100000 and 100000),
  seed text not null check (char_length(seed) <= 40)
);

create table public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) <= 20),
  message text not null check (char_length(message) between 1 and 2000)
);

alter table public.leaderboard enable row level security;
alter table public.feedback enable row level security;

-- leaderboard: anyone can submit and read
create policy "anon can insert scores" on public.leaderboard
  for insert to anon with check (true);
create policy "anon can read scores" on public.leaderboard
  for select to anon using (true);

-- feedback: write-only for players; only the dashboard owner reads it
create policy "anon can insert feedback" on public.feedback
  for insert to anon with check (true);
-- (no select policy on feedback: the anon key cannot read it back)
