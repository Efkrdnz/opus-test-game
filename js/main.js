// HOMUNCULUS — bootstrap and main loop.
import { createBody, pushEvent } from './sim/body.js';
import { stepBody, DEFAULT_ENV, SIM_STEP } from './sim/physiology.js';
import { createActor, issueCommand, updateActor, say } from './sim/behavior.js';
import { SceneRenderer } from './render/scene.js';
import { MonitorAudio } from './ui/audio.js';
import { $, toast, store, esc } from './ui/dom.js';
import { initLab, drawFlask, renderFlask, renderResult, renderAdmin, SUBSTANCE_INDEX } from './ui/lab.js';
import { Monitor } from './ui/monitor.js';
import { initChamber, appendLog, syncLayerButtons } from './ui/chamber.js';
import { initCodex } from './ui/codex.js';
import { brewMixture } from './sim/mixer.js';
import { RECIPES } from './data/recipes.js';
import { fmtClock, approach } from './util.js';

const SAVE_KEY = 'homunculus.v1';

function boot() {
  const saved = store.get(SAVE_KEY, {});
  const game = {
    body: createBody(),
    actor: createActor(),
    env: { ...DEFAULT_ENV },
    speed: 1,
    lastSpeed: 1,
    time: 0,
    opts: { peel: 0, xray: false, thermal: false, damage: false, labels: false, hover: null },
    peelTarget: 0,
    flask: [],
    process: { heatOn: false, temp: 80, stir: 'gentle', time: 'minute', treatments: new Set() },
    mixture: null,
    route: 'oral',
    site: 'armL',
    dose: 10,
    cabinet: Array.isArray(saved.cabinet) ? saved.cabinet : [],
    discovered: saved.discovered || {},
    encountered: saved.encountered || {},
    audio: new MonitorAudio(),
    renderer: null,
    monitor: null,
    logLine(text, level = 'info') { appendLog(text, level, game.body.time); },
    save() { store.set(SAVE_KEY, { cabinet: game.cabinet, discovered: game.discovered, encountered: game.encountered, seenGuide: true }); },
    command(cmd, arg) { issueCommand(game.actor, game.body, cmd, arg); },
    setSpeed(s) {
      if (s > 0) game.lastSpeed = s;
      game.speed = s;
      $('speedSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.speed === s));
    },
    newSubject() {
      game.body = createBody();
      game.actor = createActor();
      game.actor.liftKg = +$('liftKg').value || 60;
      pushEvent(game.body, `${game.body.name} is decanted from the growth vat.`, 'good');
      say(game.actor, game.body, 'greet');
      renderAdmin(game);
    },
  };

  game.renderer = new SceneRenderer($('scene'));
  game.renderer.resize();
  window.addEventListener('resize', () => game.renderer.resize());
  if (window.ResizeObserver) new ResizeObserver(() => game.renderer.resize()).observe($('stage'));

  initLab(game);
  game.monitor = new Monitor(game);
  initChamber(game);
  initCodex(game);

  $('speedSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) game.setSpeed(+b.dataset.speed); });
  $('soundBtn').addEventListener('click', () => {
    game.audio.enable(!game.audio.enabled);
    $('soundBtn').textContent = game.audio.enabled ? '🔊 Sound' : '🔇 Sound';
  });

  // Opening state: a caffeine tonic already brewed, so the bench is ready to use.
  game.flask = [{ id: 'caffeine', ml: 20 }, { id: 'saline', ml: 30 }].filter((i) => SUBSTANCE_INDEX[i.id]);
  renderFlask(game);
  const first = brewMixture(game.flask, { temp: null, stir: 'gentle', time: 'minute', treatments: [] }, SUBSTANCE_INDEX, RECIPES);
  if (first.ok) { game.mixture = { ...first.mixture, remaining: first.mixture.volume }; renderResult(game, first); }
  game.logLine('Lab online. Chamber pressurised, monitors calibrated.', 'good');
  game.logLine('A sample tonic is on the bench. Choose a route and press Administer, or pour your own mixture.', 'info');
  pushEvent(game.body, `${game.body.name} is decanted from the growth vat.`, 'good');
  say(game.actor, game.body, 'greet');
  if (!saved.seenGuide) {
    setTimeout(() => toast('New to the lab? Press <b>? Guide</b> for a two-minute tour.'), 1200);
    store.set(SAVE_KEY, { ...store.get(SAVE_KEY, {}), seenGuide: true });
  }

  // ---------------------------------------------------------------------------
  let last = performance.now();
  let acc = 0;
  let uiT = 0;
  let wallT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    wallT += dt;
    const simDt = dt * game.speed;
    game.time += simDt;
    acc += simDt;
    let steps = 0;
    while (acc >= SIM_STEP && steps < 120) { stepBody(game.body, game.env, SIM_STEP); acc -= SIM_STEP; steps++; }
    if (simDt > 0) updateActor(game.actor, game.body, game.env, simDt);

    // events → log / toasts
    for (const ev of game.body.events) {
      appendLog(ev.text, ev.level, ev.t);
      if (ev.level === 'death') toast(`✝ ${esc(ev.text)}`, 'death');
      else if (ev.level === 'mutation' && /COMPLETE|RISES|CRYOSTASIS|PETRIFIED|statue|solid gold/i.test(ev.text)) toast(esc(ev.text));
    }
    game.body.events.length = 0;
    for (const d of game.body.diseases) if (!game.encountered[d.id]) { game.encountered[d.id] = true; game.save(); }

    // anatomy peel animation
    game.opts.peel = approach(game.opts.peel, game.peelTarget, 7, dt);
    if (Math.abs(game.opts.peel - game.peelTarget) > 0.001) syncLayerButtons(game);

    game.renderer.render(game, simDt, game.time);
    game.monitor.frame(dt, simDt, game.time);
    drawFlask(game, wallT);

    uiT += dt;
    if (uiT > 0.25) {
      uiT = 0;
      game.monitor.update();
      $('simClock').textContent = fmtClock(game.body.time);
      $('adminBtn').disabled = !game.mixture || game.mixture.remaining < 0.5 || game.body.gone;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__homunculus = game;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
