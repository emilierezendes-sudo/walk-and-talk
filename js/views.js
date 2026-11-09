// The main screens. Each returns HTML; clicks are handled in app.js via data-act attributes.
import * as db from './db.js';
import { S } from './db.js';
import { esc, fmtDate, fmtDay, plural, safeUrl, STATUS } from './ui.js';
import { ideaRow, outingCard, statusPill, wantBtn, tagChips, reactionsBar, commentsSection, photoGrid, avatar, empty, ratingSection, thumb, fmtStars } from './components.js';
import { nextMilestone, onThisDay, yearStats, yearsWithDates } from './stats.js';
import { icon } from './icons.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const header = (title, right = '', back = '') => `
  <header class="top">
    ${back ? `<a class="icon-btn back" href="${back}" aria-label="Back">${icon('back')}</a>` : ''}
    <h1>${title}</h1><div class="top-right">${right}</div>
  </header>`;

// ───────── Home ─────────
export function home() {
  const total = db.total();
  const updated = db.lastUpdated();
  const planned = S.ideas.filter((i) => i.status === 'planned')
    .sort((a, b) => (a.planned_for || '9999').localeCompare(b.planned_for || '9999'));
  const notYet = S.ideas.filter((i) => i.status === 'not_yet').length;
  const wants = db.visibleIdeas().filter((i) => i.want && i.status !== 'done').length;
  const recent = db.sortedOutings().slice(0, 3);
  const inbox = suggestionsBanner();
  const ms = nextMilestone(total);
  const memories = onThisDay();
  const year = new Date().getFullYear();
  const memoryCard = memories.length ? `
    <section class="block memory" aria-label="On this day">
      <div class="block-head"><h2>${memories[0].kind === 'month' ? 'One month ago' : 'On this day'}</h2></div>
      <div class="olist">${memories.slice(0, 3).map(({ o, years, kind }) => `
        <a class="ocard memory-card" href="#/outing/${o.id}">${thumb(o)}
          <span class="ocard-main"><span class="memory-when">${kind === 'month' ? 'A month ago today' : `${plural(years, 'year')} ago${kind === 'today' ? ' today' : ' this week'}`}</span>
          <span class="ocard-title">${esc(db.outingTitle(o))}</span>
          ${o.recap ? `<span class="ocard-recap">${esc(o.recap)}</span>` : ''}</span></a>`).join('')}</div>
    </section>` : '';
  return `
    ${header('<span class="brand">Walk <i>&amp;</i> Talk</span>')}
    <section class="hero" aria-label="Total dates">
      <div class="hero-num">${total}</div>
      <div class="hero-label">${total === 1 ? 'date' : 'dates'} together</div>
      ${updated ? `<div class="hero-sub">Updated ${fmtDate(updated)}</div>` : ''}
      <button class="hero-plus" data-act="bump" aria-label="Count one more date without adding details">${icon('plus', 'ic-sm')} 1 date</button>
      <div class="hero-stats">
        <a href="#/ideas?status=planned"><b>${planned.length}</b> planned</a>
        <a href="#/ideas?status=not_yet"><b>${notYet}</b> not yet</a>
        <a href="#/ideas?want=1"><b>${wants}</b> 😍</a>
      </div>
      <div class="milestone" aria-label="${ms.left} more ${ms.left === 1 ? 'date' : 'dates'} until date number ${ms.next}">
        <div class="milestone-bar" aria-hidden="true"><span style="width:${ms.pct}%"></span></div>
        <div class="milestone-text">${ms.left} to go until date #${ms.next}</div>
      </div>
    </section>
    <button class="btn btn-primary btn-block btn-big pick-btn" data-act="pick">${icon('dice')} Pick for us</button>
    ${inbox}
    ${memoryCard}

    <section class="block">
      <div class="block-head"><h2>Up next</h2><a href="#/ideas?status=planned" class="small">See all</a></div>
      ${planned.length ? `<ul class="ilist">${planned.slice(0, 4).map(ideaRow).join('')}</ul>`
        : `<p class="muted">Nothing planned yet. Tap <b>Pick for us</b> or set an idea to <b>Planned</b>.</p>`}
    </section>

    <section class="block">
      <div class="block-head"><h2>Recent dates</h2><a href="#/log" class="small">Date log</a></div>
      ${recent.length ? `<div class="olist">${recent.map(outingCard).join('')}</div>`
        : `<p class="muted">No dates logged yet.</p>`}
      <button class="btn btn-ghost btn-block" data-act="log-date">${icon('plus')} Log a date</button>
    </section>

    <a class="review-link" href="#/year/${year}">${icon('sparkle')}<span><b>${year} in review</b><small>Your year of dates, by the numbers</small></span>${icon('next')}</a>`;
}

function suggestionsBanner() {
  const n = S.suggestions.length;
  return n ? `<button class="inbox-banner" data-act="suggestions">${icon('inbox')}<span><b>${plural(n, 'new suggestion')}</b><small>From friends — tap to add or decline</small></span>${icon('next')}</button>` : '';
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
    .filter((i) => !db.isHidden(i) || (!q && !st.want && !st.tag)) // surprises only show when no search/filter could give them away
    .filter((i) => st.status === 'all' || i.status === st.status)
    .filter((i) => !st.want || i.want)
    .filter((i) => !st.tag || i.tag_ids?.includes(st.tag))
    .filter((i) => !q || i.title.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q))
    .sort((a, b) => order[a.status] - order[b.status] || (db.isHidden(b) - db.isHidden(a)) || (b.want - a.want) || a.title.localeCompare(b.title));
  const counts = Object.fromEntries(['not_yet', 'planned', 'done'].map((k) => [k, S.ideas.filter((i) => i.status === k).length]));
  const seg = (k, label) => `<button class="seg-btn ${st.status === k ? 'on' : ''}" data-act="filter-status" data-v="${k}" aria-pressed="${st.status === k}">${label}</button>`;
  return `
    ${header('Ideas')}
    ${suggestionsBanner()}
    <div class="filters">
      <input type="search" id="idea-search" class="search" placeholder="Search ${S.ideas.length} ideas…" value="${esc(st.q)}" aria-label="Search ideas" data-input="search">
      <div class="seg" role="group" aria-label="Status">${seg('all', 'All')}${seg('not_yet', `Not yet <small>${counts.not_yet}</small>`)}${seg('planned', `Planned <small>${counts.planned}</small>`)}${seg('done', `Done <small>${counts.done}</small>`)}</div>
      <div class="chips-scroll" role="group" aria-label="Filter by tag">
        <button class="chip chip-toggle ${st.want ? 'on' : ''}" data-act="filter-want" aria-pressed="${st.want}">😍 Really want</button>
        ${S.tags.map((t) => `<button class="chip chip-toggle ${st.tag === t.id ? 'on' : ''}" data-act="filter-tag" data-v="${t.id}" aria-pressed="${st.tag === t.id}">${esc(t.name)}</button>`).join('')}
      </div>
    </div>
    ${list.length ? `<ul class="ilist">${list.map(ideaRow).join('')}</ul>`
      : S.ideas.length ? empty('search', 'No ideas match', 'Try clearing a filter.') : empty('idea', 'No ideas yet', 'Tap + to add your first one.')}
    <button class="fab" data-act="new-idea" aria-label="Add an idea">${icon('plus')}</button>`;
}

// ───────── One idea ─────────
export function idea({ id }) {
  const i = db.idea(id);
  if (!i) return header('Not found', '', '#/ideas') + empty('idea', 'This idea was deleted');
  if (db.isHidden(i)) {
    const from = esc(db.memberName(i.created_by));
    return `
      ${header('', '', '#/ideas')}
      <article class="detail surprise-page">
        <div class="surprise-art">${icon('gift')}</div>
        <h1 class="detail-title center">A surprise from ${from}</h1>
        ${i.planned_for ? `<p class="center surprise-when">${icon('calendar', 'ic-sm')} ${fmtDay(i.planned_for)}</p>` : ''}
        <p class="center muted">${from} is planning something. It’ll reveal itself after the date — or you can peek now if you’d rather know.</p>
        <button class="btn btn-ghost btn-block" data-act="peek" data-id="${id}">${icon('eye')} Peek at the surprise</button>
      </article>`;
  }
  const outs = db.outingsFor(id);
  const surpriseNote = i.is_surprise && i.status !== 'done' && db.isMe(i.created_by)
    ? `<p class="surprise-note">${icon('gift', 'ic-sm')} Surprise for ${esc(db.partner()?.display_name || 'your partner')} — ${(i.revealed_to || []).length ? 'they peeked!' : 'they can’t see the details.'}</p>` : '';
  const link = safeUrl(i.link);
  const facts = [
    i.status === 'planned' ? `<li>${icon('calendar')} <span>${i.planned_for ? fmtDay(i.planned_for) : 'No day picked yet'}</span> <button class="link-btn" data-act="plan" data-id="${id}">${i.planned_for ? 'Change' : 'Pick a day'}</button>
      ${i.planned_for ? `<button class="link-btn" data-act="calendar" data-id="${id}">Add to calendar</button>` : ''}</li>` : '',
    i.location ? `<li>${icon('pin')} <a href="https://maps.google.com/?q=${encodeURIComponent(i.location)}" target="_blank" rel="noopener">${esc(i.location)}</a></li>` : '',
    link ? `<li>${icon('link')} <a href="${esc(link)}" target="_blank" rel="noopener">${esc(new URL(link).hostname.replace(/^www\./, ''))}</a></li>` : '',
    i.suggested_by ? `<li>${avatar(i.suggested_by, 'sm')} <span>${db.isMe(i.suggested_by) ? 'Your' : `${esc(db.memberName(i.suggested_by))}’s`} idea</span></li>` : '',
  ].join('');
  return `
    ${header('', `<button class="icon-btn" data-act="edit-idea" data-id="${id}" aria-label="Edit idea">${icon('edit')}</button>`, '#/ideas')}
    <article class="detail">
      ${surpriseNote}
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
        <button class="btn btn-ghost btn-block" data-act="log-date" data-idea="${id}">${icon('plus')} ${outs.length ? 'We did it again' : 'We did it — log it'}</button>
      </section>

      ${commentsSection('idea', id)}
      <button class="btn btn-danger-ghost btn-block" data-act="delete-idea" data-id="${id}">Delete idea</button>
    </article>`;
}

// ───────── Date log (list or map) ─────────
export const logState = { view: 'list', focus: null };
export function log(params = {}) {
  if (params.view) logState.view = params.view;
  logState.focus = params.focus || null;
  const outs = db.sortedOutings();
  const base = db.baseline();
  const seg = (k, label) => `<button class="seg-btn ${logState.view === k ? 'on' : ''}" data-act="log-view" data-v="${k}" aria-pressed="${logState.view === k}">${label}</button>`;
  let body;
  if (logState.view === 'map') {
    const pinned = S.outings.filter((o) => o.lat != null).length;
    const wish = db.visibleIdeas().filter((i) => i.lat != null && i.status !== 'done').length;
    const missing = S.outings.filter((o) => o.lat == null).length;
    body = `
      <div id="map-slot" class="map-slot" aria-label="Map of our dates"></div>
      <p class="map-legend small"><span class="pin-key done" aria-hidden="true"></span> ${plural(pinned, 'date')} we went on
        <span class="pin-key wish" aria-hidden="true"></span> ${plural(wish, 'idea')} we want to try</p>
      ${!S.v2 ? '<p class="muted small center">The map needs the Phase 2 database update (see Settings).</p>'
        : missing ? `<p class="muted small center">${plural(missing, 'date')} ${missing === 1 ? 'isn’t' : 'aren’t'} on the map yet. Edit a date and add a place to pin it.</p>` : ''}`;
  } else {
    let html = '', month = '';
    for (const o of outs) {
      const m = fmtDate(o.happened_on, { month: 'long', year: 'numeric' });
      if (m !== month) { if (month) html += '</div>'; html += `<h2 class="month">${m}</h2><div class="olist">`; month = m; }
      html += outingCard(o);
    }
    if (month) html += '</div>';
    body = `${outs.length ? html : empty('book', 'No dates logged yet', 'Tap + after your next date.')}
      ${base.count ? `<p class="muted small center baseline">Plus ${plural(Number(base.count), 'more date')} counted without details${base.as_of ? ` (last on ${fmtDate(base.as_of)})` : ''}</p>` : ''}`;
  }
  return `
    ${header('Date log', `<a class="icon-btn" href="#/year/${new Date().getFullYear()}" aria-label="Year in review">${icon('sparkle')}</a>`)}
    <p class="log-total"><b>${db.total()}</b> dates together${db.lastUpdated() ? ` · updated ${fmtDate(db.lastUpdated())}` : ''}</p>
    <div class="seg log-seg" role="group" aria-label="View">${seg('list', `${icon('list', 'ic-sm')} List`)}${seg('map', `${icon('map', 'ic-sm')} Map`)}</div>
    ${body}
    <button class="fab" data-act="log-date" aria-label="Log a date">${icon('plus')}</button>`;
}

// ───────── Year in review ─────────
export function year({ id }) {
  const y = Number(id) || new Date().getFullYear();
  const st = yearStats(y);
  const years = yearsWithDates();
  const max = Math.max(1, ...st.months);
  const chips = years.map((yy) => `<a class="chip chip-toggle ${yy === y ? 'on' : ''}" href="#/year/${yy}" ${yy === y ? 'aria-current="page"' : ''}>${yy}</a>`).join('');
  if (!st.count) {
    return `${header(`${y} in review`, '', '#/')}<div class="chips">${chips}</div>${empty('sparkle', `No dates logged in ${y} yet`, 'Your year in review fills in as you log dates.')}`;
  }
  const tile = (n, label) => `<div class="tile"><b>${n}</b><span>${label}</span></div>`;
  const bars = st.months.map((n, i) => `
    <div class="bar-col" tabindex="0" aria-label="${MONTHS[i]}: ${plural(n, 'date')}">
      <span class="bar-tip" role="tooltip">${MONTHS[i]} · ${plural(n, 'date')}</span>
      <span class="bar" style="height:${n ? Math.max(6, (n / max) * 100) : 0}%"></span>
      <span class="bar-label" aria-hidden="true">${MONTHS[i][0]}</span>
    </div>`).join('');
  return `
    ${header(`${y} in review`, '', '#/')}
    <div class="chips year-chips">${chips}</div>
    <section class="review-hero">
      <div class="hero-num">${st.count}</div>
      <div class="hero-label">${st.count === 1 ? 'date' : 'dates'} logged in ${y}</div>
      ${st.first ? `<div class="hero-sub">From “${esc(db.outingTitle(st.first))}” (${fmtDate(st.first.happened_on, { month: 'short', day: 'numeric' })}) to “${esc(db.outingTitle(st.last))}” (${fmtDate(st.last.happened_on, { month: 'short', day: 'numeric' })})</div>` : ''}
    </section>
    <div class="tiles">
      ${tile(st.photos, st.photos === 1 ? 'photo' : 'photos')}
      ${tile(st.comments, st.comments === 1 ? 'comment' : 'comments')}
      ${tile(st.places, st.places === 1 ? 'place' : 'places')}
      ${tile(st.avg != null ? `${fmtStars(st.avg)}<small>★</small>` : '–', 'avg rating')}
    </div>

    <section class="card">
      <h2>Dates by month</h2>
      <p class="muted small">Busiest: <b>${MONTHS[st.busiest]}</b> with ${plural(st.months[st.busiest], 'date')}</p>
      <div class="bars" role="list">${bars}</div>
    </section>

    ${st.rated.length ? `<section class="card"><h2>Top rated</h2><ol class="rank">${st.rated.map((x) => `
      <li><a href="#/outing/${x.o.id}">${esc(db.outingTitle(x.o))}</a><span class="rank-val">${fmtStars(x.avg)} ★</span></li>`).join('')}</ol></section>`
      : S.v2 ? '<section class="card"><h2>Top rated</h2><p class="muted small">Rate your dates (open one and tap the stars) to see your favorites here.</p></section>' : ''}

    ${st.topTags.length ? `<section class="card"><h2>Favorite kinds of dates</h2><ol class="rank">${st.topTags.map((x) => `
      <li><span>${esc(x.tag.name)}</span><span class="rank-val">${plural(x.n, 'date')}</span></li>`).join('')}</ol></section>` : ''}

    <div class="tiles two">
      ${st.mostPhotos ? `<a class="tile link" href="#/outing/${st.mostPhotos.o.id}"><span>Most photographed</span><b class="t-title">${esc(db.outingTitle(st.mostPhotos.o))}</b><span>${plural(st.mostPhotos.n, 'photo')}</span></a>` : ''}
      ${st.topEmoji ? `<div class="tile"><span>Favorite reaction</span><b class="t-emoji">${st.topEmoji[0]}</b><span>used ${plural(st.topEmoji[1], 'time')}</span></div>` : ''}
    </div>`;
}

// ───────── One logged date ─────────
export function outing({ id }) {
  const o = db.outing(id);
  if (!o) return header('Not found', '', '#/log') + empty('book', 'This date was deleted');
  const i = o.idea_id ? db.idea(o.idea_id) : null;
  return `
    ${header('', `<button class="icon-btn" data-act="edit-outing" data-id="${id}" aria-label="Edit date">${icon('edit')}</button>`, '#/log')}
    <article class="detail">
      <p class="eyebrow">${fmtDate(o.happened_on, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
      <h1 class="detail-title">${esc(db.outingTitle(o))}</h1>
      ${i ? `<a class="from-idea" href="#/idea/${i.id}">From our idea list ${tagChips(i.tag_ids, { short: true })} ›</a>` : ''}
      ${o.location ? `<p class="facts-line">${icon('pin')} <a href="https://maps.google.com/?q=${encodeURIComponent(o.lat != null ? `${o.lat},${o.lng}` : o.location)}" target="_blank" rel="noopener">${esc(o.location)}</a>
        ${o.lat != null ? ` · <a href="#/log?view=map&focus=${id}">see on our map</a>` : ''}</p>` : ''}
      ${photoGrid(id)}
      ${o.recap ? `<div class="recap">${esc(o.recap).replace(/\n/g, '<br>')}</div>`
        : `<button class="recap recap-empty" data-act="edit-outing" data-id="${id}">${icon('edit')} Add a recap — how did it go?</button>`}
      ${ratingSection(id)}
      ${reactionsBar('outing', id)}
      <button class="btn btn-ghost btn-block" data-act="share-date" data-id="${id}">${icon('share')} Share this date</button>
      ${commentsSection('outing', id)}
      <button class="btn btn-danger-ghost btn-block" data-act="delete-outing" data-id="${id}">Delete this date</button>
    </article>`;
}

// ───────── Sharing (in Settings) ─────────
function linkBlock(kind, title, about) {
  const l = db.link(kind);
  const url = l?.enabled ? db.linkUrl(kind) : '';
  return `<div class="link-block">
    <h3 class="sub-title">${title}</h3>
    <p class="muted small">${about}</p>
    ${url ? `
      <div class="link-box"><input readonly value="${esc(url)}" aria-label="${title} address" data-select-all></div>
      <div class="row-btns wrap">
        <button class="btn btn-primary btn-sm" data-act="share-link" data-kind="${kind}">${icon('share', 'ic-sm')} Send</button>
        <button class="btn btn-ghost btn-sm" data-act="copy-link" data-kind="${kind}">${icon('copy', 'ic-sm')} Copy</button>
        <button class="btn btn-ghost btn-sm" data-act="link-new" data-kind="${kind}">New address</button>
        <button class="btn btn-ghost btn-sm danger-text" data-act="link-off" data-kind="${kind}">Turn off</button>
      </div>`
      : `<button class="btn btn-ghost btn-block" data-act="link-on" data-kind="${kind}">${l ? 'Turn the link back on' : 'Create link'}</button>`}
  </div>`;
}
function sharingCard(demo) {
  return `<section class="card">
    <h2>Sharing</h2>
    ${demo ? '<p class="muted small">Links can be made here in demo mode, but they only open in the real app.</p>' : ''}
    ${linkBlock('share', 'Share our dates', 'Anyone with this link can see your dates’ <b>photos and recaps</b> — never comments, ratings, places or surprises. Turn it off any time.')}
    ${linkBlock('suggest', 'Suggest-a-date link', 'Friends can send you date ideas. They land in an inbox here for you to add or decline; they can’t see anything in your app.')}
    ${S.suggestions.length ? `<button class="btn btn-ghost btn-block" data-act="suggestions">${icon('inbox', 'ic-sm')} Open inbox (${S.suggestions.length})</button>` : ''}
  </section>`;
}

// ───────── Settings ─────────
export function settings({ demo, canImport, theme, season, currentSeason }) {
  const me = db.member(S.me?.id);
  const base = db.baseline();
  const themeBtn = (k, label) => `<button class="seg-btn ${theme === k ? 'on' : ''}" data-act="theme" data-v="${k}" aria-pressed="${theme === k}">${label}</button>`;
  const seasonBtn = (k, label) => `<button class="season-opt season-${k} ${k === 'auto' ? `season-${currentSeason}` : ''} ${season === k ? 'on' : ''}" data-act="season" data-v="${k}" aria-pressed="${season === k}">
    <span class="season-sw" aria-hidden="true"><i></i><i></i><i></i></span>${label}</button>`;
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  return `
    ${header('Settings')}
    ${!S.v2 && !demo ? `<section class="card notice"><h2>One-time update needed</h2>
      <p class="small">Star ratings and the map need a small database update. In Supabase, open <b>SQL Editor → New query</b>, paste everything from <code>supabase/phase2.sql</code>, and click <b>Run</b>. Then reopen the app.</p></section>` : ''}
    ${S.v2 && !S.v3 && !demo ? `<section class="card notice"><h2>One-time update needed</h2>
      <p class="small">Surprises, the share link and the suggest-a-date link need a small database update. In Supabase, open <b>SQL Editor → New query</b>, paste everything from <code>supabase/phase3.sql</code>, and click <b>Run</b>. Then reopen the app.</p></section>` : ''}
    ${S.v3 ? sharingCard(demo) : ''}
    <section class="card">
      <h2>Us</h2>
      <ul class="people">${S.members.map((m) => `<li>${avatar(m.id)}<span><b>${esc(m.display_name)}</b>${db.isMe(m.id) ? ' <small class="muted">(you)</small>' : ''}</span></li>`).join('')}</ul>
      <form class="inline-form" data-form="rename"><label class="field grow"><span>Your name in the app</span>
        <input name="name" value="${esc(me?.display_name || '')}" maxlength="30"></label><button class="btn btn-ghost">Save</button></form>
    </section>

    <section class="card">
      <div class="block-head"><h2>Tags</h2><button class="btn btn-ghost btn-sm" data-act="new-tag">${icon('plus', 'ic-sm')} Add</button></div>
      <ul class="tag-list">${S.tags.map((t) => {
        const n = S.ideas.filter((i) => i.tag_ids?.includes(t.id)).length;
        return `<li><span class="grow">${esc(t.name)} <small class="muted">${n}</small></span>
          <button class="link-btn" data-act="edit-tag" data-id="${t.id}">Edit</button>
          <button class="link-btn danger" data-act="delete-tag" data-id="${t.id}" aria-label="Delete ${esc(t.name)}">Delete</button></li>`;
      }).join('') || '<li class="muted">No tags yet.</li>'}</ul>
    </section>

    <section class="card">
      <h2>Date count</h2>
      <p class="muted small">Dates counted without details: the ones from before the app plus every <b>+ 1 date</b> tap. They’re added to your total.</p>
      <form class="inline-form" data-form="baseline">
        <label class="field"><span>Dates without details</span><input name="count" type="number" min="0" inputmode="numeric" value="${esc(base.count ?? 0)}"></label>
        <label class="field grow"><span>Last counted</span><input name="as_of" type="date" value="${esc(base.as_of || '')}"></label>
        <button class="btn btn-ghost">Save</button></form>
    </section>

    <section class="card">
      <h2>Colors</h2>
      <p class="muted small">Match the season switches on its own: winter Dec–Feb, spring Mar–May, summer Jun–Aug, fall Sep–Nov. Right now it’s ${currentSeason}.</p>
      <div class="season-grid" role="group" aria-label="Color season">
        ${seasonBtn('auto', `Match the season <small>(${cap(currentSeason)})</small>`)}${seasonBtn('fall', 'Fall')}${seasonBtn('winter', 'Winter')}${seasonBtn('spring', 'Spring')}${seasonBtn('summer', 'Summer')}
      </div>
      <h3 class="sub-title">Light or dark</h3>
      <div class="seg" role="group" aria-label="Light or dark">${themeBtn('auto', 'Match phone')}${themeBtn('light', 'Light')}${themeBtn('dark', 'Dark')}</div>
    </section>

    <section class="card">
      <h2>Put it on your home screen</h2>
      <p><b>iPhone:</b> open in <b>Safari</b> → tap <b>Share</b> → <b>Add to Home Screen</b>.</p>
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
    <p class="muted small center">Walk &amp; Talk</p>`;
}
