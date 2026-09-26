// The alchemist's bench: reagent shelf, flask, processing, analysis, administration, cabinet.
import { SUBSTANCES } from '../data/substances.js';
import { RECIPES } from '../data/recipes.js';
import { EFFECTS, TAGS, CATEGORIES } from '../data/vocab.js';
import { DISEASES } from '../data/diseases.js';
import { brewMixture, TREATMENTS, STIR_MODES, BREW_TIMES, VESSEL_CAPACITY } from '../sim/mixer.js';
import { administer, ROUTES, SITES } from '../sim/pharmacology.js';
import { blendColors, clamp, rgba, uid } from '../util.js';
import { $, esc, h, toast, placeFloating } from './dom.js';

export const SUBSTANCE_INDEX = Object.fromEntries(SUBSTANCES.map((s) => [s.id, s]));
const RARITY_MARK = { common: '', uncommon: 'UNC', rare: 'RARE', legendary: 'LEG' };

let shelfCat = 'all';
let shelfQuery = '';

export function initLab(game) {
  // category chips
  const chips = $('catChips');
  const cats = [['all', 'All', '#9fb6c0'], ...Object.entries(CATEGORIES).map(([k, c]) => [k, c.name, c.color])];
  for (const [k, name, color] of cats) {
    const b = h('button', { type: 'button', class: `chip${k === 'all' ? ' on' : ''}`, 'data-cat': k }, `<span class="dot" style="background:${color}"></span>${name}`);
    b.addEventListener('click', () => {
      shelfCat = k;
      chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
      renderShelf(game);
    });
    chips.appendChild(b);
  }
  $('shelfSearch').addEventListener('input', (e) => { shelfQuery = e.target.value.trim().toLowerCase(); renderShelf(game); });
  renderShelf(game);

  // process controls
  const heatOn = $('heatOn'), heatTemp = $('heatTemp'), heatOut = $('heatOut');
  const syncHeat = () => {
    heatTemp.disabled = !heatOn.checked;
    game.process.heatOn = heatOn.checked;
    game.process.temp = +heatTemp.value;
    heatOut.textContent = heatOn.checked ? `${heatTemp.value} °C` : 'off';
  };
  heatOn.addEventListener('change', syncHeat);
  heatTemp.addEventListener('input', syncHeat);
  syncHeat();
  $('stirSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    game.process.stir = b.dataset.v;
    $('stirSeg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  });
  const bt = $('brewTime');
  for (const [k, t] of Object.entries(BREW_TIMES)) bt.appendChild(h('option', { value: k }, t.name));
  bt.value = 'minute';
  bt.addEventListener('change', () => { game.process.time = bt.value; });
  const tr = $('treatments');
  for (const [k, t] of Object.entries(TREATMENTS)) {
    const b = h('button', { type: 'button', class: 'treat', title: t.desc }, `${t.icon} ${t.name}`);
    b.addEventListener('click', () => {
      if (game.process.treatments.has(k)) game.process.treatments.delete(k); else game.process.treatments.add(k);
      b.classList.toggle('on', game.process.treatments.has(k));
    });
    tr.appendChild(b);
  }
  $('brewBtn').addEventListener('click', () => brew(game));
  $('emptyBtn').addEventListener('click', () => { game.flask = []; renderFlask(game); });

  // routes
  const rg = $('routeGrid');
  for (const [k, r] of Object.entries(ROUTES)) {
    const b = h('button', { type: 'button', class: `route${k === game.route ? ' on' : ''}`, title: `${r.name}: ${r.desc}`, 'data-route': k }, `<span class="i">${r.icon}</span><span>${r.short}</span>`);
    b.addEventListener('click', () => {
      game.route = k;
      rg.querySelectorAll('.route').forEach((x) => x.classList.toggle('on', x === b));
      renderAdmin(game);
    });
    rg.appendChild(b);
  }
  const site = $('siteSel');
  for (const [k, n] of Object.entries(SITES)) site.appendChild(h('option', { value: k }, n));
  site.addEventListener('change', () => { game.site = site.value; renderAdmin(game); });
  const dose = $('doseMl');
  dose.addEventListener('input', () => { game.dose = +dose.value; renderAdmin(game); });
  const presets = $('dosePresets');
  for (const v of [1, 5, 10, 25, 50, 100, 'All']) {
    const b = h('button', { type: 'button' }, v === 'All' ? 'All' : `${v} ml`);
    b.addEventListener('click', () => {
      const max = game.mixture ? Math.max(1, Math.floor(game.mixture.remaining)) : 100;
      game.dose = v === 'All' ? max : Math.min(v, max);
      renderAdmin(game);
    });
    presets.appendChild(b);
  }
  $('adminBtn').addEventListener('click', () => doAdminister(game));
  renderFlask(game);
  renderResult(game);
  renderCabinet(game);
}

// ---------------------------------------------------------------------------
function matches(s, q) {
  if (!q) return true;
  if (s.name.toLowerCase().includes(q) || s.id.includes(q)) return true;
  if (s.tags.some((t) => t.includes(q) || (TAGS[t]?.name || '').toLowerCase().includes(q))) return true;
  if (Object.keys(s.effects).some((e) => e.toLowerCase().includes(q) || (EFFECTS[e]?.name || '').toLowerCase().includes(q))) return true;
  return s.desc.toLowerCase().includes(q);
}

export function renderShelf(game) {
  const grid = $('shelfGrid');
  const list = SUBSTANCES.filter((s) => (shelfCat === 'all' || s.category === shelfCat) && matches(s, shelfQuery));
  $('shelfCount').textContent = `${list.length} / ${SUBSTANCES.length}`;
  grid.innerHTML = '';
  if (!list.length) { grid.innerHTML = '<p class="empty">No reagent matches that search.</p>'; return; }
  for (const s of list) {
    const b = h('button', { type: 'button', class: 'reagent', style: `--c:${s.color}`, 'data-id': s.id },
      `<span class="ico">${s.icon}</span><span class="nm">${esc(s.name)}</span>${RARITY_MARK[s.rarity] ? `<span class="rar ${s.rarity}">${RARITY_MARK[s.rarity]}</span>` : ''}`);
    b.addEventListener('click', () => addToFlask(game, s.id, 10));
    b.addEventListener('mouseenter', (e) => showSubstanceCard(s, e));
    b.addEventListener('mousemove', (e) => placeFloating($('hoverCard'), e.clientX, e.clientY));
    b.addEventListener('mouseleave', hideCard);
    b.addEventListener('focus', (e) => { const r = e.target.getBoundingClientRect(); showSubstanceCard(s, { clientX: r.right, clientY: r.top }); });
    b.addEventListener('blur', hideCard);
    grid.appendChild(b);
  }
}

export function substanceCardHTML(s) {
  const eff = Object.entries(s.effects).sort((a, b) => b[1] - a[1]);
  const max = Math.max(2, ...eff.map((e) => e[1]));
  const effHTML = eff.map(([k, v]) => {
    const e = EFFECTS[k];
    return `<div class="eff"><span class="n${e.bad ? ' bad' : ''}">${e.name}</span><div class="bar"><i style="width:${(v / max) * 100}%;--c:${e.color}"></i></div><span class="v">${v}</span></div>`;
  }).join('');
  const inf = Object.entries(s.infections || {}).map(([d, p]) => `${DISEASES[d]?.name || d} ${Math.round(p * 100)}%`).join(', ');
  const grants = Object.entries(s.grants || {}).map(([g, p]) => `${g} ${Math.round(p * 100)}%`).join(', ');
  return `<h4>${s.icon} ${esc(s.name)}</h4>
    <div class="meta">${CATEGORIES[s.category].name} · ${s.state} · ${s.temperature} °C · pH ${s.ph} · stability ${Math.round(s.stability * 100)}% · t½ ${s.halfLife}s</div>
    <p>${esc(s.desc)}</p>
    <div class="chips">${s.tags.map((t) => `<span class="tag" style="color:${TAGS[t]?.color}">${TAGS[t]?.name || t}</span>`).join('')}</div>
    <div class="effects">${effHTML}</div>
    ${inf ? `<div class="infections">☣ ${esc(inf)}</div>` : ''}
    ${grants ? `<div class="infections" style="color:#e0a8ff">🧬 ${esc(grants)}</div>` : ''}
    ${s.amplify ? `<div class="infections" style="color:var(--brass-2)">✦ Catalyst ×${s.amplify}${s.amplifyTag ? ` (${s.amplifyTag})` : ''}</div>` : ''}`;
}

function showSubstanceCard(s, e) {
  const c = $('hoverCard');
  c.innerHTML = substanceCardHTML(s);
  c.hidden = false;
  placeFloating(c, e.clientX, e.clientY);
}
function hideCard() { $('hoverCard').hidden = true; }

// ---------------------------------------------------------------------------
export function addToFlask(game, id, ml) {
  const total = game.flask.reduce((a, i) => a + i.ml, 0);
  const room = VESSEL_CAPACITY - total;
  if (room <= 0) { toast('The flask is full (500 ml). Remove something first.'); return; }
  const add = Math.min(ml, room);
  const ex = game.flask.find((i) => i.id === id);
  if (ex) ex.ml += add; else game.flask.push({ id, ml: add });
  game.audio.bubble();
  renderFlask(game);
}

export function renderFlask(game) {
  const list = $('ingredientList');
  const total = game.flask.reduce((a, i) => a + i.ml, 0);
  $('flaskTotal').textContent = `${Math.round(total)} / ${VESSEL_CAPACITY} ml`;
  if (!game.flask.length) { list.innerHTML = '<p class="empty">Click reagents on the shelf to pour 10 ml into the flask.</p>'; return; }
  list.innerHTML = '';
  for (const ing of game.flask) {
    const s = SUBSTANCE_INDEX[ing.id];
    const row = h('div', { class: 'ing' });
    row.innerHTML = `<span>${s.icon}</span><span class="nm" title="${esc(s.name)}">${esc(s.name)}</span>
      <input class="input ml" type="number" min="1" max="500" value="${ing.ml}" aria-label="${esc(s.name)} millilitres">
      <button type="button" class="x" title="Remove" aria-label="Remove ${esc(s.name)}">✕</button>
      <span></span><input type="range" min="1" max="250" value="${Math.min(250, ing.ml)}" aria-label="${esc(s.name)} amount"><span></span>`;
    const num = row.querySelector('.ml'), rng = row.querySelector('input[type=range]');
    const set = (v) => {
      const others = game.flask.reduce((a, i) => a + (i === ing ? 0 : i.ml), 0);
      ing.ml = clamp(Math.round(+v || 1), 1, VESSEL_CAPACITY - others);
      num.value = ing.ml; rng.value = Math.min(250, ing.ml);
      $('flaskTotal').textContent = `${Math.round(others + ing.ml)} / ${VESSEL_CAPACITY} ml`;
    };
    num.addEventListener('change', () => set(num.value));
    rng.addEventListener('input', () => set(rng.value));
    row.querySelector('.x').addEventListener('click', () => { game.flask = game.flask.filter((i) => i !== ing); renderFlask(game); });
    list.appendChild(row);
  }
}

// Animated flask picture
export function drawFlask(game, time) {
  const cv = $('flaskCanvas');
  if (!cv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== 90 * dpr) { cv.width = 90 * dpr; cv.height = 120 * dpr; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, 90, 120);
  const total = game.flask.reduce((a, i) => a + i.ml, 0);
  const color = total ? blendColors(game.flask.map((i) => [SUBSTANCE_INDEX[i.id].color, i.ml])) : '#000000';
  const level = clamp(total / VESSEL_CAPACITY, 0, 1);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(36, 8); ctx.lineTo(36, 42); ctx.lineTo(10, 104); ctx.quadraticCurveTo(8, 112, 16, 112);
    ctx.lineTo(74, 112); ctx.quadraticCurveTo(82, 112, 80, 104); ctx.lineTo(54, 42); ctx.lineTo(54, 8); ctx.closePath();
  };
  // liquid
  if (total > 0) {
    ctx.save(); path(); ctx.clip();
    const top = 112 - level * 98;
    const g = ctx.createLinearGradient(0, top, 0, 112);
    g.addColorStop(0, rgba(color, 0.95)); g.addColorStop(1, rgba(color, 0.7));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, top);
    for (let x = 0; x <= 90; x += 6) ctx.lineTo(x, top + Math.sin(time * 3 + x * 0.2) * 1.2);
    ctx.lineTo(90, 120); ctx.lineTo(0, 120); ctx.closePath(); ctx.fill();
    const hot = game.process.heatOn && game.process.temp > 60;
    const n = hot ? 9 : 3;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (let i = 0; i < n; i++) {
      const ph = ((time * (hot ? 0.9 : 0.25) + i * 0.37) % 1);
      const x = 22 + ((i * 29) % 46), y = 110 - ph * (110 - top);
      ctx.beginPath(); ctx.arc(x + Math.sin(time * 4 + i) * 2, y, hot ? 2 : 1.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  // glass
  path();
  ctx.strokeStyle = 'rgba(190,230,240,0.75)'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = 'rgba(190,230,240,0.06)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.moveTo(40, 46); ctx.lineTo(20, 96); ctx.stroke();
  for (let i = 1; i < 5; i++) { const y = 112 - i * 19.6; ctx.strokeStyle = 'rgba(190,230,240,0.3)'; ctx.beginPath(); ctx.moveTo(56 + (112 - y) * 0.2, y); ctx.lineTo(62 + (112 - y) * 0.2, y); ctx.stroke(); }
  // burner flame / frost
  if (game.process.heatOn) {
    const t = game.process.temp;
    if (t > 30) {
      const k = clamp(t / 1500, 0.15, 1);
      ctx.fillStyle = `rgba(90,160,255,${0.5 + k * 0.4})`;
      ctx.beginPath(); ctx.moveTo(38, 119); ctx.quadraticCurveTo(45, 112 - 10 * k - Math.sin(time * 20) * 2, 52, 119); ctx.fill();
      if (t > 100 && total) { ctx.strokeStyle = 'rgba(230,240,245,0.35)'; for (let i = 0; i < 3; i++) { const y = 6 - ((time * 20 + i * 10) % 20); ctx.beginPath(); ctx.moveTo(42 + i * 4, 8); ctx.quadraticCurveTo(38 + i * 4 + Math.sin(time * 3 + i) * 4, y, 44 + i * 4, y - 6); ctx.stroke(); } }
    } else if (t < 0) {
      ctx.strokeStyle = 'rgba(220,245,255,0.8)'; ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) { const x = 14 + i * 8; ctx.beginPath(); ctx.moveTo(x, 112); ctx.lineTo(x + 2, 106); ctx.stroke(); }
    }
  }
}

// ---------------------------------------------------------------------------
function brew(game) {
  const p = game.process;
  const res = brewMixture(game.flask, { temp: p.heatOn ? p.temp : null, stir: p.stir, time: p.time, treatments: [...p.treatments] }, SUBSTANCE_INDEX, RECIPES);
  if (!res.ok) {
    if (res.exploded) {
      game.logLine(`BENCH EXPLOSION — ${res.error}`, 'critical');
      toast(`💥 <b>${esc(res.error)}</b> The flask is gone.`, 'death');
      const boom = $('benchBoom');
      boom.hidden = false; boom.style.animation = 'none'; void boom.offsetWidth; boom.style.animation = '';
      setTimeout(() => { boom.hidden = true; }, 1200);
      game.renderer.fx.shake = Math.min(1.6, 0.4 + res.severity * 0.25);
      game.renderer.fx.flash = 0.6; game.renderer.fx.flashColor = '#ffc890';
      game.audio.boom();
      game.flask = [];
      renderFlask(game);
    } else toast(esc(res.error));
    return;
  }
  const m = res.mixture;
  m.remaining = m.volume;
  game.mixture = m;
  game.logLine(`Brewed ${m.volume} ml of ${m.name}.`, 'dose');
  for (const r of res.reactions) game.logLine(`Reaction · ${r.name}: ${r.text}`, 'info');
  if (m.recipe) {
    const fresh = !game.discovered[m.recipe];
    game.discovered[m.recipe] = true;
    game.save();
    if (fresh) {
      toast(`★ New recipe discovered<br><b>${esc(m.name)}</b>`, 'recipe');
      game.logLine(`★ RECIPE DISCOVERED: ${m.name}`, 'recipe');
    }
  }
  game.audio.bubble();
  game.dose = Math.min(game.dose, Math.max(1, m.remaining));
  renderResult(game, res);
  renderAdmin(game);
  const panel = $('adminPanel');
  if (panel.scrollIntoView) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export function renderResult(game, res) {
  const body = $('resultBody');
  const m = game.mixture;
  if (!m) { body.innerHTML = '<p class="empty">Brew something to see its analysis here.</p>'; $('resultVol').textContent = ''; renderAdmin(game); return; }
  $('resultVol').textContent = `${Math.max(0, Math.round(m.remaining))} / ${m.volume} ml`;
  const eff = Object.entries(m.effects).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const max = Math.max(2, ...eff.map((e) => e[1]));
  const effHTML = eff.map(([k, v]) => {
    const e = EFFECTS[k];
    return `<div class="eff" title="${esc(e.desc)}"><span class="n${e.bad ? ' bad' : ''}">${e.name}</span><div class="bar"><i style="width:${Math.min(100, (v / max) * 100)}%;--c:${e.color}"></i></div><span class="v">${v.toFixed(2)}</span></div>`;
  }).join('') || '<p class="empty">Inert. No active effects.</p>';
  const inf = Object.entries(m.infections).map(([d, p]) => `${DISEASES[d]?.name || d} (${Math.round(p * 100)}%/10 ml)`).join(', ');
  const reactions = (res ? res.reactions : m.reactions) || [];
  const logLines = res ? res.log : [];
  body.innerHTML = `
    <div class="mix-title">
      <div class="swatch" style="background:${m.color};--glow:${m.glowColor ? rgba(m.glowColor, 0.8) : 'transparent'}"></div>
      <div>${m.recipe ? '<div class="mix-recipe">★ Named recipe</div>' : ''}<div class="mix-name">${esc(m.name)}</div></div>
    </div>
    ${m.recipeDesc ? `<p class="empty" style="color:var(--text-2)">${esc(m.recipeDesc)}</p>` : ''}
    <div class="stats">
      <div class="stat"><b>State</b><span>${m.state}</span></div>
      <div class="stat"><b>Temp</b><span>${m.temperature} °C</span></div>
      <div class="stat"><b>pH</b><span>${m.ph}</span></div>
      <div class="stat"><b>Stability</b><span>${Math.round(m.stability * 100)}%</span></div>
      <div class="stat"><b>Half-life</b><span>${m.halfLife} s</span></div>
      <div class="stat"><b>Potency</b><span>${m.potency}</span></div>
      <div class="stat"><b>Toxicity</b><span style="color:${m.toxicity > 3 ? 'var(--crit)' : m.toxicity > 1 ? 'var(--warn)' : 'var(--text)'}">${m.toxicity}</span></div>
      <div class="stat"><b>Volume</b><span>${m.volume} ml</span></div>
    </div>
    ${m.hazards.length ? `<div class="chips">${m.hazards.map((z) => `<span class="tag haz">${z}</span>`).join('')}</div>` : ''}
    <div class="subhead">Effects per 10 ml</div>
    <div class="effects">${effHTML}</div>
    ${inf ? `<div class="infections">☣ ${esc(inf)}</div>` : ''}
    ${reactions.length ? `<div class="subhead">Reactions</div><ul class="reactions">${reactions.map((r) => `<li><b>${esc(r.name)}.</b> ${esc(r.text)}</li>`).join('')}</ul>` : ''}
    ${logLines.length ? `<ul class="reactions">${logLines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    <div class="row"><button type="button" class="btn" id="saveMix">🗄 Save to cabinet</button></div>`;
  $('saveMix').addEventListener('click', () => {
    const copy = JSON.parse(JSON.stringify(m));
    copy.id = uid('mix');
    copy.remaining = copy.volume;
    game.cabinet.unshift(copy);
    game.cabinet = game.cabinet.slice(0, 40);
    game.save();
    renderCabinet(game);
    toast(`Saved <b>${esc(m.name)}</b> to the cabinet.`);
  });
  renderAdmin(game);
}

export function renderAdmin(game) {
  const m = game.mixture;
  const R = ROUTES[game.route];
  $('siteRow').hidden = !R.site;
  $('siteSel').value = game.site;
  const max = m ? Math.max(1, Math.floor(m.remaining)) : 100;
  const dose = $('doseMl');
  dose.max = String(Math.max(1, Math.min(250, max)));
  game.dose = clamp(game.dose, 1, Math.max(1, max));
  dose.value = String(game.dose);
  $('doseOut').textContent = `${game.dose} ml`;
  const warn = [];
  if (m) {
    const inj = game.route === 'iv' || game.route === 'spinal' || game.route === 'cranial';
    if (m.antimatter) warn.push('☢ ANTIMATTER. Any contact annihilates the subject.');
    if (inj && ['powder', 'crystal', 'solid'].includes(m.state)) warn.push('Undissolved solids can embolise. Dissolve them in a liquid first.');
    if (inj && m.state === 'gas') warn.push('Injecting gas risks an air embolism.');
    if (m.temperature > 58) warn.push(`Scalding at ${m.temperature} °C. It will burn where it lands.`);
    if (m.temperature < 0) warn.push(`Cryogenic at ${m.temperature} °C. It will freeze where it lands.`);
    if (m.ph < 3 || m.ph > 11) warn.push(`pH ${m.ph}: corrosive on contact.`);
    if ((m.effects.explosive || 0) > 0.3) warn.push('Unstable: may detonate inside the subject.');
    const inf = Object.keys(m.infections);
    if (inf.length) warn.push(`Biohazard: may cause ${inf.map((d) => DISEASES[d]?.name || d).join(', ')}.`);
    if (m.remaining < 0.5) warn.push('The vial is empty. Brew again or load one from the cabinet.');
  }
  $('adminWarn').innerHTML = `<p class="info"><b style="color:var(--text)">${esc(R.name)}.</b> ${esc(R.desc)}</p>` + warn.map((w) => `<p>⚠ ${esc(w)}</p>`).join('');
  $('vialSummary').innerHTML = m
    ? `<div class="swatch" style="background:${m.color};--glow:${m.glowColor ? rgba(m.glowColor, 0.8) : 'transparent'}"></div><div class="mix-name" title="${esc(m.name)}">${esc(m.name)}</div>`
    : '<p class="empty">No mixture brewed yet.</p>';
  $('vialLeft').textContent = m ? `${Math.max(0, Math.round(m.remaining))} ml left` : '';
  const btn = $('adminBtn');
  btn.disabled = !m || m.remaining < 0.5 || game.body.gone;
  btn.textContent = m ? `${R.icon} ${R.name} · ${game.dose} ml` : 'Brew a mixture first';
}

function doAdminister(game) {
  const m = game.mixture;
  if (!m || m.remaining < 0.5) return;
  const ml = Math.min(game.dose, m.remaining);
  administer(game.body, m, game.route, ml, game.site, game.env);
  m.remaining -= ml;
  $('resultVol').textContent = `${Math.max(0, Math.round(m.remaining))} / ${m.volume} ml`;
  renderAdmin(game);
}

export function renderCabinet(game) {
  const list = $('cabinetList');
  $('cabinetCount').textContent = game.cabinet.length ? `${game.cabinet.length}` : '';
  if (!game.cabinet.length) { list.innerHTML = '<p class="empty">Saved mixtures appear here.</p>'; return; }
  list.innerHTML = '';
  for (const m of game.cabinet) {
    const row = h('div', { class: 'cabinet-item' });
    row.innerHTML = `<span class="dot" style="background:${m.color}"></span><button type="button" class="nm" title="Load ${esc(m.name)}">${esc(m.name)}</button><button type="button" class="btn tiny ghost" title="Discard">✕</button>`;
    row.querySelector('.nm').addEventListener('click', () => {
      game.mixture = JSON.parse(JSON.stringify(m));
      game.mixture.remaining = game.mixture.volume;
      renderResult(game);
      toast(`Loaded <b>${esc(m.name)}</b>.`);
    });
    row.querySelector('.btn').addEventListener('click', () => { game.cabinet = game.cabinet.filter((x) => x !== m); game.save(); renderCabinet(game); });
    list.appendChild(row);
  }
}
