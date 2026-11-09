-- Walk & Talk — database setup (Phase 1)
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run more than once.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Who is allowed in. Rows are added by allowlist.sql (kept off GitHub).
-- No policies on this table → the app itself can never read or change it.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.allowed_emails (
  email text primary key
);
alter table public.allowed_emails enable row level security;

create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
grant execute on function public.is_member() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────
create table if not exists public.members (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  emoji      text not null default '🏷️',
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ideas (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text not null default '',
  status       text not null default 'not_yet' check (status in ('not_yet','planned','done')),
  want         boolean not null default false,          -- 😍 "we really want to do this"
  tag_ids      uuid[] not null default '{}',
  planned_for  date,
  link         text not null default '',
  location     text not null default '',
  suggested_by uuid references public.members(id) on delete set null,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One row per date you actually went on (the "date log")
create table if not exists public.outings (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid references public.ideas(id) on delete set null,
  title       text not null default '',                 -- used when not linked to an idea
  happened_on date not null default current_date,
  recap       text not null default '',
  location    text not null default '',
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.photos (
  id         uuid primary key default gen_random_uuid(),
  outing_id  uuid not null references public.outings(id) on delete cascade,
  path       text not null,                             -- file path in the "photos" storage bucket
  width      int,
  height     int,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('idea','outing')),
  target_id   uuid not null,
  body        text not null,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.reactions (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('idea','outing','comment')),
  target_id   uuid not null,
  emoji       text not null,
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (target_type, target_id, emoji, created_by)
);

-- Small key/value settings, e.g. id = 'baseline' → {"count":17,"as_of":"2026-11-03"}
create table if not exists public.settings (
  id         text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists outings_idea_idx   on public.outings(idea_id);
create index if not exists photos_outing_idx  on public.photos(outing_id);
create index if not exists comments_target_idx  on public.comments(target_type, target_id);
create index if not exists reactions_target_idx on public.reactions(target_type, target_id);

-- keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists ideas_touch    on public.ideas;
drop trigger if exists outings_touch  on public.outings;
drop trigger if exists settings_touch on public.settings;
create trigger ideas_touch    before update on public.ideas    for each row execute function public.touch_updated_at();
create trigger outings_touch  before update on public.outings  for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Security: only the two allow-listed people can see or change anything
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['tags','ideas','outings','photos','comments','reactions','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "members only" on public.%I', t);
    execute format('create policy "members only" on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())', t);
  end loop;
end $$;

alter table public.members enable row level security;
drop policy if exists "members read"       on public.members;
drop policy if exists "members add self"   on public.members;
drop policy if exists "members edit self"  on public.members;
create policy "members read"      on public.members for select to authenticated using (public.is_member());
create policy "members add self"  on public.members for insert to authenticated with check (public.is_member() and id = auth.uid());
create policy "members edit self" on public.members for update to authenticated using (public.is_member() and id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Photo storage (private bucket)
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 15728640, array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif'])
on conflict (id) do nothing;

drop policy if exists "members read photos"   on storage.objects;
drop policy if exists "members add photos"    on storage.objects;
drop policy if exists "members delete photos" on storage.objects;
create policy "members read photos"   on storage.objects for select to authenticated using (bucket_id = 'photos' and public.is_member());
create policy "members add photos"    on storage.objects for insert to authenticated with check (bucket_id = 'photos' and public.is_member());
create policy "members delete photos" on storage.objects for delete to authenticated using (bucket_id = 'photos' and public.is_member());

-- ─────────────────────────────────────────────────────────────
-- Live updates: when one of you changes something, the other's app refreshes
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['members','tags','ideas','outings','photos','comments','reactions','settings'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ═════════════ Phase 2 (also available on its own as phase2.sql) ═════════════
-- Walk & Talk â€” Phase 2 database update (star ratings + map locations)
-- Paste into Supabase â†’ SQL Editor â†’ New query â†’ Run. Safe to run more than once.

-- â­ One rating per person per date
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

-- ðŸ“ Map coordinates for dates and ideas
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

