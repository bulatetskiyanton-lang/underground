// Живой свет поверх видео лича: огонь в глазницах и мерцание свечи.
// Два холста: shade (обычное наложение, тени) и glow (режим screen, свет и огонь).
// Координаты в долях кадра 1440×1075, сняты с эталона.

const EYES = [{ x: 0.4594, y: 0.2985 }, { x: 0.5387, y: 0.3020 }];
const CANDLE = { x: 0.909, y: 0.622 };          // середина пламени
const SOCKET_W = 0.044;                          // ширина глазницы, доля ширины кадра

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

  // ---------- искры из глазниц ----------
  const parts = [];
  function spark(eye, power, ox, oy) {
    if (Math.random() > 0.10 * power) return;
    parts.push({ x: eye.x + ox + rnd(-0.25, 0.25) * SOCKET_W, y: eye.y + oy - 0.012, vx: rnd(-0.01, 0.01), vy: -rnd(0.05, 0.11), life: 0, max: rnd(0.4, 0.9), r: rnd(0.0012, 0.0024) });
  }


  // ---- огонь в глазницах на шейдере (шум + языки), режим screen поверх всего ----
  const glc = document.createElement('canvas');
  glc.className = 'fx fx-glow'; glc.setAttribute('aria-hidden', 'true');
  stage.insertBefore(glc, anchor);
  let gl = null, glP = null, glU = {};
  try {
    gl = glc.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false });
    if (gl) {
      const vs = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
      const fs = `precision highp float;
uniform vec2 uRes,uE0,uE1;uniform float uSw,uT,uI,uOn,uLean;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*vn(p);p=mat2(.8,.6,-.6,.8)*p*2.02+17.3;a*=.5;}return s/.9375;}
vec3 eye(vec2 fc,vec2 c,float seed){
  vec2 p=(fc-c)/uSw;p.y=-p.y;                       // в ширинах глазницы, y вверх
  float fl=.8+.2*vn(vec2(uT*11.+seed,2.3));
  float h=1.25+.75*uI;
  float y=(p.y+.22)/h;
  float n=fbm(vec2(p.x*2.4+seed,p.y*1.7-uT*2.7));
  float n2=fbm(vec2(p.x*5.+seed*3.,p.y*3.2-uT*4.6));
  float x=p.x-uLean*max(p.y,0.)*.55+(n-.5)*.75*clamp(y,0.,1.);
  float w=.40*(1.-clamp(y,0.,1.)*.82)+.02;
  float d=abs(x)/w;
  float body=smoothstep(1.05,.15,d)*smoothstep(-.06,.12,y)*smoothstep(1.,.25,y+(n2-.5)*.6);
  float core=smoothstep(.75,.0,d)*smoothstep(.62,.0,y+(n2-.5)*.3)*smoothstep(-.04,.1,y);
  vec2 q=p*vec2(1.,1.35);
  float pit=exp(-dot(q,q)*5.5);                      // жар в самой глазнице
  float halo=exp(-dot(p,p)*.55)*.22+exp(-dot(p,p)*.09)*.07*uI;  // отсвет на черепе
  vec3 col=vec3(.02,.42,.36)*body*1.1+vec3(.25,1.,.85)*body*body*.9+vec3(.95,1.,.98)*core*1.2;
  col+=(vec3(.3,1.,.86)*pit*1.1+vec3(.9,1.,.97)*pit*pit*.9)*(.75+.25*uI);
  col+=vec3(.12,.85,.72)*halo;
  return col*fl;
}
void main(){vec2 fc=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);
  vec3 c=eye(fc,uE0,1.7)+eye(fc,uE1,5.3);
  gl_FragColor=vec4(c*uOn,1.);}`;
      const mk = (t, src) => { const sh = gl.createShader(t); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
      glP = gl.createProgram(); gl.attachShader(glP, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(glP, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(glP);
      if (!gl.getProgramParameter(glP, gl.LINK_STATUS)) throw new Error('link');
      gl.useProgram(glP);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const l = gl.getAttribLocation(glP, 'a'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
      ['uRes', 'uE0', 'uE1', 'uSw', 'uT', 'uI', 'uOn', 'uLean'].forEach((n) => { glU[n] = gl.getUniformLocation(glP, n); });
    }
  } catch (e) { gl = null; glc.remove(); }
  function glEyes(t, on, I, ox, oy) {
    if (glc.width !== W || glc.height !== H) { glc.width = W; glc.height = H; gl.viewport(0, 0, W, H); }
    gl.uniform2f(glU.uRes, W, H);
    gl.uniform2f(glU.uE0, (EYES[0].x + ox) * W, (EYES[0].y + oy) * H + SOCKET_W * W * 0.06);
    gl.uniform2f(glU.uE1, (EYES[1].x + ox) * W, (EYES[1].y + oy) * H + SOCKET_W * W * 0.06);
    gl.uniform1f(glU.uSw, SOCKET_W * W); gl.uniform1f(glU.uT, t); gl.uniform1f(glU.uI, I); gl.uniform1f(glU.uOn, on);
    gl.uniform1f(glU.uLean, 0.25 * Math.sin(t * 2.3) + sway * 0.4);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawShade() {
    sx.clearRect(0, 0, W, H);
    const k = 1 - light;                                               // чем слабее свеча, тем темнее всё вокруг
    const cx = (CANDLE.x + sway * 0.012) * W, cy = CANDLE.y * H;
    const g = sx.createRadialGradient(cx, cy, W * 0.05, cx - W * 0.22, cy - H * 0.08, W * 1.0);
    g.addColorStop(0, 'rgba(18,10,3,0)');
    g.addColorStop(0.35, `rgba(18,10,3,${0.16 + k * 0.34})`);
    g.addColorStop(1, `rgba(8,4,1,${0.52 + k * 0.40})`);
    sx.fillStyle = g; sx.fillRect(0, 0, W, H);
  }

  // язык пламени: капля с дрожащим кончиком
  function tongue(ex, ey, w, h, lean, col) {
    gx.beginPath();
    gx.moveTo(ex - w, ey);
    gx.bezierCurveTo(ex - w * 1.05, ey - h * 0.45, ex - w * 0.25 + lean * 0.5, ey - h * 0.7, ex + lean, ey - h);
    gx.bezierCurveTo(ex + w * 0.35 + lean * 0.5, ey - h * 0.62, ex + w * 1.05, ey - h * 0.4, ex + w, ey);
    gx.bezierCurveTo(ex + w * 0.9, ey + w * 0.9, ex - w * 0.9, ey + w * 0.9, ex - w, ey);
    gx.fillStyle = col; gx.fill();
  }

  function drawGlow(now, eyesOn, eyeI, ox, oy, dt) {
    gx.clearRect(0, 0, W, H);
    gx.globalCompositeOperation = 'lighter';
    // свеча заливает сцену: большое тёплое пятно на всю комнату + ядро у пламени + блик на столе
    const cx = (CANDLE.x + sway * 0.006) * W, cy = CANDLE.y * H;
    const room = gx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.95);
    room.addColorStop(0, `rgba(255,150,50,${0.34 * light})`);
    room.addColorStop(0.3, `rgba(230,115,30,${0.17 * light})`);
    room.addColorStop(0.7, `rgba(190,85,20,${0.07 * light})`);
    room.addColorStop(1, 'rgba(190,85,20,0)');
    gx.fillStyle = room; gx.fillRect(0, 0, W, H);
    const core = gx.createRadialGradient(cx, cy - H * 0.012, 0, cx, cy - H * 0.012, W * 0.07);
    core.addColorStop(0, `rgba(255,240,190,${0.75 * light})`); core.addColorStop(0.4, `rgba(255,190,100,${0.3 * light})`); core.addColorStop(1, 'rgba(255,170,80,0)');
    gx.fillStyle = core; gx.fillRect(0, 0, W, H);
    gx.save(); gx.translate(cx, H * 0.80); gx.scale(1, 0.16);
    const tb = gx.createRadialGradient(0, 0, 0, 0, 0, W * 0.5);
    tb.addColorStop(0, `rgba(255,170,70,${0.30 * light})`); tb.addColorStop(1, 'rgba(255,170,70,0)');
    gx.fillStyle = tb; gx.beginPath(); gx.arc(0, 0, W * 0.5, 0, Math.PI * 2); gx.fill(); gx.restore();

    // огонь в глазницах: свет заполняет глазницу, язык пламени, отсвет на кости
    if (gl) glEyes(now / 1000, eyesOn, eyeI, ox, oy);
    if (eyesOn > 0.01) {
      const t = now / 1000;
      EYES.forEach((e, i) => {
        if (gl) { if (!reduce) spark(e, eyeI * eyesOn, ox, oy); return; }
        const ex = (e.x + ox) * W, ey = (e.y + oy) * H, sw = SOCKET_W * W, a = eyesOn;
        const fl = 0.85 + 0.15 * Math.sin(t * 17 + i * 2.1) + 0.1 * Math.sin(t * 31 + i);
        // отсвет на черепе вокруг
        const spill = gx.createRadialGradient(ex, ey, sw * 0.3, ex, ey, sw * 4.2);
        spill.addColorStop(0, `rgba(60,230,195,${Math.min(1, 0.42 * a * (0.6 + eyeI) * fl)})`); spill.addColorStop(0.4, `rgba(40,200,170,${0.16 * a * fl})`); spill.addColorStop(1, 'rgba(40,200,170,0)');
        gx.fillStyle = spill; gx.fillRect(ex - sw * 4.5, ey - sw * 4.5, sw * 9, sw * 9);
        // свечение внутри глазницы (эллипс по форме глазницы)
        gx.save(); gx.translate(ex, ey); gx.scale(1, 0.72);
        const inner = gx.createRadialGradient(0, sw * 0.1, 0, 0, 0, sw * 0.62);
        inner.addColorStop(0, `rgba(235,255,250,${Math.min(1, 1.0 * a * fl)})`);
        inner.addColorStop(0.35, `rgba(80,245,210,${Math.min(1, 0.85 * a * fl)})`);
        inner.addColorStop(0.8, `rgba(20,150,130,${0.4 * a})`);
        inner.addColorStop(1, 'rgba(10,90,80,0)');
        gx.fillStyle = inner; gx.beginPath(); gx.arc(0, 0, sw * 0.62, 0, Math.PI * 2); gx.fill(); gx.restore();
        // языки пламени
        const hgt = sw * (0.95 + 0.65 * eyeI) * (0.85 + 0.25 * Math.sin(t * 9 + i * 1.7) * Math.sin(t * 5.3 + i));
        const lean = sw * 0.16 * Math.sin(t * 6.1 + i * 2.4) + sway * sw * 0.1;
        const by = ey + sw * 0.08;
        tongue(ex, by, sw * 0.30, hgt, lean, `rgba(25,175,150,${0.65 * a})`);
        tongue(ex, by, sw * 0.21, hgt * 0.78, lean * 0.7, `rgba(80,245,215,${0.85 * a})`);
        tongue(ex, by, sw * 0.11, hgt * 0.5, lean * 0.4, `rgba(240,255,252,${1 * a})`);
        if (!reduce) spark(e, eyeI * a, ox, oy);
      });
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt; if (p.life > p.max) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = p.life / p.max;
      gx.fillStyle = `rgba(150,255,235,${(1 - k) * 0.9 * eyesOn})`;
      gx.beginPath(); gx.arc(p.x * W, p.y * H, p.r * W, 0, Math.PI * 2); gx.fill();
    }
    gx.globalCompositeOperation = 'source-over';
  }

  // сдвиг головы по кадрам видео (снят заранее), чтобы огонь не съезжал с глазниц
  const tracks = {};
  async function loadTrack(name, url) { try { const r = await fetch(url); if (r.ok) tracks[name] = await r.json(); } catch { /* без трекинга */ } }

  let eyesOn = 1, eyeI = 1;
  return {
    loadTrack,
    get light() { return light; },
    hasTrack(n) { return !!tracks[n]; },
    // s: { active: 'idle'|'talk', time, speaking, level, listening, thinking, blink, mood, enabled }
    step(now, dt, s) {
      resize();
      if (!W) return;
      candle(now, dt);
      let ox = 0, oy = 0, seen = 1;
      const tr = tracks[s.active];
      if (tr && tr.dx && tr.dx.length) { const i = Math.min(tr.dx.length - 1, Math.max(0, Math.floor((s.time || 0) * tr.fps))); ox = tr.dx[i]; oy = tr.dy[i]; if (tr.c) seen = tr.c[i]; }
      let wantI = 1;
      if (s.thinking) wantI = 0.55;
      if (s.listening) wantI = 1.45;
      if (s.speaking) wantI = 1.05 + Math.min(0.9, (s.level || 0) * 6);
      if (s.mood === 'злится') wantI *= 1.35;
      if (s.mood === 'шепчет') wantI *= 0.7;
      eyeI = lerp(eyeI, wantI, Math.min(1, dt * 8));
      eyesOn = lerp(eyesOn, s.blink || seen < 0.5 ? 0 : 1, Math.min(1, dt * (s.blink ? 30 : 12)));
      drawShade();
      drawGlow(now, s.enabled ? eyesOn : 0, eyeI, ox, oy, dt);
    },
  };
}
