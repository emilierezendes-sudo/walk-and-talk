// Pop-up sheets: add/edit forms, status changes, Pick for us, photo viewer.
import * as db from './db.js';
import { S } from './db.js';
import { esc, openSheet, confirmSheet, toast, REACTIONS, STATUS, fmtDate, fmtDay, plural } from './ui.js';

const go = (hash) => { location.hash = hash; };

// ───────── "Where?" field with place search ─────────
function placeField(value) {
  return `<div class="field place-field"><label for="place-input">Where? <small class="muted">(optional)</small></label>
    <div class="place-row"><input id="place-input" name="location" value="${esc(value || '')}" placeholder="Place or address" maxlength="200" autocomplete="off">
    <button type="button" class="btn btn-ghost btn-sm" data-place-find>📍 Find</button></div>
    <p class="place-status small" aria-live="polite"></p><div class="place-results" role="list"></div></div>`;
}
// Wires up the field. Returns a function that reads { location, lat, lng, needsLookup }.
function mountPlace(root, start = {}) {
  const inp = root.querySelector('[name=location]'), status = root.querySelector('.place-status'), list = root.querySelector('.place-results');
  const st = { lat: start.lat ?? null, lng: start.lng ?? null, text: (start.location || '').trim() };
  const showPinned = () => { status.textContent = st.lat != null && inp.value.trim() ? '📍 Pinned on your map' : ''; };
  showPinned();
  inp.addEventListener('input', () => { if (inp.value.trim() !== st.text) { st.lat = st.lng = null; } list.innerHTML = ''; showPinned(); });
  const find = async () => {
    const q = inp.value.trim(); if (!q) { inp.focus(); return; }
    status.textContent = 'Searching…'; list.innerHTML = '';
    try {
      const { searchPlaces } = await import('./geo.js');
      const res = await searchPlaces(q);
      if (!res.length) { status.textContent = 'No matches — try adding the city.'; return; }
      status.textContent = 'Pick the right place:';
      list.innerHTML = res.map((r, k) => `<button type="button" class="place-hit" data-k="${k}" role="listitem"><b>${esc(r.name)}</b><small>${esc(r.label)}</small></button>`).join('');
      list.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => {
        const r = res[Number(b.dataset.k)];
        inp.value = r.name; st.text = r.name; st.lat = r.lat; st.lng = r.lng; list.innerHTML = ''; showPinned();
      });
    } catch (e) { status.textContent = e.message || 'Search failed — try again.'; }
  };
  root.querySelector('[data-place-find]').onclick = find;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); find(); } });
  return () => {
    const location = inp.value.trim();
    if (!location) return { location: '', lat: null, lng: null, needsLookup: false };
    return { location, lat: st.lat, lng: st.lng, needsLookup: st.lat == null };
  };
}
// Typed a place but didn't pick a search result: look it up quietly after saving.
async function lookupLater(kind, id, location) {
  if (!S.v2) return;
  try {
    const { searchPlaces } = await import('./geo.js');
    const [hit] = await searchPlaces(location);
    if (!hit) return;
    if (kind === 'outing') await db.saveOuting({ lat: hit.lat, lng: hit.lng }, id);
    else await db.saveIdea({ lat: hit.lat, lng: hit.lng }, id);
  } catch (e) { console.warn('place lookup failed', e); }
}

// ───────── status ─────────
export function statusMenu(ideaId) {
  const i = db.idea(ideaId);
  openSheet({
    title: i.title,
    html: `<div class="status-choices">${Object.entries(STATUS).map(([k, s]) => `
      <button class="status-choice st-${k} ${i.status === k ? 'current' : ''}" data-status="${k}">
        <span class="pill-dot" aria-hidden="true"></span><span><b>${s.label}</b><small>${
          k === 'not_yet' ? 'Still on the wish list' : k === 'planned' ? 'We’ve picked a day (or soon will)' : 'We went! Log it with photos & a recap'}</small></span>
        ${i.status === k ? '<span class="tick" aria-label="current">✓</span>' : ''}</button>`).join('')}</div>`,
    onMount(el, close) {
      el.querySelectorAll('[data-status]').forEach((b) => b.onclick = () => { close(); changeStatus(ideaId, b.dataset.status); });
    },
  });
}

export async function changeStatus(ideaId, status) {
  const i = db.idea(ideaId);
  if (status === 'planned') return planSheet(ideaId);
  if (status === 'done') return logSheet({ ideaId });
  if (i.status === 'done' && db.outingsFor(ideaId).length) {
    const ok = await confirmSheet('Move this back to “Not yet”? The dates you already logged stay in your log.', { yes: 'Move it' });
    if (!ok) return;
  }
  await db.setStatus(ideaId, status);
}

export function planSheet(ideaId) {
  const i = db.idea(ideaId);
  openSheet({
    title: 'Plan it 📅',
    html: `<p class="muted">${esc(i.title)}</p>
      <label class="field"><span>When? <small class="muted">(optional)</small></span>
        <input type="date" name="when" value="${esc(i.planned_for || '')}"></label>
      <button class="btn btn-primary btn-block" data-save>Mark as Planned</button>`,
    onMount(el, close) {
      el.querySelector('[data-save]').onclick = async () => {
        await db.setStatus(ideaId, 'planned', el.querySelector('[name=when]').value);
        close(); toast('Planned! 🗓️');
      };
    },
  });
}

// ───────── log a date (create or edit an outing) ─────────
export function logSheet({ ideaId = null, outingId = null } = {}) {
  const o = outingId ? db.outing(outingId) : null;
  const linkedId = o ? o.idea_id : ideaId;
  const i = linkedId ? db.idea(linkedId) : null;
  const options = [...S.ideas].sort((a, b) => a.title.localeCompare(b.title))
    .map((x) => `<option value="${x.id}" ${x.id === linkedId ? 'selected' : ''}>${esc(x.title)}</option>`).join('');
  openSheet({
    title: o ? 'Edit date' : i ? 'We did it! 🎉' : 'Log a date',
    html: `
      <form class="form" novalidate>
        ${!o && i ? `<p class="muted">${esc(i.title)}</p>` : `
        <label class="field"><span>From our idea list <small class="muted">(optional)</small></span>
          <select name="idea"><option value="">— Not from the list —</option>${options}</select></label>
        <label class="field" data-title-field ${linkedId ? 'hidden' : ''}><span>What did you do?</span>
          <input name="title" value="${esc(o?.title || '')}" placeholder="e.g. Tacos and a long walk" maxlength="120"></label>`}
        <label class="field"><span>When?</span><input type="date" name="day" required value="${esc(o?.happened_on || db.todayStr())}"></label>
        ${placeField(o ? o.location : i?.location)}
        <label class="field"><span>Recap <small class="muted">(how did it go?)</small></span>
          <textarea name="recap" rows="4" placeholder="The best part was…">${esc(o?.recap || '')}</textarea></label>
        <button class="btn btn-primary btn-block" type="submit">${o ? 'Save' : 'Log it'}</button>
        ${!o && i && i.status !== 'done' ? '<button class="btn btn-ghost btn-block" type="button" data-just-done>Just mark Done (don’t add to the log)</button>' : ''}
        ${!o ? '<p class="muted small center">You can add photos on the next screen.</p>' : ''}
      </form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      const sel = f.elements.idea;
      const src = o || i;
      const readPlace = mountPlace(f, src ? { location: src.location, lat: src.lat, lng: src.lng } : {});
      sel?.addEventListener('change', () => { f.querySelector('[data-title-field]').hidden = !!sel.value; });
      el.querySelector('[data-just-done]')?.addEventListener('click', async () => { await db.setStatus(ideaId, 'done'); close(); });
      f.onsubmit = async (e) => {
        e.preventDefault();
        const idea_id = sel ? (sel.value || null) : linkedId;
        const title = f.elements.title?.value.trim() || '';
        if (!idea_id && !title) { toast('Give the date a name, or pick it from your list'); f.elements.title.focus(); return; }
        const place = readPlace();
        const fields = { idea_id, title: idea_id ? '' : title, happened_on: f.elements.day.value || db.todayStr(),
          location: place.location, lat: place.lat, lng: place.lng, recap: f.elements.recap.value.trim() };
        close();
        const id = await db.saveOuting(fields, outingId);
        if (place.needsLookup) lookupLater('outing', id, place.location);
        if (idea_id && db.idea(idea_id)?.status !== 'done') await db.setStatus(idea_id, 'done');
        if (!o) { toast(`Date #${db.total()} logged! 🎉`); go(`#/outing/${id}`); }
      };
    },
  });
}

// ───────── add / edit an idea ─────────
export function ideaSheet(ideaId = null) {
  const i = ideaId ? db.idea(ideaId) : null;
  const sel = new Set(i?.tag_ids || []);
  const people = S.members.map((m) => `<option value="${m.id}" ${(i ? i.suggested_by : S.me?.id) === m.id ? 'selected' : ''}>${esc(m.display_name)}</option>`).join('');
  openSheet({
    title: i ? 'Edit idea' : 'New date idea 💡',
    html: `
      <form class="form" novalidate>
        <label class="field"><span>The idea</span><input name="title" required maxlength="140" value="${esc(i?.title || '')}" placeholder="e.g. Sunset picnic at the lake" autofocus></label>
        <label class="field"><span>Details <small class="muted">(optional)</small></span>
          <textarea name="description" rows="3" placeholder="Anything to remember…">${esc(i?.description || '')}</textarea></label>
        <fieldset class="field"><legend>Tags</legend>
          <div class="tag-pick">${S.tags.map((t) => `<button type="button" class="chip chip-toggle ${sel.has(t.id) ? 'on' : ''}" data-tag="${t.id}" aria-pressed="${sel.has(t.id)}">${t.emoji} ${esc(t.name)}</button>`).join('')}</div>
        </fieldset>
        <label class="switch-row"><input type="checkbox" name="want" ${i?.want ? 'checked' : ''}><span>😍 We <b>really</b> want to do this</span></label>
        <label class="field"><span>Link <small class="muted">(website, tickets…)</small></span><input name="link" type="url" inputmode="url" value="${esc(i?.link || '')}" placeholder="https://"></label>
        ${placeField(i?.location)}
        <label class="field"><span>Whose idea?</span><select name="by"><option value="">Both of us / not sure</option>${people}</select></label>
        <button class="btn btn-primary btn-block" type="submit">${i ? 'Save' : 'Add idea'}</button>
      </form>`,
    onMount(el, close) {
      el.querySelectorAll('[data-tag]').forEach((b) => b.onclick = () => {
        const on = !sel.has(b.dataset.tag); on ? sel.add(b.dataset.tag) : sel.delete(b.dataset.tag);
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
      });
      const f = el.querySelector('form');
      const readPlace = mountPlace(f, i ? { location: i.location, lat: i.lat, lng: i.lng } : {});
      f.onsubmit = async (e) => {
        e.preventDefault();
        const title = f.elements.title.value.trim();
        if (!title) { toast('Give the idea a name'); f.elements.title.focus(); return; }
        let link = f.elements.link.value.trim();
        if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
        const place = readPlace();
        const fields = { title, description: f.elements.description.value.trim(), tag_ids: [...sel], want: f.elements.want.checked,
          link, location: place.location, lat: place.lat, lng: place.lng, suggested_by: f.elements.by.value || null };
        close();
        const id = await db.saveIdea(fields, ideaId);
        if (place.needsLookup) lookupLater('idea', id, place.location);
        if (!i) { toast('Idea added 💡'); go(`#/idea/${id}`); }
      };
    },
  });
}

// ───────── Pick for us ─────────
const pickPrefs = { tags: new Set(), wantOnly: false, planned: false };
export function pickSheet() {
  openSheet({
    title: '🎲 Pick for us',
    className: 'pick-sheet',
    html: `
      <div class="pick-stage" aria-live="polite"><div class="pick-card idle"><span class="pick-emoji">🎲</span><span class="pick-title">Ready when you are</span></div></div>
      <div class="pick-actions"></div>
      <details class="pick-filters" open>
        <summary>Filters <span class="pick-count muted small"></span></summary>
        <div class="tag-pick">${S.tags.map((t) => `<button type="button" class="chip chip-toggle ${pickPrefs.tags.has(t.id) ? 'on' : ''}" data-tag="${t.id}" aria-pressed="${pickPrefs.tags.has(t.id)}">${t.emoji} ${esc(t.name)}</button>`).join('')}</div>
        <label class="switch-row"><input type="checkbox" name="want" ${pickPrefs.wantOnly ? 'checked' : ''}><span>Only 😍 ideas</span></label>
        <label class="switch-row"><input type="checkbox" name="planned" ${pickPrefs.planned ? 'checked' : ''}><span>Include ideas already Planned</span></label>
      </details>
      <button class="btn btn-primary btn-block btn-big" data-roll>Pick one!</button>`,
    onMount(el, close) {
      const pool = () => S.ideas.filter((i) => (i.status === 'not_yet' || (pickPrefs.planned && i.status === 'planned'))
        && (!pickPrefs.wantOnly || i.want)
        && (!pickPrefs.tags.size || i.tag_ids?.some((t) => pickPrefs.tags.has(t))));
      const count = () => { const n = pool().length; el.querySelector('.pick-count').textContent = `· ${plural(n, 'idea')} to choose from`; return n; };
      count();
      el.querySelectorAll('[data-tag]').forEach((b) => b.onclick = () => {
        const id = b.dataset.tag, on = !pickPrefs.tags.has(id);
        on ? pickPrefs.tags.add(id) : pickPrefs.tags.delete(id);
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); count();
      });
      el.querySelector('[name=want]').onchange = (e) => { pickPrefs.wantOnly = e.target.checked; count(); };
      el.querySelector('[name=planned]').onchange = (e) => { pickPrefs.planned = e.target.checked; count(); };

      const stage = el.querySelector('.pick-stage'), actions = el.querySelector('.pick-actions'), roll = el.querySelector('[data-roll]');
      let last = null;
      const card = (i, cls = '') => {
        const t = i.tag_ids?.length ? db.tag(i.tag_ids[0]) : null;
        return `<div class="pick-card ${cls}"><span class="pick-emoji">${t?.emoji || '💞'}</span><span class="pick-title">${esc(i.title)}</span>${i.want ? '<span class="pick-want">😍</span>' : ''}</div>`;
      };
      roll.onclick = async () => {
        const p = pool();
        if (!p.length) { stage.innerHTML = '<div class="pick-card idle"><span class="pick-emoji">🤷</span><span class="pick-title">Nothing matches — try fewer filters</span></div>'; actions.innerHTML = ''; return; }
        const choices = p.length > 1 ? p.filter((x) => x !== last) : p;
        const winner = choices[Math.floor(Math.random() * choices.length)];
        roll.disabled = true; actions.innerHTML = '';
        el.querySelector('.pick-filters').open = false;
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduce && p.length > 1) {
          for (let k = 0; k < 12; k++) {
            stage.innerHTML = card(p[Math.floor(Math.random() * p.length)], 'spin');
            await new Promise((r) => setTimeout(r, 50 + k * 12));
          }
        }
        last = winner;
        stage.innerHTML = card(winner, 'win');
        actions.innerHTML = `<button class="btn btn-accent" data-plan>📅 Let’s do it</button><a class="btn btn-ghost" href="#/idea/${winner.id}" data-close>See idea</a>`;
        actions.querySelector('[data-plan]').onclick = () => { close(); planSheet(winner.id); };
        roll.textContent = 'Pick again'; roll.disabled = false;
      };
    },
  });
}

// ───────── tags ─────────
export function tagSheet(tagId = null) {
  const t = tagId ? db.tag(tagId) : null;
  openSheet({
    title: t ? 'Edit tag' : 'New tag',
    html: `<form class="form" novalidate>
      <div class="row-fields">
        <label class="field emoji-field"><span>Emoji</span><input name="emoji" value="${esc(t?.emoji || '🏷️')}" maxlength="8" aria-label="Tag emoji"></label>
        <label class="field grow"><span>Name</span><input name="name" value="${esc(t?.name || '')}" maxlength="40" required autofocus placeholder="e.g. Rainy day"></label>
      </div>
      <button class="btn btn-primary btn-block" type="submit">${t ? 'Save' : 'Add tag'}</button></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      f.onsubmit = async (e) => {
        e.preventDefault();
        const name = f.elements.name.value.trim(); if (!name) { toast('Give the tag a name'); return; }
        close(); await db.saveTag({ name, emoji: f.elements.emoji.value.trim() || '🏷️' }, tagId);
      };
    },
  });
}

// ───────── reactions ─────────
export function reactPicker(type, id) {
  openSheet({
    title: 'React',
    html: `<div class="react-picker">${REACTIONS.map((e) => `<button data-e="${e}" aria-label="React with ${e}">${e}</button>`).join('')}</div>`,
    onMount(el, close) {
      el.querySelectorAll('[data-e]').forEach((b) => b.onclick = () => { close(); db.toggleReaction(type, id, b.dataset.e); });
    },
  });
}

// ───────── photo viewer ─────────
export function photoViewer(photoId) {
  const p0 = S.photos.find((p) => p.id === photoId);
  const list = db.photosFor(p0.outing_id);
  let idx = list.findIndex((p) => p.id === photoId);
  const back = document.createElement('div');
  back.className = 'viewer';
  back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true'); back.setAttribute('aria-label', 'Photo');
  const draw = () => {
    const p = list[idx];
    back.innerHTML = `
      <img src="${esc(db.photoUrl(p.path))}" alt="Photo ${idx + 1} of ${list.length}">
      <div class="viewer-bar">
        <button class="icon-btn" data-x aria-label="Close">✕</button>
        <span>${idx + 1} / ${list.length} · added by ${esc(db.memberName(p.created_by))}</span>
        <button class="icon-btn" data-del aria-label="Delete photo">🗑</button>
      </div>
      ${list.length > 1 ? '<button class="viewer-nav prev" data-prev aria-label="Previous photo">‹</button><button class="viewer-nav next" data-next aria-label="Next photo">›</button>' : ''}`;
  };
  const close = () => { back.remove(); document.removeEventListener('keydown', key); document.body.classList.remove('no-scroll'); };
  const step = (d) => { idx = (idx + d + list.length) % list.length; draw(); };
  const key = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1); };
  back.addEventListener('click', async (e) => {
    if (e.target.closest('[data-x]') || e.target === back) return close();
    if (e.target.closest('[data-prev]')) return step(-1);
    if (e.target.closest('[data-next]')) return step(1);
    if (e.target.closest('[data-del]')) {
      if (await confirmSheet('Delete this photo for both of you?', { yes: 'Delete', danger: true })) { await db.deletePhoto(list[idx].id); close(); }
    }
  });
  let x0 = null;
  back.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  back.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50 && list.length > 1) step(dx < 0 ? 1 : -1); x0 = null; });
  document.addEventListener('keydown', key);
  document.body.classList.add('no-scroll');
  draw(); document.body.append(back);
}

export { fmtDate, fmtDay };
