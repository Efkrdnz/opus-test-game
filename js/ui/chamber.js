// Chamber controls: anatomy layers, commands, environment, medical tools, log, inspector.
import { COMMANDS, parseCommand } from '../sim/behavior.js';
import { LAYERS } from '../render/anatomy.js';
import { ORGANS, BRAIN_REGIONS, NERVE_REGIONS, MUSCLES, BONES } from '../data/vocab.js';
import { organFn } from '../sim/body.js';
import { defibrillate, stabilize, dialysis, fullRestore } from '../sim/physiology.js';
import { fmtClock } from '../util.js';
import { $, esc, h, toast } from './dom.js';

const LIFT_WEIGHTS = [10, 20, 40, 60, 80, 100, 140, 200, 300, 500, 1000, 5000];

export function initChamber(game) {
  // layers
  const seg = $('layerSeg');
  LAYERS.forEach((l, i) => {
    const b = h('button', { type: 'button', 'data-i': i, title: `${l.name} layer (${i + 1})`, class: i === 0 ? 'on' : '' }, l.name);
    b.addEventListener('click', () => setLayer(game, i));
    seg.appendChild(b);
  });
  $('peel').addEventListener('input', (e) => { game.peelTarget = +e.target.value; game.opts.peel = game.peelTarget; syncLayerButtons(game); });
  document.querySelectorAll('.tog').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.tog;
    game.opts[k] = !game.opts[k];
    b.classList.toggle('on', game.opts[k]);
  }));

  // commands
  const grid = $('cmdGrid');
  for (const [k, c] of Object.entries(COMMANDS)) {
    const b = h('button', { type: 'button', class: 'cmd', title: c.test ? `${c.name} — tests ${c.test.toLowerCase()} (key ${c.key})` : `${c.name} (key ${c.key})` }, `<span class="n">${c.name}</span><span class="k">${esc(c.key)}</span>`);
    b.addEventListener('click', () => game.command(k));
    grid.appendChild(b);
  }
  $('cmdForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('cmdText');
    const parsed = parseCommand(input.value);
    if (parsed) game.command(parsed.cmd, parsed.arg);
    input.value = '';
  });
  const lk = $('liftKg');
  for (const w of LIFT_WEIGHTS) lk.appendChild(h('option', { value: w }, `${w} kg`));
  lk.value = String(game.actor.liftKg);
  lk.addEventListener('change', () => { game.actor.liftKg = +lk.value; });

  // environment
  const env = [
    ['envTemp', 'temp', (v) => `${v} °C`],
    ['envGrav', 'gravity', (v) => `${(+v).toFixed(1)} g`],
    ['envO2', 'oxygen', (v) => `${v} %`],
    ['envRad', 'radiation', (v) => (+v === 0 ? 'off' : `${(+v).toFixed(1)} Sv/min`)],
  ];
  for (const [id, key, fmt] of env) {
    const el = $(id), out = $(id + 'Out');
    const sync = () => { game.env[key] = +el.value; out.textContent = fmt(el.value); };
    el.addEventListener('input', sync);
    sync();
  }

  // tools
  document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.tool;
    const body = game.body;
    let msg = '';
    if (t === 'defib') { msg = defibrillate(body); game.audio.zap(); }
    else if (t === 'stabilize') msg = stabilize(body);
    else if (t === 'dialysis') msg = dialysis(body);
    else if (t === 'restore') msg = fullRestore(body);
    else if (t === 'new') { game.newSubject(); return; }
    if (msg) game.logLine(msg, 'info');
  }));
  $('clearLog').addEventListener('click', () => { $('log').innerHTML = ''; });

  // canvas inspector
  const cv = $('scene'), tip = $('partTip');
  cv.addEventListener('mousemove', (e) => {
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = game.renderer.hit(x, y);
    game.opts.hover = hit;
    if (!hit) { tip.hidden = true; return; }
    tip.innerHTML = partTip(game.body, hit);
    tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = `${Math.min(r.width - tw - 6, x + 16)}px`;
    tip.style.top = `${Math.min(r.height - th - 6, Math.max(6, y - th / 2))}px`;
  });
  cv.addEventListener('mouseleave', () => { tip.hidden = true; game.opts.hover = null; });
  cv.addEventListener('click', () => {
    const hit = game.opts.hover;
    if (!hit) return;
    const tab = { organ: hit.id === 'skin' ? 'organs' : 'organs', bone: 'skeleton', muscle: 'muscles', nerve: 'nerves', brain: 'brain', vitals: 'blood' }[hit.kind];
    game.monitor.setTab(tab, hit.id);
  });

  // keyboard
  const keyMap = {};
  for (const [k, c] of Object.entries(COMMANDS)) keyMap[c.key.toLowerCase()] = k;
  keyMap.arrowleft = 'left'; keyMap.arrowright = 'right';
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!$('modal').hidden) { if (e.key === 'Escape') $('modal').hidden = true; return; }
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); game.setSpeed(game.speed === 0 ? (game.lastSpeed || 1) : 0); return; }
    if (/^[1-6]$/.test(k)) { setLayer(game, +k - 1); return; }
    if (keyMap[k]) { e.preventDefault(); game.command(keyMap[k]); }
  });
}

export function setLayer(game, i) {
  game.peelTarget = i;
  game.opts.xray = false;
  document.querySelector('.tog[data-tog=xray]').classList.remove('on');
  syncLayerButtons(game);
}

export function syncLayerButtons(game) {
  const i = Math.round(game.peelTarget);
  $('layerSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
  $('peel').value = String(game.opts.peel);
}

function partTip(body, hit) {
  const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
  const pct = (x) => `${Math.round(x)}%`;
  switch (hit.kind) {
    case 'organ': {
      const o = body.organs[hit.id];
      let x = `<h4>${ORGANS[hit.id].name}</h4>${kv('Health', pct(o.health))}${kv('Function', pct(organFn(body, hit.id) * 100))}${kv('Inflammation', pct(o.inflammation))}`;
      if (hit.id === 'skin') x += kv('Core temp', `${body.vitals.temp.toFixed(1)} °C`) + kv('Burns', pct(body.burns * 100)) + kv('Frostbite', pct(body.frost * 100));
      if (hit.id === 'heart') x += kv('Rate', body.rhythm === 'vfib' ? 'VF' : `${Math.round(body.vitals.hr)} bpm`);
      if (hit.id.startsWith('lung')) x += kv('SpO₂', pct(body.vitals.spo2)) + kv('Resp rate', `${Math.round(body.vitals.rr)}/min`);
      if (hit.id === 'liver') x += kv('Toxin load', `${Math.round(body.blood.toxins)}`);
      if (hit.id === 'brain') x += kv('Consciousness', pct(body.vitals.consciousness));
      if (hit.id === 'stomach') x += kv('Unabsorbed doses', `${body.doses.filter((d) => d.route === 'oral' && d.depot > 0.05).length}`);
      return x;
    }
    case 'bone': {
      const b = body.bones[hit.id];
      return `<h4>${BONES[hit.id].name}</h4>${kv('Integrity', pct(b.health))}${kv('Density', `${b.density.toFixed(2)}×`)}${kv('Status', b.fractured ? '<span style="color:var(--crit)">FRACTURED</span>' : 'intact')}`;
    }
    case 'muscle': {
      const m = body.muscles[hit.id];
      const s = body.cap[hit.id];
      return `<h4>${MUSCLES[hit.id].name} muscles</h4>${s !== undefined ? kv('Force', pct(s * 100)) : ''}${kv('Health', pct(m.health))}${kv('Fatigue', pct(m.fatigue))}${kv('Mass', `${m.mass.toFixed(2)}×`)}${m.spasm > 0.1 ? kv('Spasm', pct(m.spasm * 100)) : ''}`;
    }
    case 'nerve': {
      const n = body.nerves[hit.id];
      return `<h4>${NERVE_REGIONS[hit.id].name}</h4>${kv('Health', pct(n.health))}${kv('Conductivity', `${body.conductivity.toFixed(2)}×`)}${kv('Reflex', `${body.cap.reflexMs} ms`)}`;
    }
    case 'brain': {
      const r = body.brain[hit.id];
      return `<h4>${BRAIN_REGIONS[hit.id].name}</h4><div class="kv"><span>${BRAIN_REGIONS[hit.id].role}</span></div>${kv('Health', pct(r.health))}${kv('Activity', pct(r.activity))}`;
    }
    case 'vitals':
      return `<h4>Great vessels</h4>${kv('Blood volume', pct(body.vitals.bloodVolume))}${kv('BP', `${Math.round(body.vitals.sys)}/${Math.round(body.vitals.dia)}`)}${kv('Bleeding', `${(body.bleedRate || 0).toFixed(2)} %/s`)}`;
    default: return '';
  }
}

export function appendLog(text, level, t) {
  const log = $('log');
  const li = h('li', { class: level || 'info' }, `<time>${fmtClock(t)}</time><span>${esc(text)}</span>`);
  log.appendChild(li);
  while (log.children.length > 300) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
