// Walk & Talk — "notify" Edge Function.
// The database calls this when something new is added; it sends a push notification
// to the OTHER person's phone(s). Paste this whole file into Supabase → Edge Functions →
// Deploy a new function → Via Editor, name it  notify , and turn OFF "Verify JWT"
// (the WEBHOOK_SECRET check below does that job instead).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const APP_URL = 'https://emilierezendes-sudo.github.io/walk-and-talk/';
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
webpush.setVapidDetails(APP_URL, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

type Rec = Record<string, any>;
const short = (s: string, n = 120) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

async function nameOf(id: string | null) {
  if (!id) return 'Someone';
  const { data } = await sb.from('members').select('display_name').eq('id', id).maybeSingle();
  return data?.display_name || 'Someone';
}

// Turn a new row into { actor, title, body, url } — or null for "don't notify"
async function describe(table: string, r: Rec) {
  if (table === 'comments') {
    const who = await nameOf(r.created_by);
    let body = short(r.body);
    if (r.target_type === 'idea') {
      // don't spoil a surprise in a notification
      const { data: i } = await sb.from('ideas').select('is_surprise, status').eq('id', r.target_id).maybeSingle();
      if (i?.is_surprise && i.status !== 'done') body = 'A comment on a surprise — open the app to see it';
    }
    return { actor: r.created_by, title: `${who} commented`, body, url: `#/${r.target_type === 'idea' ? 'idea' : 'outing'}/${r.target_id}` };
  }
  if (table === 'ideas') {
    const who = await nameOf(r.created_by);
    if (r.is_surprise) {
      return { actor: r.created_by, title: `${who} is planning a surprise for you`, body: r.planned_for ? `Save the day: ${fmtDay(r.planned_for)}` : 'Details are a secret — for now', url: `#/idea/${r.id}` };
    }
    return { actor: r.created_by, title: `${who} added a date idea`, body: short(r.title), url: `#/idea/${r.id}` };
  }
  if (table === 'outings') {
    const who = await nameOf(r.created_by);
    let title = r.title;
    if (!title && r.idea_id) title = (await sb.from('ideas').select('title').eq('id', r.idea_id).maybeSingle()).data?.title;
    return { actor: r.created_by, title: `${who} logged a date`, body: short(title || 'Tap to add your rating and comments'), url: `#/outing/${r.id}` };
  }
  if (table === 'suggestions') {
    return { actor: null, title: 'New date suggestion', body: short(`${r.from_name} suggested: ${r.title}`), url: '#/ideas' };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' || req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('Not allowed', { status: 401 });
  }
  try {
    const { table, record } = await req.json();
    const msg = await describe(table, record || {});
    if (!msg) return new Response('ignored');

    let q = sb.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth');
    if (msg.actor) q = q.neq('user_id', msg.actor);
    const { data: subs, error } = await q;
    if (error) throw error;

    const payload = JSON.stringify({ title: msg.title, body: msg.body, url: APP_URL + msg.url, tag: `${table}-${record.id}` });
    const results = await Promise.allSettled((subs || []).map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 })
        .catch(async (e: any) => {
          // phone unsubscribed or the app was removed: forget this subscription
          if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from('push_subscriptions').delete().eq('id', s.id);
          throw e;
        })));
    const sent = results.filter((x) => x.status === 'fulfilled').length;
    return new Response(JSON.stringify({ sent, of: results.length }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(String((e as Error)?.message || e), { status: 500 });
  }
});
