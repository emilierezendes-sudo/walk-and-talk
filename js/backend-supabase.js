// Real backend: Supabase (database + email/password sign in + photo storage + live updates)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';

const BUCKET = 'photos';
const appUrl = () => location.origin + location.pathname;

export function createSupabaseBackend({ url, key }) {
  const sb = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const ok = ({ data, error }) => { if (error) throw error; return data; };
  const asUser = (u) => (u ? { id: u.id, email: u.email } : null);

  return {
    mode: 'supabase',

    async getUser() {
      const { data } = await sb.auth.getSession();
      return asUser(data.session?.user);
    },
    async signIn(email, password) {
      const d = ok(await sb.auth.signInWithPassword({ email, password }));
      return asUser(d.user);
    },
    // Creates the account; Supabase emails a confirmation link before it can be used.
    async signUp(email, password) {
      const d = ok(await sb.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } }));
      return { needsConfirm: !d.session, user: asUser(d.user) };
    },
    async sendReset(email) {
      ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() }));
    },
    async setPassword(password) { ok(await sb.auth.updateUser({ password })); },
    async signOut() { await sb.auth.signOut(); },
    async isMember() { return ok(await sb.rpc('is_member')) === true; },

    async selectAll(table) {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const rows = ok(await sb.from(table).select('*').range(from, from + 999));
        out.push(...rows);
        if (rows.length < 1000) return out;
      }
    },
    async insert(table, rows) { return ok(await sb.from(table).insert(rows).select()); },
    async update(table, id, patch) { return ok(await sb.from(table).update(patch).eq('id', id).select())[0]; },
    async upsert(table, row) { return ok(await sb.from(table).upsert(row).select())[0]; },
    async remove(table, id) { ok(await sb.from(table).delete().eq('id', id)); },
    async removeMany(table, ids) { if (ids.length) ok(await sb.from(table).delete().in('id', ids)); },

    async upload(path, blob, contentType) {
      ok(await sb.storage.from(BUCKET).upload(path, blob, { contentType, upsert: false }));
    },
    async removeFiles(paths) { if (paths.length) ok(await sb.storage.from(BUCKET).remove(paths)); },
    async signedUrls(paths) {
      const d = ok(await sb.storage.from(BUCKET).createSignedUrls(paths, 60 * 60));
      return Object.fromEntries(d.filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
    },

    subscribe(cb) {
      const ch = sb.channel('walk-and-talk')
        .on('postgres_changes', { event: '*', schema: 'public' }, (p) => cb(p))
        .subscribe();
      return () => sb.removeChannel(ch);
    },
  };
}
