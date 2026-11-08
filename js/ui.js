// Small UI helpers: escaping, dates, toasts, bottom sheets.
export const REACTIONS = ['❤️', '😂', '😍', '🔥', '🥹', '👏', '😮', '🎉'];
export const QUICK_EMOJI = ['❤️', '😂', '😍', '🥰', '🔥', '🥹', '😮', '🎉', '✨', '🍕', '🌅', '🚶'];
export const STATUS = {
  not_yet: { label: 'Not yet', icon: '○' },
  planned: { label: 'Planned', icon: '◐' },
  done: { label: 'Done', icon: '●' },
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const safeUrl = (u) => { try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) ? x.href : ''; } catch { return ''; } };

export function parseDay(s) { if (!s) return null; const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
export function fmtDate(s, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const d = parseDay(s); return d ? d.toLocaleDateString(undefined, opts) : '';
}
export function fmtDay(s) {
  const d = parseDay(s); if (!d) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return fmtDate(s, d.getFullYear() === today.getFullYear() ? { weekday: 'short', month: 'short', day: 'numeric' } : undefined);
}
export function relTime(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ───────── toast ─────────
// toast('Saved') · toast('Oops', 'error') · toast('Counted', 'info', { label: 'Undo', onClick })
export function toast(msg, kind = 'info', action = null) {
  let wrap = document.querySelector('.toasts');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toasts'; wrap.setAttribute('role', 'status'); document.body.append(wrap); }
  const t = document.createElement('div');
  t.className = `toast toast-${kind}`; t.textContent = msg;
  const hide = () => { t.classList.add('out'); setTimeout(() => t.remove(), 300); };
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-action'; b.textContent = action.label;
    b.onclick = () => { hide(); action.onClick(); };
    t.append(b);
  }
  wrap.append(t);
  setTimeout(hide, kind === 'error' ? 6000 : action ? 5000 : 2600);
}

// ───────── bottom sheet ─────────
// openSheet({ title, html, onMount(el, close) }) → close()
export function openSheet({ title = '', html = '', onMount, className = '' }) {
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `
    <div class="sheet ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip" aria-hidden="true"></div>
      ${title ? `<div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>` : ''}
      <div class="sheet-body">${html}</div>
    </div>`;
  const prevFocus = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    back.classList.add('out');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { back.remove(); document.body.classList.toggle('no-scroll', !!document.querySelector('.sheet-back')); prevFocus?.focus?.(); }, 200);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  document.body.classList.add('no-scroll');
  const el = back.querySelector('.sheet');
  onMount?.(el, close);
  requestAnimationFrame(() => {
    back.classList.add('in');
    const f = el.querySelector('[autofocus]');
    if (f && !matchMedia('(pointer: coarse)').matches) f.focus();
  });
  return close;
}

export function confirmSheet(message, { yes = 'Yes', no = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const close = openSheet({
      html: `<p class="confirm-msg">${esc(message)}</p>
        <div class="row-btns"><button class="btn btn-ghost" data-no>${esc(no)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(yes)}</button></div>`,
      onMount(el, close) {
        el.querySelector('[data-yes]').onclick = () => { answered = true; resolve(true); close(); };
        el.querySelector('[data-no]').onclick = () => { answered = true; resolve(false); close(); };
      },
    });
    // resolve false if dismissed by tapping outside
    const obs = new MutationObserver(() => { if (!document.body.contains(document.querySelector('.confirm-msg'))) { obs.disconnect(); if (!answered) resolve(false); } });
    obs.observe(document.body, { childList: true });
    void close;
  });
}
