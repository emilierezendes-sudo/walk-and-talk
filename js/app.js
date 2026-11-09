import { CONFIG } from './config.js';
import * as db from './db.js';
import { S } from './db.js';
import * as V from './views.js';
import * as F from './flows.js';
import { esc, toast, confirmSheet, celebrate } from './ui.js';
import { milestoneToCelebrate } from './stats.js';
import { mountMap } from './mapview.js';
import { icon } from './icons.js';

const app = document.getElementById('app');
const qs = new URLSearchParams(location.search);
const DEMO = qs.has('demo') || !CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey;
const LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const AUTH_HASH = location.hash; // read before Supabase consumes tokens from email links

// ───────── colors: season + light/dark (saved per phone) ─────────
const SEASON_BY_MONTH = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall', 'winter'];
const seasonNow = () => SEASON_BY_MONTH[new Date().getMonth()];
const getPref = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const getTheme = () => getPref('wt-theme', 'auto');      // auto · light · dark
const getSeason = () => getPref('wt-season', 'auto');    // auto · fall · winter · spring · summer
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const root = document.documentElement;
  const mode = getTheme(), season = getSeason();
  root.dataset.theme = mode;
  root.dataset.mode = mode === 'dark' || (mode === 'auto' && darkQuery.matches) ? 'dark' : 'light';
  root.dataset.season = season === 'auto' ? seasonNow() : season;
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  if (bg) document.head.append(Object.assign(document.createElement('meta'), { name: 'theme-color', content: bg }));
}
applyTheme();
darkQuery.addEventListener?.('change', applyTheme);

// ───────── backend ─────────
const backend = DEMO
  ? (await import('./backend-demo.js')).createDemoBackend()
  : (await import('./backend-supabase.js')).createSupabaseBackend({ url: CONFIG.supabaseUrl, key: CONFIG.supabaseAnonKey });
db.init(backend);

// ───────── sign in ─────────
// steps: signin · signup · sent (check email) · forgot · reset-sent · newpass (from reset link) · denied
function renderAuth(step = 'signin', email = '', error = '', note = '') {
  const emailField = `<label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" inputmode="email" required value="${esc(email)}" autofocus></label>`;
  const pwField = (label, auto) => `<label class="field"><span>${label}</span>
    <span class="pw-wrap"><input type="password" name="password" autocomplete="${auto}" required minlength="${auto === 'new-password' ? 8 : 1}">
    <button type="button" class="link-btn pw-toggle" data-pw aria-label="Show password">Show</button></span></label>`;
  const body = {
    signin: `<form class="form" data-step="signin">${emailField}${pwField('Password', 'current-password')}
        <button class="btn btn-primary btn-block">Sign in</button>
        <div class="auth-links"><button type="button" class="link-btn" data-go="forgot">Forgot password?</button>
        <button type="button" class="link-btn" data-go="signup">First time? Create your account</button></div></form>`,
    signup: `<form class="form" data-step="signup"><p class="muted small">Use the email that’s on the guest list, and pick a password (8+ characters).</p>
        ${emailField}${pwField('Choose a password', 'new-password')}
        <button class="btn btn-primary btn-block">Create account</button>
        <div class="auth-links"><button type="button" class="link-btn" data-go="signin">Already have an account? Sign in</button></div></form>`,
    sent: `<div class="form"><p>Almost there! We emailed a confirmation link to <b>${esc(email)}</b>.</p>
        <p class="muted small">Tap the link in that email (check spam if you don’t see it), then come back here and sign in.</p>
        <button class="btn btn-primary btn-block" data-go="signin">Go to sign in</button></div>`,
    forgot: `<form class="form" data-step="forgot"><p class="muted small">We’ll email you a link to set a new password.</p>${emailField}
        <button class="btn btn-primary btn-block">Send reset link</button>
        <div class="auth-links"><button type="button" class="link-btn" data-go="signin">Back to sign in</button></div></form>`,
    'reset-sent': `<div class="form"><p>If <b>${esc(email)}</b> has an account, a reset link is on its way.</p>
        <button class="btn btn-ghost btn-block" data-go="signin">Back to sign in</button></div>`,
    newpass: `<form class="form" data-step="newpass"><p>Choose a new password.</p>${pwField('New password', 'new-password')}
        <button class="btn btn-primary btn-block">Save password</button></form>`,
    denied: `<div class="form"><p><b>${esc(email)}</b> isn’t on the guest list for this app.</p>
        <button class="btn btn-ghost btn-block" data-signout>Sign out</button></div>`,
  }[step];
  app.innerHTML = `
    <main class="auth">
      <img class="auth-logo" src="icons/icon.svg" alt="" width="72" height="72">
      <h1 class="brand big">Walk <i>&amp;</i> Talk</h1>
      <p class="muted">Our dates, all in one place.</p>
      ${body}
      ${note ? `<p class="auth-note" role="status">${esc(note)}</p>` : ''}
      ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
      ${DEMO ? '<p class="demo-note">Demo mode — any email and password works.</p>' : ''}
    </main>`;
  const val = (n) => app.querySelector(`[name=${n}]`)?.value.trim() || '';
  app.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => renderAuth(b.dataset.go, val('email') || email)));
  app.querySelector('[data-pw]')?.addEventListener('click', (e) => {
    const inp = app.querySelector('[name=password]'); const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password'; e.target.textContent = show ? 'Hide' : 'Show';
  });
  app.querySelector('[data-signout]')?.addEventListener('click', async () => { await backend.signOut(); renderAuth(); });
  const f = app.querySelector('form');
  if (!f) return;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const em = val('email').toLowerCase() || email;
    const pw = app.querySelector('[name=password]')?.value || '';
    if (f.elements.password && f.elements.password.minLength > 1 && pw.length < 8) return renderAuth(step, em, 'Passwords need at least 8 characters.');
    const btn = f.querySelector('.btn-primary'); btn.disabled = true; btn.textContent = 'One moment…';
    try {
      if (step === 'signin') await enter(await backend.signIn(em, pw));
      if (step === 'signup') {
        const r = await backend.signUp(em, pw);
        if (r.needsConfirm) renderAuth('sent', em); else await enter(r.user);
      }
      if (step === 'forgot') { await backend.sendReset(em); renderAuth('reset-sent', em); }
      if (step === 'newpass') {
        await backend.setPassword(pw);
        history.replaceState(null, '', location.pathname + '#/');
        toast('Password updated');
        await enter(await backend.getUser());
      }
    } catch (err) {
      console.error(err);
      renderAuth(step, em, friendlyAuthError(err));
    }
  };
}

function friendlyAuthError(err) {
  const m = (err?.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'That email and password don’t match. Try again, or tap “Forgot password?”.';
  if (m.includes('email not confirmed')) return 'Please tap the confirmation link we emailed you first (check spam), then sign in.';
  if (m.includes('already registered')) return 'There’s already an account for that email — sign in instead.';
  if (m.includes('rate limit') || m.includes('security purposes')) return 'Too many emails in a short time. Wait a few minutes and try again.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'New accounts are turned off for this app.';
  return err?.message || 'Something went wrong — try again.';
}

// ───────── start ─────────
let unsubscribe = null;
async function enter(user) {
  if (!(await backend.isMember())) return renderAuth('denied', user.email);
  S.me = user;
  await db.ensureMember(user);
  await db.load();
  if (DEMO && !S.ideas.length && !localStorage.getItem('wt-demo-seeded')) {
    try {
      const r = await fetch('seed/seed.json');
      if (r.ok) { localStorage.setItem('wt-demo-seeded', '1'); await db.importSeed(await r.json()); toast('Demo loaded with your spreadsheet'); }
    } catch {}
  }
  let t = null;
  unsubscribe?.();
  unsubscribe = backend.subscribe(() => { clearTimeout(t); t = setTimeout(() => db.load().catch(console.error), 400); });
  db.onChange(scheduleRender);
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { applyTheme(); db.load().catch(() => {}); } });
  render();
}

// ───────── routing & rendering ─────────
let seedAvailable = null;
function route() {
  const [path, query] = (location.hash.slice(1) || '/').split('?');
  const parts = path.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { name: parts[0] || 'home', id: parts[1], params };
}

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return; renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

function render() {
  const r = route();
  let html;
  try { html = viewHtml(r); } catch (e) {
    console.error(e);
    html = `<div class="empty"><p><b>Something went wrong on this screen.</b></p><p class="muted small">${esc(e.message)}</p><a class="btn btn-ghost" href="#/">Go home</a></div>`;
  }
  paint(r, html);
}

function viewHtml(r) {
  let html;
  switch (r.name) {
    case 'ideas': html = V.ideas(r.params); if (Object.keys(r.params).length) history.replaceState(null, '', '#/ideas'); break;
    case 'idea': html = V.idea({ id: r.id }); break;
    case 'log': html = V.log(r.params); if (Object.keys(r.params).length) history.replaceState(null, '', '#/log'); break;
    case 'year': html = V.year({ id: r.id }); break;
    case 'outing': html = V.outing({ id: r.id }); break;
    case 'settings':
      if (seedAvailable === null && LOCAL) { seedAvailable = false; fetch('seed/seed.json', { method: 'HEAD' }).then((x) => { seedAvailable = x.ok; scheduleRender(); }).catch(() => {}); }
      html = V.settings({ demo: DEMO, theme: getTheme(), season: getSeason(), currentSeason: seasonNow(), canImport: LOCAL && seedAvailable && !S.ideas.length });
      break;
    default: html = V.home();
  }
  return html;
}

function paint(r, html) {
  const tab = { home: 'home', ideas: 'ideas', idea: 'ideas', log: 'log', outing: 'log', year: 'home', settings: 'settings' }[r.name] || 'home';

  // keep what's being typed and the cursor position across re-renders
  const kept = {};
  app.querySelectorAll('main input[id], main textarea[id]').forEach((el) => { kept[el.id] = el.value; });
  const focusId = document.activeElement?.id;
  const sel = focusId && document.activeElement.selectionStart != null ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const y = window.scrollY;

  app.innerHTML = `
    ${DEMO ? '<div class="demo-banner">Demo mode · saved only in this browser</div>' : ''}
    <main id="view" class="view view-${r.name}">${html}</main>
    <nav class="tabbar" aria-label="Main">
      ${[['home', 'home', 'Home', '#/'], ['ideas', 'idea', 'Ideas', '#/ideas'], ['log', 'book', 'Log', '#/log'], ['settings', 'settings', 'Settings', '#/settings']]
        .map(([k, ic, label, href]) => `<a href="${href}" class="${tab === k ? 'on' : ''}" ${tab === k ? 'aria-current="page"' : ''}>${icon(ic)}${label}</a>`).join('')}
    </nav>`;

  for (const [k, v] of Object.entries(kept)) { const el = document.getElementById(k); if (el && el.type !== 'search') el.value = v; }
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(...sel); } catch {} }
  }
  window.scrollTo(0, y);
  app.querySelectorAll('textarea').forEach(autoGrow);
  if (r.name === 'log' && V.logState.view === 'map') mountMap();
  const m = milestoneToCelebrate();
  if (m) celebrate(m);
}

function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 240) + 'px'; }

// ───────── actions (taps on [data-act]) ─────────
const actions = {
  'pick': () => F.pickSheet(),
  'rate': (d) => db.setRating(d.id, Number(d.v)),
  'peek': (d) => F.peekFlow(d.id),
  'suggestions': () => F.suggestionsSheet(),
  'calendar': (d) => F.calendarSheet(d.id),
  'share-date': (d) => F.shareDate(d.id),
  'share-link': (d) => F.shareLink(d.kind),
  'copy-link': async (d) => { await F.copyText(db.linkUrl(d.kind)); toast('Link copied'); },
  'link-on': (d) => db.setLink(d.kind, true),
  'link-new': async (d) => {
    if (await confirmSheet('Make a new address? The old link will stop working for anyone who has it.', { yes: 'Make new link' })) { await db.setLink(d.kind, 'new'); toast('New link ready'); }
  },
  'link-off': async (d) => {
    if (await confirmSheet(d.kind === 'share' ? 'Turn off the share link? Anyone who has it won’t be able to see your dates.' : 'Turn off the suggestion link? Friends won’t be able to send ideas.', { yes: 'Turn off', danger: true })) await db.setLink(d.kind, false);
  },
  'log-view': (d) => { V.logState.view = d.v; render(); },
  'bump': async () => {
    await db.bumpCount(1);
    toast(`Date #${db.total()} counted`, 'info', { label: 'Undo', onClick: () => db.bumpCount(-1) });
  },
  'new-idea': () => F.ideaSheet(),
  'edit-idea': (d) => F.ideaSheet(d.id),
  'delete-idea': async (d) => {
    const n = db.outingsFor(d.id).length;
    if (await confirmSheet(`Delete “${db.idea(d.id).title}”?${n ? ` The ${n === 1 ? 'date' : n + ' dates'} you logged for it will stay in your log.` : ''}`, { yes: 'Delete', danger: true })) {
      location.hash = '#/ideas'; await db.deleteIdea(d.id);
    }
  },
  'toggle-want': (d) => db.toggleWant(d.id),
  'status-menu': (d) => F.statusMenu(d.id),
  'set-status': (d) => { if (db.idea(d.id).status !== d.v || d.v === 'planned') F.changeStatus(d.id, d.v); },
  'plan': (d) => F.planSheet(d.id),
  'log-date': (d) => F.logSheet({ ideaId: d.idea || null }),
  'edit-outing': (d) => F.logSheet({ outingId: d.id }),
  'delete-outing': async (d) => {
    if (await confirmSheet('Delete this date, its photos and comments? This can’t be undone.', { yes: 'Delete', danger: true })) {
      location.hash = '#/log'; await db.deleteOuting(d.id);
    }
  },
  'open-photo': (d) => F.photoViewer(d.id),
  'react': (d) => db.toggleReaction(d.type, d.id, d.emoji),
  'react-picker': (d) => F.reactPicker(d.type, d.id),
  'insert-emoji': (d) => {
    const t = document.getElementById(d.target); if (!t) return;
    const s = t.selectionStart ?? t.value.length, e = t.selectionEnd ?? t.value.length;
    t.value = t.value.slice(0, s) + d.emoji + t.value.slice(e);
    t.focus(); t.setSelectionRange(s + d.emoji.length, s + d.emoji.length); autoGrow(t);
  },
  'send-comment': async (d) => {
    const t = document.getElementById(`cmt-${d.type}-${d.id}`);
    const body = t?.value.trim(); if (!body) return t?.focus();
    t.value = ''; t.blur();
    await db.addComment(d.type, d.id, body);
  },
  'delete-comment': async (d) => { if (await confirmSheet('Delete this comment?', { yes: 'Delete', danger: true })) db.deleteComment(d.id); },
  'filter-status': (d) => { V.ideasState.status = d.v; render(); },
  'filter-want': () => { V.ideasState.want = !V.ideasState.want; render(); },
  'filter-tag': (d) => { V.ideasState.tag = V.ideasState.tag === d.v ? '' : d.v; render(); },
  'new-tag': () => F.tagSheet(),
  'edit-tag': (d) => F.tagSheet(d.id),
  'delete-tag': async (d) => {
    const t = db.tag(d.id);
    if (await confirmSheet(`Delete the “${t.name}” tag? Ideas keep everything else.`, { yes: 'Delete', danger: true })) db.deleteTag(d.id);
  },
  'theme': (d) => { setPref('wt-theme', d.v); applyTheme(); render(); },
  'season': (d) => { setPref('wt-season', d.v); applyTheme(); render(); },
  'import': async (d, el) => {
    el.disabled = true;
    const out = document.querySelector('.import-progress');
    try {
      const seed = await (await fetch('seed/seed.json')).json();
      await db.importSeed(seed, (m) => { if (out) out.textContent = m; });
      toast('Imported'); location.hash = '#/';
    } catch (e) { console.error(e); toast(`Import stopped — ${e.message || e}`, 'error'); el.disabled = false; }
  },
  'reset-demo': async () => {
    if (await confirmSheet('Erase all demo data and start over?', { yes: 'Reset', danger: true })) {
      backend.reset(); localStorage.removeItem('wt-demo-seeded'); location.hash = ''; location.reload();
    }
  },
  'sign-out': async () => { if (await confirmSheet('Sign out on this device?', { yes: 'Sign out' })) { await backend.signOut(); location.hash = ''; location.reload(); } },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !app.contains(el)) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  Promise.resolve(fn(el.dataset, el)).catch((err) => { console.error(err); toast(err.message || 'Something went wrong', 'error'); });
});

document.addEventListener('focusin', (e) => { if (e.target.matches?.('[data-select-all]')) e.target.select(); });

document.addEventListener('input', (e) => {
  if (e.target.matches?.('textarea')) autoGrow(e.target);
  if (e.target.dataset?.input === 'search') { V.ideasState.q = e.target.value; render(); }
});

document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd+Enter sends a comment
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target.matches?.('.composer textarea')) {
    e.target.closest('.composer').querySelector('[data-act=send-comment]').click();
  }
});

document.addEventListener('change', async (e) => {
  const inp = e.target.closest?.('[data-upload]');
  if (!inp || !inp.files?.length) return;
  const files = [...inp.files]; const id = inp.dataset.upload; inp.value = '';
  toast(`Uploading ${files.length === 1 ? 'photo' : files.length + ' photos'}…`);
  const n = await db.addPhotos(id, files);
  if (n) toast(`${n === 1 ? 'Photo' : n + ' photos'} added`);
});

document.addEventListener('submit', async (e) => {
  const f = e.target.closest?.('[data-form]');
  if (!f || !app.contains(f)) return;
  e.preventDefault();
  if (f.dataset.form === 'rename') {
    const name = f.elements.name.value.trim(); if (name) { await db.renameMe(name); toast('Saved'); }
  }
  if (f.dataset.form === 'baseline') {
    await db.saveSetting('baseline', { count: Math.max(0, parseInt(f.elements.count.value, 10) || 0), as_of: f.elements.as_of.value || null });
    toast('Saved');
  }
});

// ───────── go ─────────
if ('serviceWorker' in navigator && !LOCAL) navigator.serviceWorker.register('sw.js').catch(() => {});
const user = await backend.getUser().catch(() => null);
// Arriving from an email link: tidy the address bar (the link's tokens are in the #hash)
const authHash = AUTH_HASH;
if (authHash.includes('access_token') || authHash.includes('error_description')) history.replaceState(null, '', location.pathname + '#/');
if (authHash.includes('type=recovery') && user) renderAuth('newpass', user.email, '', 'You’re signed in from the reset link.');
else if (authHash.includes('error_description')) renderAuth('signin', '', decodeURIComponent((authHash.match(/error_description=([^&]*)/) || [])[1] || '').replace(/\+/g, ' '));
else if (user) await enter(user).catch((e) => { console.error(e); renderAuth('signin', '', e.message); });
else renderAuth();
