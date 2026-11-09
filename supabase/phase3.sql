-- Walk & Talk — Phase 3 database update (surprises, share link, suggest-a-date link)
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run more than once.

-- ───────── Surprise dates ─────────
-- A surprise idea is hidden from the other person until they tap Peek (added to revealed_to)
-- or it's marked Done.
alter table public.ideas add column if not exists is_surprise boolean not null default false;
alter table public.ideas add column if not exists revealed_to uuid[] not null default '{}';

-- ───────── Secret links (share + suggest) ─────────
-- One row per link. Only the two of you can read or change them; the public pages
-- never read this table directly — they go through the functions below.
create table if not exists public.links (
  kind       text primary key check (kind in ('share', 'suggest')),
  token      text not null check (length(token) >= 20),
  enabled    boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.links enable row level security;
drop policy if exists "members only" on public.links;
create policy "members only" on public.links for all to authenticated
  using (public.is_member()) with check (public.is_member());

-- ───────── Suggestions from friends ─────────
create table if not exists public.suggestions (
  id         uuid primary key default gen_random_uuid(),
  from_name  text not null,
  title      text not null,
  details    text not null default '',
  created_at timestamptz not null default now()
);
alter table public.suggestions enable row level security;
drop policy if exists "members only" on public.suggestions;
create policy "members only" on public.suggestions for all to authenticated
  using (public.is_member()) with check (public.is_member());

-- A date is shareable unless it belongs to a surprise that hasn't happened yet
create or replace function public.outing_is_shareable(p_outing uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.outings o left join public.ideas i on i.id = o.idea_id
    where o.id = p_outing and (i.id is null or not i.is_surprise or i.status = 'done')
  );
$$;

-- What the public share page gets: titles, days, recaps and photo paths. Nothing else
-- (no comments, ratings, reactions, places, ideas or surprises).
create or replace function public.shared_dates(p_token text)
returns json language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.links where kind = 'share' and enabled and token = p_token) then
    json_build_object(
      'names', (select coalesce(json_agg(display_name order by created_at), '[]'::json) from public.members),
      'dates', (select coalesce(json_agg(json_build_object(
                  'id', o.id,
                  'title', coalesce(nullif(o.title, ''), i.title, 'A date'),
                  'day', o.happened_on,
                  'recap', o.recap,
                  'photos', (select coalesce(json_agg(p.path order by p.created_at), '[]'::json) from public.photos p where p.outing_id = o.id)
                ) order by o.happened_on desc, o.created_at desc), '[]'::json)
                from public.outings o left join public.ideas i on i.id = o.idea_id
                where public.outing_is_shareable(o.id))
    )
  end;
$$;

-- Photos can be opened by visitors only while the share link is on, and only for shareable dates.
create or replace function public.photo_is_shared(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_outing uuid;
begin
  if not exists (select 1 from public.links where kind = 'share' and enabled) then return false; end if;
  begin v_outing := split_part(p_name, '/', 1)::uuid; exception when others then return false; end;
  return public.outing_is_shareable(v_outing);
end $$;

drop policy if exists "shared photos" on storage.objects;
create policy "shared photos" on storage.objects for select to anon
  using (bucket_id = 'photos' and public.photo_is_shared(name));

-- What the public suggest page gets: just your names (or null if the link is off/wrong)
create or replace function public.suggest_info(p_token text)
returns json language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.links where kind = 'suggest' and enabled and token = p_token) then
    json_build_object('names', (select coalesce(json_agg(display_name order by created_at), '[]'::json) from public.members))
  end;
$$;

-- Friends drop an idea in the box (only while the suggest link is on)
create or replace function public.suggest_date(p_token text, p_name text, p_title text, p_details text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.links where kind = 'suggest' and enabled and token = p_token) then
    raise exception 'This suggestion link is turned off';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_title), '') = '' then
    raise exception 'Please add your name and an idea';
  end if;
  if (select count(*) from public.suggestions) >= 50 then
    raise exception 'The suggestion box is full right now — try again later';
  end if;
  insert into public.suggestions (from_name, title, details)
  values (left(trim(p_name), 60), left(trim(p_title), 140), left(coalesce(trim(p_details), ''), 1000));
  return true;
end $$;

revoke all on function public.outing_is_shareable(uuid) from public;
revoke all on function public.photo_is_shared(text) from public;
grant execute on function public.photo_is_shared(text) to anon, authenticated;
grant execute on function public.shared_dates(text) to anon, authenticated;
grant execute on function public.suggest_info(text) to anon, authenticated;
grant execute on function public.suggest_date(text, text, text, text) to anon, authenticated;

-- live updates for the new tables
do $$
declare t text;
begin
  foreach t in array array['links', 'suggestions'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
