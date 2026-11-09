// Reusable pieces of HTML used across screens.
import * as db from './db.js';
import { S } from './db.js';
import { esc, REACTIONS, QUICK_EMOJI, STATUS, relTime, fmtDay, fmtDate, plural } from './ui.js';

export function avatar(memberId, size = '') {
  const name = db.memberName(memberId);
  const cls = db.isMe(memberId) ? 'me' : 'them';
  return `<span class="avatar ${cls} ${size}" aria-hidden="true">${esc([...name][0]?.toUpperCase() || '?')}</span>`;
}

export function statusPill(i) {
  const s = STATUS[i.status];
  return `<button class="pill st-${i.status}" data-act="status-menu" data-id="${i.id}" aria-label="Status: ${s.label}. Tap to change">
    <span class="pill-dot" aria-hidden="true"></span>${s.label}</button>`;
}

export function wantBtn(i, big = false) {
  return `<button class="want ${i.want ? 'on' : ''} ${big ? 'big' : ''}" data-act="toggle-want" data-id="${i.id}"
    aria-pressed="${i.want}" aria-label="${i.want ? 'Marked as really want to do' : 'Mark as really want to do'}" title="We really want to do this">😍</button>`;
}

export function tagChips(ids = [], { short = false } = {}) {
  return ids.map(db.tag).filter(Boolean)
    .map((t) => `<span class="chip">${t.emoji}${short ? '' : ` ${esc(t.name)}`}</span>`).join('');
}

export function reactionsBar(type, id, { compact = false } = {}) {
  const groups = new Map();
  for (const r of db.reactionsFor(type, id)) {
    const g = groups.get(r.emoji) || { n: 0, mine: false, who: [] };
    g.n++; g.who.push(db.memberName(r.created_by)); if (db.isMe(r.created_by)) g.mine = true;
    groups.set(r.emoji, g);
  }
  const chips = [...groups].map(([e, g]) => `<button class="react ${g.mine ? 'mine' : ''}" data-act="react" data-type="${type}" data-id="${id}" data-emoji="${e}"
      title="${esc(g.who.join(', '))}" aria-pressed="${g.mine}" aria-label="${e} from ${esc(g.who.join(' and '))}">${e}${g.n > 1 ? `<b>${g.n}</b>` : ''}</button>`).join('');
  return `<div class="reacts ${compact ? 'compact' : ''}">${chips}
    <button class="react add" data-act="react-picker" data-type="${type}" data-id="${id}" aria-label="Add a reaction">${compact ? '☺' : '☺ React'}</button></div>`;
}

export function commentsSection(type, id) {
  const list = db.commentsFor(type, id);
  const items = list.map((c) => `
    <li class="cmt ${db.isMe(c.created_by) ? 'mine' : ''}">
      ${avatar(c.created_by)}
      <div class="cmt-bubble">
        <div class="cmt-head"><b>${esc(db.memberName(c.created_by))}</b><span>${relTime(c.created_at)}</span>
          ${db.isMe(c.created_by) ? `<button class="link-btn" data-act="delete-comment" data-id="${c.id}" aria-label="Delete comment">Delete</button>` : ''}</div>
        <div class="cmt-body">${esc(c.body).replace(/\n/g, '<br>')}</div>
        ${reactionsBar('comment', c.id, { compact: true })}
      </div>
    </li>`).join('');
  const box = `cmt-${type}-${id}`;
  return `
    <section class="comments" aria-label="Comments">
      <h3 class="section-title">💬 Comments ${list.length ? `<span class="count">${list.length}</span>` : ''}</h3>
      ${list.length ? `<ul class="cmt-list">${items}</ul>` : '<p class="muted small">No comments yet — start the conversation.</p>'}
      <div class="composer">
        <textarea id="${box}" rows="1" placeholder="Say something sweet…" aria-label="Write a comment"></textarea>
        <button class="btn btn-primary" data-act="send-comment" data-type="${type}" data-id="${id}">Send</button>
      </div>
      <div class="emoji-bar" aria-label="Add emoji to comment">
        ${QUICK_EMOJI.map((e) => `<button data-act="insert-emoji" data-target="${box}" data-emoji="${e}" aria-label="Insert ${e}">${e}</button>`).join('')}
      </div>
    </section>`;
}

export function photoGrid(outingId) {
  const ps = db.photosFor(outingId);
  const tiles = ps.map((p, i) => {
    const url = db.photoUrl(p.path);
    return `<button class="ph" data-act="open-photo" data-id="${p.id}" aria-label="Open photo ${i + 1} of ${ps.length}">
      ${url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : '<span class="ph-wait"></span>'}</button>`;
  }).join('');
  return `<div class="ph-grid">${tiles}
    <label class="ph add"><input type="file" accept="image/*" multiple data-upload="${outingId}" class="sr-only">
      <span aria-hidden="true">＋</span><small>Add photos</small></label></div>`;
}

export function thumb(o) {
  const p = db.photosFor(o.id)[0];
  const url = p && db.photoUrl(p.path);
  if (url) return `<span class="thumb"><img src="${esc(url)}" alt="" loading="lazy" decoding="async"></span>`;
  const i = o.idea_id && db.idea(o.idea_id);
  const emoji = (i && i.tag_ids?.length && db.tag(i.tag_ids[0])?.emoji) || '💞';
  return `<span class="thumb thumb-emoji" aria-hidden="true">${emoji}</span>`;
}

export const fmtStars = (avg) => (Math.round(avg * 10) / 10).toString();

export function ratingSection(outingId) {
  if (!S.v2) return '';
  const rows = S.members.map((m) => {
    const r = S.ratings.find((x) => x.outing_id === outingId && x.created_by === m.id)?.stars || 0;
    const mine = db.isMe(m.id);
    const stars = [1, 2, 3, 4, 5].map((n) => mine
      ? `<button class="star ${n <= r ? 'on' : ''}" data-act="rate" data-id="${outingId}" data-v="${n}" aria-label="${n} star${n > 1 ? 's' : ''}" aria-pressed="${n === r}">★</button>`
      : `<span class="star ${n <= r ? 'on' : ''}" aria-hidden="true">★</span>`).join('');
    const note = r ? '' : mine ? '<small class="muted">tap to rate</small>' : '<small class="muted">hasn’t rated yet</small>';
    return `<li>${avatar(m.id)}<span class="grow"><b>${esc(db.isMe(m.id) ? 'You' : m.display_name)}</b> ${note}</span>
      <span class="stars" ${mine ? 'role="group" aria-label="Your rating"' : `role="img" aria-label="${r ? `${r} of 5 stars` : 'not rated'}"`}>${stars}</span></li>`;
  }).join('');
  return `<section class="ratings" aria-label="Ratings"><h3 class="section-title">⭐ How was it?</h3><ul class="rate-list">${rows}</ul></section>`;
}

export function outingCard(o) {
  const nPh = db.photosFor(o.id).length, nC = db.commentsFor('outing', o.id).length, avg = db.avgRating(o.id);
  const meta = [avg != null && `⭐ ${fmtStars(avg)}`, nPh && `📷 ${nPh}`, nC && `💬 ${nC}`].filter(Boolean).join(' · ');
  return `<a class="ocard" href="#/outing/${o.id}">
    ${thumb(o)}
    <span class="ocard-main">
      <span class="ocard-title">${esc(db.outingTitle(o))}</span>
      <span class="ocard-date">${fmtDate(o.happened_on)}${meta ? ` · ${meta}` : ''}</span>
      ${o.recap ? `<span class="ocard-recap">${esc(o.recap)}</span>` : ''}
    </span></a>`;
}

export function ideaRow(i) {
  const sub = [
    tagChips(i.tag_ids, { short: true }),
    i.status === 'planned' && i.planned_for ? `<span class="when">📅 ${fmtDay(i.planned_for)}</span>` : '',
    i.status === 'done' && db.outingsFor(i.id).length > 1 ? `<span class="when">${db.outingsFor(i.id).length}×</span>` : '',
  ].join('');
  return `<li class="irow ${i.status === 'done' ? 'is-done' : ''}">
    ${wantBtn(i)}
    <a class="irow-main" href="#/idea/${i.id}"><span class="irow-title">${esc(i.title)}</span>${sub ? `<span class="irow-sub">${sub}</span>` : ''}</a>
    ${statusPill(i)}
  </li>`;
}

export const empty = (emoji, title, text = '') =>
  `<div class="empty"><div class="empty-emoji" aria-hidden="true">${emoji}</div><p><b>${esc(title)}</b></p>${text ? `<p class="muted">${text}</p>` : ''}</div>`;

export { S };
