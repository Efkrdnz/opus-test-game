// The bedside monitor: status, vitals, waveforms and detailed system tabs.
import { ORGANS, BRAIN_REGIONS, NERVE_REGIONS, MUSCLES, BONES, EFFECTS, SYMPTOMS, MUTATIONS, TRANSFORMS } from '../data/vocab.js';
import { DISEASES } from '../data/diseases.js';
import { ROUTES } from '../sim/pharmacology.js';
import { organFn, NEURO_KEYS } from '../sim/body.js';
import { stageIndex } from '../sim/diseases.js';
import { BeatClock, Sweep, ecgValue, plethValue, respValue, eegValue } from '../render/waves.js';
import { clamp, fmtNum } from '../util.js';
import { $, esc, h, barHTML, healthColor } from './dom.js';

const MONITOR_TABS = [
  ['organs', 'Organs'], ['brain', 'Brain'], ['nerves', 'Nerves'], ['muscles', 'Muscles'], ['skeleton', 'Skeleton'],
  ['blood', 'Blood'], ['conditions', 'Conditions'], ['doses', 'Doses'], ['tests', 'Tests'],
];

const VITALS = [
  { id: 'hr', k: 'HR', u: 'bpm', c: 'var(--hr)' },
  { id: 'spo2', k: 'SpO₂', u: '%', c: 'var(--spo2)' },
  { id: 'bp', k: 'NIBP', u: 'mmHg', c: 'var(--bp)' },
  { id: 'rr', k: 'RESP', u: '/min', c: 'var(--rr)' },
  { id: 'temp', k: 'TEMP', u: '°C', c: 'var(--temp)' },
  { id: 'glu', k: 'GLUCOSE', u: 'mg/dL', c: 'var(--glu)' },
  { id: 'gcs', k: 'GCS', u: '/15', c: 'var(--text)' },
  { id: 'pain', k: 'PAIN', u: '/10', c: 'var(--eeg)' },
];

export class Monitor {
  constructor(game) {
    this.game = game;
    this.tab = 'organs';
    this.focus = null;
    this.clock = new BeatClock();
    this.respState = {};
    this.lastStatus = '';
    this.clock.onBeat = (body) => { if (game.audio.enabled) game.audio.beat(body.vitals.spo2); };
    const vit = $('vitals');
    for (const v of VITALS) {
      vit.appendChild(h('div', { class: 'vital', id: `v-${v.id}`, style: `--vc:${v.c}` }, `<div class="k">${v.k}<em></em></div><div class="v">--</div><div class="u">${v.u}</div>`));
    }
    const tabs = $('monTabs');
    for (const [id, name] of MONITOR_TABS) {
      const b = h('button', { type: 'button', class: `tab${id === this.tab ? ' on' : ''}`, role: 'tab', 'data-tab': id }, name);
      b.addEventListener('click', () => this.setTab(id));
      tabs.appendChild(b);
    }
    this.sweeps = {
      ecg: new Sweep($('wEcg'), '#3ef08a', { gain: 0.36 }),
      pleth: new Sweep($('wPleth'), '#3fd0ff', { gain: 0.4 }),
      resp: new Sweep($('wResp'), '#ffe066', { gain: 0.38, speed: 45 }),
      eeg: new Sweep($('wEeg'), '#d58bff', { gain: 0.32, speed: 110 }),
    };
    window.addEventListener('resize', () => { for (const s of Object.values(this.sweeps)) s.resize(); });
  }

  setTab(id, focus = null) {
    this.tab = id;
    this.focus = focus;
    $('monTabs').querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === id));
    this.renderPane();
  }

  // every frame
  frame(dt, simDt, time) {
    const body = this.game.body;
    this.clock.update(simDt, body);
    if (simDt <= 0) { this.game.audio.setFlatline(false); return; }
    const t0 = time - dt;
    this.respState.dt = simDt / Math.max(1, Math.ceil(this.sweeps.resp.speed * dt / 2));
    this.sweeps.ecg.push(dt, (f) => ecgValue(body, this.clock, t0 + f * dt));
    this.sweeps.pleth.push(dt, () => plethValue(body, this.clock));
    this.sweeps.resp.push(dt, () => respValue(body, t0, this.respState));
    this.sweeps.eeg.push(dt, (f) => eegValue(body, t0 + f * dt));
    const flat = (body.alive && (body.rhythm === 'asystole' || body.rhythm === 'vfib')) || (!body.alive && !body.undead && !body.gone && body.deadTime < 20);
    this.game.audio.setFlatline(flat && this.game.speed > 0);
  }

  // a few times per second
  update() {
    const body = this.game.body;
    const v = body.vitals, cap = body.cap;
    // status
    $('subjName').textContent = body.name;
    $('subjSub').textContent = body.gone ? '—' : `Age ${Math.round(body.age)} · ${cap.heightCm} cm · ${cap.weightKg} kg · IQ ${cap.iq}`;
    const st = this.status(body);
    const pill = $('statusPill');
    pill.textContent = st.text; pill.className = `pill ${st.cls}`;
    if (st.cls === 'crit' && this.lastStatus !== 'crit' && this.game.audio.enabled) this.game.audio.alarm();
    this.lastStatus = st.cls;
    $('rhythmLbl').textContent = this.rhythmLabel(body);
    // vitals
    const pumping = body.alive && body.rhythm !== 'vfib' && body.rhythm !== 'asystole' && !body.stasis;
    const dead = !body.alive || body.stasis;
    const set = (id, val, alarm, sub = '') => {
      const e = $(`v-${id}`);
      e.querySelector('.v').innerHTML = val;
      e.querySelector('.k em').textContent = sub;
      e.classList.toggle('alarm', !!alarm && !body.gone);
    };
    set('hr', dead ? '--' : body.rhythm === 'vfib' ? 'VF' : body.rhythm === 'asystole' ? '0' : fmtNum(v.hr), body.alive && (!pumping || v.hr < 45 || v.hr > 150), body.rhythm === 'afib' ? 'irreg' : '');
    set('spo2', dead && !body.alive ? '--' : fmtNum(v.spo2), body.alive && v.spo2 < 88);
    set('bp', dead ? '--/--' : `${fmtNum(v.sys)}/${fmtNum(v.dia)}<small> (${fmtNum(v.map)})</small>`, body.alive && (v.sys < 85 || v.sys > 180));
    set('rr', dead ? '--' : fmtNum(v.rr), body.alive && (v.rr < 8 || v.rr > 30));
    set('temp', body.gone ? '--' : fmtNum(v.temp, 1), body.alive && (v.temp < 35 || v.temp > 39.5));
    set('glu', body.gone ? '--' : fmtNum(v.glucose), body.alive && (v.glucose < 60 || v.glucose > 250));
    const gcs = body.alive ? Math.round(3 + (v.consciousness / 100) * 12) : 3;
    set('gcs', body.gone ? '--' : String(gcs), body.alive && gcs < 9, body.sleeping ? 'asleep' : body.seizure > 0 ? 'seizing' : '');
    set('pain', body.gone ? '--' : fmtNum(v.pain / 10, 1), body.alive && v.pain > 70);
    // tab badges
    const badge = { conditions: body.diseases.length + body.mutations.length + Object.values(body.transform).filter((x) => x > 0.25).length, doses: body.doses.length };
    $('monTabs').querySelectorAll('.tab').forEach((t) => {
      const n = badge[t.dataset.tab];
      const name = MONITOR_TABS.find((x) => x[0] === t.dataset.tab)[1];
      t.innerHTML = n ? `${name}<span class="badge">${n}</span>` : name;
    });
    this.renderPane();
  }

  status(body) {
    const v = body.vitals;
    if (body.gone) return { text: body.goneKind === 'ascended' ? 'ASCENDED' : body.goneKind === 'erased' ? 'ERASED' : 'NO SUBJECT', cls: 'dead' };
    if (body.undead) return { text: 'UNDEAD', cls: 'odd' };
    if (!body.alive) return { text: 'DECEASED', cls: 'dead' };
    if (body.stasis) return { text: body.stasis === 'cryo' ? 'CRYOSTASIS' : body.stasis === 'gold' ? 'GILDED' : 'PETRIFIED', cls: 'odd' };
    if (body.rhythm === 'vfib' || body.rhythm === 'asystole') return { text: 'CARDIAC ARREST', cls: 'crit' };
    if (v.spo2 < 80 || v.map < 55 || v.consciousness < 20 || body.organs.brain.health < 30 || v.temp > 41 || v.temp < 32 || v.bloodVolume < 55 || body.seizure > 0) return { text: 'CRITICAL', cls: 'crit' };
    if (v.spo2 < 90 || v.map < 65 || v.map > 125 || v.hr > 130 || v.hr < 45 || v.temp > 38.5 || v.temp < 35.5 || v.pain > 60 || body.diseases.some((d) => d.incubation <= 0) || Object.values(body.organs).some((o) => o.health < 50)) return { text: 'UNSTABLE', cls: 'warn' };
    return { text: 'STABLE', cls: '' };
  }

  rhythmLabel(body) {
    if (body.gone) return 'No signal';
    if (body.undead) return 'No cardiac activity · subject is moving';
    if (!body.alive) return `Asystole · deceased ${Math.floor(body.deadTime)} s · ${body.deathCause}`;
    if (body.stasis) return 'Metabolism suspended';
    return { sinus: 'Normal sinus rhythm', tachy: 'Sinus tachycardia', brady: 'Sinus bradycardia', afib: 'Atrial fibrillation', vfib: 'VENTRICULAR FIBRILLATION — defibrillate!', asystole: 'ASYSTOLE — no cardiac output' }[body.rhythm] || body.rhythm;
  }

  renderPane() {
    const pane = $('monPane');
    const body = this.game.body;
    const fn = this['pane_' + this.tab];
    pane.innerHTML = fn ? fn.call(this, body) : '';
  }

  row(name, value, frac, color, extra = '', id = '') {
    const f = this.focus && this.focus === id ? ' style="background:rgba(111,240,255,.08);border-radius:3px"' : '';
    return `<div class="mrow"${f}><span class="n">${name}${extra ? `<small>${extra}</small>` : ''}</span>${barHTML(frac, color)}<span class="v">${value}</span></div>`;
  }

  pane_organs(body) {
    let out = '';
    for (const [id, o] of Object.entries(body.organs)) {
      const fnv = organFn(body, id);
      const notes = [];
      if (o.inflammation > 15) notes.push('inflamed');
      if (o.health < 25) notes.push('failing');
      else if (o.health < 55) notes.push('damaged');
      if (id === 'liver' && body.symptoms.jaundice) notes.push('jaundice');
      if (id.startsWith('lung') && body.vitals.spo2 < 88) notes.push('hypoxic');
      if (id === 'heart' && body.alive) notes.push(this.rhythmLabel(body).split(' ')[0].toLowerCase());
      out += this.row(ORGANS[id].name, `${Math.round(o.health)}%`, o.health / 100, healthColor(o.health), notes.join(' · ') + ` · fn ${Math.round(fnv * 100)}%`, id);
    }
    return out + `<p class="empty">Function combines tissue health with inflammation. Hover the Organs layer to inspect.</p>`;
  }

  pane_brain(body) {
    const cap = body.cap;
    let out = '<div class="cogs">';
    const cog = (k, v, c) => `<div class="cog"><b>${k}</b><span style="color:${c || 'var(--text)'}">${v}</span></div>`;
    out += cog('IQ est.', cap.iq, cap.iq < 70 ? 'var(--crit)' : cap.iq > 130 ? 'var(--good)' : '');
    out += cog('Obedience', `${Math.round(cap.obedience * 100)}%`);
    out += cog('Comprehension', `${Math.round(cap.comprehension * 100)}%`);
    out += cog('Memory', `${Math.round(cap.memory * 100)}%`);
    out += cog('Coordination', `${Math.round(cap.coordination * 100)}%`);
    out += cog('Mood', `${cap.mood > 0 ? '+' : ''}${Math.round(cap.mood)}`, cap.mood < -30 ? 'var(--crit)' : cap.mood > 30 ? 'var(--good)' : '');
    out += cog('Vision', `${Math.round(cap.vision * 100)}%`);
    out += cog('Hearing', `${Math.round(cap.hearing * 100)}%`);
    out += cog('Speech', `${Math.round(cap.speech * 100)}%`);
    out += '</div><div class="group-title">Regions · health / activity</div>';
    for (const [id, r] of Object.entries(body.brain)) {
      out += `<div class="mrow"${this.focus === id ? ' style="background:rgba(111,240,255,.08)"' : ''}><span class="n">${BRAIN_REGIONS[id].name}<small>${BRAIN_REGIONS[id].role}</small></span><div style="display:flex;flex-direction:column;gap:2px">${barHTML(r.health / 100, healthColor(r.health))}${barHTML(r.activity / 100, 'var(--rr)')}</div><span class="v">${Math.round(r.health)}</span></div>`;
    }
    out += '<div class="group-title">Neurotransmitters · baseline 50</div>';
    const col = { dopamine: '#ffcf3d', serotonin: '#ff7ad9', norepinephrine: '#ff8a3d', gaba: '#6d8cff', glutamate: '#5fe3ff', acetylcholine: '#9ff0d0', endorphin: '#c89bff', melatonin: '#5b6bd6' };
    for (const k of NEURO_KEYS) {
      const val = body.neuro[k];
      out += `<div class="mrow"><span class="n" style="text-transform:capitalize">${k}</span><div class="bar dual"><i style="width:${val}%;--c:${col[k]}"></i><b style="left:50%"></b></div><span class="v">${Math.round(val)}</span></div>`;
    }
    return out;
  }

  pane_nerves(body) {
    const cap = body.cap;
    let out = '<div class="cogs">';
    out += `<div class="cog"><b>Conductivity</b><span>${body.conductivity.toFixed(2)}×</span></div>`;
    out += `<div class="cog"><b>Reflex</b><span>${cap.reflexMs} ms</span></div>`;
    out += `<div class="cog"><b>Pain</b><span>${Math.round(body.vitals.pain)}/100</span></div>`;
    out += '</div>';
    for (const [id, n] of Object.entries(body.nerves)) out += this.row(NERVE_REGIONS[id].name, `${Math.round(n.health)}%`, n.health / 100, healthColor(n.health), n.health < 40 ? 'signal loss' : '', id);
    const para = body.effects.paralysis || 0;
    if (para > 0.2) out += `<p class="empty" style="color:var(--warn)">Neuromuscular block: ${Math.round(clamp(para * 30, 0, 100))}% of motor signal lost.</p>`;
    if (body.seizure > 0) out += '<p class="empty" style="color:var(--crit)">Seizure in progress: uncontrolled cortical discharge.</p>';
    return out;
  }

  pane_muscles(body) {
    const cap = body.cap;
    let out = '<div class="cogs">';
    out += `<div class="cog"><b>Strength</b><span>${Math.round(cap.strength * 100)}%</span></div>`;
    out += `<div class="cog"><b>Stamina</b><span>${Math.round(cap.stamina)}%</span></div>`;
    out += `<div class="cog"><b>Speed</b><span>${(1.3 * cap.speed).toFixed(2)} m/s</span></div>`;
    out += '</div>';
    const str = { armL: cap.armL, armR: cap.armR, legL: cap.legL, legR: cap.legR, core: cap.core };
    for (const [id, m] of Object.entries(body.muscles)) {
      const s = str[id];
      const notes = [`mass ${m.mass.toFixed(2)}×`, `fatigue ${Math.round(m.fatigue)}%`];
      if (m.spasm > 0.2) notes.push('spasm');
      out += this.row(MUSCLES[id].name, s !== undefined ? `${Math.round(s * 100)}%` : `${Math.round(m.health)}%`, (s !== undefined ? s : m.health / 100) / 1.5, healthColor(m.health), notes.join(' · '), id);
    }
    return out + '<p class="empty">Bars show force output relative to 150% of a healthy baseline.</p>';
  }

  pane_skeleton(body) {
    let out = '';
    const avgD = Object.values(body.bones).reduce((a, b) => a + b.density, 0) / 16;
    out += `<div class="cogs"><div class="cog"><b>Density</b><span>${avgD.toFixed(2)}×</span></div><div class="cog"><b>Fractures</b><span style="color:${Object.values(body.bones).some((b) => b.fractured) ? 'var(--crit)' : 'var(--text)'}">${Object.values(body.bones).filter((b) => b.fractured).length}</span></div><div class="cog"><b>Load</b><span>${body.cap.weightKg} kg</span></div></div>`;
    for (const [id, b] of Object.entries(body.bones)) {
      out += this.row(BONES[id].name, b.fractured ? '<span style="color:var(--crit)">FX</span>' : `${Math.round(b.health)}%`, b.health / 100, b.fractured ? 'var(--crit)' : healthColor(b.health), `density ${b.density.toFixed(2)}×`, id);
    }
    return out;
  }

  pane_blood(body) {
    const b = body.blood, v = body.vitals;
    const kv = (k, val, unit, ok) => `<div class="mrow wide"><span class="n">${k}</span><span class="v" style="color:${ok ? 'var(--text)' : 'var(--warn)'}">${val} <small style="color:var(--muted)">${unit}</small></span></div>`;
    let out = '<div class="group-title">Haematology</div>';
    out += kv('Blood volume', fmtNum(v.bloodVolume), '%', v.bloodVolume > 80);
    out += kv('Red cells', fmtNum(b.rbc, 2), '×10¹²/L', b.rbc > 4);
    out += kv('White cells', fmtNum(b.wbc, 1), '×10⁹/L', b.wbc > 4 && b.wbc < 11);
    out += kv('Platelets', fmtNum(b.platelets), '×10⁹/L', b.platelets > 150);
    out += kv('Clotting risk', `${Math.round(b.clotRisk * 100)}`, '%', b.clotRisk < 0.4);
    out += kv('Bleeding', fmtNum(body.bleedRate || 0, 2), '%/s', (body.bleedRate || 0) < 0.05);
    out += '<div class="group-title">Chemistry</div>';
    out += kv('pH', fmtNum(b.ph, 2), '', b.ph > 7.3 && b.ph < 7.5);
    out += kv('Glucose', fmtNum(v.glucose), 'mg/dL', v.glucose > 60 && v.glucose < 200);
    out += kv('Toxin load', fmtNum(b.toxins), '/100', b.toxins < 20);
    out += kv('Blood alcohol', fmtNum(b.bac, 3), '%', b.bac < 0.08);
    out += kv('Hydration', fmtNum(v.hydration), '%', v.hydration > 50);
    out += kv('Tissue oxygen', fmtNum((body.tissueO2 || 0) * 100), '%', (body.tissueO2 || 0) > 0.7);
    out += '<div class="group-title">Exotic</div>';
    out += kv('Radiation dose', fmtNum(b.radiation, 2), 'Sv', b.radiation < 1);
    out += kv('Mana', fmtNum(b.mana), 'thaums', b.mana < 100);
    out += kv('Immune strength', fmtNum(body.immune), '/100', body.immune > 40);
    return out;
  }

  pane_conditions(body) {
    let out = '';
    if (!body.diseases.length) out += '<p class="empty">No active diseases.</p>';
    for (const inst of body.diseases) {
      const d = DISEASES[inst.id];
      if (!d) continue;
      const st = d.stages[stageIndex(d, inst.progress)];
      const cures = Object.entries(d.cures || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([e]) => EFFECTS[e]?.name || e).join(', ');
      out += `<div class="disease"><h4>${esc(d.name)}<span>${d.kind}</span></h4>
        ${inst.incubation > 0 ? `<p>Incubating… ${Math.ceil(inst.incubation)} s</p>` : `<p><b style="color:var(--text)">${esc(st.name)}</b> — ${esc(st.note || '')}</p>`}
        ${barHTML(inst.progress, inst.progress > 0.7 ? 'var(--crit)' : 'var(--warn)')}
        ${inst.incubation > 0 ? '' : `<div class="chips">${(st.symptoms || []).map((s) => `<span class="tag">${SYMPTOMS[s] || s}</span>`).join('')}</div>`}
        <p>Treat with: ${esc(cures || 'nothing known')}</p></div>`;
    }
    const T = Object.entries(body.transform).filter(([, v]) => v > 0.02);
    if (T.length) {
      out += '<div class="group-title">Transformations</div>';
      for (const [k, v] of T) out += this.row(TRANSFORMS[k].name, `${Math.round(Math.min(1, v) * 100)}%`, Math.min(1, v), v >= 1 ? 'var(--eeg)' : 'var(--warn)');
    }
    if (body.mutations.length) {
      out += '<div class="group-title">Mutations</div><div class="chips">' + body.mutations.map((m) => `<span class="tag" title="${esc(MUTATIONS[m].desc)}" style="color:#e0a8ff">${MUTATIONS[m].name}</span>`).join('') + '</div>';
    }
    const S = Object.entries(body.symptoms).filter(([, v]) => v > 0.15).sort((a, b) => b[1] - a[1]);
    if (S.length) out += '<div class="group-title">Signs &amp; symptoms</div><div class="chips">' + S.map(([k]) => `<span class="tag warn">${SYMPTOMS[k] || k}</span>`).join('') + '</div>';
    const imm = Object.keys(body.immunities);
    if (imm.length) out += '<div class="group-title">Immune to</div><div class="chips">' + imm.map((d) => `<span class="tag good">${DISEASES[d]?.name || d}</span>`).join('') + '</div>';
    return out;
  }

  pane_doses(body) {
    let out = '';
    if (!body.doses.length) out += '<p class="empty">Nothing active in the bloodstream.</p>';
    for (const d of body.doses) {
      out += `<div class="mrow"><span class="n"><span style="color:${d.color}">●</span> ${esc(d.name)}<small>${ROUTES[d.route].name} · ${Math.round(d.ml)} ml · ${Math.round(d.t)} s</small></span>${barHTML(d.plasma, d.color)}<span class="v">${Math.round(d.plasma * 100)}%</span></div>`;
    }
    const E = Object.entries(body.effects).filter(([, v]) => v > 0.03).sort((a, b) => b[1] - a[1]);
    if (E.length) {
      out += '<div class="group-title">Active effect intensity</div>';
      const max = Math.max(2, ...E.map((e) => e[1]));
      for (const [k, v] of E) {
        const e = EFFECTS[k];
        out += `<div class="mrow" title="${esc(e.desc)}"><span class="n" style="${e.bad ? 'color:#ffb0a4' : ''}">${e.name}</span>${barHTML(v / max, e.color)}<span class="v">${v.toFixed(2)}</span></div>`;
      }
    }
    return out;
  }

  pane_tests(body) {
    const ms = body.measurements.slice().reverse();
    if (!ms.length) return '<p class="empty">Give the subject commands (walk, jump, lift, punch, balance, solve…) to record performance tests.</p>';
    let out = '<table class="tests"><thead><tr><th>Test</th><th>Result</th><th>vs base</th><th>t</th></tr></thead><tbody>';
    for (const m of ms.slice(0, 40)) {
      const pct = m.base ? Math.round((m.value / m.base) * 100) : null;
      out += `<tr><td>${esc(m.test)}${m.note ? `<br><small style="color:var(--muted)">${esc(m.note)}</small>` : ''}</td><td>${typeof m.value === 'number' ? +m.value.toFixed(2) : esc(m.value)} ${esc(m.unit)}</td><td class="${pct === null ? '' : pct >= 100 ? 'pct-up' : 'pct-down'}">${pct === null ? '–' : pct + '%'}</td><td>${Math.round(m.t)}s</td></tr>`;
    }
    return out + '</tbody></table>';
  }
}
