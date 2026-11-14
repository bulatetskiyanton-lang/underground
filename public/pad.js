// Пульт: вход по коду, создание монстра, разговор с личом голосом, броски.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var store = { get: function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ок */ } } };

  var RACES = [
    { id: 'Орк', hint: 'сильный, громкий, обидчивый', legends: ['Меня выгнали из орды за то, что я плакал над убитым кабаном. Теперь качаю мышцы и пишу стихи.', 'Я бывший вышибала в таверне для героев. Знаю все их слабости и пароль от погреба.'] },
    { id: 'Гоблин', hint: 'мелкий, хитрый, ворует ложки', legends: ['Я коллекционирую ложки. У меня их четыреста. Ради серебряной полезу хоть к дракону.', 'Меня трижды продавали в рабство, и трижды я продавал покупателя дороже.'] },
    { id: 'Скелет', hint: 'сухой, вежливый, рассыпается', legends: ['При жизни я был бухгалтером. После смерти тоже. Считаю чужие кости и свои обиды.', 'Меня подняли по ошибке вместо соседа. Некромант извинился и ушёл. Я остался.'] },
    { id: 'Кикимора', hint: 'болотная бабка, варит и сглаживает', legends: ['Я варю варенье из мухоморов и сглаживаю всех, кто не доел. Внуков нет, есть пиявки.', 'Моё болото осушили под замок героя. Теперь я живу в его подвале и порчу ему вино.'] },
    { id: 'Слизень', hint: 'липкий, добрый, всё переваривает', legends: ['Я съел волшебную книгу и теперь иногда говорю заклинаниями. Не всегда к месту.', 'Меня держали как питомца у мага. Маг пропал. Я не при чём. Почти.'] },
    { id: 'Крысолюд', hint: 'нервный, быстрый, знает все ходы', legends: ['Я знаю все ходы в подземелье и продаю карты героям. Неправильные.', 'Я сбежал из лаборатории алхимика. У меня светится хвост и чешется совесть.'] }
  ];
  var DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

  NKUI.boot();
  Array.prototype.forEach.call(document.querySelectorAll('[data-ribbon]'), function (e) { e.outerHTML = NKUI.ribbon(esc(e.dataset.ribbon)); });
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.innerHTML = '<span class="medal">' + NKUI.icon(b.dataset.ic) + '</span>' + b.textContent; });
  document.getElementById('talk').innerHTML = NKUI.seal('horn');
  document.getElementById('throw').innerHTML = NKUI.seal('roll');

  var ws = null, room = '', pid = store.get('nk_pid'), state = null, me = null, race = null, wantRemake = false, lastAsk = null;
  var err = function (t) { $('err').textContent = t || ''; };
  var show = function (v) { ['join', 'race', 'legend', 'wait', 'play'].forEach(function (n) { $('v-' + n).hidden = n !== v; }); };

  // ---------- вход ----------
  $('name').value = store.get('nk_name');
  $('room').value = (new URLSearchParams(location.search).get('room') || store.get('nk_room')).toUpperCase();
  $('join').addEventListener('click', function () {
    var name = $('name').value.trim(), code = $('room').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!name) return err('Напиши имя.');
    if (code.length < 4) return err('Введи код комнаты с экрана.');
    store.set('nk_name', name); store.set('nk_room', code); room = code; err('');
    connect();
  });

  function connect() {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?room=' + room);
    ws.onopen = function () { send({ t: 'hello', role: 'pad', pid: pid, name: store.get('nk_name') }); err(''); };
    ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (e) { return; } onMsg(m); };
    ws.onclose = function () { err('Связь пропала, переподключаюсь…'); setTimeout(connect, 1500); };
  }
  function send(m) { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); } catch (e) { /* нет связи */ } }
  setInterval(function () { send({ t: 'ping' }); }, 20000);

  function onMsg(m) {
    if (m.t === 'you') { pid = m.pid; store.set('nk_pid', pid); }
    else if (m.t === 'state') { state = m; me = (m.players || []).filter(function (p) { return p.pid === pid; })[0] || null; render(); }
    else if (m.t === 'lich') { showLich(m.text, m.roll); }
    else if (m.t === 'make_failed') { err(m.text); wantRemake = true; render(); }
    else if (m.t === 'gift' && m.pid === pid) { selItem = m.i; ping('gear'); toastGift(m.item); try { navigator.vibrate && navigator.vibrate([30, 60, 30]); } catch (x) { /* ок */ } }
  }

  // ---------- экраны ----------
  var tab = 'sheet', selItem = -1, selDie = 'd20';
  function render() {
    if (!me) return;
    if (me.making) return show('wait');
    if (me.monster && !wantRemake) {
      drawSheet(); drawGear(); drawPaths(); if (state.lich) showLich(state.lich.text, state.lich.roll);
      $('title').textContent = me.monster.name;
      return show('play');
    }
    if ($('v-legend').hidden && $('v-race').hidden) show('race');
  }
  var show0 = show;
  show = function (v) { show0(v); var play = v === 'play'; $('tabs').hidden = !play; document.body.classList.toggle('play', play); if (!play) $('title').textContent = 'Нижний Край'; };

  function setTab(t) {
    tab = t;
    ['sheet', 'gear', 'dice', 'talk'].forEach(function (n) { $('t-' + n).hidden = n !== t; });
    Array.prototype.forEach.call($('tabs').querySelectorAll('button'), function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === t)); if (b.dataset.tab === t) b.classList.remove('ping'); });
    window.scrollTo(0, 0);
  }
  Array.prototype.forEach.call($('tabs').querySelectorAll('button'), function (b) { b.addEventListener('click', function () { setTab(b.dataset.tab); }); });
  function ping(t) { if (tab === t) return; var b = $('tabs').querySelector('[data-tab="' + t + '"]'); if (b) b.classList.add('ping'); }

  RACES.forEach(function (r) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn race';
    b.innerHTML = esc(r.id) + '<small>' + esc(r.hint) + '</small>';
    b.addEventListener('click', function () { race = r; openLegend(); });
    $('races').appendChild(b);
  });
  function openLegend() {
    $('race-title').textContent = race.id + ': твоя легенда';
    $('legends').innerHTML = '';
    race.legends.forEach(function (l) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn leg'; b.textContent = l;
      b.addEventListener('click', function () { $('legend').value = l; });
      $('legends').appendChild(b);
    });
    show('legend');
  }
  $('back-race').addEventListener('click', function () { show('race'); });
  $('make').addEventListener('click', function () {
    if (!race) return show('race');
    wantRemake = false; err(''); selItem = -1;
    send({ t: 'make', race: race.id, legend: $('legend').value.trim() });
    show('wait');
  });
  $('remake').addEventListener('click', function () { wantRemake = true; show('race'); });

  // ---------- лист персонажа ----------
  var SK_IC = ['sword', 'eye', 'star'];
  function drawSheet() {
    var m = me.monster, tr = m.traits || [];
    var img = me.pv ? ' style="background-image:url(\'/api/portrait?room=' + room + '&pid=' + encodeURIComponent(pid) + '&v=' + me.pv + '\')"' : '';
    $('sheet').innerHTML =
      '<div class="portrait"' + img + '>' + (me.pv ? '' : esc(m.name.charAt(0))) + '</div>' +
      NKUI.ribbon(esc(m.name)) +
      '<div class="subtitle">' + esc(m.title) + ' · ' + esc(m.race) + '</div>' +
      '<div class="stats">' +
        '<div class="stat"><span class="medal">' + NKUI.icon('heart') + '</span><b>' + m.hp + '</b>здоровье</div>' +
        '<div class="stat"><span class="medal">' + NKUI.icon('shield') + '</span><b>' + esc(tr[0] || '—') + '</b></div>' +
        '<div class="stat"><span class="medal">' + NKUI.icon('eye') + '</span><b>' + esc(tr[1] || '—') + '</b>' + esc(tr[2] || '') + '</div>' +
      '</div>' +
      (m.skills || []).map(function (s, i) { return '<div class="paper skill"><div class="ibox">' + NKUI.icon(SK_IC[i % 3]) + '</div><div><b>' + esc(s.name) + '</b>' + esc(s.desc) + '</div><button type="button" class="die-btn" data-sk="' + i + '" aria-label="Бросить ' + esc(s.die) + '">' + NKUI.die(s.die) + '</button></div>'; }).join('') +
      '<div class="paper skill weak"><div class="ibox">' + NKUI.icon('skull') + '</div><div><b>Слабость</b>' + esc(m.weakness) + '<br><span class="hand" style="font-size:17px">«' + esc(m.phrase) + '»</span></div></div>';
  }
  $('sheet').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sk]'); if (!b || !me || !me.monster) return;
    var s = me.monster.skills[Number(b.dataset.sk)];
    send({ t: 'say', text: 'Использую умение «' + s.name + '».' });
    send({ t: 'roll', die: s.die, power: 0.5 + Math.random() * 0.4 });
    setTab('talk');
  });

  // ---------- амуниция ----------
  function toastGift(it) {
    var d = document.createElement('button'); d.type = 'button'; d.className = 'gift';
    d.innerHTML = '<img src="/img/items/' + esc(it.kind) + '.webp" alt=""><div><small>Лич дал тебе</small><b>' + esc(it.name) + '</b>' + esc(it.desc) + '</div>';
    d.addEventListener('click', function () { d.remove(); setTab('gear'); });
    document.body.appendChild(d); setTimeout(function () { d.classList.add('out'); setTimeout(function () { d.remove(); }, 500); }, 5200);
  }
  function drawGear() {
    var items = (me.monster && me.monster.items) || [], gear = me.gear || [];
    $('gear-hint').textContent = !items.length ? 'У этого монстра нет вещей. Слепи нового — лич соберёт ему шесть на выбор.' : gear.length < 3 ? 'Возьми с собой три вещи. Взято: ' + gear.length + ' из 3.' : 'Три вещи с тобой. Нажми на вещь и «Использовать».';
    var cells = items.map(function (it, i) { return '<button type="button" class="slot' + (gear.indexOf(i) >= 0 ? ' on' : '') + (i === selItem ? ' sel' : '') + (i === me.fresh ? ' fresh' : '') + '" data-i="' + i + '" aria-label="' + esc(it.name) + '"><img src="/img/items/' + esc(it.kind) + '.webp" alt=""></button>'; });
    var total = Math.max(6, Math.ceil(items.length / 3) * 3);
    for (var k = items.length; k < total; k++) cells.push('<div class="slot empty"></div>');
    $('slots').innerHTML = cells.join('');
    var it = items[selItem], has = gear.indexOf(selItem) >= 0;
    $('detail').innerHTML = it
      ? '<div class="pic"><img src="/img/items/' + esc(it.kind) + '.webp" alt=""></div><div><h3>' + esc(it.name) + '</h3><p>' + esc(it.desc) + '</p><span class="tag">' + (has ? 'с собой' : 'лежит в норе') + (it.gift ? ' · от лича' : '') + '</span></div>'
      : '<div class="none">Нажми на вещь, чтобы рассмотреть.</div>';
    $('take').disabled = !it || (!has && gear.length >= 3);
    $('take').textContent = has ? 'Выложить' : 'Взять';
    $('use').disabled = !it || !has;
    $('askitem').disabled = !it;
    if (items.length && gear.length < 3) ping('gear');
  }
  $('slots').addEventListener('click', function (e) { var b = e.target.closest('button.slot'); if (!b) return; selItem = Number(b.dataset.i); drawGear(); });
  $('take').addEventListener('click', function () {
    var gear = (me.gear || []).slice(), k = gear.indexOf(selItem);
    if (k >= 0) gear.splice(k, 1); else if (gear.length < 3) gear.push(selItem);
    me.gear = gear; drawGear(); send({ t: 'gear', idx: gear });
  });
  $('askitem').addEventListener('click', function () { if (selItem < 0) return; var it = me.monster.items[selItem]; send({ t: 'say', text: 'Лич, что можно сделать с вещью «' + it.name + '»? Где она мне сейчас пригодится?' }); $('heard').textContent = 'Ты спросил про: ' + it.name; setTab('talk'); });
  $('use').addEventListener('click', function () { if (selItem < 0) return; send({ t: 'use', i: selItem }); $('heard').textContent = 'Ты достал: ' + me.monster.items[selItem].name; setTab('talk'); });

  // ---------- кубики: печать зажал — сила копится, отпустил — бросок ----------
  DICE.forEach(function (d, i) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'd' + (d === selDie ? ' on' : ''); b.dataset.d = d;
    b.setAttribute('aria-label', d);
    b.innerHTML = NKUI.die(d);
    b.addEventListener('click', function () { pickDie(d); });
    $('dice').appendChild(b);
  });
  function pickDie(d) { selDie = d; Array.prototype.forEach.call($('dice').children, function (b) { b.classList.toggle('on', b.dataset.d === d); }); $('throw-label').textContent = 'Зажми печать — сила, отпусти — бросок ' + d; }
  var charge = 0, charging = false, chargeT0 = 0, lockUntil = 0;
  function chargeLoop() {
    if (!charging) return;
    var t = (performance.now() - chargeT0) / 1000 * 1.1, ph = t % 2; charge = ph < 1 ? ph : 2 - ph;
    $('pw').style.width = 'calc(' + (charge * 100).toFixed(1) + '% - 10px)';
    requestAnimationFrame(chargeLoop);
  }
  var th = $('throw');
  th.addEventListener('pointerdown', function (e) { e.preventDefault(); if (Date.now() < lockUntil) return; try { th.setPointerCapture(e.pointerId); } catch (x) { /* ок */ } charging = true; chargeT0 = performance.now(); th.classList.add('down'); try { navigator.vibrate && navigator.vibrate(15); } catch (x) { /* ок */ } chargeLoop(); });
  function release() {
    if (!charging) return; charging = false; th.classList.remove('down');
    send({ t: 'roll', die: selDie, power: Math.max(0.15, charge) });
    try { navigator.vibrate && navigator.vibrate([10, 40, 25]); } catch (x) { /* ок */ }
    $('ask').className = 'btn'; lastAsk = null; lockUntil = Date.now() + 2500;
    setTimeout(function () { $('pw').style.width = '0'; }, 400);
  }
  th.addEventListener('pointerup', release); th.addEventListener('pointercancel', release);
  th.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  function drawPaths() {
    var qs = state.quests || []; $('quests').hidden = !qs.length; $('quests').innerHTML = qs.length ? '<small>Задания</small>' + qs.map(function (q) { return '<div class="' + (q.done ? 'done' : '') + '"><i></i><span>' + esc(q.text) + '</span></div>'; }).join('') : '';
    $('goal').hidden = !state.goal; $('goal').innerHTML = state.goal ? '<small>Что делать</small>' + esc(state.goal) : '';
    var ps = state.paths || [];
    $('paths').innerHTML = ps.length ? '<div class="label" style="text-align:center">Куда идём</div>' + ps.map(function (t, i) { return '<button type="button" class="btn" data-p="' + i + '">' + esc(t) + '</button>'; }).join('') : '';
  }
  $('paths').addEventListener('click', function (e) { var b = e.target.closest('button[data-p]'); if (!b) return; var t = (state.paths || [])[Number(b.dataset.p)]; if (!t) return; $('heard').textContent = 'Ты: идём — ' + t; send({ t: 'say', text: 'Идём сюда: ' + t + '.' }); $('paths').innerHTML = ''; });

  // ---------- разговор ----------
  function showLich(text, roll) {
    if ($('lich-text').textContent !== text) { $('lich-text').textContent = text; ping('talk'); }
    var mine = roll && (!roll.pid || roll.pid === pid);
    lastAsk = mine ? roll : null;
    $('ask').className = 'btn' + (mine ? ' on' : '');
    $('ask').textContent = mine ? 'Лич просит: брось ' + roll.die + ' — ' + roll.why : '';
    if (mine) { pickDie(roll.die); ping('dice'); }
  }
  $('ask').addEventListener('click', function () { if (lastAsk) { send({ t: 'roll', die: lastAsk.die }); $('ask').className = 'btn'; lastAsk = null; } });
  $('form').addEventListener('submit', function (e) {
    e.preventDefault(); var v = $('txt').value.trim(); if (!v) return;
    $('txt').value = ''; $('heard').textContent = 'Ты: ' + v; send({ t: 'say', text: v });
  });

  // ---------- голос: запись → распознавание ----------
  var stream = null, rec = null, chunks = [], recT0 = 0, recBtn = null, recDone = null;
  function mime() {
    if (!window.MediaRecorder) return '';
    var list = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return '';
  }
  function startRec(btn, done) {
    if (rec) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) return err('Этот браузер не умеет записывать голос. Пиши текстом.');
    recBtn = btn; recDone = done; btn.classList.add('down');
    var begin = function () {
      if (!btn.classList.contains('down')) return;            // уже отпустил, пока спрашивали разрешение
      chunks = []; var mt = mime();
      try { rec = mt ? new MediaRecorder(stream, { mimeType: mt }) : new MediaRecorder(stream); } catch (e) { rec = null; return err('Запись не запустилась: ' + e.message); }
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () { var type = (rec && rec.mimeType) || mt || 'audio/webm'; rec = null; finishRec(new Blob(chunks, { type: type })); };
      rec.start(); recT0 = Date.now();
      if (btn.id === 'talk') send({ t: 'talking', on: true });
    };
    if (stream) return begin();
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (s) { stream = s; if (btn.classList.contains('down')) begin(); else err('Микрофон включён. Зажми кнопку ещё раз и говори.'); })
      .catch(function () { btn.classList.remove('down'); err('Микрофон запрещён. Разреши его в настройках браузера или пиши текстом.'); });
  }
  function stopRec() {
    if (recBtn) recBtn.classList.remove('down');
    if (recBtn && recBtn.id === 'talk') send({ t: 'talking', on: false });
    if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch (e) { rec = null; } }
  }
  function finishRec(blob) {
    var done = recDone; recDone = null;
    if (Date.now() - recT0 < 350 || blob.size < 800) return err('Слишком коротко. Зажми, скажи и только потом отпускай.');
    err(''); $('heard').textContent = 'Распознаю…';
    fetch('/api/stt', { method: 'POST', headers: { 'content-type': blob.type || 'audio/webm' }, body: blob })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j.error) { $('heard').textContent = ''; return err(j.error); } if (!j.text) { $('heard').textContent = ''; return err('Не расслышал. Попробуй ещё раз, ближе к микрофону.'); } done(j.text); })
      .catch(function (e) { $('heard').textContent = ''; err('Распознавание не ответило: ' + e.message); });
  }
  function hold(btn, done) {
    btn.addEventListener('pointerdown', function (e) { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch (x) { /* ок */ } startRec(btn, done); });
    btn.addEventListener('pointerup', stopRec);
    btn.addEventListener('pointercancel', stopRec);
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  hold($('talk'), function (text) { $('heard').textContent = 'Ты: ' + text; send({ t: 'say', text: text }); });
  hold($('dictate'), function (text) { $('heard').textContent = ''; var a = $('legend'); a.value = (a.value ? a.value + ' ' : '') + text; });

  if ($('room').value && $('name').value && store.get('nk_pid')) { /* вернулся: одно нажатие «Войти» */ }
})();
