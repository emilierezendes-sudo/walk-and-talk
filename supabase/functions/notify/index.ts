// Walk & Talk — "notify" Edge Function.
// The database calls this when something new is added; it sends a push notification
// to the OTHER person's phone(s). Paste this whole file into Supabase → Edge Functions →
// notify → Code, and Deploy. "Verify JWT" must be OFF (the WEBHOOK_SECRET check does that job).
//
// Everything that can fail (missing secrets, loading the push library) happens inside the
// request, after the secret check, so problems show up as a clear message instead of a crash.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const APP_URL = 'https://emilierezendes-sudo.github.io/walk-and-talk/';
const env = (k: string) => (Deno.env.get(k) || '').trim();

type Rec = Record<string, any>;
const short = (s: string, n = 120) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let webpush: any = null;
async function push() {
  if (webpush) return webpush;
  const missing = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'].filter((k) => !env(k));
  if (missing.length) throw new Error(`Missing secret(s): ${missing.join(', ')}`);
  const mod = await import('npm:web-push@3.6.7');
  const wp = mod.default ?? mod;
  wp.setVapidDetails(APP_URL, env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  webpush = wp;
  return wp;
}

let sbClient: any = null;
const db = () => (sbClient ||= createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } }));

async function nameOf(id: string | null) {
  if (!id) return 'Someone';
  const { data } = await db().from('members').select('display_name').eq('id', id).maybeSingle();
  return data?.display_name || 'Someone';
}

// Turn a new row into { actor, title, body, url } — or null for "don't notify"
async function describe(table: string, r: Rec) {
  if (table === 'comments') {
    const who = await nameOf(r.created_by);
    let body = short(r.body);
    if (r.target_type === 'idea') {
      // don't spoil a surprise in a notification
      const { data: i } = await db().from('ideas').select('is_surprise, status').eq('id', r.target_id).maybeSingle();
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
    if (!title && r.idea_id) title = (await db().from('ideas').select('title').eq('id', r.idea_id).maybeSingle()).data?.title;
    return { actor: r.created_by, title: `${who} logged a date`, body: short(title || 'Tap to add your rating and comments'), url: `#/outing/${r.id}` };
  }
  if (table === 'suggestions') {
    return { actor: null, title: 'New date suggestion', body: short(`${r.from_name} suggested: ${r.title}`), url: '#/ideas' };
  }
  if (table === '_test') {
    return { actor: null, title: 'Walk & Talk notifications work', body: 'This is a test — you’re all set.', url: '' };
  }
  return null;
}

Deno.serve(async (req) => {
  const secret = env('WEBHOOK_SECRET');
  if (!secret) return json({ error: 'Missing secret: WEBHOOK_SECRET' }, 500);
  if (req.method !== 'POST' || req.headers.get('x-webhook-secret') !== secret) return json({ error: 'Not allowed' }, 401);

  try {
    const { table, record = {} } = await req.json();

    // health check: confirms secrets + push library, sends nothing
    if (table === '_ping') {
      await push();
      const { count, error } = await db().from('push_subscriptions').select('id', { count: 'exact', head: true });
      if (error) throw error;
      return json({ ok: true, phones: count ?? 0 });
    }

    const msg = await describe(table, record);
    if (!msg) return json({ ignored: table });
    const wp = await push();

    let q = db().from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth');
    if (msg.actor) q = q.neq('user_id', msg.actor);
    const { data: subs, error } = await q;
    if (error) throw error;

    const payload = JSON.stringify({ title: msg.title, body: msg.body, url: APP_URL + msg.url, tag: `${table}-${record.id || Date.now()}` });
    const results = await Promise.allSettled((subs || []).map((s: Rec) =>
      wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 })
        .catch(async (e: any) => {
          // phone unsubscribed or the app was removed: forget this subscription
          if (e?.statusCode === 404 || e?.statusCode === 410) await db().from('push_subscriptions').delete().eq('id', s.id);
          throw e;
        })));
    const failed = results.filter((x) => x.status === 'rejected').map((x: any) => String(x.reason?.body || x.reason?.message || x.reason).slice(0, 200));
    return json({ sent: results.length - failed.length, of: results.length, failed });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
