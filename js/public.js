// The two public pages: share.html (read-only photos + recaps) and suggest.html (friends send ideas).
// They never sign in. The secret token sits after the # in the link, so it isn't sent in web requests;
// the database functions check it and hand back only what each page is allowed to show.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
import { CONFIG } from './config.js';
import { esc, fmtDate, plural } from './ui.js';
import { icon } from './icons.js';

const root = document.getElementById('page');
const page = document.body.dataset.page;
const token = decodeURIComponent(location.hash.slice(1));
const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const names = (list) => (list || []).join(' & ') || 'us';

const message = (title, text = '') => {
  root.innerHTML = `<div class="empty public-msg"><img class="auth-logo" src="icons/icon.svg" alt="" width="64" height="64">
    <p><b>${esc(title)}</b></p>${text ? `<p class="muted">${esc(text)}</p>` : ''}</div>`;
};

async function sharePage() {
  if (!token) return message('This link is missing its code', 'Ask whoever sent it for the full link.');
  const { data, error } = await sb.rpc('shared_dates', { p_token: token });
  if (error) return message('Couldn’t load these dates', 'Please try again in a moment.');
  if (!data) return message('This link isn’t active', 'It may have been turned off or replaced with a new one.');
  const who = names(data.names);
  document.title = `${who} · Walk & Talk`;
  const dates = data.dates || [];
  const paths = dates.flatMap((d) => d.photos || []);
  const urls = {};
  for (let k = 0; k < paths.length; k += 100) {
    const { data: signed } = await sb.storage.from('photos').createSignedUrls(paths.slice(k, k + 100), 60 * 60 * 6);
    (signed || []).forEach((s) => { if (s.signedUrl) urls[s.path] = s.signedUrl; });
  }
  let html = '', month = '';
  for (const d of dates) {
    const m = fmtDate(d.day, { month: 'long', year: 'numeric' });
    if (m !== month) { if (month) html += '</div>'; html += `<h2 class="month">${m}</h2><div class="pub-list">`; month = m; }
    const ph = (d.photos || []).filter((p) => urls[p]);
    html += `<article class="pub-card">
      ${ph.length ? `<div class="pub-photos n${Math.min(ph.length, 3)}">${ph.map((p, i) => `<a href="${esc(urls[p])}" target="_blank" rel="noopener" aria-label="Open photo ${i + 1}"><img src="${esc(urls[p])}" alt="" loading="lazy" decoding="async"></a>`).join('')}</div>` : ''}
      <div class="pub-body"><p class="eyebrow">${fmtDate(d.day, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      <h3 class="pub-title">${esc(d.title)}</h3>
      ${d.recap ? `<p class="pub-recap">${esc(d.recap).replace(/\n/g, '<br>')}</p>` : ''}</div>
    </article>`;
  }
  if (month) html += '</div>';
  root.innerHTML = `
    <header class="pub-head"><img class="pub-logo" src="icons/icon.svg" alt="" width="44" height="44">
      <div><h1>${esc(who)}</h1><p class="muted">${plural(dates.length, 'date')} together, shared from Walk &amp; Talk</p></div></header>
    ${dates.length ? html : '<p class="muted center">No dates shared yet.</p>'}`;
}

async function suggestPage() {
  if (!token) return message('This link is missing its code', 'Ask whoever sent it for the full link.');
  const { data, error } = await sb.rpc('suggest_info', { p_token: token });
  if (error) return message('Couldn’t open the suggestion box', 'Please try again in a moment.');
  if (!data) return message('This suggestion link isn’t active', 'It may have been turned off or replaced with a new one.');
  const who = names(data.names);
  document.title = `Suggest a date for ${who}`;
  root.innerHTML = `
    <header class="pub-head"><img class="pub-logo" src="icons/icon.svg" alt="" width="44" height="44">
      <div><h1>Suggest a date</h1><p class="muted">for ${esc(who)}</p></div></header>
    <form class="form card" novalidate>
      <label class="field"><span>Your name</span><input name="name" maxlength="60" autocomplete="name" required></label>
      <label class="field"><span>Date idea</span><input name="title" maxlength="140" placeholder="Stargazing at the lake" required></label>
      <label class="field"><span>Details <small class="muted">(optional)</small></span><textarea name="details" rows="4" maxlength="1000" placeholder="Where, when, why it’d be fun…"></textarea></label>
      <p class="error" role="alert" hidden></p>
      <button class="btn btn-primary btn-block">${icon('share', 'ic-sm')} Send suggestion</button>
      <p class="muted small center">${esc(who)} will see your name and idea. Nothing else is shared.</p>
    </form>`;
  const f = root.querySelector('form'), err = f.querySelector('.error');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const name = f.elements.name.value.trim(), title = f.elements.title.value.trim();
    if (!name || !title) { err.textContent = 'Add your name and a date idea first.'; err.hidden = false; return; }
    const btn = f.querySelector('.btn-primary'); btn.disabled = true; btn.textContent = 'Sending…'; err.hidden = true;
    const { error: e2 } = await sb.rpc('suggest_date', { p_token: token, p_name: name, p_title: title, p_details: f.elements.details.value.trim() });
    if (e2) { err.textContent = e2.message || 'Couldn’t send — please try again.'; err.hidden = false; btn.disabled = false; btn.innerHTML = `${icon('share', 'ic-sm')} Send suggestion`; return; }
    root.querySelector('form').outerHTML = `<div class="card center thanks"><div class="empty-icon">${icon('check')}</div>
      <p><b>Sent — thank you!</b></p><p class="muted">${esc(who)} will see “${esc(title)}” in their app.</p>
      <button class="btn btn-ghost" onclick="location.reload()">Suggest another</button></div>`;
  };
  f.querySelectorAll('input, textarea').forEach((el) => el.addEventListener('input', () => { err.hidden = true; }));
}

(page === 'share' ? sharePage() : suggestPage()).catch((e) => { console.error(e); message('Something went wrong', 'Please try again in a moment.'); });
