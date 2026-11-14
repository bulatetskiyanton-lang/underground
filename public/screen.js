// Экран: лич (кадры + липсинк по звуку), кубики, монстры, комната.
import qrcode from './vendor/qrcode.js';
import { createFx } from './fx.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let ws = null, room = '', state = { players: [], started: false }, audioCtx = null, analyser = null;
let speaking = false, thinking = false, listening = new Set(), level = 0, blinkUntil = 0, nextBlink = performance.now() + 3000;
let pendingRoll = null;      // { pid, die } — чей бросок сейчас летит
let lastLichId = 0, speakSeq = 0, mood = '';

// ---------- статус ключей ----------
fetch('/api/status').then((r) => r.json()).then((s) => {
  const set = (id, ok, on, off) => { const e = $(id); e.textContent = ok ? on : off; e.className = 'pill ' + (ok ? 'on' : 'off'); };
  set('s-brain', s.brain, 'мозги: есть', 'мозги: нет ключа');
  set('s-voice', s.voice, 'голос: есть', 'голос: нет ключа');
  set('s-ears', s.ears, 'уши: есть', 'уши: нет ключа');
  set('s-art', s.art, 'портреты: есть', 'портреты: выключены');
}).catch(() => {});

// ---------- вход ----------
$('open').addEventListener('click', async () => {
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); analyser = audioCtx.createAnalyser(); analyser.fftSize = 512; analyser.connect(audioCtx.destination); } catch { audioCtx = null; }
  room = (new URLSearchParams(location.search).get('room') || localStorage.getItem('nk_screen_room') || '').toUpperCase();
  if (room.length < 4) { try { room = (await (await fetch('/api/new')).json()).room; } catch { room = Math.random().toString(36).slice(2, 7).toUpperCase(); } }
  localStorage.setItem('nk_screen_room', room);
  history.replaceState(null, '', '/screen.html?room=' + room);
  $('gate').hidden = true; $('gate').style.display = 'none'; $('app').hidden = false;
  $('code').textContent = room;
  const url = location.origin + '/?room=' + room;
  $('url').textContent = url.replace(/^https?:\/\//, '');
  try { const q = qrcode(0, 'M'); q.addData(url); q.make(); $('qr').innerHTML = q.createSvgTag({ cellSize: 6, margin: 1, scalable: true }); } catch { $('qr').textContent = ''; }
  initDice();
  startVideo();
  connect();
  requestAnimationFrame(frame);
});

function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?room=' + room);
  ws.onopen = () => { send({ t: 'hello', role: 'screen' }); err(''); };
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } onMsg(m); };
  ws.onclose = () => { err('Связь с комнатой пропала, переподключаюсь…'); setTimeout(connect, 1500); };
}
const send = (m) => { try { ws && ws.readyState === 1 && ws.send(JSON.stringify(m)); } catch { /* нет связи */ } };
setInterval(() => send({ t: 'ping' }), 20000);
const err = (t) => { $('err').textContent = t || ''; };

function onMsg(m) {
  if (m.t === 'state') { state = m; renderState(); if (m.lich && m.lich.id > lastLichId && !speaking) { lastLichId = m.lich.id; showLine(m.lich.text, false); showAsk(m.lich.roll); } }
  else if (m.t === 'lich') { lastLichId = m.id; mood = m.mood || ''; $('mood').textContent = m.mood || 'говорит'; showAsk(m.roll); speak(m.text); }
  else if (m.t === 'think') { thinking = !!m.on; if (thinking) $('mood').textContent = 'думает'; }
  else if (m.t === 'talking') { if (m.on) { listening.add(m.pid); stopSpeak(); } else listening.delete(m.pid); }
  else if (m.t === 'said') { addLog(m.name, m.text); }
  else if (m.t === 'rolled') { addLog(m.name, 'бросил ' + m.die + ': ' + m.n); }
  else if (m.t === 'do_roll') doRoll(m.pid, m.die, m.power);
  else if (m.t === 'gift') showGift(m);
  else if (m.t === 'error') err(m.text);
}

// ---------- монстры и комната ----------
function renderState() {
  $('scene').textContent = state.scene || 'Логово лича';
  const ps = state.players || [];
  $('players').innerHTML = ps.map((p) => {
    const m = p.monster;
    const img = p.pv ? `style="background-image:url('/api/portrait?room=${room}&pid=${encodeURIComponent(p.pid)}&v=${p.pv}')"` : '';
    if (!m) return `<div class="card"><div class="ph">?</div><div><h3>${esc(p.name || 'Кто-то')}</h3><div class="t">${p.making ? 'лич лепит монстра…' : 'выбирает монстра'}</div></div></div>`;
    const gear = (p.gear || []).map((i) => (m.items || [])[i]).filter(Boolean).map((it) => `<img src="/img/items/${esc(it.kind)}.webp" alt="${esc(it.name)}" title="${esc(it.name)}">`).join('');
    return `<div class="card ${listening.has(p.pid) ? 'live' : ''}" data-pid="${esc(p.pid)}"><div class="ph" ${img}>${p.pv ? '' : esc(m.name[0] || '?')}</div><div><h3>${esc(m.name)}</h3><div class="t">${esc(m.title)} · ${esc(p.name || '')}</div><div class="hp">здоровье ${m.hp}${p.online ? '' : ' · не в сети'}</div>${gear ? `<div class="gear">${gear}</div>` : ''}</div></div>`;
  }).join('') || '<div class="url">Пока никого. Наведи камеру телефона на код.</div>';
  const ready = ps.some((p) => p.monster);
  $('start').hidden = state.started || !ready;
  $('log').innerHTML = (state.log || []).slice(-6).map((l) => `<div><b>${esc(l.who)}</b> ${esc(l.text)}</div>`).join('');
}
function addLog(who, text) {
  const d = document.createElement('div'); d.innerHTML = `<b>${esc(who)}</b> ${esc(text)}`;
  $('log').appendChild(d); while ($('log').children.length > 6) $('log').firstChild.remove();
}
$('start').addEventListener('click', () => { send({ t: 'start' }); $('start').hidden = true; });
function showAsk(roll) { $('ask').textContent = roll ? `${roll.who}: бросай ${roll.die} — ${roll.why}` : ''; }

// ---------- вещь в подарок: карточка по центру, потом летит к монстру ----------
const giftQ = [];
let giftBusy = false;
function showGift(m) { giftQ.push(m); if (!giftBusy) nextGift(); }
function nextGift() {
  const m = giftQ.shift(); if (!m) { giftBusy = false; return; }
  giftBusy = true;
  const box = $('giftfx');
  const c = document.createElement('div'); c.className = 'giftcard';
  c.innerHTML = `<small>${esc(m.name)} получает</small><img src="/img/items/${esc(m.item.kind)}.webp" alt=""><b>${esc(m.item.name)}</b><p>${esc(m.item.desc)}</p>`;
  box.appendChild(c);
  addLog(m.name, 'получил: ' + m.item.name);
  setTimeout(() => {
    const card = document.querySelector(`.card[data-pid="${CSS.escape(m.pid)}"]`);
    if (card) {
      const a = c.getBoundingClientRect(), b = card.getBoundingClientRect();
      c.style.setProperty('--fx', (b.left + b.width / 2 - (a.left + a.width / 2)) + 'px');
      c.style.setProperty('--fy', (b.top + b.height / 2 - (a.top + a.height / 2)) + 'px');
    } else { c.style.setProperty('--fx', '-60vw'); c.style.setProperty('--fy', '0px'); }
    c.classList.add('fly');
    setTimeout(() => { c.remove(); if (card) { card.classList.add('live'); setTimeout(() => card.classList.remove('live'), 900); } nextGift(); }, 720);
  }, 3600);
}

// ---------- голос и липсинк ----------
let curAudio = null, lineText = '', lineDur = 0, lineT0 = 0;
function showLine(text, live) { lineText = text; if (!live) { $('said').textContent = text; $('rest').textContent = ''; } }
function stopSpeak() { speakSeq++; if (curAudio) { try { curAudio.pause(); } catch { /* ok */ } curAudio = null; } speaking = false; level = 0; if (lineText) { $('said').textContent = lineText; $('rest').textContent = ''; } }

async function speak(text) {
  stopSpeak();
  const my = ++speakSeq;
  lineText = text; $('said').textContent = ''; $('rest').textContent = text;
  thinking = true;
  let blob = null;
  try {
    const r = await fetch('/api/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    if (r.ok) blob = await r.blob(); else err('Голос: ' + (await r.text()).slice(0, 140));
  } catch (e) { err('Голос не ответил: ' + e.message); }
  if (my !== speakSeq) return;
  thinking = false;
  if (!blob) {            // без голоса: показываем текст и шевелим ртом по таймеру
    speaking = true; lineT0 = performance.now(); lineDur = Math.max(1.5, text.length / 15); curAudio = null;
    setTimeout(() => { if (my === speakSeq) { speaking = false; $('said').textContent = text; $('rest').textContent = ''; $('mood').textContent = 'ждёт'; } }, lineDur * 1000);
    return;
  }
  const a = new Audio(URL.createObjectURL(blob));
  curAudio = a;
  try { if (audioCtx) { if (audioCtx.state === 'suspended') await audioCtx.resume(); audioCtx.createMediaElementSource(a).connect(analyser); } } catch { /* играем напрямую */ }
  a.onloadedmetadata = () => { if (isFinite(a.duration)) lineDur = a.duration; };
  a.onended = a.onerror = () => { if (my === speakSeq) { speaking = false; curAudio = null; level = 0; $('said').textContent = text; $('rest').textContent = ''; $('mood').textContent = 'ждёт'; } };
  lineDur = Math.max(1.5, text.length / 15); lineT0 = performance.now(); speaking = true;
  try { await a.play(); } catch (e) { err('Звук не включился: нажми на страницу'); a.onended(); }
}

const buf = new Uint8Array(512);
function mouthLevel(now) {
  if (curAudio && analyser) {
    analyser.getByteTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; }
    const rms = Math.sqrt(s / buf.length);
    level = level * 0.55 + rms * 0.45;
    return level > 0.11 ? 2 : level > 0.035 ? 1 : 0;
  }
  return [0, 1, 2, 1][Math.floor(now / 110) % 4];     // запасной вариант без звука
}

// ---------- кадр лича ----------
const frames = {}; document.querySelectorAll('#stage img.f').forEach((i) => { frames[i.dataset.f] = i; });
let curFrame = 'closed';
function setFrame(f) { if (f === curFrame) return; frames[curFrame].classList.remove('on'); frames[f].classList.add('on'); curFrame = f; }

// видео-петли: «покой» и «говорит». Если видео не играет — остаются кадры.
const vIdle = $('v-idle'), vTalk = $('v-talk');
let videoOk = false, talkHold = 0;
const fx = createFx($('stage'));
fx.loadTrack('idle', '/video/lich_idle.track.json');
fx.loadTrack('talk', '/video/lich_talk.track.json');
function startVideo() {
  Promise.all([vIdle.play(), vTalk.play()]).then(() => { videoOk = true; $('stage').classList.add('video'); }).catch(() => { videoOk = false; });
}
function setVideo(talk) { vTalk.classList.toggle('on', talk); vIdle.classList.toggle('on', !talk); }

let lastT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
  pollPad(now);
  let f = 'closed';
  if (speaking) {
    const lv = mouthLevel(now);
    f = ['closed', 'half', 'half'][lv];          // рот открываем мягко, без широкого кадра
    if (lv > 0) talkHold = now + 260;
    const t = curAudio ? curAudio.currentTime : (now - lineT0) / 1000;
    const k = Math.min(lineText.length, Math.round(lineText.length * Math.min(1, t / (lineDur || 1))));
    $('said').textContent = lineText.slice(0, k); $('rest').textContent = lineText.slice(k);
  } else if (listening.size) { f = 'listen'; $('mood').textContent = 'слушает'; }
  else if (thinking) f = 'think';
  else {
    if (now > nextBlink) { blinkUntil = now + 140; nextBlink = now + 2600 + Math.random() * 3500; }
    if (now < blinkUntil) f = 'blink';
  }
  setFrame(f);
  const talkOn = speaking && now < talkHold;
  if (videoOk) {
    setVideo(talkOn);
    const v = talkOn ? vTalk : vIdle;
    fx.step(now, dt, { enabled: true, active: talkOn ? 'talk' : 'idle', time: v.currentTime, speaking, level, listening: listening.size > 0, thinking, blink: !speaking && now < blinkUntil, mood: speaking ? mood : '' });
  }
  $('stage').classList.toggle('hear', !speaking && listening.size > 0);
  $('stage').classList.toggle('muse', !speaking && !listening.size && thinking);
  NKDice.step(now, dt);
  requestAnimationFrame(frame);
}

// ---------- кубики ----------
function initDice() {
  const rack = $('rack');
  NKDice.DICE.forEach((d, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = d.id;
    b.addEventListener('click', () => pick(i));
    rack.appendChild(b);
  });
  NKDice.init($('gl'), (def, n) => {
    $('res').textContent = def.id + ': ' + n;
    const pid = pendingRoll ? pendingRoll.pid : ((state.players || []).find((p) => p.monster) || {}).pid || null;
    pendingRoll = null; $('ask').textContent = '';
    send({ t: 'rolled', pid, die: def.id, n });
  }, (p) => { $('pw').style.width = Math.round(p * 100) + '%'; });
  markRack();
}
function markRack() { [...$('rack').children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === NKDice.selected()))); }
function pick(i) { if (NKDice.select(i)) { $('res').textContent = ''; markRack(); } }
function doRoll(pid, die, power) {
  const i = NKDice.DICE.findIndex((d) => d.id === die);
  const go = () => { if (NKDice.busy()) return setTimeout(go, 300); pick(i < 0 ? 5 : i); pendingRoll = { pid, die }; $('res').textContent = ''; NKDice.throwNow(typeof power === 'number' ? power : 0.45 + Math.random() * 0.5); };
  go();
}

// ---------- джойстик ----------
let padT = false, padSelAt = 0;
function pollPad(now) {
  let pads = null; try { pads = navigator.getGamepads ? navigator.getGamepads() : null; } catch { return; }
  const gp = pads && [...pads].find(Boolean);
  if (!gp) return;
  const B = (i) => { const b = gp.buttons[i]; return !!(b && (b.pressed || b.value > 0.3)); };
  const tr = B(7) || B(6);
  if (tr && !padT) { $('res').textContent = ''; NKDice.chargeStart(); }
  if (!tr && padT) NKDice.chargeEnd();
  padT = tr;
  const ry = gp.axes[3] || 0, rx = gp.axes[2] || 0;
  const dir = (ry > 0.6 || rx > 0.6 || B(13) || B(15)) ? 1 : (ry < -0.6 || rx < -0.6 || B(12) || B(14)) ? -1 : 0;
  if (dir && now - padSelAt > 230) { padSelAt = now; pick(NKDice.selected() + dir); }
  if (!dir) padSelAt = 0;
}
