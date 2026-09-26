// Tiny DOM helpers shared by the UI modules.
export const $ = (id) => document.getElementById(id);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function h(tag, attrs = {}, html = '') {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  if (html) e.innerHTML = html;
  return e;
}

export function toast(html, kind = '') {
  const box = $('toasts');
  if (!box) return;
  const t = h('div', { class: `toast ${kind}` }, html);
  box.appendChild(t);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => t.remove(), kind === 'recipe' ? 6000 : 4200);
}

export function barHTML(frac, color, extraClass = '') {
  const w = Math.max(0, Math.min(1, frac)) * 100;
  return `<div class="bar ${extraClass}"><i style="width:${w.toFixed(1)}%;--c:${color}"></i></div>`;
}

export function healthColor(h) {
  return h > 70 ? 'var(--good)' : h > 35 ? 'var(--warn)' : 'var(--crit)';
}

export function placeFloating(el, x, y, pad = 14) {
  const r = el.getBoundingClientRect();
  let left = x + pad, top = y + pad;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - pad;
  if (top + r.height > window.innerHeight - 8) top = window.innerHeight - r.height - 8;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${Math.max(8, top)}px`;
}

export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  },
};
