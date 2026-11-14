// Живой свет поверх видео лича: огонь в глазницах и мерцание свечи.
// Два холста: shade (обычное наложение, тени) и glow (режим screen, свет и огонь).
// Координаты в долях кадра 1440×1075, сняты с эталона.

const EYES = [{ x: 0.4579, y: 0.2920 }, { x: 0.5461, y: 0.2915 }];
const CANDLE = { x: 0.909, y: 0.622 };          // середина пламени
const SOCKET_W = 0.026;                          // ширина глазницы, доля ширины кадра

const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, k) => a + (b - a) * k;

export function createFx(stage) {
  const shade = document.createElement('canvas');
  const glow = document.createElement('canvas');
  shade.className = 'fx fx-shade'; glow.className = 'fx fx-glow';
  shade.setAttribute('aria-hidden', 'true'); glow.setAttribute('aria-hidden', 'true');
  const anchor = stage.querySelector('#gl');
  stage.insertBefore(shade, anchor); stage.insertBefore(glow, anchor);
  const sx = shade.getContext('2d'), gx = glow.getContext('2d');
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, dpr = 1;
  function resize() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (w === W && h === H) return;
    W = w; H = h;
    for (const c of [shade, glow]) { c.width = W; c.height = H; }
  }

  // ---------- свеча: дрожь, порывы, редкое «почти погасла» ----------
  let light = 1, target = 1, gutterUntil = 0, nextGutter = performance.now() + rnd(9000, 20000), sway = 0, swayV = 0;
  function candle(now, dt) {
    if (now > nextGutter) { gutterUntil = now + rnd(500, 1100); nextGutter = now + rnd(10000, 24000); }
    const t = now / 1000;
    let base = 0.88 + 0.05 * Math.sin(t * 2.1) + 0.04 * Math.sin(t * 5.3 + 1.7) + 0.03 * Math.sin(t * 11.9 + 0.4);
    if (Math.random() < dt * 6) target = rnd(-0.12, 0.08);            // мелкие рывки пламени
    base += target;
    if (now < gutterUntil) base *= 0.45;                               // сквозняк — свеча чуть не гаснет
    light = lerp(light, base, Math.min(1, dt * (now < gutterUntil ? 6 : 14)));
    swayV += (rnd(-1, 1) * 40 - sway * 9) * dt; sway += swayV * dt;    // пламя качается — тени за ним тоже
    sway = Math.max(-1, Math.min(1, sway));
  }

  // ---------- огонь в глазах: частицы ----------
  const parts = [];
  function emit(eye, power, ox, oy) {
    const n = Math.round(power * 2.2 + Math.random());
    for (let i = 0; i < n; i++) {
      parts.push({
        x: eye.x + ox + rnd(-0.32, 0.32) * SOCKET_W, y: eye.y + oy + rnd(-0.004, 0.006),
        vx: rnd(-0.004, 0.004), vy: -rnd(0.07, 0.13) * (0.7 + power * 0.4),
        life: 0, max: rnd(0.35, 0.75), r: rnd(0.0045, 0.0085) * (0.8 + power * 0.35),
      });
    }
  }

  function drawShade() {
    sx.clearRect(0, 0, W, H);
    const k = 1 - light;                                               // чем слабее свеча, тем темнее углы
    const cx = (CANDLE.x + sway * 0.012) * W, cy = CANDLE.y * H;
    const g = sx.createRadialGradient(cx, cy, W * 0.06, cx - W * 0.25, cy - H * 0.05, W * 1.05);
    g.addColorStop(0, 'rgba(20,12,4,0)');
    g.addColorStop(0.45, `rgba(20,12,4,${0.10 + k * 0.30})`);
    g.addColorStop(1, `rgba(12,7,3,${0.30 + k * 0.45})`);
    sx.fillStyle = g; sx.fillRect(0, 0, W, H);
    // тень лича на стене слева качается от пламени
    const sh = sx.createRadialGradient((0.32 - sway * 0.02) * W, 0.35 * H, 0, (0.32 - sway * 0.02) * W, 0.35 * H, W * 0.22);
    sh.addColorStop(0, `rgba(10,6,2,${0.10 + k * 0.18})`); sh.addColorStop(1, 'rgba(10,6,2,0)');
    sx.fillStyle = sh; sx.fillRect(0, 0, W, H);
  }

  function drawGlow(eyesOn, eyeI, ox, oy, dt) {
    gx.clearRect(0, 0, W, H);
    gx.globalCompositeOperation = 'lighter';
    // тёплый свет свечи
    const cx = (CANDLE.x + sway * 0.006) * W, cy = CANDLE.y * H;
    const cg = gx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.42);
    cg.addColorStop(0, `rgba(255,170,70,${0.30 * light})`);
    cg.addColorStop(0.25, `rgba(240,130,40,${0.12 * light})`);
    cg.addColorStop(1, 'rgba(240,130,40,0)');
    gx.fillStyle = cg; gx.fillRect(0, 0, W, H);
    const core = gx.createRadialGradient(cx, cy - H * 0.01, 0, cx, cy - H * 0.01, W * 0.035);
    core.addColorStop(0, `rgba(255,236,170,${0.55 * light})`); core.addColorStop(1, 'rgba(255,200,120,0)');
    gx.fillStyle = core; gx.fillRect(0, 0, W, H);

    // огонь в глазах
    if (eyesOn > 0.01) {
      for (const e of EYES) {
        const ex = (e.x + ox) * W, ey = (e.y + oy) * H, rr = SOCKET_W * W * (1.1 + eyeI * 0.35);
        const halo = gx.createRadialGradient(ex, ey - rr * 0.3, 0, ex, ey - rr * 0.3, rr * 2.4);
        halo.addColorStop(0, `rgba(80,240,210,${0.30 * eyesOn * eyeI})`); halo.addColorStop(1, 'rgba(60,220,190,0)');
        gx.fillStyle = halo; gx.fillRect(ex - rr * 3, ey - rr * 3.4, rr * 6, rr * 6);
        if (!reduce) emit(e, eyeI * eyesOn, ox, oy);
      }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt; if (p.life > p.max) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx += rnd(-0.03, 0.03) * dt;
      const k = p.life / p.max, a = (1 - k) * (k < 0.15 ? k / 0.15 : 1) * eyesOn;
      const r = p.r * W * (1 - k * 0.6);
      const g = gx.createRadialGradient(p.x * W, p.y * H, 0, p.x * W, p.y * H, r);
      g.addColorStop(0, `rgba(${k < 0.3 ? '220,255,245' : '90,240,210'},${0.8 * a})`);
      g.addColorStop(1, 'rgba(40,200,170,0)');
      gx.fillStyle = g; gx.save(); gx.translate(p.x * W, p.y * H); gx.scale(0.75, 1.9); gx.translate(-p.x * W, -p.y * H);
      gx.beginPath(); gx.arc(p.x * W, p.y * H, r, 0, Math.PI * 2); gx.fill(); gx.restore();
    }
    if (parts.length > 400) parts.splice(0, parts.length - 400);
    gx.globalCompositeOperation = 'source-over';
  }

  // сдвиг головы по кадрам видео (снят заранее), чтобы огонь не съезжал с глазниц
  const tracks = {};
  async function loadTrack(name, url) { try { const r = await fetch(url); if (r.ok) tracks[name] = await r.json(); } catch { /* без трекинга */ } }

  let eyesOn = 1, eyeI = 1;
  return {
    loadTrack,
    // s: { active: 'idle'|'talk', time, speaking, level, listening, thinking, blink, mood, enabled }
    step(now, dt, s) {
      resize();
      if (!W) return;
      candle(now, dt);
      let ox = 0, oy = 0;
      const tr = tracks[s.active];
      if (tr && tr.dx && tr.dx.length) { const i = Math.min(tr.dx.length - 1, Math.max(0, Math.floor((s.time || 0) * tr.fps))); ox = tr.dx[i]; oy = tr.dy[i]; }
      let wantI = 1;
      if (s.thinking) wantI = 0.55;
      if (s.listening) wantI = 1.45;
      if (s.speaking) wantI = 1.05 + Math.min(0.9, (s.level || 0) * 6);
      if (s.mood === 'злится') wantI *= 1.35;
      if (s.mood === 'шепчет') wantI *= 0.7;
      eyeI = lerp(eyeI, wantI, Math.min(1, dt * 8));
      eyesOn = lerp(eyesOn, s.blink ? 0 : 1, Math.min(1, dt * (s.blink ? 30 : 9)));
      drawShade();
      drawGlow(s.enabled ? eyesOn : 0, eyeI, ox, oy, dt);
    },
  };
}
