// Underground · гравюра кодом. Все плашки, карточки, бирки и таблички интерфейса рисуются здесь — одной рукой:
// одна толщина пера, одна штриховка, одна бумага, один сургуч. Картинок-подложек нет.
// Использование: <div data-plate="paper|tag|sign|note|plate|card|card-back|map|medal"> — NKInk.auto() дорисует подложку под размер.
(function () {
  'use strict';
  var INK = '#14100c', PAPER = '#f4e9cf', AGED = '#dcc89f', EDGE = '#b89a6a', SHADOW = 'rgba(8,5,2,.55)';
  var LW = 2.2, LW2 = 1.1;                     // перо: контур и тонкая линия — везде одинаковые

  // ---------- общие узоры, один раз на страницу ----------
  var DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
    '<pattern id="ik-h" width="4.2" height="4.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4.2" stroke="' + INK + '" stroke-width=".9"/></pattern>' +
    '<pattern id="ik-x" width="4.6" height="4.6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><path d="M0 0V4.6M0 0H4.6" stroke="' + INK + '" stroke-width=".8"/></pattern>' +
    '<pattern id="ik-wood" width="60" height="9" patternUnits="userSpaceOnUse"><rect width="60" height="9" fill="#5b3f27"/><path d="M0 2.5q15 -2 30 0t30 0M0 6.5q12 1.6 26 0t34 .4" fill="none" stroke="#2a1a0e" stroke-width=".9"/></pattern>' +
    '<pattern id="ik-leather" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#2a1d14"/><circle cx="2" cy="2" r=".6" fill="#3a2a1e"/><circle cx="5.5" cy="5" r=".5" fill="#1a110a"/></pattern>' +
    '<filter id="ik-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .25  0 0 0 0 .12  0 0 0 .16 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>' +
    '<radialGradient id="ik-age" cx="50%" cy="50%" r="72%"><stop offset=".55" stop-color="' + AGED + '" stop-opacity="0"/><stop offset="1" stop-color="' + EDGE + '" stop-opacity=".75"/></radialGradient>' +
    '<radialGradient id="ik-wax" cx="38%" cy="32%" r="72%"><stop offset="0" stop-color="#b14a2e"/><stop offset=".55" stop-color="#7d2a18"/><stop offset="1" stop-color="#43130a"/></radialGradient>' +
    '<radialGradient id="ik-metal" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#c9c2b6"/><stop offset=".6" stop-color="#6d655a"/><stop offset="1" stop-color="#2a2620"/></radialGradient>' +
    '</defs></svg>';

  // ---------- случайность, но одна и та же для одного элемента ----------
  function rng(seed) { var h = 2166136261; for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } return function () { h += 0x6D2B79F5; var t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var f = function (n) { return Math.round(n * 10) / 10; };

  // контур по точкам с дрожью пера (amp) и рваными краями (tear)
  function edge(pts, R, amp, tear, step) {
    var d = '', first = true;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / (step || 9)));
      var nx = -(b[1] - a[1]) / (len || 1), ny = (b[0] - a[0]) / (len || 1);
      for (var k = 0; k < n; k++) {
        var t = k / n, j = (R() - 0.5) * 2 * amp + (tear ? -R() * tear : 0);
        if (k === 0) j = (R() - 0.5) * amp;          // углы — почти точные
        var x = a[0] + (b[0] - a[0]) * t + nx * j, y = a[1] + (b[1] - a[1]) * t + ny * j;
        d += (first ? 'M' : 'L') + f(x) + ' ' + f(y); first = false;
      }
    }
    return d + 'Z';
  }
  function rect(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }

  // бумага: тень штрихом, лист, зерно, старение к краям, контур тушью
  function paper(pts, R, o) {
    o = o || {};
    var sh = edge(pts.map(function (p) { return [p[0] + 5, p[1] + 6]; }), R, 0.6, o.tear || 0, o.step);
    var pg = edge(pts, R, o.amp == null ? 0.7 : o.amp, o.tear || 0, o.step);
    return '<path d="' + sh + '" fill="' + SHADOW + '"/><path d="' + sh + '" fill="url(#ik-h)" opacity=".35"/>' +
      '<path d="' + pg + '" fill="' + (o.fill || PAPER) + '"/>' +
      '<path d="' + pg + '" fill="url(#ik-age)"/>' +
      '<path d="' + pg + '" fill="' + PAPER + '" filter="url(#ik-grain)"/>' +
      '<path d="' + pg + '" fill="none" stroke="' + INK + '" stroke-width="' + LW + '" stroke-linejoin="round"/>';
  }
  // тонкая внутренняя рамка с завитками в углах
  function inner(x, y, w, h, R, corners) {
    var s = '<path d="' + edge(rect(x, y, w, h), R, 0.45, 0, 14) + '" fill="none" stroke="' + INK + '" stroke-width="' + LW2 + '"/>';
    if (corners) [[x, y, 0], [x + w, y, 90], [x + w, y + h, 180], [x, y + h, 270]].forEach(function (c) { s += flourish(c[0], c[1], c[2], Math.min(22, w * 0.12, h * 0.25)); });
    return s;
  }
  function flourish(x, y, rot, s) {
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ') rotate(' + rot + ') scale(' + f(s / 20) + ')" fill="none" stroke="' + INK + '" stroke-width="' + f(LW2 * 20 / s) + '" stroke-linecap="round">' +
      '<path d="M3 20Q3 3 20 3"/><path d="M8 3q0 7 -5 9M3 8q7 0 9 -5"/><path d="M10 10q6 -1 6 -6M10 10q-1 6 -6 6"/><circle cx="10" cy="10" r="1.6" fill="' + INK + '"/></g>';
  }
  // лента для заголовка
  function ribbon(x, y, w, h) {
    var e = h * 0.55, t = h * 0.22;
    return '<g stroke="' + INK + '" stroke-width="' + LW2 * 1.4 + '" stroke-linejoin="round">' +
      '<path d="M' + f(x - e) + ' ' + f(y + t) + 'h' + f(e * 1.2) + 'v' + f(h) + 'h' + f(-e * 1.2) + 'l' + f(e * 0.45) + ' ' + f(-h / 2) + 'z" fill="' + AGED + '"/>' +
      '<path d="M' + f(x + w + e) + ' ' + f(y + t) + 'h' + f(-e * 1.2) + 'v' + f(h) + 'h' + f(e * 1.2) + 'l' + f(-e * 0.45) + ' ' + f(-h / 2) + 'z" fill="' + AGED + '"/>' +
      '<path d="M' + f(x - e) + ' ' + f(y + t) + 'h' + f(e * 1.2) + 'v' + f(h) + 'h' + f(-e * 1.2) + 'l' + f(e * 0.45) + ' ' + f(-h / 2) + 'z" fill="url(#ik-h)" opacity=".45" stroke="none"/>' +
      '<path d="M' + f(x + e * 0.2) + ' ' + f(y + t + h) + 'l' + f(-e * 0.2) + ' ' + f(-t) + 'v' + f(t) + 'z" fill="' + INK + '"/><path d="M' + f(x + w - e * 0.2) + ' ' + f(y + t + h) + 'l' + f(e * 0.2) + ' ' + f(-t) + 'v' + f(t) + 'z" fill="' + INK + '"/>' +
      '<path d="M' + f(x) + ' ' + f(y) + 'Q' + f(x + w / 2) + ' ' + f(y - t * 0.8) + ' ' + f(x + w) + ' ' + f(y) + 'V' + f(y + h) + 'Q' + f(x + w / 2) + ' ' + f(y + h - t * 0.8) + ' ' + f(x) + ' ' + f(y + h) + 'Z" fill="' + PAPER + '"/>' +
      '</g>';
  }
  // сургуч
  function wax(cx, cy, r, R, mark) {
    var d = '', n = 48, ph = R() * 6;
    for (var i = 0; i <= n; i++) { var a = i / n * Math.PI * 2, rr = r * (1 + 0.07 * Math.sin(a * 7 + ph) + 0.04 * Math.sin(a * 13 + ph * 2)); d += (i ? 'L' : 'M') + f(cx + rr * Math.cos(a)) + ' ' + f(cy + rr * Math.sin(a)); }
    return '<path d="' + d + 'Z" fill="url(#ik-wax)" stroke="' + INK + '" stroke-width="' + LW2 * 1.3 + '"/>' +
      '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r * 0.66) + '" fill="none" stroke="#3a0f07" stroke-width="' + f(r * 0.12) + '" opacity=".75"/>' +
      '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r * 0.6) + '" fill="url(#ik-h)" opacity=".22"/>' +
      (mark ? '<text x="' + f(cx) + '" y="' + f(cy + r * 0.24) + '" text-anchor="middle" font-family="Kurale,serif" font-size="' + f(r * 0.8) + '" fill="#2a0c05" opacity=".85">' + mark + '</text>' : '');
  }
  function nail(x, y, s) {
    return '<path d="M' + f(x - s * 0.18) + ' ' + f(y) + 'l' + f(s * 0.12) + ' ' + f(s * 1.1) + 'h' + f(s * 0.12) + 'l' + f(s * 0.12) + ' ' + f(-s * 1.1) + 'z" fill="url(#ik-metal)" stroke="' + INK + '" stroke-width="' + LW2 + '"/>' +
      '<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="' + f(s * 0.42) + '" ry="' + f(s * 0.2) + '" fill="url(#ik-metal)" stroke="' + INK + '" stroke-width="' + LW2 + '"/>';
  }
  function twine(x1, y1, x2, y2) {
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + 4, d = 'M' + f(x1) + ' ' + f(y1) + 'Q' + f(mx) + ' ' + f(my) + ' ' + f(x2) + ' ' + f(y2);
    return '<path d="' + d + '" fill="none" stroke="' + INK + '" stroke-width="4.4" stroke-linecap="round"/><path d="' + d + '" fill="none" stroke="#c7b38a" stroke-width="2.4" stroke-linecap="round"/><path d="' + d + '" fill="none" stroke="' + INK + '" stroke-width="2.4" stroke-dasharray="1.2 3.2" stroke-linecap="round" opacity=".55"/>';
  }
  function circle(cx, cy, r, fill, w) { return '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r) + '" fill="' + (fill || PAPER) + '" stroke="' + INK + '" stroke-width="' + (w || LW2 * 1.3) + '"/>'; }
  // медальон: кружок с двойным ободом и зубчиками
  function medal(cx, cy, r, R) {
    var s = '', n = 18;
    for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; s += '<circle cx="' + f(cx + Math.cos(a) * r * 1.08) + '" cy="' + f(cy + Math.sin(a) * r * 1.08) + '" r="' + f(r * 0.1) + '" fill="' + PAPER + '" stroke="' + INK + '" stroke-width="' + LW2 * 0.8 + '"/>'; }
    return s + circle(cx, cy, r) + '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r * 0.84) + '" fill="none" stroke="' + INK + '" stroke-width="' + LW2 * 0.8 + '"/>';
  }
  function heart(cx, cy, s, fill) {
    return '<path transform="translate(' + f(cx) + ' ' + f(cy) + ') scale(' + f(s / 20) + ')" d="M0 9C-9 3 -11 -3 -8 -7S-1 -8 0 -4C1 -8 5 -10 8 -7S9 3 0 9Z" fill="' + (fill || 'url(#ik-wax)') + '" stroke="' + INK + '" stroke-width="' + f(LW2 * 20 / s) + '"/>';
  }

  // ---------- виды подложек ----------
  var KIND = {
    // обычный лист с рамкой
    paper: function (w, h, R, o) {
      var s = paper(rect(2, 2, w - 9, h - 10), R, { tear: o.tear });
      if (h >= 64) { var i = h >= 110 ? 9 : 6; s += inner(2 + i, 2 + i, w - 9 - 2 * i, h - 10 - 2 * i, R, h >= 90); }   // на коротких листах рамка не лезет на текст
      return s;
    },
    // реплика лича: длинный лист + бирка «ЛИЧ» слева с сургучом
    plate: function (w, h, R) {
      var L = 74, s = paper(rect(L * 0.55, 3, w - L * 0.55 - 8, h - 11), R, { tear: 1.6 }) + inner(L * 0.55 + 9, 11, w - L * 0.55 - 25, h - 27, R, false);
      var ty = h * 0.18, th = h * 0.56;
      s += '<g transform="rotate(-3 ' + f(L / 2) + ' ' + f(ty + th / 2) + ')">' + paper(rect(4, ty, L, th), R, { tear: 1.2, step: 6 }) + '</g>';
      s += wax(L * 0.28, ty + th * 0.98, Math.min(13, h * 0.15), R);
      return s;
    },
    // бирка с кодом: ушко, верёвка, сургуч, поле кода, место под QR
    tag: function (w, h, R) {
      var c = h * 0.28, s = '';
      s += '<path d="M' + f(w * 0.07) + ' ' + f(h * 0.5) + 'C' + f(-w * 0.04) + ' ' + f(h * 0.62) + ' ' + f(-w * 0.03) + ' ' + f(h * 0.95) + ' ' + f(w * 0.02) + ' ' + f(h * 1.12) + '" fill="none" stroke="' + INK + '" stroke-width="4.4" stroke-linecap="round"/><path d="M' + f(w * 0.07) + ' ' + f(h * 0.5) + 'C' + f(-w * 0.04) + ' ' + f(h * 0.62) + ' ' + f(-w * 0.03) + ' ' + f(h * 0.95) + ' ' + f(w * 0.02) + ' ' + f(h * 1.12) + '" fill="none" stroke="#c7b38a" stroke-width="2.4" stroke-linecap="round"/>';
      s += paper([[c, 2], [w - 8, 2], [w - 8, h - 9], [c, h - 9], [3, h * 0.66], [3, h * 0.34]], R, { tear: 1.2 });
      s += '<path d="' + edge([[c + 6, 9], [w - 15, 9], [w - 15, h - 16], [c + 6, h - 16], [10, h * 0.64], [10, h * 0.36]], R, 0.4, 0, 14) + '" fill="none" stroke="' + INK + '" stroke-width="' + LW2 + '"/>';
      s += circle(w * 0.075, h * 0.5, h * 0.075, '#1b130c') + '<circle cx="' + f(w * 0.075) + '" cy="' + f(h * 0.5) + '" r="' + f(h * 0.11) + '" fill="none" stroke="' + INK + '" stroke-width="' + LW2 * 1.6 + '"/>';
      s += wax(w * 0.2, h * 0.47, h * 0.2, R);
      var q = h * 0.56, qx = w - 16 - q, qy = (h - 9 - q) / 2;   // место под QR — так же в CSS (#qr)
      s += '<rect x="' + f(w * 0.33) + '" y="' + f(h * 0.27) + '" width="' + f(qx - 10 - w * 0.33) + '" height="' + f(h * 0.4) + '" rx="3" fill="' + PAPER + '" stroke="' + INK + '" stroke-width="' + LW2 * 1.3 + '"/>';
      s += '<rect x="' + f(qx - 3) + '" y="' + f(qy - 3) + '" width="' + f(q + 6) + '" height="' + f(q + 6) + '" fill="' + PAPER + '" stroke="' + INK + '" stroke-width="' + LW2 * 1.3 + '"/>';
      return s;
    },
    // табличка на гвозде и бечёвке
    sign: function (w, h, R) {
      var top = h * 0.34, s = '';
      s += twine(w / 2, h * 0.07, w * 0.1, top + 12) + twine(w / 2, h * 0.07, w * 0.9, top + 12);
      s += paper(rect(4, top, w - 11, h - top - 9), R, { tear: 1.4 });
      s += inner(12, top + 8, w - 27, h - top - 25, R, false);
      s += circle(w * 0.1, top + 12, 3.2, '#1b130c', LW2) + circle(w * 0.9, top + 12, 3.2, '#1b130c', LW2);
      s += nail(w / 2, h * 0.04, Math.min(26, h * 0.16));
      s += wax(w * 0.9, top + h * 0.2, Math.min(11, h * 0.08), R);
      return s;
    },
    // записка на гвозде: рваная бумага, лента с заголовком
    note: function (w, h, R) {
      var s = paper(rect(3, 10, w - 10, h - 19), R, { tear: 2.6, step: 7 });
      s += ribbon(w * 0.22, 22, w * 0.56, Math.min(26, h * 0.1));
      s += nail(w / 2, 4, 18) + wax(w / 2, 14, 7, R);
      return s;
    },
    // пергамент карты
    map: function (w, h, R) {
      var s = paper(rect(3, 3, w - 10, h - 11), R, { tear: 3.2, step: 6, fill: '#ecdcb6' });
      s += '<path d="' + edge(rect(3, 3, w - 10, h - 11), R, 0.7, 3, 6) + '" fill="url(#ik-age)" opacity=".8"/>';
      s += ribbon(w * 0.2, h * 0.055, w * 0.6, Math.min(24, h * 0.1));
      s += compass(w * 0.12, h * 0.87, Math.min(w, h) * 0.07) + compass(w * 0.88, h * 0.87, Math.min(w, h) * 0.07);
      return s;
    },
    // карта монстра, лицо: рамка, арка под портрет, лента имени, сердце, три лунки под вещи
    card: function (w, h, R) {
      var s = paper(rect(3, 3, w - 9, h - 10), R, { amp: 0.4 });
      s += '<rect x="9" y="9" width="' + f(w - 21) + '" height="' + f(h - 22) + '" rx="3" fill="url(#ik-x)" opacity=".18"/>';
      s += inner(9, 9, w - 21, h - 22, R, true) + inner(15, 15, w - 33, h - 34, R, false);
      var ax = w * 0.17, aw = w * 0.66, ay = h * 0.135, ah = h * 0.515;
      s += '<path d="M' + f(ax) + ' ' + f(ay + ah) + 'V' + f(ay + aw / 2) + 'A' + f(aw / 2) + ' ' + f(aw / 2) + ' 0 0 1 ' + f(ax + aw) + ' ' + f(ay + aw / 2) + 'V' + f(ay + ah) + 'Z" fill="#1b1613" stroke="' + INK + '" stroke-width="' + LW + '"/>';
      s += '<path d="M' + f(ax - 4) + ' ' + f(ay + ah + 3) + 'V' + f(ay + aw / 2) + 'A' + f(aw / 2 + 4) + ' ' + f(aw / 2 + 4) + ' 0 0 1 ' + f(ax + aw + 4) + ' ' + f(ay + aw / 2) + 'V' + f(ay + ah + 3) + '" fill="none" stroke="' + INK + '" stroke-width="' + LW2 + '"/>';
      s += ribbon(w * 0.25, h * 0.698, w * 0.5, h * 0.075);
      s += heart(w * 0.875, h * 0.11, w * 0.13) ;
      [0.327, 0.5, 0.673].forEach(function (x) { s += medal(w * x, h * 0.876, w * 0.062, R); });
      return s;
    },
    // карта монстра, оборот: медальон, три кружка статов, три ленты умений, шесть ячеек
    'card-back': function (w, h, R) {
      var s = paper(rect(3, 3, w - 9, h - 10), R, { amp: 0.4 });
      s += '<rect x="9" y="9" width="' + f(w - 21) + '" height="' + f(h - 22) + '" rx="3" fill="url(#ik-x)" opacity=".18"/>';
      s += inner(9, 9, w - 21, h - 22, R, true) + inner(15, 15, w - 33, h - 34, R, false);
      s += medal(w / 2, h * 0.117, w * 0.085, R);
      [0.281, 0.5, 0.723].forEach(function (x) { s += medal(w * x, h * 0.33, w * 0.088, R); });
      [0.422, 0.51, 0.593].forEach(function (y) { s += ribbon(w * 0.25, h * (y - 0.025), w * 0.5, h * 0.05); });
      [[0.207, 0.687], [0.435, 0.687], [0.66, 0.687], [0.207, 0.836], [0.435, 0.836], [0.66, 0.836]].forEach(function (c) {
        s += '<rect x="' + f(w * c[0]) + '" y="' + f(h * c[1]) + '" width="' + f(w * 0.13) + '" height="' + f(w * 0.13) + '" fill="' + PAPER + '" stroke="' + INK + '" stroke-width="' + LW2 * 1.3 + '"/><rect x="' + f(w * c[0] + 3) + '" y="' + f(h * c[1] + 3) + '" width="' + f(w * 0.13 - 6) + '" height="' + f(w * 0.13 - 6) + '" fill="none" stroke="' + INK + '" stroke-width="' + LW2 * 0.7 + '"/>';
      });
      return s;
    },
    // кружок-медальон (кнопки кубиков и вещей)
    medal: function (w, h, R) { return medal(w / 2, h / 2, Math.min(w, h) / 2 - 4, R); },
  };
  function compass(cx, cy, r) {
    var s = '<g stroke="' + INK + '" stroke-width="' + LW2 + '" fill="none">' + '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r) + '"/><circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r * 0.78) + '" stroke-dasharray="1.5 2.5"/>';
    for (var i = 0; i < 4; i++) { var a = i * Math.PI / 2, b = a + Math.PI / 4; s += '<path d="M' + f(cx + Math.cos(a) * r * 1.25) + ' ' + f(cy + Math.sin(a) * r * 1.25) + 'L' + f(cx + Math.cos(a + 0.35) * r * 0.25) + ' ' + f(cy + Math.sin(a + 0.35) * r * 0.25) + 'L' + f(cx) + ' ' + f(cy) + 'Z" fill="' + INK + '"/><path d="M' + f(cx + Math.cos(b) * r * 0.85) + ' ' + f(cy + Math.sin(b) * r * 0.85) + 'L' + f(cx) + ' ' + f(cy) + '"/>'; }
    return s + '</g>';
  }

  // ---------- рисование под размер ----------
  var ro = window.ResizeObserver ? new ResizeObserver(function (es) { es.forEach(function (e) { draw(e.target); }); }) : null;
  function draw(el) {
    var w = Math.round(el.clientWidth), h = Math.round(el.clientHeight), k = el.getAttribute('data-plate');
    if (!w || !h || !KIND[k]) return;
    var key = k + w + 'x' + h; if (el._ik === key) return; el._ik = key;
    var svg = el.querySelector(':scope>svg.ik');
    if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'ik'); svg.setAttribute('aria-hidden', 'true'); el.insertBefore(svg, el.firstChild); }
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.setAttribute('width', w); svg.setAttribute('height', h);
    svg.innerHTML = KIND[k](w, h, rng(k + (el.id || el.dataset.seed || '')), { tear: el.dataset.tear ? Number(el.dataset.tear) : 0 });
  }
  function auto(root) {
    (root || document).querySelectorAll('.paper:not([data-plate])').forEach(function (el) { el.setAttribute('data-plate', 'paper'); });
    (root || document).querySelectorAll('[data-plate]').forEach(function (el) { if (!el._ikOn) { el._ikOn = 1; if (ro) ro.observe(el); } draw(el); });
  }
  function boot() {
    if (!document.getElementById('ik-defs')) { var d = document.createElement('div'); d.id = 'ik-defs'; d.innerHTML = DEFS; document.body.appendChild(d); }
    var st = document.createElement('style');
    st.textContent = ':where([data-plate]){position:relative}[data-plate]{isolation:isolate}[data-plate]>svg.ik{position:absolute;left:0;top:0;z-index:-1;overflow:visible;pointer-events:none}';
    document.head.appendChild(st);
    auto();
    if (window.MutationObserver) new MutationObserver(function () { auto(); }).observe(document.body, { childList: true, subtree: true });
  }
  // доска для кубиков — картинкой-текстурой для 3D-стола, нарисованной тем же пером
  function trayTexture(px) {
    var w = px || 1024, h = w, b = w * 0.09, R = rng('tray');
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + DEFS.replace(/^<svg[^>]*>/, '').replace('</svg>', '') +
      '<rect x="0" y="0" width="' + w + '" height="' + h + '" rx="' + f(b * 0.25) + '" fill="url(#ik-wood)" stroke="' + INK + '" stroke-width="6"/>' +
      '<rect x="' + b + '" y="' + b + '" width="' + (w - 2 * b) + '" height="' + (h - 2 * b) + '" fill="url(#ik-leather)" stroke="' + INK + '" stroke-width="5"/>' +
      '<rect x="' + b + '" y="' + b + '" width="' + (w - 2 * b) + '" height="' + (b * 0.5) + '" fill="url(#ik-h)" opacity=".7"/>' +
      '<rect x="' + b + '" y="' + b + '" width="' + (b * 0.5) + '" height="' + (h - 2 * b) + '" fill="url(#ik-h)" opacity=".7"/>' +
      '<rect x="' + f(b * 0.35) + '" y="' + f(b * 0.35) + '" width="' + f(w - b * 0.7) + '" height="' + f(h - b * 0.7) + '" fill="none" stroke="' + INK + '" stroke-width="2"/>';
    [[0, 0, 0], [w, 0, 90], [w, h, 180], [0, h, 270]].forEach(function (c) { s += '<g transform="translate(' + c[0] + ' ' + c[1] + ') rotate(' + c[2] + ')"><path d="M0 0H' + f(b * 1.6) + 'L' + f(b * 1.6) + ' ' + f(b * 0.55) + 'H' + f(b * 0.55) + 'V' + f(b * 1.6) + 'H0Z" fill="url(#ik-metal)" stroke="' + INK + '" stroke-width="4"/><circle cx="' + f(b * 0.3) + '" cy="' + f(b * 0.3) + '" r="' + f(b * 0.1) + '" fill="' + INK + '"/><circle cx="' + f(b * 1.25) + '" cy="' + f(b * 0.28) + '" r="' + f(b * 0.08) + '" fill="' + INK + '"/><circle cx="' + f(b * 0.28) + '" cy="' + f(b * 1.25) + '" r="' + f(b * 0.08) + '" fill="' + INK + '"/></g>'; });
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s + '</svg>');
  }

  window.NKInk = { boot: boot, auto: auto, draw: function (el) { el._ik = ''; draw(el); }, trayTexture: trayTexture, heart: heart, wax: wax };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
