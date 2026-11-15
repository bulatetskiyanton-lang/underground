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
  var show = function (v) { ['join', 'intro', 'quiz', 'race', 'legend', 'wait', 'play'].forEach(function (n) { $('v-' + n).hidden = n !== v; }); };

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
    else if (m.t === 'lich') { showLich(m.text, m.roll, m.id); }
    else if (m.t === 'votes' && m.mine && m.mine[pid] != null) { myVote[m.id] = m.mine[pid]; markVote(); }
    else if (m.t === 'bones' && m.pid === pid) { toastBones(m); try { navigator.vibrate && navigator.vibrate(m.n > 0 ? [20, 40, 20, 40, 60] : 40); } catch (x) { /* ок */ } }
    else if (m.t === 'vol_state') { if (document.activeElement !== $('pv-voice')) $('pv-voice').value = Math.round(m.voice * 100); if (document.activeElement !== $('pv-amb')) $('pv-amb').value = Math.round(m.amb * 100); }
    else if (m.t === 'make_failed') { err(m.text); if (oldFlow) wantRemake = true; else { qFailed = true; if (qStep > 5) drawQuiz(); } render(); }
    else if (m.t === 'quiz_c') { qSaid = m.text; qSaidStep = m.step; drawQuizLich(); }
    else if (m.t === 'seal' && m.pid === pid) { sealPop(); }
    else if (m.t === 'gift' && m.pid === pid) { selItem = m.i; ping('gear'); toastGift(m.item); try { navigator.vibrate && navigator.vibrate([30, 60, 30]); } catch (x) { /* ок */ } }
  }

  // ---------- экраны ----------
  var tab = 'sheet', selItem = -1, selDie = 'd20';
  function render() {
    if (!me) return;
    if (sealOpen) return;
    var inQuiz = me.quiz >= 1 && !me.sealed;
    if (!oldFlow && (inQuiz || (!me.monster && !me.making) || wantRemake)) return renderQuiz(inQuiz);
    if (me.making) return show('wait');
    if (me.monster && !wantRemake) {
      drawSheet(); drawGear(); drawPaths(); if (state.lich) showLich(state.lich.text, state.lich.roll, state.lich.id);
      $('title').textContent = me.monster.name;
      return show('play');
    }
    if ($('v-legend').hidden && $('v-race').hidden) show('race');
  }
  var show0 = show;
  show = function (v) { show0(v); var play = v === 'play'; $('tabs').hidden = !play; document.body.classList.toggle('play', play); if (!play) $('title').textContent = 'Underground'; };

  function setTab(t) {
    if ((t === 'sheet') !== (tab === 'sheet') || t === 'sheet') send({ t: 'look', on: t === 'sheet' });
    tab = t;
    ['sheet', 'gear', 'dice', 'talk'].forEach(function (n) { $('t-' + n).hidden = n !== t; });
    if (t === 'dice') NKCup.reset();
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
  $('remake').addEventListener('click', function () { wantRemake = true; render(); });
  $('to-quiz').addEventListener('click', function () { oldFlow = false; render(); });

  // ---------- анкета жильца: пять вопросов, лич отвечает на каждый ----------
  var Q = window.NKQuiz, oldFlow = false, sawIntro = false, introSeenAt = 0, qStep = 0, qSaid = '', qSaidStep = 0, qLoot = null, qFailed = false, sealOpen = false;
  var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  function renderQuiz(inQuiz) {
    // интро идёт на экране — ждём «Ты кто такой?» (но не дольше 50 секунд)
    if (state.intro === 'play' && !inQuiz) {
      if (!sawIntro) { sawIntro = true; introSeenAt = Date.now(); setTimeout(render, 50000); }
      if (Date.now() - introSeenAt < 50000) return show('intro');
    }
    if (!inQuiz) {                           // новая анкета
      wantRemake = false; qFailed = false; qSaid = ''; qSaidStep = 0; qLoot = null; err('');
      me.quiz = 1; me.sealed = false; qStep = 0;
      send({ t: 'quiz_at', step: 1, voice: !sawIntro });
    }
    // шаг только растёт: старое состояние с сервера не откатывает уже отвеченный вопрос
    var want = Math.max(qStep, me.quiz || 1);
    if (want !== qStep) { qStep = want; drawQuiz(); }
    show('quiz');
  }
  function drawQuizLich() {
    var q = Q.Q[qStep - 1];
    var said = qSaid && qSaidStep === qStep - 1 ? '<i>Лич</i>' + esc(qSaid) : qStep === 1 ? (sawIntro ? '<i>Лич</i>Ты кто такой?' : '<i>Лич</i>Новенький? Сейчас запишу. Отвечай быстро, у меня свеча не казённая.') : '<i>Лич</i>…';
    if (qStep > 5) said = qSaid && qSaidStep === 5 ? '<i>Лич</i>' + esc(qSaid) : '<i>Лич</i>Так-так…';
    $('q-said').innerHTML = said;
    if (q) $('q-ask').textContent = q.q;
  }
  function drawQuiz() {
    var st = qStep, body = '', foot = '';
    $('q-num').textContent = st <= 5 ? 'Анкета жильца · ' + st + ' из 5' : 'Анкета заполнена';
    $('q-dots').innerHTML = [1, 2, 3, 4, 5].map(function (k) { return '<i class="' + (k < st ? 'on' : k === st ? 'now' : '') + '"></i>'; }).join('');
    $('q-custom').hidden = !(st === 2 || st === 3 || st === 5);
    $('q-ask').hidden = st > 5;
    if (st === 1) {
      body = '<div class="races8">' + Q.RACES.map(function (r, i) { return '<button type="button" class="btn rcard" data-r="' + i + '"><span class="pic">' + esc(r.id.charAt(0)) + '<img src="/api/race?i=' + i + '" alt="" loading="eager" onerror="this.remove()"></span><b>' + esc(r.id) + '</b><small>' + esc(r.hint) + '</small></button>'; }).join('') + '</div>';
      foot = '<button class="btn dark" id="q-old" type="button" style="width:100%">Старый вход: раса и легенда</button>';
    } else if (st === 2 || st === 3) {
      body = '<div class="row">' + (st === 2 ? Q.FROM : Q.FEAR).map(function (o, i) { return '<button type="button" class="btn leg" data-o="' + i + '">' + esc(o.t) + '</button>'; }).join('') + '</div>';
    } else if (st === 4) {
      if (!qLoot) { var pool = Q.LOOT.slice(); qLoot = []; while (qLoot.length < 3) qLoot.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]); }
      body = '<div class="loot3">' + qLoot.map(function (it, i) { return '<button type="button" class="btn lcard" data-l="' + i + '"><img src="/img/items/' + esc(it.kind) + '.webp" alt=""><div><b>' + esc(it.name) + '</b><span>' + esc(it.desc) + '</span></div></button>'; }).join('') + '</div>';
    } else if (st > 5) {
      body = qFailed
        ? '<div class="muted" style="text-align:center">Монстр не слепился. Ответы целы — попробуем ещё раз.</div><button class="btn main" id="q-retry" type="button" style="width:100%">Слепить ещё раз</button>'
        : '<h2 style="text-align:center">Лич ставит печать <span class="flame"></span></h2><div class="muted" style="text-align:center">Кости, глина, немного плесени. Смотри на экран.</div>';
    }
    var say = $('q-say');
    if (st === 5) { say.className = 'sealbtn'; say.innerHTML = NKUI.seal('horn'); $('q-say-label').hidden = false; $('q-or').hidden = true; $('q-txt').placeholder = 'или напиши фразу'; }
    else { say.className = 'btn'; say.textContent = 'Зажми и скажи своё'; $('q-say-label').hidden = true; $('q-or').hidden = false; $('q-txt').placeholder = 'или напиши'; }
    $('q-txt').value = '';
    $('q-body').innerHTML = body; $('q-foot').innerHTML = foot;
    drawQuizLich();
    window.scrollTo(0, 0);
  }
  function answer(payload) {
    if (qStep < 1 || qStep > 5) return;
    payload.t = 'quiz'; payload.step = qStep;
    if (payload.custom) payload.spare = pick(Q.SPARE[qStep] || ['Хм. Запишу.']);
    send(payload);
    try { navigator.vibrate && navigator.vibrate(12); } catch (x) { /* ок */ }
    me.quiz = qStep + 1; qStep = me.quiz; drawQuiz();
  }
  $('q-body').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.r != null) { var r = Q.RACES[Number(b.dataset.r)]; race = { id: r.id }; answer({ text: r.id, c: r.c }); }
    else if (b.dataset.o != null) { var o = (qStep === 2 ? Q.FROM : Q.FEAR)[Number(b.dataset.o)]; answer({ text: o.t, c: o.c }); }
    else if (b.dataset.l != null) { var it = qLoot[Number(b.dataset.l)]; answer({ loot: { name: it.name, kind: it.kind, desc: it.desc }, c: it.c }); }
    else if (b.id === 'q-retry') { qFailed = false; err(''); send({ t: 'quiz_remake' }); drawQuiz(); }
  });
  $('q-foot').addEventListener('click', function (e) {
    if (e.target.closest('#q-old')) { oldFlow = true; show('race'); }
  });
  $('q-form').addEventListener('submit', function (e) {
    e.preventDefault(); var v = $('q-txt').value.trim(); if (!v) return;
    answer({ text: v, custom: true });
  });
  $('skip-intro').addEventListener('click', function () { send({ t: 'skip_intro' }); });

  // печать: карта монстра с портретом, потом — в нору
  function sealPop() {
    if (sealOpen) return;
    sealOpen = true;
    var m = (me && me.monster) || {};
    var img = me && me.pv ? ' style="background-image:url(\'/api/portrait?room=' + room + '&pid=' + encodeURIComponent(pid) + '&v=' + me.pv + '\')"' : '';
    var d = document.createElement('div'); d.id = 'seal-pop';
    d.innerHTML = '<div class="card paper"><div class="label" style="color:#7a2a12">Новый жилец</div><div class="ph"' + img + '>' + (me && me.pv ? '' : esc((m.name || '?').charAt(0))) + '</div><h3>' + esc(m.name || '') + '</h3><div>' + esc(m.title || '') + ' · ' + esc(m.race || '') + '</div><div class="q">«' + esc(m.phrase || '') + '»</div><div class="stamp">' + NKUI.seal('skull') + '</div></div>';
    document.body.appendChild(d);
    try { navigator.vibrate && navigator.vibrate([20, 80, 60]); } catch (x) { /* ок */ }
    var close = function () { if (!sealOpen) return; sealOpen = false; d.remove(); qStep = 0; render(); setTab('sheet'); };
    d.addEventListener('click', close);
    setTimeout(close, 5200);
  }

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
      '<div class="paper skill bones"><div class="ibox"><img src="/img/items/bone.webp" alt=""></div><div><b>' + bonesWord(me.bones || 0) + '</b>Лич даёт за находчивость и смешное. Трать словами: «выкуплю», «уговорю соседа за кость», «растолкаю напарника».</div></div>' +
      '<div class="paper skill weak"><div class="ibox">' + NKUI.icon('skull') + '</div><div><b>Слабость</b>' + esc(m.weakness) + '<br><span class="hand" style="font-size:17px">«' + esc(m.phrase) + '»</span></div></div>';
  }
  $('sheet').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sk]'); if (!b || !me || !me.monster) return;
    var s = me.monster.skills[Number(b.dataset.sk)];
    send({ t: 'say', text: 'Использую умение «' + s.name + '».' });
    send({ t: 'roll', die: s.die, power: 0.5 + Math.random() * 0.4 });
    setTab('talk');
  });

  function bonesWord(n) { var k = Math.abs(n) % 100, d = k % 10; return Math.abs(n) + ' ' + (k > 10 && k < 20 ? 'костей' : d === 1 ? 'кость' : d >= 2 && d <= 4 ? 'кости' : 'костей'); }
  function toastBones(m) {
    var d = document.createElement('button'); d.type = 'button'; d.className = 'gift';
    d.innerHTML = '<img src="/img/items/bone.webp" alt=""><div><small>' + (m.n > 0 ? 'Лич дал тебе' : 'Ты отдал') + '</small><b>' + bonesWord(m.n) + '</b>' + esc(m.why || '') + (m.n > 0 ? '' : '') + '<br>Всего: ' + bonesWord(m.total || 0) + '</div>';
    d.addEventListener('click', function () { d.remove(); setTab('sheet'); });
    document.body.appendChild(d); setTimeout(function () { d.classList.add('out'); setTimeout(function () { d.remove(); }, 500); }, 4200);
    ping('sheet');
  }

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
  // стаканчик: тряска гремит, смахнул вверх — бросок на экран
  var cupLock = 0;
  NKCup.mount($('cup'), function (p) {
    if (Date.now() < cupLock) return;
    cupLock = Date.now() + 2500;
    send({ t: 'roll', die: selDie, power: p });
    $('ask').className = 'btn'; lastAsk = null;
  });
  NKCup.die(selDie);
  $('cupask').hidden = !(window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function');
  $('cupask').addEventListener('click', function () { NKCup.ask(); $('cupask').hidden = true; });
  function pickDie(d) { NKCup.die(d); selDie = d; Array.prototype.forEach.call($('dice').children, function (b) { b.classList.toggle('on', b.dataset.d === d); }); $('throw-label').textContent = 'или зажми печать — бросок ' + d; }
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
    var mp = state.map; $('mapcard').hidden = !mp || !window.NKMap;
    if (mp && window.NKMap) {
      var pls = (state.players || []).filter(function (p) { return p.monster; }).map(function (p) { return { name: p.monster.name, img: p.pv ? '/api/portrait?room=' + room + '&pid=' + encodeURIComponent(p.pid) + '&v=' + p.pv : '' }; });
      var sv = $('rmap'); sv.setAttribute('viewBox', '0 0 ' + NKMap.size + ' ' + NKMap.size); sv.innerHTML = NKMap.draw(mp, { players: pls, tap: true });
      var r = mp.rooms[mp.at] || {}, f = r.find;
      $('roominfo').innerHTML = '<b>' + esc(r.name || '') + '</b>' + (r.state === 'seen' ? ' — ' + esc(f ? f.what + (f.taken ? ' (забрано)' : '') : 'пусто') : '');
      $('b-search').hidden = r.state === 'seen'; $('b-loot').hidden = !(f && f.loot);
    }
    var ps = mp ? [] : state.paths || [];
    $('paths').innerHTML = ps.length ? '<div class="label" style="text-align:center">Куда идём</div>' + ps.map(function (t, i) { return '<button type="button" class="btn" data-p="' + i + '">' + esc(t) + '</button>'; }).join('') : '';
  }
  $('rmap').addEventListener('click', function (e) {
    var g = e.target.closest('.room.can'); if (!g || !state.map) return;
    var id = Number(g.dataset.room), st = NKMap.neighbors(state.map)[id];
    $('heard').textContent = st === 'locked' ? 'Ты: дёргаю запертую дверь' : 'Ты: идём туда';
    send({ t: 'go', room: id });
  });
  $('b-search').addEventListener('click', function () { $('heard').textContent = 'Ты: осматриваю комнату'; send({ t: 'search' }); });
  $('b-loot').addEventListener('click', function () { $('heard').textContent = 'Ты: забираю'; send({ t: 'loot' }); });
  $('paths').addEventListener('click', function (e) { var b = e.target.closest('button[data-p]'); if (!b) return; var t = (state.paths || [])[Number(b.dataset.p)]; if (!t) return; $('heard').textContent = 'Ты: идём — ' + t; send({ t: 'say', text: 'Идём сюда: ' + t + '.' }); $('paths').innerHTML = ''; });

  // громкость на экране: двигаешь здесь — меняется на телевизоре
  var volT = 0;
  ['voice', 'amb'].forEach(function (k) { $('pv-' + k).addEventListener('input', function (e) { clearTimeout(volT); var m = { t: 'vol' }; m[k] = e.target.value / 100; volT = setTimeout(function () { send(m); }, 60); }); });

  // ---------- разговор ----------
  // «браво» / «мимо»: что нравится, лич повторяет, что нет — больше не делает
  var lichId = 0, myVote = {};
  function markVote() {
    var v = myVote[lichId] || 0;
    $('v-up').setAttribute('aria-pressed', String(v > 0)); $('v-down').setAttribute('aria-pressed', String(v < 0));
    $('v-up').disabled = $('v-down').disabled = !lichId;
  }
  function vote(v) { if (!lichId) return; var cur = myVote[lichId] || 0; v = cur === v ? 0 : v; myVote[lichId] = v; markVote(); send({ t: 'vote', id: lichId, v: v }); try { navigator.vibrate && navigator.vibrate(12); } catch (x) { /* ок */ } }
  $('v-up').addEventListener('click', function () { vote(1); });
  $('v-down').addEventListener('click', function () { vote(-1); });
  function showLich(text, roll, id) {
    if (id) { lichId = id; markVote(); }
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
  hold($('q-say'), function (text) { $('q-txt').value = text; answer({ text: text, custom: true }); });
  hold($('dictate'), function (text) { $('heard').textContent = ''; var a = $('legend'); a.value = (a.value ? a.value + ' ' : '') + text; });

  if ($('room').value && $('name').value && store.get('nk_pid')) { /* вернулся: одно нажатие «Войти» */ }
})();
