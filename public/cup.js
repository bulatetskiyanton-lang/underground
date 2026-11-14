// Стаканчик для кубика на телефоне.
// Трясёшь телефон — кубик бьётся о стенки (гироскоп/акселерометр), гремит и даёт вибрацию.
// Смахнул кубик пальцем вверх или резко дёрнул телефоном вверх — кубик улетает, бросок уходит на экран.
// Без датчиков (или пока не разрешено) — кубик можно гонять пальцем, смахнуть так же.
(function () {
  'use strict';
  var cv, g, W = 0, H = 0, R = 0, cx = 0, cy = 0, die = { x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0, r: 0 };
  var ax = 0, ay = 0, sensor = false, asked = false, energy = 0, label = 'd20', flying = 0, flyT = 0, onThrow = null;
  var drag = null, lastHit = 0, audio = null, raf = 0, last = 0;

  function sound(v) {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      var t = audio.currentTime, n = audio.createBufferSource(), b = audio.createBuffer(1, 1600, audio.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
      n.buffer = b;
      var f = audio.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 1600; f.Q.value = 3;
      var gn = audio.createGain(); gn.gain.value = Math.min(0.9, 0.15 + v * 0.06);
      n.connect(f); f.connect(gn); gn.connect(audio.destination); n.start(t);
    } catch (e) { /* без звука */ }
  }
  function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* айфон не вибрирует из браузера */ } }

  function size() {
    var r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(W, H) * 0.44; cx = W / 2; cy = H / 2; die.r = R * 0.24;
    if (!die.x) { die.x = cx; die.y = cy; }
  }

  function motion(e) {
    var a = e.accelerationIncludingGravity, l = e.acceleration;
    if (!a) return;
    sensor = true;
    // наклон и тряска: экран смотрит вверх — x вправо, y вверх по экрану
    ax = (a.x || 0); ay = -(a.y || 0);
    var up = l ? -(l.y || 0) : 0, push = l ? Math.hypot(l.x || 0, l.y || 0, l.z || 0) : 0;
    energy = Math.min(1, energy + push * 0.004);
    // резкий рывок вверх после тряски — бросок
    if (!flying && energy > 0.25 && (up > 14 || (l && (l.z || 0) > 16))) toss(Math.max(energy, 0.5));
  }
  function ask() {
    if (asked) return; asked = true;
    var D = window.DeviceMotionEvent;
    if (D && typeof D.requestPermission === 'function') {
      D.requestPermission().then(function (s) { if (s === 'granted') window.addEventListener('devicemotion', motion); }).catch(function () {});
    } else if (D) window.addEventListener('devicemotion', motion);
  }

  function toss(p) {
    if (flying) return;
    flying = 1; flyT = performance.now(); energy = 0; buzz([12, 30, 40]); sound(6);
    if (onThrow) onThrow(Math.max(0.15, Math.min(1, p)));
  }

  function step(now) {
    raf = requestAnimationFrame(step);
    var dt = Math.min(0.033, (now - last) / 1000 || 0.016); last = now;
    if (!W) size();
    energy = Math.max(0, energy - dt * 0.35);
    if (flying) {
      var k = (now - flyT) / 520;
      die.y -= (900 + 1600 * k) * dt; die.r *= 1 - dt * 1.4; die.a += dt * 20;
      if (k > 1.6) { flying = 0; die.x = cx; die.y = cy; die.vx = die.vy = 0; die.r = R * 0.24; }
    } else if (!drag) {
      var gx = sensor ? ax * 140 : 0, gy = sensor ? ay * 140 : 0;
      die.vx += gx * dt; die.vy += gy * dt;
      die.vx *= 1 - dt * 0.6; die.vy *= 1 - dt * 0.6;
      die.x += die.vx * dt; die.y += die.vy * dt; die.a += die.va * dt; die.va *= 1 - dt * 1.5;
      var dx = die.x - cx, dy = die.y - cy, d = Math.hypot(dx, dy), lim = R - die.r;
      if (d > lim) {
        var nx = dx / d, ny = dy / d, vn = die.vx * nx + die.vy * ny;
        die.x = cx + nx * lim; die.y = cy + ny * lim;
        if (vn > 0) {
          die.vx -= 1.75 * vn * nx; die.vy -= 1.75 * vn * ny; die.va += (Math.random() - 0.5) * vn * 0.08;
          if (vn > 90 && now - lastHit > 70) { lastHit = now; sound(vn / 120); buzz(Math.min(30, 6 + vn / 40)); energy = Math.min(1, energy + vn / 2600); }
        }
      }
    }
    draw();
  }

  function poly(n, r, rot) { g.beginPath(); for (var i = 0; i < n; i++) { var t = rot + i * Math.PI * 2 / n; g[i ? 'lineTo' : 'moveTo'](Math.cos(t) * r, Math.sin(t) * r); } g.closePath(); }
  function draw() {
    g.clearRect(0, 0, W, H);
    // стаканчик сверху: кожа, обод, тень
    var gr = g.createRadialGradient(cx, cy - R * 0.2, R * 0.2, cx, cy, R);
    gr.addColorStop(0, '#3a2a1e'); gr.addColorStop(1, '#140d08');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    g.lineWidth = R * 0.09; g.strokeStyle = '#14100c'; g.stroke();
    g.lineWidth = 2; g.strokeStyle = '#c9b48a'; g.beginPath(); g.arc(cx, cy, R * 0.955, 0, 7); g.stroke();
    g.setLineDash([3, 7]); g.strokeStyle = 'rgba(201,180,138,.5)'; g.beginPath(); g.arc(cx, cy, R * 0.87, 0, 7); g.stroke(); g.setLineDash([]);
    // заряд тряски — янтарное свечение по ободу
    if (energy > 0.02) { g.lineWidth = 6; g.strokeStyle = 'rgba(240,150,43,' + Math.min(0.9, energy) + ')'; g.beginPath(); g.arc(cx, cy, R * 1.02, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * energy); g.stroke(); }
    // кубик
    g.save(); g.translate(die.x, die.y); g.rotate(die.a);
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 14; g.shadowOffsetY = 6;
    var n = label === 'd4' ? 3 : label === 'd6' ? 4 : label === 'd8' ? 4 : label === 'd10' ? 5 : 6;
    poly(n, die.r, -Math.PI / 2); g.fillStyle = '#1b1613'; g.fill();
    g.shadowColor = 'transparent'; g.lineWidth = 2; g.strokeStyle = '#f3ecd4'; g.stroke();
    poly(3, die.r * 0.55, -Math.PI / 2); g.strokeStyle = 'rgba(243,236,212,.45)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#f3ecd4'; g.font = '700 ' + Math.round(die.r * 0.62) + 'px Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label.slice(1), 0, die.r * 0.05);
    g.restore();
  }

  function down(e) {
    ask(); sound(0.5);
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (Math.hypot(x - die.x, y - die.y) > die.r * 1.6 || flying) return;
    drag = { x: x, y: y, t: performance.now(), hist: [] }; try { cv.setPointerCapture(e.pointerId); } catch (x2) { /* ок */ }
    e.preventDefault();
  }
  function move(e) {
    if (!drag) return;
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, now = performance.now();
    drag.hist.push({ x: x, y: y, t: now }); if (drag.hist.length > 6) drag.hist.shift();
    var dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), lim = R - die.r;
    if (d > lim) { x = cx + dx / d * lim; y = cy + dy / d * lim; if (now - lastHit > 90) { lastHit = now; sound(1); buzz(8); } }
    die.vx = (x - die.x) / 0.016; die.vy = (y - die.y) / 0.016; die.x = x; die.y = y; die.a += 0.05;
    energy = Math.min(1, energy + Math.hypot(die.vx, die.vy) / 90000);
  }
  function up() {
    if (!drag) return;
    var h = drag.hist, v = 0;
    if (h.length > 1) { var a = h[0], b = h[h.length - 1]; v = -(b.y - a.y) / Math.max(1, b.t - a.t); }   // пикселей в мс, вверх — плюс
    drag = null;
    if (v > 0.9) toss(Math.max(energy, Math.min(1, v / 3)));   // смахнул вверх — бросок
  }

  window.NKCup = {
    mount: function (canvas, cb) {
      cv = canvas; g = cv.getContext('2d'); onThrow = cb;
      cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move);
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      window.addEventListener('resize', function () { W = 0; });
      if (!raf) raf = requestAnimationFrame(step);
    },
    die: function (d) { label = d || 'd20'; },
    ask: ask,
    sensor: function () { return sensor; },
    reset: function () { W = 0; },
  };
})();
