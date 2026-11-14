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
  }

  // ---------- экраны ----------
  function render() {
    if (!me) return;
    if (me.making) return show('wait');
    if (me.monster && !wantRemake) { drawSheet(); if (state.lich) showLich(state.lich.text, state.lich.roll); return show('play'); }
    if ($('v-legend').hidden && $('v-race').hidden) show('race');
  }

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
    wantRemake = false; err('');
    send({ t: 'make', race: race.id, legend: $('legend').value.trim() });
    show('wait');
  });
  $('remake').addEventListener('click', function () { wantRemake = true; show('race'); });

  function drawSheet() {
    var m = me.monster;
    var img = me.pv ? ' style="background-image:url(\'/api/portrait?room=' + room + '&pid=' + encodeURIComponent(pid) + '&v=' + me.pv + '\')"' : '';
    $('sheet').innerHTML =
      '<div class="top"><div class="ph"' + img + '>' + (me.pv ? '' : esc(m.name.charAt(0))) + '</div><div><h2>' + esc(m.name) + '</h2><div class="t">' + esc(m.title) + ' · ' + esc(m.race) + '</div><div class="hp">здоровье ' + m.hp + '</div><div class="t">' + esc((m.traits || []).join(' · ')) + '</div></div></div>' +
      (m.skills || []).map(function (s, i) { return '<div class="sk"><div><b>' + esc(s.name) + '</b><br>' + esc(s.desc) + '</div><button type="button" data-sk="' + i + '">' + esc(s.die) + '</button></div>'; }).join('') +
      '<div class="weak"><b>Слабость:</b> ' + esc(m.weakness) + '<br><span class="hand">«' + esc(m.phrase) + '»</span></div>';
  }
  $('sheet').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sk]'); if (!b || !me || !me.monster) return;
    var s = me.monster.skills[Number(b.dataset.sk)];
    send({ t: 'say', text: 'Использую умение «' + s.name + '».' });
    send({ t: 'roll', die: s.die });
  });

  function showLich(text, roll) {
    $('lich').innerHTML = '<span class="who">ЛИЧ</span>' + esc(text);
    var mine = roll && (!roll.pid || roll.pid === pid);
    lastAsk = mine ? roll : null;
    $('ask').className = 'btn' + (mine ? ' on' : '');
    $('ask').textContent = mine ? 'Лич просит: брось ' + roll.die + ' — ' + roll.why : '';
  }
  $('ask').addEventListener('click', function () { if (lastAsk) { send({ t: 'roll', die: lastAsk.die }); $('ask').className = 'btn'; lastAsk = null; } });

  DICE.forEach(function (d) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = d;
    b.addEventListener('click', function () { send({ t: 'roll', die: d }); });
    $('dice').appendChild(b);
  });
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
