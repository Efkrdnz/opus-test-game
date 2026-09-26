// Optional monitor sounds: pulse-oximeter beeps whose pitch falls with SpO2
// (as on real monitors), a flatline tone, and a few lab effects.
export class MonitorAudio {
  constructor() { this.ctx = null; this.enabled = false; this.flat = null; this.alarmT = 0; }
  enable(on) {
    this.enabled = on;
    if (on && !this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.enabled = false; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (!on) this.setFlatline(false);
  }
  tone(freq, dur, type = 'sine', vol = 0.06, when = 0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  beat(spo2) { this.tone(280 + Math.max(50, Math.min(100, spo2)) * 6.2, 0.09, 'sine', 0.05); }
  setFlatline(on) {
    if (!this.ctx) return;
    if (on && this.enabled && !this.flat) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.025;
      o.connect(g).connect(this.ctx.destination); o.start();
      this.flat = { o, g };
    } else if ((!on || !this.enabled) && this.flat) {
      try { this.flat.o.stop(); } catch (e) { /* already stopped */ }
      this.flat = null;
    }
  }
  alarm() { for (let i = 0; i < 3; i++) this.tone(960, 0.12, 'square', 0.03, i * 0.18); }
  bubble() { for (let i = 0; i < 5; i++) this.tone(300 + Math.random() * 500, 0.06, 'sine', 0.03, i * 0.07); }
  boom() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.6, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = buf; g.gain.value = 0.25; src.connect(g).connect(this.ctx.destination); src.start(t);
  }
  zap() { this.tone(120, 0.25, 'sawtooth', 0.05); this.tone(1800, 0.08, 'square', 0.02, 0.02); }
}
