// The main screens. Each returns HTML; clicks are handled in app.js via data-act attributes.
import * as db from './db.js';
import { S } from './db.js';
import { esc, fmtDate, fmtDay, plural, safeUrl, STATUS } from './ui.js';
import { ideaRow, outingCard, statusPill, wantBtn, tagChips, reactionsBar, commentsSection, photoGrid, avatar, empty } from './components.js';

const header = (title, right = '', back = '') => `
  <header class="top">
    ${back ? `<a class="icon-btn back" href="${back}" aria-label="Back">‹</a>` : ''}
    <h1>${title}</h1><div class="top-right">${right}</div>
  </header>`;

// ───────── Home ─────────
export function home() {
  const total = db.total();
  const updated = db.lastUpdated();
  const planned = S.ideas.filter((i) => i.status === 'planned')
    .sort((a, b) => (a.planned_for || '9999').localeCompare(b.planned_for || '9999'));
  const notYet = S.ideas.filter((i) => i.status === 'not_yet').length;
  const wants = S.ideas.filter((i) => i.want && i.status !== 'done').length;
  const recent = db.sortedOutings().slice(0, 3);
  return `
    ${header('<span class="brand">Walk <i>&amp;</i> Talk</span>')}
    <section class="hero" aria-label="Total dates">
      <div class="hero-num">${total}</div>
      <div class="hero-label">${total === 1 ? 'date' : 'dates'} together</div>
      ${updated ? `<div class="hero-sub">Updated ${fmtDate(updated)}</div>` : ''}
      <button class="hero-plus" data-act="bump" aria-label="Count one more date without adding details">＋1 date</button>
      <div class="hero-stats">
        <a href="#/ideas?status=planned"><b>${planned.length}</b> planned</a>
        <a href="#/ideas?status=not_yet"><b>${notYet}</b> not yet</a>
        <a href="#/ideas?want=1"><b>${wants}</b> 😍</a>
      </div>
    </section>
    <button class="btn btn-primary btn-block btn-big pick-btn" data-act="pick">🎲 Pick for us</button>

    <section class="block">
      <div class="block-head"><h2>Up next</h2><a href="#/ideas?status=planned" class="small">See all</a></div>
      ${planned.length ? `<ul class="ilist">${planned.slice(0, 4).map(ideaRow).join('')}</ul>`
        : `<p class="muted">Nothing planned yet. Tap <b>Pick for us</b> or set an idea to <b>Planned</b>.</p>`}
    </section>

    <section class="block">
      <div class="block-head"><h2>Recent dates</h2><a href="#/log" class="small">Date log</a></div>
      ${recent.length ? `<div class="olist">${recent.map(outingCard).join('')}</div>`
        : `<p class="muted">No dates logged yet.</p>`}
      <button class="btn btn-ghost btn-block" data-act="log-date">＋ Log a date</button>
    </section>`;
}

// ───────── Ideas list ─────────
export const ideasState = { q: '', status: 'all', want: false, tag: '' };
export function ideas(params) {
  if (Object.keys(params).length) Object.assign(ideasState, { q: '', status: 'all', want: false, tag: '' });
  if (params.status) ideasState.status = params.status;
  if (params.want) ideasState.want = true;
  if (params.tag) ideasState.tag = params.tag;
  const st = ideasState;
  const q = st.q.trim().toLowerCase();
  const order = { planned: 0, not_yet: 1, done: 2 };
  const list = S.ideas
    .filter((i) => st.status === 'all' || i.status === st.status)
    .filter((i) => !st.want || i.want)
    .filter((i) => !st.tag || i.tag_ids?.includes(st.tag))
    .filter((i) => !q || i.title.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q))
    .sort((a, b) => order[a.status] - order[b.status] || (b.want - a.want) || a.title.localeCompare(b.title));
  const counts = Object.fromEntries(['not_yet', 'planned', 'done'].map((k) => [k, S.ideas.filter((i) => i.status === k).length]));
  const seg = (k, label) => `<button class="seg-btn ${st.status === k ? 'on' : ''}" data-act="filter-status" data-v="${k}" aria-pressed="${st.status === k}">${label}</button>`;
  return `
    ${header('Ideas', `<button class="icon-btn" data-act="new-idea" aria-label="Add an idea">＋</button>`)}
    <div class="filters">
      <input type="search" id="idea-search" class="search" placeholder="Search ${S.ideas.length} ideas…" value="${esc(st.q)}" aria-label="Search ideas" data-input="search">
      <div class="seg" role="group" aria-label="Status">${seg('all', 'All')}${seg('not_yet', `Not yet <small>${counts.not_yet}</small>`)}${seg('planned', `Planned <small>${counts.planned}</small>`)}${seg('done', `Done <small>${counts.done}</small>`)}</div>
      <div class="chips-scroll" role="group" aria-label="Filter by tag">
        <button class="chip chip-toggle ${st.want ? 'on' : ''}" data-act="filter-want" aria-pressed="${st.want}">😍 Really want</button>
        ${S.tags.map((t) => `<button class="chip chip-toggle ${st.tag === t.id ? 'on' : ''}" data-act="filter-tag" data-v="${t.id}" aria-pressed="${st.tag === t.id}">${t.emoji} ${esc(t.name)}</button>`).join('')}
      </div>
    </div>
    ${list.length ? `<ul class="ilist">${list.map(ideaRow).join('')}</ul>`
      : S.ideas.length ? empty('🔍', 'No ideas match', 'Try clearing a filter.') : empty('💡', 'No ideas yet', 'Tap ＋ to add your first one.')}
    <button class="fab" data-act="new-idea" aria-label="Add an idea">＋</button>`;
}

// ───────── One idea ─────────
export function idea({ id }) {
  const i = db.idea(id);
  if (!i) return header('Not found', '', '#/ideas') + empty('🫥', 'This idea was deleted');
  const outs = db.outingsFor(id);
  const link = safeUrl(i.link);
  const facts = [
    i.status === 'planned' ? `<li>📅 <span>${i.planned_for ? fmtDay(i.planned_for) : 'No day picked yet'}</span> <button class="link-btn" data-act="plan" data-id="${id}">${i.planned_for ? 'Change' : 'Pick a day'}</button></li>` : '',
    i.location ? `<li>📍 <a href="https://maps.google.com/?q=${encodeURIComponent(i.location)}" target="_blank" rel="noopener">${esc(i.location)}</a></li>` : '',
    link ? `<li>🔗 <a href="${esc(link)}" target="_blank" rel="noopener">${esc(new URL(link).hostname.replace(/^www\./, ''))}</a></li>` : '',
    i.suggested_by ? `<li>${avatar(i.suggested_by, 'sm')} <span>${db.isMe(i.suggested_by) ? 'Your' : `${esc(db.memberName(i.suggested_by))}’s`} idea</span></li>` : '',
  ].join('');
  return `
    ${header('', `<button class="icon-btn" data-act="edit-idea" data-id="${id}" aria-label="Edit idea">✎</button>`, '#/ideas')}
    <article class="detail">
      <div class="detail-title-row"><h1 class="detail-title">${esc(i.title)}</h1>${wantBtn(i, true)}</div>
      ${i.tag_ids?.length ? `<div class="chips">${tagChips(i.tag_ids)}</div>` : ''}
      <div class="seg status-seg" role="group" aria-label="Status">
        ${Object.entries(STATUS).map(([k, s]) => `<button class="seg-btn st-${k} ${i.status === k ? 'on' : ''}" data-act="set-status" data-id="${id}" data-v="${k}" aria-pressed="${i.status === k}">${s.label}</button>`).join('')}
      </div>
      ${i.description ? `<p class="desc">${esc(i.description).replace(/\n/g, '<br>')}</p>` : ''}
      ${facts ? `<ul class="facts">${facts}</ul>` : ''}
      ${reactionsBar('idea', id)}

      <section class="block">
        <div class="block-head"><h2>${outs.length ? `Done ${plural(outs.length, 'time')}` : 'In the log'}</h2></div>
        ${outs.length ? `<div class="olist">${outs.map(outingCard).join('')}</div>` : '<p class="muted small">Not logged yet.</p>'}
        <button class="btn btn-ghost btn-block" data-act="log-date" data-idea="${id}">＋ ${outs.length ? 'We did it again!' : 'We did it — log it'}</button>
      </section>

      ${commentsSection('idea', id)}
      <button class="btn btn-danger-ghost btn-block" data-act="delete-idea" data-id="${id}">Delete idea</button>
    </article>`;
}

// ───────── Date log ─────────
export function log() {
  const outs = db.sortedOutings();
  const base = db.baseline();
  let html = '', month = '';
  for (const o of outs) {
    const m = fmtDate(o.happened_on, { month: 'long', year: 'numeric' });
    if (m !== month) { if (month) html += '</div>'; html += `<h2 class="month">${m}</h2><div class="olist">`; month = m; }
    html += outingCard(o);
  }
  if (month) html += '</div>';
  return `
    ${header('Date log', `<button class="icon-btn" data-act="log-date" aria-label="Log a date">＋</button>`)}
    <p class="log-total"><b>${db.total()}</b> dates together${db.lastUpdated() ? ` · updated ${fmtDate(db.lastUpdated())}` : ''}</p>
    ${outs.length ? html : empty('📖', 'No dates logged yet', 'Tap ＋ after your next date.')}
    ${base.count ? `<p class="muted small center baseline">＋ ${plural(Number(base.count), 'more date')} counted without details${base.as_of ? ` (last on ${fmtDate(base.as_of)})` : ''}</p>` : ''}
    <button class="fab" data-act="log-date" aria-label="Log a date">＋</button>`;
}

// ───────── One logged date ─────────
export function outing({ id }) {
  const o = db.outing(id);
  if (!o) return header('Not found', '', '#/log') + empty('🫥', 'This date was deleted');
  const i = o.idea_id ? db.idea(o.idea_id) : null;
  return `
    ${header('', `<button class="icon-btn" data-act="edit-outing" data-id="${id}" aria-label="Edit date">✎</button>`, '#/log')}
    <article class="detail">
      <p class="eyebrow">${fmtDate(o.happened_on, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
      <h1 class="detail-title">${esc(db.outingTitle(o))}</h1>
      ${i ? `<a class="from-idea" href="#/idea/${i.id}">From our idea list ${tagChips(i.tag_ids, { short: true })} ›</a>` : ''}
      ${o.location ? `<p class="facts-line">📍 <a href="https://maps.google.com/?q=${encodeURIComponent(o.location)}" target="_blank" rel="noopener">${esc(o.location)}</a></p>` : ''}
      ${photoGrid(id)}
      ${o.recap ? `<div class="recap">${esc(o.recap).replace(/\n/g, '<br>')}</div>`
        : `<button class="recap recap-empty" data-act="edit-outing" data-id="${id}">✍️ Add a recap — how did it go?</button>`}
      ${reactionsBar('outing', id)}
      ${commentsSection('outing', id)}
      <button class="btn btn-danger-ghost btn-block" data-act="delete-outing" data-id="${id}">Delete this date</button>
    </article>`;
}

// ───────── Settings ─────────
export function settings({ demo, canImport, theme }) {
  const me = db.member(S.me?.id);
  const base = db.baseline();
  const themeBtn = (k, label) => `<button class="seg-btn ${theme === k ? 'on' : ''}" data-act="theme" data-v="${k}" aria-pressed="${theme === k}">${label}</button>`;
  return `
    ${header('Settings')}
    <section class="card">
      <h2>Us</h2>
      <ul class="people">${S.members.map((m) => `<li>${avatar(m.id)}<span><b>${esc(m.display_name)}</b>${db.isMe(m.id) ? ' <small class="muted">(you)</small>' : ''}</span></li>`).join('')}</ul>
      <form class="inline-form" data-form="rename"><label class="field grow"><span>Your name in the app</span>
        <input name="name" value="${esc(me?.display_name || '')}" maxlength="30"></label><button class="btn btn-ghost">Save</button></form>
    </section>

    <section class="card">
      <div class="block-head"><h2>Tags</h2><button class="btn btn-ghost btn-sm" data-act="new-tag">＋ Add</button></div>
      <ul class="tag-list">${S.tags.map((t) => {
        const n = S.ideas.filter((i) => i.tag_ids?.includes(t.id)).length;
        return `<li><span class="tag-emoji">${t.emoji}</span><span class="grow">${esc(t.name)} <small class="muted">${n}</small></span>
          <button class="link-btn" data-act="edit-tag" data-id="${t.id}">Edit</button>
          <button class="link-btn danger" data-act="delete-tag" data-id="${t.id}" aria-label="Delete ${esc(t.name)}">Delete</button></li>`;
      }).join('') || '<li class="muted">No tags yet.</li>'}</ul>
    </section>

    <section class="card">
      <h2>Date count</h2>
      <p class="muted small">Dates counted without details: the ones from before the app plus every <b>＋1 date</b> tap. They’re added to your total.</p>
      <form class="inline-form" data-form="baseline">
        <label class="field"><span>Dates without details</span><input name="count" type="number" min="0" inputmode="numeric" value="${esc(base.count ?? 0)}"></label>
        <label class="field grow"><span>Last counted</span><input name="as_of" type="date" value="${esc(base.as_of || '')}"></label>
        <button class="btn btn-ghost">Save</button></form>
    </section>

    <section class="card">
      <h2>Appearance</h2>
      <div class="seg" role="group" aria-label="Theme">${themeBtn('auto', 'Match phone')}${themeBtn('light', 'Light')}${themeBtn('dark', 'Dark')}</div>
    </section>

    <section class="card">
      <h2>Put it on your home screen</h2>
      <p><b>iPhone:</b> open in <b>Safari</b> → tap <b>Share</b> <span aria-hidden="true">⬆︎</span> → <b>Add to Home Screen</b>.</p>
      <p><b>Android:</b> open in <b>Chrome</b> → tap <b>⋮</b> → <b>Install app</b> (or Add to Home screen).</p>
    </section>

    ${canImport ? `<section class="card">
      <h2>Import our spreadsheet</h2>
      <p class="muted small">Adds the ideas, tags, past dates, recaps and photos from <i>date_ideas_checklist.xlsx</i>. Only do this once.</p>
      <button class="btn btn-primary btn-block" data-act="import">Import now</button>
      <p class="import-progress muted small" aria-live="polite"></p></section>` : ''}

    <section class="card">
      ${demo ? `<p class="muted small">Demo mode: everything is saved only in this browser.</p>
        <button class="btn btn-danger-ghost btn-block" data-act="reset-demo">Reset demo data</button>` : ''}
      <button class="btn btn-ghost btn-block" data-act="sign-out">Sign out</button>
    </section>
    <p class="muted small center">Walk &amp; Talk · made with 💞</p>`;
}
