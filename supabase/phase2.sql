-- Walk & Talk — Phase 2 database update (star ratings + map locations)
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run more than once.

-- ⭐ One rating per person per date
create table if not exists public.ratings (
  id         uuid primary key default gen_random_uuid(),
  outing_id  uuid not null references public.outings(id) on delete cascade,
  stars      int  not null check (stars between 1 and 5),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (outing_id, created_by)
);
alter table public.ratings enable row level security;
drop policy if exists "members only" on public.ratings;
create policy "members only" on public.ratings for all to authenticated
  using (public.is_member()) with check (public.is_member());

-- 📍 Map coordinates for dates and ideas
alter table public.outings add column if not exists lat double precision;
alter table public.outings add column if not exists lng double precision;
alter table public.ideas   add column if not exists lat double precision;
alter table public.ideas   add column if not exists lng double precision;

-- live updates for ratings
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ratings') then
    alter publication supabase_realtime add table public.ratings;
  end if;
end $$;
