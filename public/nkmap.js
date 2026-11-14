// Карта локации: комнаты, двери, туман. Один рисовальщик на экран и пульт.
(function () {
  var S = 56, G = 12, P = 8, W = P * 2 + S * 3 + G * 2;
  var ICON = { chest: 'M-6 -2h12v7h-12zM-6 -2q6 -7 12 0M-1 0h2v3h-2z', trap: 'M0 -7L7 6H-7zM0 -2v4M0 4v.5', neighbor: 'M0 -3a3 3 0 1 0 .01 0M-6 7q6 -9 12 0', secret: 'M-5 -4q5 -5 6 1q0 3 -3 4v2M-2 6v.5' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function xy(r) { return [P + r.x * (S + G), P + r.y * (S + G)]; }
  function wrap(name) { var w = name.split(' '), out = [], cur = ''; w.forEach(function (t) { if ((cur + ' ' + t).trim().length > 9 && cur) { out.push(cur); cur = t; } else cur = (cur + ' ' + t).trim(); }); if (cur) out.push(cur); return out.slice(0, 3); }
  window.NKMap = {
    size: W,
    neighbors: function (map) { var o = {}; (map.doors || []).forEach(function (d) { if (d.a === map.at) o[d.b] = d.state; if (d.b === map.at) o[d.a] = d.state; }); return o; },
    draw: function (map, opt) {
      opt = opt || {};
      if (!map) return '';
      var nb = this.neighbors(map), h = '<defs><pattern id="nkfog" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#14100c" stroke-width="1" opacity=".5"/></pattern></defs>';
      // проходы
      map.doors.forEach(function (d) {
        var a = map.rooms[d.a], b = map.rooms[d.b], pa = xy(a), pb = xy(b), cx = (pa[0] + pb[0]) / 2 + S / 2, cy = (pa[1] + pb[1]) / 2 + S / 2, hor = a.y === b.y;
        h += '<rect x="' + (cx - (hor ? G / 2 + 2 : 7)) + '" y="' + (cy - (hor ? 7 : G / 2 + 2)) + '" width="' + (hor ? G + 4 : 14) + '" height="' + (hor ? 14 : G + 4) + '" fill="#f6ecd3" stroke="#14100c" stroke-width="1.4"/>';
        if (d.state !== 'open') h += '<rect x="' + (cx - (hor ? 2 : 6)) + '" y="' + (cy - (hor ? 6 : 2)) + '" width="' + (hor ? 4 : 12) + '" height="' + (hor ? 12 : 4) + '" fill="' + (d.state === 'locked' ? '#8f2415' : '#14100c') + '"/>';
        if (d.state === 'locked') h += '<circle cx="' + cx + '" cy="' + cy + '" r="4.5" fill="#f6ecd3" stroke="#8f2415" stroke-width="1.6"/><rect x="' + (cx - 1) + '" y="' + (cy - 1) + '" width="2" height="3.4" fill="#8f2415"/>';
      });
      map.rooms.forEach(function (r) {
        if (r.state === 'unknown') return;
        var p = xy(r), x = p[0], y = p[1], on = r.id === map.at, can = opt.tap && r.id in nb;
        h += '<g class="room s-' + r.state + (on ? ' on' : '') + (can ? ' can' : '') + '" data-room="' + r.id + '">';
        h += '<rect x="' + x + '" y="' + y + '" width="' + S + '" height="' + S + '" rx="2" fill="' + (r.state === 'door' ? 'url(#nkfog)' : '#f6ecd3') + '" stroke="' + (on ? '#0f8f80' : can ? '#964f05' : '#14100c') + '" stroke-width="' + (on ? 3.4 : 2) + '"' + (can ? ' stroke-dasharray="5 3"' : '') + '/>';
        if (r.state === 'door') h += '<text x="' + (x + S / 2) + '" y="' + (y + S / 2 + 8) + '" text-anchor="middle" class="q">?</text>';
        else {
          wrap(r.name).forEach(function (l, i) { h += '<text x="' + (x + S / 2) + '" y="' + (y + 12 + i * 9.5) + '" text-anchor="middle" class="nm">' + esc(l) + '</text>'; });
          if (r.state === 'open') h += '<text x="' + (x + S / 2) + '" y="' + (y + S / 2 + 6) + '" text-anchor="middle" class="hint">не осмотрено</text>';
          else if (r.find) h += '<g transform="translate(' + (x + S - 13) + ',' + (y + S - 13) + ')" class="ic' + (r.find.taken ? ' taken' : '') + '"><circle r="10" fill="#f6ecd3" stroke="' + (r.find.loot ? '#964f05' : '#14100c') + '" stroke-width="1.6"/><path d="' + (ICON[r.find.kind] || ICON.secret) + '" fill="none" stroke="' + (r.find.loot ? '#964f05' : '#14100c') + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></g>';
          else h += '<text x="' + (x + S / 2) + '" y="' + (y + S / 2 + 6) + '" text-anchor="middle" class="hint">пусто</text>';
        }
        if (on) {
          var ps = (opt.players || []).slice(0, 4);
          if (!ps.length) h += '<circle cx="' + (x + 13) + '" cy="' + (y + S - 13) + '" r="7" fill="#0f8f80" stroke="#14100c" stroke-width="1.6" class="cur"/>';
          ps.forEach(function (pl, i) {
            var cx = x + 12 + i * 13, cy = y + S - 12;
            h += '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="#0f8f80" stroke="#14100c" stroke-width="1.6"/>';
            if (pl.img) h += '<clipPath id="nkc' + i + '"><circle cx="' + cx + '" cy="' + cy + '" r="6.6"/></clipPath><image href="' + esc(pl.img) + '" x="' + (cx - 6.6) + '" y="' + (cy - 6.6) + '" width="13.2" height="13.2" preserveAspectRatio="xMidYMid slice" clip-path="url(#nkc' + i + ')"/>';
            else h += '<text x="' + cx + '" y="' + (cy + 3) + '" text-anchor="middle" class="tk">' + esc((pl.name || '?').charAt(0)) + '</text>';
          });
        }
        h += '</g>';
      });
      return h;
    },
  };
})();
