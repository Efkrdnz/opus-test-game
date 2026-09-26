// The Codex: guide, reagents, recipes, diseases and effects reference.
import { SUBSTANCES } from '../data/substances.js';
import { RECIPES } from '../data/recipes.js';
import { DISEASES } from '../data/diseases.js';
import { EFFECTS, CATEGORIES } from '../data/vocab.js';
import { TREATMENTS } from '../sim/mixer.js';
import { $, esc, h } from './dom.js';
import { substanceCardHTML, SUBSTANCE_INDEX } from './lab.js';

const CODEX_TABS = [['guide', 'Guide'], ['reagents', 'Reagents'], ['recipes', 'Recipes'], ['diseases', 'Diseases'], ['effects', 'Effects']];

export function initCodex(game) {
  const tabs = $('modalTabs');
  for (const [id, name] of CODEX_TABS) {
    const b = h('button', { type: 'button', class: 'tab', 'data-tab': id }, name);
    b.addEventListener('click', () => openCodex(game, id));
    tabs.appendChild(b);
  }
  $('modalClose').addEventListener('click', () => { $('modal').hidden = true; });
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('modal').hidden = true; });
  $('codexBtn').addEventListener('click', () => openCodex(game, 'recipes'));
  $('helpBtn').addEventListener('click', () => openCodex(game, 'guide'));
}

export function openCodex(game, tab) {
  $('modal').hidden = false;
  $('modalTabs').querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
  const body = $('modalBody');
  body.scrollTop = 0;
  if (tab === 'guide') body.innerHTML = guideHTML();
  else if (tab === 'reagents') body.innerHTML = reagentsHTML();
  else if (tab === 'recipes') body.innerHTML = recipesHTML(game);
  else if (tab === 'diseases') body.innerHTML = diseasesHTML(game);
  else body.innerHTML = effectsHTML();
}

function guideHTML() {
  return `
  <p>You run a clandestine lab. Your test subject is a homunculus: a lab-grown human whose every organ, brain region, nerve, muscle and bone is simulated. Mix impossible things, give them to it, and watch what happens on the monitor and in the chamber.</p>
  <div class="guide-steps">
    <div><b>1 · Pour</b>Click reagents on the shelf. Each click pours 10 ml into the flask. Adjust amounts with the sliders. Hover any reagent for its properties.</div>
    <div><b>2 · Process</b>Light the burner (−200 to 1500 °C), pick a stir, a steeping time, and treatments like Distill, Enchant, Irradiate or Bless. Unstable mixtures can explode on the bench.</div>
    <div><b>3 · Brew</b>The analysis shows state, temperature, pH, stability, effects and any reactions between ingredients. Certain combinations form named recipes.</div>
    <div><b>4 · Administer</b>Pick a route: drink, IV, intramuscular, inhale, skin, eye drops, splash, spinal, intracranial, or fumigate the chamber. Temperature and pH burn or freeze the contact site.</div>
    <div><b>5 · Observe</b>Peel through six anatomy layers, toggle X-ray, thermal and damage views, and hover body parts. The monitor tracks vitals, ECG, EEG, organs, brain, blood and diseases.</div>
    <div><b>6 · Test</b>Command the subject: walk, run, jump, lift, punch, balance, solve maths, speak. Each command is a measured test recorded in the Tests tab.</div>
  </div>
  <h3>Keyboard</h3>
  <p><kbd>Space</kbd> pause · <kbd>1</kbd>–<kbd>6</kbd> anatomy layers · <kbd>W</kbd> walk · <kbd>R</kbd> run · <kbd>J</kbd> jump · <kbd>L</kbd> lift · <kbd>P</kbd> punch · <kbd>D</kbd> dance · <kbd>T</kbd> speak · <kbd>Q</kbd> solve · <kbd>←</kbd>/<kbd>→</kbd> move. Type free commands like <kbd>say hello</kbd>.</p>
  <h3>Things worth knowing</h3>
  <p>Effects listed on a mixture are per 10 ml injected; larger doses scale up. Oral doses pass the liver first and absorb slowly; vomiting brings up what has not been absorbed yet. Powders injected without a solvent can embolise. Cyanide keeps SpO₂ normal while the subject suffocates at the cellular level. Opioids shrink the pupils; stimulants dilate them. Hypothermia protects the brain from hypoxia.</p>
  <p>Obedience depends on the frontal lobe, hearing on the temporal lobe, speech on Broca's area, balance on the cerebellum and breathing on the brainstem. Damage them and the subject behaves accordingly.</p>
  <p>Treatments: ${Object.values(TREATMENTS).map((t) => `${t.icon} <b style="color:var(--text)">${t.name}</b> — ${esc(t.desc)}`).join(' · ')}</p>
  <p>Medical tools: Defibrillate fixes ventricular fibrillation (and sometimes restarts a fresh corpse). Stabilise restores fluids, oxygen and glucose. Dialysis flushes every substance. Full restore undoes everything. New subject grows a fresh homunculus.</p>`;
}

function reagentsHTML() {
  let out = '';
  for (const [k, c] of Object.entries(CATEGORIES)) {
    out += `<h3>${c.name} <span style="color:var(--muted);font-family:var(--f-body);letter-spacing:0;text-transform:none">— ${esc(c.blurb)}</span></h3><div class="codex-grid">`;
    for (const s of SUBSTANCES.filter((x) => x.category === k)) out += `<div class="codex-card">${substanceCardHTML(s)}</div>`;
    out += '</div>';
  }
  return out;
}

function recipesHTML(game) {
  const found = RECIPES.filter((r) => game.discovered[r.id]).length;
  let out = `<p>${found} of ${RECIPES.length} named recipes discovered. Undiscovered recipes show only their riddle.</p><div class="codex-grid">`;
  for (const r of RECIPES) {
    const known = game.discovered[r.id];
    if (!known) { out += `<div class="codex-card locked"><h4>??? <small>undiscovered</small></h4><p>“${esc(r.hint)}”</p></div>`; continue; }
    const ings = r.ingredients.map((i) => `${SUBSTANCE_INDEX[i]?.icon || ''} ${esc(SUBSTANCE_INDEX[i]?.name || i)}`).join(' + ');
    const p = r.process || {};
    const proc = [p.minTemp !== undefined ? `≥ ${p.minTemp} °C` : '', p.maxTemp !== undefined ? `≤ ${p.maxTemp} °C` : '', p.stir ? `${p.stir} stir` : '', p.time ? `steep ${p.time}` : '', ...(p.treatments || []).map((t) => TREATMENTS[t]?.name || t)].filter(Boolean).join(' · ');
    const bonus = Object.entries(r.bonusEffects).map(([e, v]) => `${EFFECTS[e]?.name || e} +${v}`).join(', ');
    out += `<div class="codex-card"><h4>★ ${esc(r.name)}</h4><p>${esc(r.desc)}</p><p style="color:var(--text)">${ings}</p>${proc ? `<p>${esc(proc)}</p>` : ''}<p style="color:var(--brass-2)">${esc(bonus)}</p></div>`;
  }
  return out + '</div>';
}

function diseasesHTML(game) {
  const seen = Object.keys(game.encountered).length;
  let out = `<p>${seen} of ${Object.keys(DISEASES).length} diseases observed. Stages and cures unlock once a subject has caught the disease.</p><div class="codex-grid">`;
  for (const [id, d] of Object.entries(DISEASES)) {
    const known = game.encountered[id];
    const sources = SUBSTANCES.filter((s) => s.infections && s.infections[id]).map((s) => s.name);
    const trig = (d.triggers || []).length ? 'Can arise spontaneously from the right conditions.' : '';
    if (!known) {
      out += `<div class="codex-card locked"><h4>${esc(d.name)} <small>${d.kind}</small></h4><p>${esc(d.desc)}</p><p>${sources.length ? `Carried by: ${esc(sources.join(', '))}. ` : ''}${trig}</p></div>`;
      continue;
    }
    const cures = Object.entries(d.cures || {}).sort((a, b) => b[1] - a[1]).map(([e, v]) => `${EFFECTS[e]?.name || e} (${v})`).join(', ');
    out += `<div class="codex-card"><h4>${esc(d.name)} <small>${d.kind}</small></h4><p>${esc(d.desc)}</p>
      <p style="color:var(--text)">${d.stages.map((s) => esc(s.name)).join(' → ')} → <b>${esc(d.outcome.type)}</b></p>
      <p>Cured by: ${esc(cures || 'nothing')}</p>${sources.length ? `<p>Carried by: ${esc(sources.join(', '))}</p>` : ''}${trig ? `<p>${trig}</p>` : ''}</div>`;
  }
  return out + '</div>';
}

function effectsHTML() {
  const cats = { neuro: 'Nervous system', mind: 'Mind', toxic: 'Toxic', element: 'Elemental', restore: 'Restorative', body: 'Body', arcane: 'Arcane & transformation' };
  let out = '';
  for (const [c, name] of Object.entries(cats)) {
    out += `<h3>${name}</h3><div class="codex-grid">`;
    for (const [id, e] of Object.entries(EFFECTS)) if (e.cat === c) {
      const n = SUBSTANCES.filter((s) => s.effects[id]).length;
      out += `<div class="codex-card"><h4><span style="color:${e.color}">●</span> ${esc(e.name)} <small>${n} reagent${n === 1 ? '' : 's'}</small></h4><p>${esc(e.desc)}</p></div>`;
    }
    out += '</div>';
  }
  return out;
}
