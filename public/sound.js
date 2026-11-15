// Underground · атмосфера пещеры кодом (без файлов) и громкость: голос лича отдельно, атмосфера отдельно.
// NKSound.start(ctx) — запустить; NKSound.voiceNode — куда подключать голос; NKSound.set({voice, amb}) — 0..1; NKSound.duck(on) — притихнуть под речь.
(function () {
  'use strict';
  var ctx = null, voiceGain = null, ambGain = null, duckGain = null, on = false;
  var vol = { voice: 0.9, amb: 0.5 };
  try { var s = JSON.parse(localStorage.getItem('nk_vol') || 'null'); if (s) vol = { voice: +s.voice, amb: +s.amb }; } catch (e) { /* по умолчанию */ }

  function noiseBuf(sec, brown) {
    var b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0), last = 0;
    for (var i = 0; i < d.length; i++) { var w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return b;
  }
  function lfo(rate, depth, target) { var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(target); o.start(); }

  function build() {
    duckGain = ctx.createGain(); duckGain.gain.value = 1; duckGain.connect(ambGain);
    // гул пещеры: два низких тона, медленно дышат
    var drone = ctx.createGain(); drone.gain.value = 0.05; drone.connect(duckGain);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.connect(drone);
    [55, 82.4, 110.3].forEach(function (fq, i) { var o = ctx.createOscillator(); o.type = i ? 'triangle' : 'sine'; o.frequency.value = fq; o.detune.value = (i - 1) * 7; var g = ctx.createGain(); g.gain.value = i === 2 ? 0.25 : 0.6; o.connect(g); g.connect(lp); o.start(); });
    lfo(0.07, 0.02, drone.gain);
    // сквозняк: шум через полосу, полоса гуляет
    var wn = ctx.createBufferSource(); wn.buffer = noiseBuf(6, true); wn.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.8;
    var wg = ctx.createGain(); wg.gain.value = 0.22; wn.connect(bp); bp.connect(wg); wg.connect(duckGain); wn.start();
    lfo(0.05, 160, bp.frequency); lfo(0.11, 0.08, wg.gain);
    // эхо для капель
    var dl = ctx.createDelay(1.5), fb = ctx.createGain(), wet = ctx.createGain();
    dl.delayTime.value = 0.37; fb.gain.value = 0.38; wet.gain.value = 0.5; dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(duckGain);
    function drip() {
      if (!on) return;
      var t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), f0 = 900 + Math.random() * 900;
      o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 1.9, t + 0.06);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 + Math.random() * 0.06, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(g); g.connect(duckGain); g.connect(dl); o.start(t); o.stop(t + 0.15);
      setTimeout(drip, 1800 + Math.random() * 5200);
    }
    // треск свечи
    var nb = noiseBuf(0.05, false);
    function crackle() {
      if (!on) return;
      var t = ctx.currentTime, n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = nb; hp.type = 'highpass'; hp.frequency.value = 2500; g.gain.value = 0.03 + Math.random() * 0.05;
      n.connect(hp); hp.connect(g); g.connect(duckGain); n.start(t);
      setTimeout(crackle, 120 + Math.random() * (Math.random() < 0.2 ? 2500 : 600));
    }
    setTimeout(drip, 900); setTimeout(crackle, 400);
  }

  function apply() {
    if (!ctx) return;
    var t = ctx.currentTime;
    voiceGain.gain.setTargetAtTime(vol.voice * 1.4, t, 0.05);
    ambGain.gain.setTargetAtTime(vol.amb * vol.amb * 1.6, t, 0.2);
  }

  window.NKSound = {
    start: function (c) {
      if (ctx || !c) return; ctx = c; on = true;
      voiceGain = ctx.createGain(); voiceGain.connect(ctx.destination);
      ambGain = ctx.createGain(); ambGain.gain.value = 0; ambGain.connect(ctx.destination);
      build(); apply();
      this.voiceNode = voiceGain;
    },
    voiceNode: null,
    get: function () { return { voice: vol.voice, amb: vol.amb }; },
    set: function (v) {
      if (v.voice != null) vol.voice = Math.max(0, Math.min(1, +v.voice));
      if (v.amb != null) vol.amb = Math.max(0, Math.min(1, +v.amb));
      try { localStorage.setItem('nk_vol', JSON.stringify(vol)); } catch (e) { /* без памяти */ }
      apply();
      if (this.onchange) this.onchange(vol);
    },
    duck: function (d) { if (duckGain) duckGain.gain.setTargetAtTime(d ? 0.4 : 1, ctx.currentTime, d ? 0.15 : 0.8); },
    onchange: null,
  };
})();
