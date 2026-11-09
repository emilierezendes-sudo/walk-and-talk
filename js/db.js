// In-memory copy of everything + the actions that change it.
// The data set for two people is small, so we simply load it all and keep it in sync.
import { toast } from './ui.js';

export const S = {
  me: null, members: [], tags: [], ideas: [], outings: [], photos: [],
  comments: [], reactions: [], ratings: [], settings: {}, loaded: false,
  v2: false, // true once supabase/phase2.sql has been run (ratings table + map columns)
};
const TABLES = ['members', 'tags', 'ideas', 'outings', 'photos', 'comments', 'reactions', 'settings'];
const OPTIONAL = ['ratings'];

let B = null;
const listeners = new Set();
export const backend = () => B;
export function init(b) { B = b; }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((f) => f()); }

export async function load() {
  const [rows, opt] = await Promise.all([
    Promise.all(TABLES.map((t) => B.selectAll(t))),
    Promise.all(OPTIONAL.map((t) => B.selectAll(t).catch(() => null))),
  ]);
  const r = Object.fromEntries(TABLES.map((t, i) => [t, rows[i]]));
  S.v2 = opt[0] !== null;
  Object.assign(S, r, {
    ratings: opt[0] || [],
    tags: r.tags.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
    settings: Object.fromEntries(r.settings.map((s) => [s.id, s.value])),
    loaded: true,
  });
  emit();
}

// Run a change locally first (so the app feels instant), then save it.
async function mutate(local, remote) {
  try { local?.(); emit(); await remote(); }
  catch (e) { console.error(e); toast(`Couldn’t save — ${e.message || e}`, 'error'); await load().catch(() => {}); }
}
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

// ───────── lookups ─────────
export const idea = (id) => S.ideas.find((x) => x.id === id);
export const outing = (id) => S.outings.find((x) => x.id === id);
export const tag = (id) => S.tags.find((x) => x.id === id);
export const member = (id) => S.members.find((x) => x.id === id);
export const memberName = (id) => member(id)?.display_name || 'Someone';
export const isMe = (id) => id && S.me && id === S.me.id;
export const outingTitle = (o) => (o.idea_id && idea(o.idea_id)?.title) || o.title || 'A date';
export const photosFor = (outingId) => S.photos.filter((p) => p.outing_id === outingId).sort((a, b) => a.created_at.localeCompare(b.created_at));
export const outingsFor = (ideaId) => S.outings.filter((o) => o.idea_id === ideaId).sort((a, b) => b.happened_on.localeCompare(a.happened_on));
export const commentsFor = (type, id) => S.comments.filter((c) => c.target_type === type && c.target_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at));
export const reactionsFor = (type, id) => S.reactions.filter((r) => r.target_type === type && r.target_id === id);
export const baseline = () => S.settings.baseline || { count: 0, as_of: null };
export const sortedOutings = () => [...S.outings].sort((a, b) => b.happened_on.localeCompare(a.happened_on) || b.created_at.localeCompare(a.created_at));

export function total() { return S.outings.length + (Number(baseline().count) || 0); }
export function lastUpdated() {
  let best = baseline().as_of || null;
  for (const o of S.outings) { const d = (o.created_at || '').slice(0, 10); if (!best || d > best) best = d; }
  return best;
}

// ───────── members ─────────
export async function ensureMember(user) {
  const rows = await B.selectAll('members');
  if (!rows.some((m) => m.id === user.id)) {
    const base = user.email.split('@')[0].replace(/[._\d]+/g, ' ').trim().split(' ')[0] || 'Me';
    await B.insert('members', { id: user.id, email: user.email, display_name: base[0].toUpperCase() + base.slice(1) });
  }
}
export const renameMe = (name) => mutate(
  () => { const m = member(S.me.id); if (m) m.display_name = name; },
  () => B.update('members', S.me.id, { display_name: name }));

// Map coordinates only exist after phase2.sql — don't send them before that
function v2(fields) {
  if (S.v2) return fields;
  const { lat, lng, ...rest } = fields; return rest;
}

// ───────── ideas ─────────
export async function saveIdea(fields, id = null) {
  fields = v2(fields);
  if (id) {
    await mutate(() => Object.assign(idea(id), fields, { updated_at: nowIso() }), () => B.update('ideas', id, fields));
    return id;
  }
  const row = { id: uid(), title: '', description: '', status: 'not_yet', want: false, tag_ids: [], planned_for: null,
    link: '', location: '', suggested_by: S.me?.id ?? null, created_by: S.me?.id ?? null, created_at: nowIso(), ...fields };
  await mutate(() => S.ideas.push(row), () => B.insert('ideas', row));
  return row.id;
}
export const toggleWant = (id) => { const i = idea(id); return saveIdea({ want: !i.want }, id); };
export const setStatus = (id, status, planned_for = undefined) => {
  const f = { status };
  if (status === 'not_yet') f.planned_for = null;
  if (planned_for !== undefined) f.planned_for = planned_for || null;
  return saveIdea(f, id);
};
export async function deleteIdea(id) {
  const linked = S.outings.filter((o) => o.idea_id === id);
  const title = idea(id)?.title || '';
  await deleteThreads('idea', [id]);
  await mutate(() => {
    S.ideas = S.ideas.filter((x) => x.id !== id);
    // keep the date log intact: past dates keep the idea's title
    linked.forEach((o) => { o.title = o.title || title; o.idea_id = null; });
  }, async () => {
    for (const o of linked) await B.update('outings', o.id, { idea_id: null, title: o.title });
    await B.remove('ideas', id);
  });
}

// ───────── outings (the date log) ─────────
export async function saveOuting(fields, id = null) {
  fields = v2(fields);
  if (id) {
    await mutate(() => Object.assign(outing(id), fields), () => B.update('outings', id, fields));
    return id;
  }
  const row = { id: uid(), idea_id: null, title: '', happened_on: todayStr(), recap: '', location: '',
    created_by: S.me?.id ?? null, created_at: nowIso(), ...fields };
  await mutate(() => S.outings.push(row), () => B.insert('outings', row));
  return row.id;
}
export async function deleteOuting(id) {
  const photos = photosFor(id);
  await deleteThreads('outing', [id]);
  await mutate(() => {
    S.outings = S.outings.filter((x) => x.id !== id);
    S.photos = S.photos.filter((p) => p.outing_id !== id);
    S.ratings = S.ratings.filter((r) => r.outing_id !== id);
  }, async () => {
    await B.removeFiles(photos.filter((p) => !p.path.startsWith('seed/')).map((p) => p.path)).catch(() => {});
    await B.removeMany('photos', photos.map((p) => p.id));
    if (B.mode === 'demo') await B.removeMany('ratings', S.ratings.filter((r) => r.outing_id === id).map((r) => r.id));
    await B.remove('outings', id);
  });
}

// ───────── ⭐ ratings ─────────
export const ratingsFor = (outingId) => S.ratings.filter((r) => r.outing_id === outingId);
export const myRating = (outingId) => S.ratings.find((r) => r.outing_id === outingId && r.created_by === S.me?.id)?.stars || 0;
export function avgRating(outingId) {
  const rs = ratingsFor(outingId); if (!rs.length) return null;
  return rs.reduce((s, r) => s + r.stars, 0) / rs.length;
}
export function setRating(outingId, stars) {
  if (!S.v2) { toast('Ratings need the Phase 2 database update (see Settings)', 'error'); return; }
  const mine = S.ratings.find((r) => r.outing_id === outingId && r.created_by === S.me?.id);
  if (mine && (!stars || mine.stars === stars)) {
    return mutate(() => { S.ratings = S.ratings.filter((r) => r !== mine); }, () => B.remove('ratings', mine.id));
  }
  if (mine) return mutate(() => { mine.stars = stars; }, () => B.update('ratings', mine.id, { stars }));
  const row = { id: uid(), outing_id: outingId, stars, created_by: S.me?.id ?? null, created_at: nowIso() };
  return mutate(() => S.ratings.push(row), () => B.insert('ratings', row));
}

// ───────── photos ─────────
export async function addPhotos(outingId, files) {
  let n = 0;
  for (const file of files) {
    try {
      const img = await shrink(file);
      const path = `${outingId}/${uid()}.${img.ext}`;
      await B.upload(path, img.blob, img.type);
      const row = { id: uid(), outing_id: outingId, path, width: img.w, height: img.h, created_by: S.me?.id ?? null, created_at: nowIso() };
      await B.insert('photos', row);
      S.photos.push(row); n++; emit();
    } catch (e) {
      console.error(e); toast(`Couldn’t upload ${file.name || 'a photo'} — ${e.message || e}`, 'error');
    }
  }
  return n;
}
export async function deletePhoto(id) {
  const p = S.photos.find((x) => x.id === id);
  await mutate(() => { S.photos = S.photos.filter((x) => x.id !== id); }, async () => {
    if (!p.path.startsWith('seed/')) await B.removeFiles([p.path]).catch(() => {});
    await B.remove('photos', id);
  });
}

// Resize big phone photos before upload (saves space and makes the app faster)
async function shrink(file, max = 2000) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) throw new Error('encode failed');
    return { blob, type: 'image/jpeg', ext: 'jpg', w, h };
  } catch {
    // e.g. a HEIC photo the browser can't decode — upload the original instead
    const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase();
    return { blob: file, type: file.type || 'image/jpeg', ext, w: null, h: null };
  }
}

const urlCache = new Map(); // path -> { url, exp }
let pending = new Set(); let flushTimer = null;
export function photoUrl(path) {
  const c = urlCache.get(path);
  if (c && c.exp > Date.now()) return c.url;
  pending.add(path);
  flushTimer ||= setTimeout(flushUrls, 0);
  return c?.url || '';
}
async function flushUrls() {
  const paths = [...pending]; pending = new Set(); flushTimer = null;
  if (!paths.length) return;
  try {
    const map = await B.signedUrls(paths);
    const exp = Date.now() + 50 * 60 * 1000;
    let added = false;
    for (const [p, url] of Object.entries(map)) { if (url) { urlCache.set(p, { url, exp }); added = true; } }
    if (added) emit();
  } catch (e) { console.error(e); }
}

// ───────── comments & reactions ─────────
export function addComment(type, id, body) {
  const row = { id: uid(), target_type: type, target_id: id, body, created_by: S.me?.id ?? null, created_at: nowIso() };
  return mutate(() => S.comments.push(row), () => B.insert('comments', row));
}
export async function deleteComment(id) {
  await deleteThreads('comment', [id]);
  await mutate(() => { S.comments = S.comments.filter((c) => c.id !== id); }, () => B.remove('comments', id));
}
export function toggleReaction(type, id, emoji) {
  const mine = S.reactions.find((r) => r.target_type === type && r.target_id === id && r.emoji === emoji && r.created_by === S.me?.id);
  if (mine) return mutate(() => { S.reactions = S.reactions.filter((r) => r !== mine); }, () => B.remove('reactions', mine.id));
  const row = { id: uid(), target_type: type, target_id: id, emoji, created_by: S.me?.id ?? null, created_at: nowIso() };
  return mutate(() => S.reactions.push(row), () => B.insert('reactions', row));
}
async function deleteThreads(type, ids) {
  const set = new Set(ids);
  const comments = S.comments.filter((c) => c.target_type === type && set.has(c.target_id));
  const cIds = new Set(comments.map((c) => c.id));
  const reacts = S.reactions.filter((r) => (r.target_type === type && set.has(r.target_id)) || (r.target_type === 'comment' && cIds.has(r.target_id)));
  await mutate(() => {
    S.comments = S.comments.filter((c) => !cIds.has(c.id));
    const rIds = new Set(reacts.map((r) => r.id));
    S.reactions = S.reactions.filter((r) => !rIds.has(r.id));
  }, async () => {
    await B.removeMany('reactions', reacts.map((r) => r.id));
    await B.removeMany('comments', comments.map((c) => c.id));
  });
}

// ───────── tags ─────────
export async function saveTag(fields, id = null) {
  if (id) return mutate(() => Object.assign(tag(id), fields), () => B.update('tags', id, fields));
  const row = { id: uid(), name: '', emoji: '🏷️', sort: (Math.max(0, ...S.tags.map((t) => t.sort)) + 1), created_at: nowIso(), ...fields };
  return mutate(() => S.tags.push(row), () => B.insert('tags', row));
}
export async function deleteTag(id) {
  const affected = S.ideas.filter((i) => i.tag_ids?.includes(id));
  await mutate(() => {
    S.tags = S.tags.filter((t) => t.id !== id);
    affected.forEach((i) => { i.tag_ids = i.tag_ids.filter((t) => t !== id); });
  }, async () => {
    for (const i of affected) await B.update('ideas', i.id, { tag_ids: i.tag_ids });
    await B.remove('tags', id);
  });
}

// Count a date without logging any details (adds to / removes from the "extra dates" number)
export function bumpCount(delta) {
  const b = baseline();
  const count = Math.max(0, (Number(b.count) || 0) + delta);
  return saveSetting('baseline', { count, as_of: delta > 0 ? todayStr() : b.as_of });
}

// ───────── settings ─────────
export const saveSetting = (key, value) => mutate(
  () => { S.settings[key] = value; },
  () => B.upsert('settings', { id: key, value }));

// ───────── importing the original spreadsheet ─────────
export async function importSeed(seed, onProgress = () => {}) {
  const tagIds = {};
  const tags = seed.tags.map((t, i) => { const id = uid(); tagIds[t.name] = id; return { id, name: t.name, emoji: t.emoji, sort: i }; });
  await B.insert('tags', tags);
  onProgress('Tags added');

  const ideas = []; const outings = []; const photoJobs = [];
  for (const s of seed.ideas) {
    const id = uid();
    ideas.push({ id, title: s.title, status: s.status, want: !!s.want, tag_ids: tagIds[s.tag] ? [tagIds[s.tag]] : [], suggested_by: null });
    if (s.outing) {
      const oid = uid();
      const day = s.outing.happened_on || seed.baseline?.as_of || todayStr();
      outings.push({ id: oid, idea_id: id, happened_on: day, recap: s.outing.recap || '', created_at: `${day}T12:00:00Z` });
      for (const p of s.outing.photos || []) photoJobs.push({ outing_id: oid, file: p });
    }
  }
  await B.insert('ideas', ideas);
  onProgress(`${ideas.length} ideas added`);
  await B.insert('outings', outings);
  onProgress(`${outings.length} past dates added`);

  let n = 0;
  for (const job of photoJobs) {
    let path = `seed/photos/${job.file}`;
    if (B.mode !== 'demo') {
      const blob = await (await fetch(path)).blob();
      path = `${job.outing_id}/${uid()}.jpg`;
      await B.upload(path, blob, 'image/jpeg');
    }
    await B.insert('photos', { id: uid(), outing_id: job.outing_id, path });
    onProgress(`Photos: ${++n} of ${photoJobs.length}`);
  }
  if (seed.baseline) await B.upsert('settings', { id: 'baseline', value: { count: seed.baseline.count, as_of: seed.baseline.as_of } });
  await load();
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
