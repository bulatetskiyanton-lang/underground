// Экран: лич (кадры + липсинк по звуку), кубики, монстры, комната.
import qrcode from './vendor/qrcode.js';
import { createFx } from './fx.js';

const $ = (id) => document.getElementById(id);
if (window.NKUI) NKUI.boot();   // общие узоры гравюры (кубики, значки) — как на пульте
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
// голос интро просим заранее, пока человек ещё не нажал «Открыть логово»
const Q = window.NKQuiz;
const lineBlob = {};
let voiceDead = false, linesCache = null;
async function voiceFor(text) {
  if (lineBlob[text]) return lineBlob[text];
  if (voiceDead) return null;
  try {
    if (linesCache === null) { try { linesCache = await caches.open('nk-lines-1'); } catch { linesCache = false; } }
    const key = '/line/' + encodeURIComponent(text);
    let r = linesCache && await linesCache.match(key);
    if (!r) {
      r = await fetch('/api/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
      if (!r.ok) { voiceDead = true; return null; }      // ключа нет или ElevenLabs молчит — дальше только текст
      if (linesCache) await linesCache.put(key, r.clone());
    }
    return (lineBlob[text] = await r.blob());
  } catch { return null; }
}
async function loadLines(list) { for (const t of list) { if (voiceDead) return; await voiceFor(t); } }
const introVoice = loadLines(Q.INTRO);

$('open').addEventListener('click', async () => {
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); analyser = audioCtx.createAnalyser(); analyser.fftSize = 512; if (window.NKSound) { NKSound.start(audioCtx); analyser.connect(NKSound.voiceNode); } else analyser.connect(audioCtx.destination); } catch { audioCtx = null; }
  room = (new URLSearchParams(location.search).get('room') || localStorage.getItem('nk_screen_room') || '').toUpperCase();
  if (room.length < 4) { try { room = (await (await fetch('/api/new')).json()).room; } catch { room = Math.random().toString(36).slice(2, 7).toUpperCase(); } }
  localStorage.setItem('nk_screen_room', room);
  history.replaceState(null, '', '/screen.html?room=' + room);
  $('gate').hidden = true; $('gate').style.display = 'none'; $('app').hidden = false; $('app').classList.add('inkwait'); setTimeout(() => { if (!$('stage').classList.contains('intro')) inkAll(); }, 700);
  $('code').textContent = room;
  const url = location.origin + '/?room=' + room;
  $('url').textContent = url.replace(/^https?:\/\//, '');
  try { const q = qrcode(0, 'M'); q.addData(url); q.make(); $('qr').innerHTML = q.createSvgTag({ cellSize: 6, margin: 1, scalable: true }); } catch { $('qr').textContent = ''; }
  initDice();
  startVideo();
  connect();
  requestAnimationFrame(frame);
  introVoice.then(() => loadLines(Q.lines()));       // реплики анкеты — в фоне, после интро
});

function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?room=' + room);
  ws.onopen = () => { send({ t: 'hello', role: 'screen' }); err(''); if (window.NKSound) { const x = NKSound.get(); send({ t: 'vol_state', voice: x.voice, amb: x.amb }); } };
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } onMsg(m); };
  ws.onclose = () => { err('Связь с комнатой пропала, переподключаюсь…'); setTimeout(connect, 1500); };
}
const send = (m) => { try { ws && ws.readyState === 1 && ws.send(JSON.stringify(m)); } catch { /* нет связи */ } };
setInterval(() => send({ t: 'ping' }), 20000);
const err = (t) => { $('err').textContent = t || ''; };

function onMsg(m) {
  if (m.t === 'state') { state = m; renderState(); maybeIntro(); if (m.lich && m.lich.id > lastLichId && !speaking) { lastLichId = m.lich.id; showLine(m.lich.text, false); showAsk(m.lich.roll); } }
  else if (m.t === 'lich') { direct(m.roll ? 'кубик' : m.focus, m.focusPid); hush(); lastLichId = m.id; $('tab').textContent = 'ЛИЧ'; mood = m.mood || ''; stopGesture(['think', 'listen']); if (m.gesture && clipUrl[m.gesture]) gesture(m.gesture); else if (m.roll) gesture('dice'); else if (m.mood === 'смеётся') gesture('laugh'); else if (m.mood === 'злится') gesture('angry'); else if (m.gesture) gesture(m.gesture); else if ((state.paths || []).length) gesture('point'); $('mood').textContent = m.mood || 'говорит'; showAsk(m.roll); speak(m.text); }
  else if (m.t === 'think') { hush(); thinking = !!m.on; if (thinking) { $('mood').textContent = 'думает'; if (!m.idle) { gesture('think'); if (Math.random() < 0.6) setTimeout(() => { if (thinking && !speaking) quip('think'); }, 900); } } }
  else if (m.t === 'talking') { hush(); if (m.on) { listening.add(m.pid); stopSpeak(); gesture('listen'); } else { listening.delete(m.pid); if (!listening.size) stopGesture(['listen']); } }
  else if (m.t === 'said') { hush(); addLog(m.name, m.text); }
  else if (m.t === 'rolled') { hush(); addLog(m.name, 'бросил ' + m.die + ': ' + m.n); }
  else if (m.t === 'bones') { showBones(m); }
  else if (m.t === 'look') { look(m.pid, m.on); }
  else if (m.t === 'vol' && window.NKSound) { NKSound.set(m); }
  else if (m.t === 'votes') { stampVote(m); }
  else if (m.t === 'do_roll') { direct('кубик'); doRoll(m.pid, m.die, m.power); quip('roll'); }
  else if (m.t === 'gift') { gesture('give'); showGift(m); }
  else if (m.t === 'scene') { gesture('map'); showScene(m, true); direct('место'); }
  else if (m.t === 'quiz_say') onQuizSay(m);
  else if (m.t === 'seal') {
    // печать видно сразу, голос — в очередь сразу после отклика на коронную фразу
    showGift({ seal: true, pid: m.pid, name: m.name }); gesture('give');
    sayQ.push({ text: Q.SEAL, name: m.name, pid: m.pid, seal: m }); pumpSay();
  }
  else if (m.t === 'skip_intro') skipIntro();
  else if (m.t === 'error') err(m.text);
}

// ---------- монстры и комната ----------
function renderState() {
  $('scene').textContent = state.scene || 'Логово лича';
  if ((state.goal || '') !== $('goal').textContent) { const wasHidden = $('goalsign').hidden; $('goal').textContent = state.goal || ''; $('goalsign').hidden = !state.goal; if (state.goal) brush(wasHidden ? $('goalsign') : $('goal'), wasHidden ? 0 : 150); }
  const qs = (state.quests || []).slice(0, 3);
  if ($('questnote').hidden && qs.length) { $('questnote').hidden = false; brush($('questnote')); }
  $('questnote').hidden = !qs.length;
  $('quests').innerHTML = qs.map((q, i) => `<div class="q ${q.done ? 'done' : ''}"><i></i><span${inkAttr('q:' + q.text + (q.done ? ':1' : ''), 500 + i * 220)}>${esc(q.text)}</span></div>`).join('');
  drawMap();
  const cp = (state.places || [])[state.cur];
  if (cp && cp.v && sceneShown !== state.cur + ':' + cp.v) showScene({ i: state.cur, name: cp.name, v: cp.v }, false);
  const ps = state.players || [];
  $('players').innerHTML = ps.map((p) => {
    const m = p.monster;
    const img = p.pv ? `style="background-image:url('/api/portrait?room=${room}&pid=${encodeURIComponent(p.pid)}&v=${p.pv}')"` : '';
    const inQuiz = p.quiz >= 1 && !p.sealed;
    if (!m || inQuiz) return `<div class="card" data-pid="${esc(p.pid)}"><div class="ph">?</div><div><h3>${esc(p.name || 'Кто-то')}</h3><div class="t">${inQuiz ? (p.quiz <= 5 ? `анкета жильца · ${p.quiz} из 5` : 'лич ставит печать…') : p.making ? 'лич лепит монстра…' : 'выбирает монстра'}</div>${inQuiz ? `<div class="qdots">${[1, 2, 3, 4, 5].map((k) => `<i class="${k < p.quiz ? 'on' : ''}"></i>`).join('')}</div>` : ''}</div></div>`;
    return monsterCard(p, m, img);
  }).join('') || '';
  const ready = ps.some((p) => p.monster) && !ps.some((p) => p.quiz >= 1 && !p.sealed);
  $('start').hidden = state.started || !ready;
  document.querySelectorAll('.giftcard.sealcard[data-pid]').forEach((c) => { const p = ps.find((x) => x.pid === c.dataset.pid); if (p && p.pv) { const ph = c.querySelector('.ph'); ph.style.backgroundImage = `url('/api/portrait?room=${room}&pid=${encodeURIComponent(p.pid)}&v=${p.pv}')`; ph.textContent = ''; } });
  $('log').innerHTML = (state.log || []).slice(-3).map((l) => `<div><b>${esc(l.who)}</b> ${esc(l.text)}</div>`).join('');
}
// ---------- кисть: интерфейс прорисовывается мазком, карта — пером ----------
const born = {}, INK = 1500;
function bornAgo(key) { const now = performance.now(); if (!(key in born)) born[key] = now; return now - born[key]; }
// для того, что перерисовывается каждый раз (карты, строки заданий): анимация идёт по часам, а не заново
function inkAttr(key, delay) { const ago = bornAgo(key); return ago < INK + delay + 100 ? ` data-ink style="--inkd:${Math.round(delay - ago)}ms"` : ''; }
function brush(el, delay = 0) {
  if (!el || el.hidden) return;
  el.removeAttribute('data-ink'); void el.offsetWidth;
  el.style.setProperty('--inkd', delay + 'ms'); el.setAttribute('data-ink', '');
  clearTimeout(el._inkT); el._inkT = setTimeout(() => el.removeAttribute('data-ink'), INK + delay + 80);
}
function inkAll() {
  let d = 0;
  brush($('codetag'), d); d += 260; brush($('joinhint'), d); d += 200;
  document.querySelectorAll('#players .mc').forEach((c) => { brush(c, d); d += 380; });
  brush($('goalsign'), d); d += 320;
  const mb = document.querySelector('#hudR .mapbox'); brush(mb, d);
  for (const k in born) if (k.startsWith('room:')) delete born[k];   // карта: комнаты дорисовываются пером вслед за листом
  setTimeout(() => { if (state.map) drawMap(); }, d + 500); d += 360;
  brush($('questnote'), d); d += 340; brush($('hudD'), d); d += 260; brush($('plate'), d);
  $('app').classList.remove('inkwait');
}
function inkMap(svg) {
  [...svg.querySelectorAll('g.room')].forEach((g, i) => {
    const key = 'room:' + g.dataset.room + ':' + (g.getAttribute('class') || '').replace(/\b(on|can|cur)\b/g, '').trim();
    const ago = bornAgo(key);
    if (ago > 1800) return;
    const r = g.querySelector('rect'); if (!r) return;
    r.setAttribute('pathLength', '100');
    g.classList.add('pen'); g.style.setProperty('--pd', Math.round(i * 90 - ago) + 'ms');
  });
}

// карта монстра по мастеру A: лицо (портрет, имя, здоровье, вещи с собой) и оборот (умения, кости, все вещи)
const looking = {}, lookT = {};
function monsterCard(p, m, img) {
  const it = (i) => (m.items || [])[i];
  const gear = (p.gear || []).map(it).filter(Boolean);
  const ic = (x) => (x ? `<img src="/img/items/${esc(x.kind)}.webp" alt="${esc(x.name)}" title="${esc(x.name)}">` : '');
  const sk = (m.skills || []).slice(0, 3);
  return `<div class="mc ${looking[p.pid] ? 'flip' : ''} ${listening.has(p.pid) ? 'live' : ''}"${inkAttr('mc:' + p.pid, 0)} data-pid="${esc(p.pid)}" title="${esc(m.name)} · ${esc(m.title || '')}${p.online ? '' : ' · не в сети'}"><div class="mc-in">
    <div class="mc-f" data-plate="card" data-seed="${esc(p.pid)}"><i class="pt" ${img}>${p.pv ? '' : esc(m.name[0] || '?')}</i><b class="nm">${esc(m.name)}</b><span class="hpv">${m.hp}</span><span class="bn"><img src="/img/items/bone.webp" alt="">${p.bones || 0}</span>${[0, 1, 2].map((k) => `<span class="it it${k + 1}">${ic(gear[k])}</span>`).join('')}</div>
    <div class="mc-b" data-plate="card-back" data-seed="${esc(p.pid)}"><i class="md" ${img}></i><span class="st st1">${m.hp}</span><span class="st st2">${p.bones || 0}</span><span class="st st3">${gear.length}</span>${sk.map((x, k) => `<span class="sk sk${k + 1}">${esc(x.name)} · ${esc(x.die)}</span>`).join('')}${[0, 1, 2, 3, 4, 5].map((k) => `<span class="sl sl${k + 1} ${(p.gear || []).includes(k) ? 'on' : ''}">${ic(it(k))}</span>`).join('')}</div>
  </div></div>`;
}
function look(pid, on) {
  looking[pid] = !!on;
  clearTimeout(lookT[pid]);
  if (on) lookT[pid] = setTimeout(() => look(pid, false), 20000);   // сам вернётся лицом через 20 с
  const c = document.querySelector(`#players .mc[data-pid="${CSS.escape(pid)}"]`);
  if (c) c.classList.toggle('flip', !!on);
}
function addLog(who, text) {
  const d = document.createElement('div'); d.innerHTML = `<b>${esc(who)}</b> ${esc(text)}`;
  $('log').appendChild(d); while ($('log').children.length > 3) $('log').firstChild.remove();
}
$('start').addEventListener('click', () => { send({ t: 'start' }); $('start').hidden = true; });
function showAsk(roll) { $('ask').textContent = roll ? `${roll.who}: бросай ${roll.die} — ${roll.why}` : ''; }

// ---------- картинка места и карта ----------
// «дубль» гравюры: штрихи слегка сдвигаются 9 раз в секунду, как в рисованной анимации
if (!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { let bs = 1; setInterval(() => { const n = document.getElementById('boil-n'); if (n && !$('scenecard').hidden) n.setAttribute('seed', String(bs = bs % 7 + 1)); }, 110); }
let sceneShown = '';
// режиссёр: что сейчас главное на экране — под каждое своя раскладка
let focusT = 0;
function direct(kind, pid) {
  const st = $('stage'), map = { 'лич': 'f-lich', 'место': 'f-place', 'кубик': 'f-dice' };
  clearTimeout(focusT);
  st.classList.remove('f-lich', 'f-place', 'f-dice'); document.body.classList.remove('f-map'); $('spot').hidden = true; $('scenecard').classList.remove('big');
  if (!kind) return;
  let hold = 6000;
  if (kind === 'место') { if ($('scenecard').hidden) return; $('scenecard').classList.add('big'); st.classList.add('f-place'); hold = 6500; }
  else if (map[kind]) { st.classList.add(map[kind]); if (kind === 'кубик') hold = 9000; }
  else if (kind === 'карта') document.body.classList.add('f-map');
  else if (kind === 'монстр') {
    const p = (state.players || []).find((x) => x.pid === pid);
    if (!p || !p.monster) return;
    $('spot').querySelector('i').style.backgroundImage = p.pv ? `url(/api/portrait?room=${room}&pid=${p.pid}&v=${p.pv})` : '';
    $('spot').querySelector('b').textContent = p.monster.name;
    $('spot').hidden = false;
    document.querySelectorAll('#players [data-pid]').forEach((c) => c.classList.toggle('live', c.dataset.pid === pid));
  }
  focusT = setTimeout(() => direct(''), hold);
}

// картинка места становится фоном за личом: стол и свеча остаются, камера медленно едет
let bgOn = false, bgCur = 0;
function setBg(url, hot) {
  const a = [$('bg-a'), $('bg-b')], nx = a[1 - bgCur], pre = new Image();
  pre.onload = () => { nx.src = url; $('bgscene').dataset.hot = hot || 'центр'; nx.classList.add('on'); a[bgCur].classList.remove('on'); bgCur = 1 - bgCur; bgOn = true; };
  pre.src = url;
}

window.NKDebug = { setBg, direct };
function showScene(m, fresh) {
  $('scenecard').dataset.hot = m.hot || ((state.places || [])[m.i] || {}).hot || 'центр';
  sceneShown = m.i + ':' + m.v;
  const c = $('scenecard');
  c.querySelector('img').src = `/api/scene?room=${room}&i=${m.i}&v=${m.v}`;
  c.querySelector('b').textContent = m.name;
  c.hidden = false; c.classList.remove('in');
  if (fresh) { void c.offsetWidth; c.classList.add('in'); }
}
$('scenecard').addEventListener('click', () => $('scenecard').classList.toggle('big'));
function drawMap() {
  if (state.map && window.NKMap) {
    const ps = (state.players || []).filter((p) => p.monster).map((p) => ({ name: p.monster.name, img: p.pv ? `/api/portrait?room=${room}&pid=${encodeURIComponent(p.pid)}&v=${p.pv}` : '' }));
    const svg = $('map'); svg.setAttribute('viewBox', `0 0 ${NKMap.size} ${NKMap.size}`); svg.classList.add('rooms');
    svg.innerHTML = NKMap.draw(state.map, { players: ps });
    inkMap(svg);
    return;
  }
  const P = state.places || [], E = state.edges || [], cur = state.cur || 0, paths = state.paths || [];
  // раскладка: тропа змейкой сверху вниз, как разрез подземелья
  const pos = P.map((_, i) => { const row = Math.floor(i / 3), col = i % 3; const x = 34 + (row % 2 ? 2 - col : col) * 66 + (i % 2 ? 6 : -4); return [x, 26 + row * 44 + (col === 1 ? 8 : 0)]; });
  let h = '<defs><pattern id="mh" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#14100c" stroke-width=".6" opacity=".35"/></pattern></defs>';
  E.forEach(([a, b]) => { if (pos[a] && pos[b]) { const [x1, y1] = pos[a], [x2, y2] = pos[b]; h += `<path d="M${x1} ${y1}Q${(x1 + x2) / 2 + 8} ${(y1 + y2) / 2 - 8} ${x2} ${y2}" fill="none" stroke="#f6ecd3" stroke-width="9" stroke-linecap="round"/><path d="M${x1} ${y1}Q${(x1 + x2) / 2 + 8} ${(y1 + y2) / 2 - 8} ${x2} ${y2}" fill="none" stroke="#14100c" stroke-width="1.6" stroke-dasharray="4 3"/>`; } });
  if (pos[cur]) paths.forEach((t, k) => { const [x, y] = pos[cur], a = (-0.5 + k * 0.5) * 1.1 + 0.6, x2 = Math.max(20, Math.min(180, x + Math.cos(a) * 34)), y2 = Math.min(198, y + Math.sin(a) * 30 + 8); h += `<path d="M${x} ${y}L${x2} ${y2}" stroke="#964f05" stroke-width="1.4" stroke-dasharray="2 3"/><circle cx="${x2}" cy="${y2}" r="4" fill="#f6ecd3" stroke="#964f05" stroke-width="1.4"/><text x="${x2}" y="${y2 + 12}" text-anchor="middle" style="fill:#964f05">${esc(t)}?</text>`; });
  P.forEach((p, i) => { const [x, y] = pos[i], on = i === cur; h += `<circle cx="${x}" cy="${y}" r="${on ? 11 : 8}" fill="#f6ecd3" stroke="#14100c" stroke-width="2"/><circle cx="${x}" cy="${y}" r="${on ? 6 : 3.5}" fill="${on ? '#0f8f80' : '#14100c'}" ${on ? 'class="cur"' : ''}/><text x="${x}" y="${y - 13}" text-anchor="middle">${esc(p.name)}</text>`; });
  $('map').innerHTML = h;
}

// ---------- вещь в подарок: карточка по центру, потом летит к монстру ----------
const giftQ = [];
let giftBusy = false;
function showGift(m) { giftQ.push(m); if (!giftBusy) nextGift(); }
function nextGift() {
  const m = giftQ.shift(); if (!m) { giftBusy = false; return; }
  giftBusy = true;
  const box = $('giftfx');
  const c = document.createElement('div'); c.className = 'giftcard';
  if (m.seal) {
    const p = (state.players || []).find((x) => x.pid === m.pid) || {}, mo = p.monster || {};
    const img = p.pv ? `style="background-image:url('/api/portrait?room=${room}&pid=${encodeURIComponent(p.pid)}&v=${p.pv}')"` : '';
    c.className = 'giftcard sealcard'; c.dataset.pid = m.pid;
    c.innerHTML = `<small>Новый жилец · ${esc(mo.race || '')}</small><div class="ph" ${img}>${p.pv ? '' : esc((mo.name || '?')[0])}</div><b>${esc(mo.name || m.name)}</b><p>${esc(mo.title || '')}</p><p class="ph-q">«${esc(mo.phrase || '')}»</p><span class="stamp">принят<br>в нору</span>`;
    addLog('Лич', 'заселил: ' + (mo.name || m.name));
  } else {
    c.innerHTML = `<small>${esc(m.name)} получает</small><img src="/img/items/${esc(m.item.kind)}.webp" alt=""><b>${esc(m.item.name)}</b><p>${esc(m.item.desc)}</p>`;
    addLog(m.name, 'получил: ' + m.item.name);
  }
  box.appendChild(c);
  setTimeout(() => {
    const card = document.querySelector(`#players [data-pid="${CSS.escape(m.pid)}"]`);
    if (card) {
      const a = c.getBoundingClientRect(), b = card.getBoundingClientRect();
      c.style.setProperty('--fx', (b.left + b.width / 2 - (a.left + a.width / 2)) + 'px');
      c.style.setProperty('--fy', (b.top + b.height / 2 - (a.top + a.height / 2)) + 'px');
    } else { c.style.setProperty('--fx', '-60vw'); c.style.setProperty('--fy', '0px'); }
    c.classList.add('fly');
    setTimeout(() => { c.remove(); if (card) { card.classList.add('live'); setTimeout(() => card.classList.remove('live'), 900); } nextGift(); }, 720);
  }, m.seal ? 4600 : 3600);
}

// ---------- кости: лич награждает — кость с числом вылетает и летит в карточку монстра ----------
const bonesWord = (n) => { const k = Math.abs(n) % 100, d = k % 10; return Math.abs(n) + ' ' + (k > 10 && k < 20 ? 'костей' : d === 1 ? 'кость' : d >= 2 && d <= 4 ? 'кости' : 'костей'); };
function showBones(m) {
  const box = $('giftfx');
  const c = document.createElement('div'); c.className = 'bonefx' + (m.n < 0 ? ' pay' : '');
  c.innerHTML = `<img src="/img/items/bone.webp" alt=""><b>${m.n > 0 ? '+' : '−'}${esc(bonesWord(m.n))}</b><small>${esc(m.name)}${m.why ? ' · ' + esc(m.why) : ''}</small>`;
  box.appendChild(c);
  addLog(m.name, (m.n > 0 ? 'получил ' : 'отдал ') + bonesWord(m.n));
  setTimeout(() => {
    const card = document.querySelector(`#players [data-pid="${CSS.escape(m.pid)}"]`);
    if (card) { const a = c.getBoundingClientRect(), b = card.getBoundingClientRect(); c.style.setProperty('--fx', (b.left + b.width / 2 - (a.left + a.width / 2)) + 'px'); c.style.setProperty('--fy', (b.top + b.height / 2 - (a.top + a.height / 2)) + 'px'); }
    else { c.style.setProperty('--fx', '-60vw'); c.style.setProperty('--fy', '0px'); }
    c.classList.add('fly');
    setTimeout(() => { c.remove(); if (card) { const bn = card.querySelector('.bn'); if (bn) { bn.classList.remove('pop'); void bn.offsetWidth; bn.classList.add('pop'); } } }, 720);
  }, 2400);
}
// «браво» с телефона — на табличке реплики на секунду проступает штамп
let lastUp = {};
function stampVote(m) {
  if (m.id !== lastLichId || (m.up || 0) <= (lastUp[m.id] || 0)) { lastUp[m.id] = m.up || 0; return; }
  lastUp[m.id] = m.up;
  const s = document.createElement('div'); s.className = 'bravo'; s.textContent = m.up > 1 ? 'Браво ×' + m.up : 'Браво!';
  $('plate').appendChild(s); setTimeout(() => s.remove(), 1800);
}

// ---------- живые паузы: полминуты тишины — просим лича что-нибудь сделать (сервер пускает не чаще раза в 2 минуты) ----------
let quietSince = performance.now();
function hush() { quietSince = performance.now(); }
setInterval(() => {
  const now = performance.now();
  if (!state.started || speaking || thinking || listening.size || (window.NKDice && NKDice.busy && NKDice.busy())) { if (speaking || thinking || listening.size) quietSince = now; return; }
  if (now - quietSince > 30000) { quietSince = now; send({ t: 'idle' }); }
}, 1000);

// ---------- голос и липсинк ----------
let curAudio = null, lineText = '', lineDur = 0, lineT0 = 0;
function showLine(text, live) { lineText = text; if (!live) { $('said').textContent = text; $('rest').textContent = ''; } }
function stopSpeak() { speakSeq++; if (curAudio) { try { curAudio.pause(); } catch { /* ok */ } curAudio = null; } speaking = false; level = 0; if (lineText) { $('said').textContent = lineText; $('rest').textContent = ''; } }

// подхваты: короткие фразы, записанные заранее, чтобы не было тишины, пока лич думает
const QUIPS = {
  roll: ['Ну, посмотрим, что там у тебя.', 'Кати, кати, не тяни.', 'Кости не врут. В отличие от тебя.', 'Ох, сейчас будет смешно.', 'Давай, удиви старика.'],
  think: ['Хм. Дай подумать.', 'Так-так-так.', 'Гниль да плесень. Любопытно.', 'Погоди, не торопи старика.'],
};
const quipBlob = {};
let lastQuip = '';
async function loadQuips() {
  let cache = null; try { cache = await caches.open('nk-quips-2'); } catch { /* без кэша */ }
  for (const text of [...QUIPS.roll, ...QUIPS.think]) {
    try {
      const key = '/quip/' + encodeURIComponent(text);
      let r = cache && await cache.match(key);
      if (!r) {
        r = await fetch('/api/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
        if (!r.ok) return;                      // голос не настроен — подхватов не будет
        if (cache) await cache.put(key, r.clone());
      }
      quipBlob[text] = await r.blob();
    } catch { return; }
  }
}
function quip(kind) {
  if (speaking) return;
  const pool = QUIPS[kind].filter((t) => quipBlob[t] && t !== lastQuip);
  if (!pool.length) return;
  lastQuip = pool[Math.floor(Math.random() * pool.length)];
  speak(lastQuip, quipBlob[lastQuip]);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// сказать фразу и дождаться конца. blob — готовый голос, 'mute' — только текстом
async function sayLine(text, blob) {
  await speak(text, blob || 'mute');
  const my = speakSeq;
  while (speaking && my === speakSeq) await sleep(80);
  return my === speakSeq;
}

async function speak(text, ready) {
  const overQuip = !ready && curAudio && curAudio.quip && !curAudio.ended;
  if (!overQuip) stopSpeak();
  const my = ++speakSeq;
  if (!overQuip) { lineText = text; $('said').textContent = ''; $('rest').textContent = text; }
  if (!ready) thinking = true;
  let blob = ready instanceof Blob ? ready : null;
  if (!ready) try {
    const r = await fetch('/api/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    if (r.ok) blob = await r.blob(); else err('Голос: ' + (await r.text()).slice(0, 140));
  } catch (e) { err('Голос не ответил: ' + e.message); }
  if (overQuip) { const q = curAudio; for (let i = 0; i < 40 && q && q === curAudio && !q.ended && !q.paused; i++) await sleep(80); if (my === speakSeq) { stopSpeak(); speakSeq = my; lineText = text; $('said').textContent = ''; $('rest').textContent = text; } }
  if (my !== speakSeq) return;
  if (!ready) thinking = false;
  if (!blob) {            // без голоса: показываем текст и шевелим ртом по таймеру
    speaking = true; lineT0 = performance.now(); lineDur = Math.max(1.5, text.length / 15); curAudio = null;
    setTimeout(() => { if (my === speakSeq) { speaking = false; $('said').textContent = text; $('rest').textContent = ''; $('mood').textContent = 'ждёт'; } }, lineDur * 1000);
    return;
  }
  const a = new Audio(URL.createObjectURL(blob));
  a.quip = ready instanceof Blob;
  curAudio = a;
  try { if (audioCtx) { if (audioCtx.state === 'suspended') await audioCtx.resume(); audioCtx.createMediaElementSource(a).connect(analyser); } } catch { /* играем напрямую */ }
  a.onloadedmetadata = () => { if (isFinite(a.duration)) lineDur = a.duration; };
  a.onended = a.onerror = () => { if (window.NKSound) NKSound.duck(false); if (my === speakSeq) { hush(); speaking = false; curAudio = null; level = 0; $('said').textContent = text; $('rest').textContent = ''; $('mood').textContent = 'ждёт'; } };
  if (!audioCtx || !window.NKSound) a.volume = Math.min(1, (window.NKSound ? NKSound.get().voice : 1));
  if (window.NKSound) NKSound.duck(true);
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

// ролики лича: у всех первый и последний кадр — одна и та же поза, поэтому режем встык, без растворения.
const CLIPS = { idle: ['idle1', 'idle2'], talk: ['talk1', 'talk2'], gest: ['map', 'point', 'dice', 'give', 'laugh', 'angry', 'think', 'listen', 'sixseven'] };
const clipUrl = {};
const vv = [$('v-a'), $('v-b')];
let videoOk = false, talkHold = 0, cur = 0, curClip = '', nextClip = '', gestQ = [], lastIdle = '';
const fx = createFx($('stage'));
function loadClip(n) {
  fx.loadTrack(n, '/video/' + n + '.track.json');
  return fetch('/video/' + n + '.webm').then((r) => (r.ok ? r.blob() : null)).then((b) => { if (b) clipUrl[n] = URL.createObjectURL(b); }).catch(() => {});
}
function pickNext() {
  while (gestQ.length) { const g = gestQ.shift(); if (clipUrl[g]) return g; }
  const pool = (speaking ? CLIPS.talk : CLIPS.idle).filter((n) => clipUrl[n]);
  if (!pool.length) return curClip;
  let n = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && n === lastIdle) n = pool[(pool.indexOf(n) + 1) % pool.length];
  lastIdle = n; return n;
}
// следующий ролик заранее стоит на первом кадре под текущим
function cue() {
  nextClip = pickNext();
  const v = vv[1 - cur];
  if (v.dataset.clip !== nextClip) { v.dataset.clip = nextClip; v.src = clipUrl[nextClip]; v.load(); } else { try { v.currentTime = 0; } catch { /* ещё не готов */ } }
}
function swap() {
  const a = vv[cur], b = vv[1 - cur];
  b.playbackRate = 1; b.play().then(() => { b.classList.add('on'); a.classList.remove('on'); a.pause(); cur = 1 - cur; curClip = nextClip; cue(); }).catch(() => { a.currentTime = 0; a.play().catch(() => {}); });
}
vv.forEach((v) => v.addEventListener('ended', () => { if (v === vv[cur]) swap(); }));
// жест: встаёт в очередь и начинается, когда текущий ролик дойдёт до общей позы
function gesture(name) {
  if (!videoOk || !clipUrl[name] || curClip === name || gestQ.includes(name)) return;
  gestQ = [name];
  if (!CLIPS.gest.includes(nextClip)) cue();
}
function stopGesture(only) { gestQ = gestQ.filter((g) => only && !only.includes(g)); if (CLIPS.gest.includes(nextClip) && (!only || only.includes(nextClip))) cue(); }
function startVideo() {
  const first = Promise.all([loadClip('idle1'), loadClip('idle2')]);
  [...CLIPS.talk, ...CLIPS.gest].forEach(loadClip);
  loadQuips();
  first.then(() => {
    if (!clipUrl.idle1) return;
    const v = vv[0]; curClip = 'idle1'; v.dataset.clip = 'idle1'; v.src = clipUrl.idle1;
    return Promise.all([$('v-cave').play(), v.play()]).then(() => { v.classList.add('on'); videoOk = true; $('stage').classList.add('video'); cue(); });
  }).catch(() => { videoOk = false; });
}

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
    const v = vv[cur];
    const rate = CLIPS.gest.includes(curClip) ? 1 : (gestQ.length || CLIPS.talk.includes(curClip) !== !!speaking) ? 1.6 : 1;
    if (v.playbackRate !== rate) v.playbackRate = rate;
    // начал или кончил говорить — следующим ставим ролик под новое состояние
    if (!gestQ.length && !CLIPS.gest.includes(nextClip) && CLIPS.talk.includes(nextClip) !== !!speaking) cue();
    { const L = fx.light, fl = 0.94 + 0.06 * Math.sin(now / 53) * Math.sin(now / 131); $('bgscene').style.filter = $('v-cave').style.filter = `brightness(${((0.34 + 0.78 * L) * fl).toFixed(3)}) sepia(${(0.25 * (1 - L)).toFixed(2)})`; vv[cur].style.filter = `brightness(${((0.6 + 0.45 * L) * (0.97 + 0.03 * Math.sin(now / 53))).toFixed(3)})`; }
    fx.step(now, dt, { enabled: true, active: curClip, time: v.currentTime, speaking, level, listening: listening.size > 0, thinking, blink: !speaking && now < blinkUntil, mood: speaking ? mood : '', ...(intro ? { dim: iv.dim, eyesOff: !iv.eyes, eyeBoost: iv.boost } : {}) });
  }
  drawIntro();
  $('stage').classList.toggle('hear', !speaking && listening.size > 0);
  $('stage').classList.toggle('muse', !speaking && !listening.size && thinking);
  NKDice.step(now, dt);
  requestAnimationFrame(frame);
}

// ---------- интро: темнота → свеча → череп и огонь в глазницах → четыре фразы → «Ты кто такой?» ----------
// Не видеофайл: те же слои, что и в игре (пещера, ролики лича, свет fx.js), поверх — шторка темноты.
let intro = null, introDone = false;
const iv = { holeC: 0, holeS: 0, dim: 0.12, lift: 1, boost: 1, eyes: false };   // что сейчас на сцене
const ease = (k) => (k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k));
function tween(key, to, ms) {
  const from = iv[key], t0 = performance.now(), me = intro;
  return new Promise((done) => {
    const tick = () => { if (intro !== me || !me) return done(); const k = ease((performance.now() - t0) / ms); iv[key] = from + (to - from) * k; if (k >= 1) done(); else requestAnimationFrame(tick); };
    tick();
  });
}
function maybeIntro() {
  if (intro || introDone) return;
  if (state.started || state.intro === 'done' || (state.players || []).some((p) => p.monster)) { introDone = true; return; }
  runIntro();
}
async function runIntro() {
  const me = intro = { t0: performance.now() };
  const alive = () => intro === me;
  Object.assign(iv, { holeC: 0, holeS: 0, dim: 0.12, lift: 1, boost: 1, eyes: false });
  $('stage').classList.add('intro');
  $('said').textContent = ''; $('rest').textContent = '';
  send({ t: 'intro', on: true });
  // 1. темно, ждём, пока загрузятся ролики (не дольше 5 с)
  for (let i = 0; i < 50 && !videoOk && alive(); i++) await sleep(100);
  await sleep(700); if (!alive()) return;
  // 2. свеча разгорается
  tween('dim', 0.55, 2600); await tween('holeC', 0.24, 2600); if (!alive()) return;
  // 3. лич поднимает череп из темноты, в глазницах вспыхивает огонь
  tween('lift', 0, 1800); await tween('holeS', 0.2, 1500); if (!alive()) return;
  iv.eyes = true; iv.boost = 3.2; tween('boost', 1, 1600); await sleep(900); if (!alive()) return;
  // пещера проявляется целиком
  tween('dim', 1, 1800); tween('holeS', 1.7, 1800); await tween('holeC', 1.7, 1800); if (!alive()) return;
  // 4. голос
  await Promise.race([introVoice, sleep(2500)]);
  $('stage').classList.add('talking');
  const L = Q.INTRO;
  for (let i = 0; i < L.length && alive(); i++) {
    const blob = voiceDead ? null : await Promise.race([voiceFor(L[i]), sleep(1500).then(() => null)]);
    if (!alive()) return;
    if (i === L.length - 1) { send({ t: 'intro', on: false }); gesture('point'); }   // на телефонах открывается первый вопрос
    const p = sayLine(L[i], blob);
    if (i === L.length - 2) {             // жест «point» встаёт в очередь заранее, чтобы рука вышла на «Ты кто такой?»
      (async () => { while (alive() && speaking) { const t = curAudio ? curAudio.currentTime : (performance.now() - lineT0) / 1000; if (lineDur - t < 1.6) { gesture('point'); break; } await sleep(80); } })();
    }
    await p; if (alive()) await sleep(i === 1 ? 600 : 380);
  }
  if (alive()) finishIntro(true);
}
function finishIntro(natural) {
  if (!intro) return;
  intro = null; introDone = true;
  Object.assign(iv, { holeC: 2, holeS: 2, dim: 1, lift: 0, boost: 1, eyes: true });
  $('stage').classList.remove('intro', 'talking');
  setTimeout(inkAll, 250);   // после интро интерфейс прорисовывается кистью
  vv.concat([...$('stage').querySelectorAll('canvas.fx')]).forEach((e) => { e.style.transform = ''; });
  const ctx = $('introc').getContext('2d'); ctx.clearRect(0, 0, $('introc').width, $('introc').height);
  send({ t: 'intro', on: false });
  if (!natural) stopSpeak();
  const nobody = !(state.players || []).length;
  lineText = nobody ? 'Ну? Наведи телефон на код слева — и отвечай, кто ты такой.' : 'Ты кто такой? Отвечай с телефона.';
  if (!speaking) { $('said').textContent = lineText; $('rest').textContent = ''; }
  pumpSay();
}
function skipIntro() { if (intro) finishIntro(false); }
$('stage').addEventListener('click', () => { if (intro) skipIntro(); });
addEventListener('keydown', () => { if (intro) skipIntro(); });

// шторка темноты: вырезаем свет у свечи и у черепа
function drawIntro() {
  const c = $('introc');
  if (!intro) return;
  const r = c.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2), W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
  g.fillStyle = '#050302'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  const fl = 0.92 + 0.08 * Math.sin(performance.now() / 47) * Math.sin(performance.now() / 113);
  const hole = (x, y, rad) => { if (rad <= 0.002) return; const R = rad * W * fl, gr = g.createRadialGradient(x * W, y * H, R * 0.15, x * W, y * H, R); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
  hole(0.909, 0.622, Math.max(0.012, iv.holeC));          // свеча (координаты как в fx.js)
  hole(0.5, 0.33, iv.holeS);                              // череп
  g.globalCompositeOperation = 'source-over';
  // череп поднимается: ролик лича и его свет вместе съезжают вверх на место
  const tf = iv.lift > 0.001 ? `translateY(${(iv.lift * 5).toFixed(2)}%)` : '';
  vv.concat([...$('stage').querySelectorAll('canvas.fx')]).forEach((e) => { if (e.style.transform !== tf) e.style.transform = tf; });
}

// ---------- анкета: лич отвечает каждому по очереди ----------
const sayQ = [];
let sayBusy = false;
function onQuizSay(m) {
  if (m.kind === 'q') {
    const q = Q.Q[(m.step || 1) - 1]; if (!q) return;
    if (sayQ.length || speaking || intro) return;        // вопрос и так написан на телефоне — не перебиваем ответы
    sayQ.push({ text: q.q, name: m.name });
  } else {
    // игроки отвечают быстрее, чем лич говорит: старый несказанный отклик этому же игроку выбрасываем
    for (let i = sayQ.length - 1; i >= 0; i--) if (sayQ[i].pid === m.pid && !sayQ[i].seal) sayQ.splice(i, 1);
    sayQ.push({ text: m.text, name: m.name, pid: m.pid });
  }
  pumpSay();
}
async function pumpSay() {
  if (sayBusy || intro) return;
  sayBusy = true;
  try {
    while (sayQ.length && !intro) {
      for (let i = 0; i < 120 && speaking; i++) await sleep(100);
      const it = sayQ.shift();
      $('tab').textContent = it.name ? 'ЛИЧ → ' + String(it.name).toUpperCase() : 'ЛИЧ';
      if (!it.seal && sayQ.length > 2) continue;           // очередь длинная — пропускаем, текст и так на телефоне
      if (it.seal) { /* карточка уже показана */ }
      else if (Math.random() < 0.3) gesture(Math.random() < 0.5 ? 'laugh' : 'think');
      const blob = await Promise.race([voiceFor(it.text), sleep(2500).then(() => null)]);
      await sayLine(it.text, blob);
      await sleep(250);
    }
  } finally { sayBusy = false; $('tab').textContent = 'ЛИЧ'; }
}

// ---------- кубики ----------
function initDice() {
  const rack = $('rack');
  NKDice.DICE.forEach((d, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', d.id); b.innerHTML = window.NKUI ? NKUI.die(d.id) : d.id;
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

// ---------- громкость: голос лича и атмосфера; с экрана и с телефона ----------
(function () {
  if (!window.NKSound) return;
  const v = $('v-voice'), a = $('v-amb');
  const show = (x) => { v.value = Math.round(x.voice * 100); a.value = Math.round(x.amb * 100); };
  show(NKSound.get());
  NKSound.onchange = (x) => { show(x); send({ t: 'vol_state', voice: x.voice, amb: x.amb }); };
  v.addEventListener('input', () => NKSound.set({ voice: v.value / 100 }));
  a.addEventListener('input', () => NKSound.set({ amb: a.value / 100 }));
})();
