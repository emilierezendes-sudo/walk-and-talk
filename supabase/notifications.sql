-- Walk & Talk — notifications (database side). Safe to run more than once.
-- Run in Supabase → SQL Editor. Then run your private notify-setup.sql.

-- pg_net lets the database make a web request (to the notify function) when rows are added
create extension if not exists pg_net with schema extensions;

-- Each phone that turned notifications on
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.members(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own subscriptions" on public.push_subscriptions;
create policy "own subscriptions" on public.push_subscriptions for all to authenticated
  using (public.is_member() and user_id = auth.uid())
  with check (public.is_member() and user_id = auth.uid());

-- Where to send changes + the shared secret. No policies → only the trigger below can read it.
create table if not exists public.notify_config (
  id           int primary key default 1 check (id = 1),
  function_url text not null,
  secret       text not null
);
alter table public.notify_config enable row level security;

create or replace function public.notify_change()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare c public.notify_config;
begin
  select * into c from public.notify_config where id = 1;
  if c.function_url is null then return new; end if;
  perform net.http_post(
    url := c.function_url,
    body := jsonb_build_object('table', tg_table_name, 'record', to_jsonb(new)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', c.secret),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  return new; -- a notification problem must never stop something from saving
end $$;

drop trigger if exists notify_comments on public.comments;
drop trigger if exists notify_ideas on public.ideas;
drop trigger if exists notify_outings on public.outings;
drop trigger if exists notify_suggestions on public.suggestions;
create trigger notify_comments    after insert on public.comments    for each row execute function public.notify_change();
create trigger notify_ideas       after insert on public.ideas       for each row execute function public.notify_change();
create trigger notify_outings     after insert on public.outings     for each row execute function public.notify_change();
create trigger notify_suggestions after insert on public.suggestions for each row execute function public.notify_change();
