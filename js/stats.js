// Milestones, "On this day", and year-in-review numbers.
import * as db from './db.js';
import { S } from './db.js';
import { parseDay } from './ui.js';

// ───────── milestones ─────────
// 10, 25, 50, 75 … 200, then every 50, plus 365 (a year's worth!) and 1000
export function milestones(upTo) {
  const out = [10];
  for (let n = 25; n <= Math.max(upTo, 25) + 200; n += n < 200 ? 25 : 50) out.push(n);
  out.push(365, 1000);
  return [...new Set(out)].sort((a, b) => a - b);
}
export function nextMilestone(total) {
  const list = milestones(total);
  const next = list.find((m) => m > total);
  const prev = [...list].reverse().find((m) => m <= total) || 0;
  return { next, prev, left: next - total, pct: Math.round(((total - prev) / (next - prev)) * 100) };
}
export function highestReached(total) { return [...milestones(total)].reverse().find((m) => m <= total) || 0; }

const M_KEY = 'wt-milestone-seen';
// Returns a milestone to celebrate on this device (once), or null.
export function milestoneToCelebrate() {
  if (!S.loaded) return null;
  const reached = highestReached(db.total());
  let seen = null;
  try { seen = localStorage.getItem(M_KEY); } catch {}
  if (seen === null) { try { localStorage.setItem(M_KEY, String(reached)); } catch {} return null; } // first run: no surprise party
  if (reached > Number(seen)) { try { localStorage.setItem(M_KEY, String(reached)); } catch {} return reached; }
  return null;
}

// ───────── On this day ─────────
// Dates from earlier years within ±3 days of today's month/day, plus exactly 1 month ago
export function onThisDay(today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const hits = [];
  for (const o of S.outings) {
    const d = parseDay(o.happened_on); if (!d) continue;
    if (d.getFullYear() < t.getFullYear()) {
      const same = new Date(t.getFullYear(), d.getMonth(), d.getDate());
      const diff = Math.round((same - t) / 86400000);
      if (Math.abs(diff) <= 3) hits.push({ o, years: t.getFullYear() - d.getFullYear(), kind: diff === 0 ? 'today' : 'week' });
    }
  }
  if (!hits.length) {
    const m = new Date(t.getFullYear(), t.getMonth() - 1, t.getDate());
    for (const o of S.outings) {
      const d = parseDay(o.happened_on);
      if (d && d.getTime() === m.getTime()) hits.push({ o, years: 0, kind: 'month' });
    }
  }
  return hits.sort((a, b) => b.years - a.years);
}

// ───────── year in review ─────────
export function yearsWithDates() {
  const ys = new Set(S.outings.map((o) => Number(o.happened_on.slice(0, 4))));
  ys.add(new Date().getFullYear());
  return [...ys].sort((a, b) => b - a);
}

export function yearStats(year) {
  const outs = S.outings.filter((o) => o.happened_on.startsWith(String(year)))
    .sort((a, b) => a.happened_on.localeCompare(b.happened_on));
  const ids = new Set(outs.map((o) => o.id));
  const months = Array.from({ length: 12 }, () => 0);
  outs.forEach((o) => { months[Number(o.happened_on.slice(5, 7)) - 1]++; });

  const photos = S.photos.filter((p) => ids.has(p.outing_id));
  const comments = S.comments.filter((c) => c.target_type === 'outing' && ids.has(c.target_id));
  const reactions = S.reactions.filter((r) => (r.target_type === 'outing' && ids.has(r.target_id))
    || (r.target_type === 'comment' && comments.some((c) => c.id === r.target_id)));
  const ratings = S.ratings.filter((r) => ids.has(r.outing_id));
  const places = new Set(outs.map((o) => (o.location || '').trim().toLowerCase()).filter(Boolean));

  const rated = outs.map((o) => ({ o, avg: db.avgRating(o.id), n: db.ratingsFor(o.id).length })).filter((x) => x.avg != null)
    .sort((a, b) => b.avg - a.avg || b.n - a.n).slice(0, 3);

  const tagCount = new Map();
  outs.forEach((o) => { const i = o.idea_id && db.idea(o.idea_id); (i?.tag_ids || []).forEach((t) => tagCount.set(t, (tagCount.get(t) || 0) + 1)); });
  const topTags = [...tagCount].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => ({ tag: db.tag(id), n })).filter((x) => x.tag);

  const emoji = new Map();
  reactions.forEach((r) => emoji.set(r.emoji, (emoji.get(r.emoji) || 0) + 1));
  const topEmoji = [...emoji].sort((a, b) => b[1] - a[1])[0] || null;

  const mostPhotos = outs.map((o) => ({ o, n: db.photosFor(o.id).length })).sort((a, b) => b.n - a.n)[0];

  return {
    year, outs, months, count: outs.length,
    photos: photos.length, comments: comments.length, places: places.size,
    avg: ratings.length ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length : null,
    rated, topTags, topEmoji, mostPhotos: mostPhotos && mostPhotos.n ? mostPhotos : null,
    first: outs[0] || null, last: outs[outs.length - 1] || null,
    busiest: months.indexOf(Math.max(...months)),
  };
}
