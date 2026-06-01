/* CopyCraft — procedural ambient music & sound effects (Web Audio).
 * Original calm music in Minecraft's style — not the copyrighted tracks. */
'use strict';

const Music = {
  ctx: null,
  enabled: true,
  _timer: null,
  playing: false,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.55;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.7;
    this.sfxGain.connect(this.master);
    try { this.enabled = localStorage.getItem('cc_music') !== '0'; } catch (e) {}
  },

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem('cc_music', on ? '1' : '0'); } catch (e) {}
    if (this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(on ? 0.9 : 0, this.ctx.currentTime + 0.5);
    }
  },

  toggle() { this.setEnabled(!this.enabled); return this.enabled; },

  tone(freq, dur, vol, type, dest) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type || 'triangle';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.musicGain);
    o.start(t); o.stop(t + dur + 0.05);
  },

  startMusic() {
    if (!this.ctx) return;
    if (this.playing) return;
    this.playing = true;
    this.setEnabled(this.enabled);
    this._schedule();
  },

  _schedule() {
    this._playPhrase();
    const gap = 5500 + Math.random() * 8000;
    this._timer = setTimeout(() => this._schedule(), gap);
  },

  _playPhrase() {
    if (!this.ctx) return;
    const night = (typeof Game !== 'undefined' && Game.world && !Game.isDaylight());
    const scale = night
      ? [196.00, 233.08, 261.63, 311.13, 349.23]
      : [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
    const n = 2 + Math.floor(Math.random() * 4);
    let delay = 0;
    for (let i = 0; i < n; i++) {
      const f = scale[Math.floor(Math.random() * scale.length)];
      setTimeout(() => {
        this.tone(f, 2.0, night ? 0.12 : 0.16, 'triangle');
        this.tone(f * 2, 1.4, 0.045, 'sine');
      }, delay);
      delay += 380 + Math.random() * 560;
    }
    this.tone(scale[0] / 2, 3.6, 0.11, 'sine');
  },

  sfx(kind) {
    if (!this.ctx || !this.enabled) return;
    if (kind === 'dig') this._noise(0.10, 900, 0.22);
    else if (kind === 'place') this._noise(0.09, 480, 0.28);
    else if (kind === 'hurt') this.tone(150, 0.26, 0.34, 'square', this.sfxGain);
    else if (kind === 'hit') this.tone(210, 0.11, 0.22, 'square', this.sfxGain);
    else if (kind === 'eat') this._noise(0.13, 320, 0.2);
    else if (kind === 'craft') { this.tone(523, 0.13, 0.18, 'triangle', this.sfxGain); this.tone(784, 0.16, 0.13, 'triangle', this.sfxGain); }
    else if (kind === 'wind') this._noise(0.55, 1400, 0.34);
    else if (kind === 'levelup') { this.tone(523, 0.5, 0.2, 'triangle', this.sfxGain); }
  },

  _noise(dur, freq, vol) {
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t);
  }
};
