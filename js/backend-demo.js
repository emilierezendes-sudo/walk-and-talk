// Demo backend: same shape as the Supabase one, but everything lives in this browser.
// Used automatically while config.js has no Supabase details (or with ?demo in the URL).
const KEY = 'wt-demo-v1';
const MEMBERS = [
  { id: 'demo-me', email: 'you@example.com', display_name: 'You' },
  { id: 'demo-partner', email: 'partner@example.com', display_name: 'Your person' },
];

export function createDemoBackend() {
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY)) || null; } catch { data = null; }
  data ||= { tables: {}, user: null };
  const files = new Map(); // uploaded photos only last until reload in demo mode
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.warn('demo save failed', e); } };
  const tbl = (t) => (data.tables[t] ||= []);
  const now = () => new Date().toISOString();
  const withDefaults = (r) => ({ id: crypto.randomUUID(), created_at: now(), created_by: data.user?.id ?? null, ...r });

  return {
    mode: 'demo',
    async getUser() { return data.user; },
    async signUp() { return { needsConfirm: true }; },
    async sendReset() {},
    async setPassword() {},
    async signIn(email) {
      data.user = { id: 'demo-me', email };
      const m = tbl('members');
      for (const mm of MEMBERS) if (!m.some((x) => x.id === mm.id)) m.push({ ...mm, created_at: now() });
      save();
      return data.user;
    },
    async signOut() { data.user = null; save(); },
    async isMember() { return true; },

    async selectAll(t) { return structuredClone(tbl(t)); },
    async insert(t, rows) {
      const list = (Array.isArray(rows) ? rows : [rows]).map(withDefaults);
      tbl(t).push(...list); save();
      return structuredClone(list);
    },
    async update(t, id, patch) {
      const r = tbl(t).find((x) => x.id === id);
      if (r) Object.assign(r, patch, { updated_at: now() });
      save();
      return structuredClone(r);
    },
    async upsert(t, row) {
      const r = tbl(t).find((x) => x.id === row.id);
      if (r) { Object.assign(r, row, { updated_at: now() }); save(); return structuredClone(r); }
      return (await this.insert(t, row))[0];
    },
    async remove(t, id) { data.tables[t] = tbl(t).filter((x) => x.id !== id); save(); },
    async removeMany(t, ids) { const s = new Set(ids); data.tables[t] = tbl(t).filter((x) => !s.has(x.id)); save(); },

    async upload(path, blob) { files.set(path, URL.createObjectURL(blob)); },
    async removeFiles(paths) { paths.forEach((p) => files.delete(p)); },
    async signedUrls(paths) {
      return Object.fromEntries(paths.map((p) => [p, p.startsWith('seed/') ? p : files.get(p) || '']));
    },
    subscribe() { return () => {}; },

    reset() { localStorage.removeItem(KEY); },
  };
}
