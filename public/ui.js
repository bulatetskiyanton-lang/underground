// Нижний Край · векторный набор интерфейса в стиле гравюры.
// Всё рисуется SVG и CSS: ленты, медальоны, печати, кубики, значки. Растр — только иллюстрации внутри.
(function () {
  'use strict';
  var INK = '#14100c', PAPER = '#efe3c6', PAPER2 = '#f6ecd3', HATCH = '#6a5c47';

  // общие узоры: штриховка, перекрёстная штриховка, дрожь линии
  var DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
    '<pattern id="nk-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="' + INK + '" stroke-width="1.3"/></pattern>' +
    '<pattern id="nk-hatch-l" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="' + PAPER + '" stroke-width="1"/></pattern>' +
    '<pattern id="nk-cross" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><path d="M0 0V6M0 0H6" stroke="' + INK + '" stroke-width="1"/></pattern>' +
    '<filter id="nk-rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="2.4"/></filter>' +
    '<radialGradient id="nk-wax" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#a8432a"/><stop offset=".55" stop-color="#7d2a18"/><stop offset="1" stop-color="#4a160c"/></radialGradient>' +
    '<radialGradient id="nk-wax-hi" cx="35%" cy="30%" r="40%"><stop offset="0" stop-color="#ffd2a8" stop-opacity=".55"/><stop offset="1" stop-color="#ffd2a8" stop-opacity="0"/></radialGradient>' +
    '</defs></svg>';

  // уголки-завитки для плашек
  function corner(rot) {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34"><g transform="rotate(' + rot + ' 17 17)" fill="none" stroke="' + INK + '" stroke-width="1.6" stroke-linecap="round">' +
      '<path d="M4 32V12Q4 4 12 4h20"/><path d="M9 32V15q0-6 6-6h17"/><path d="M15 15q5 0 5 5t-4 4q-3 0-3-3t3-2"/><circle cx="4" cy="4" r="1.8" fill="' + INK + '"/></g></svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")';
  }
  var grain = '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .32  0 0 0 0 .24  0 0 0 0 .14  0 0 0 .2 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>';

  function boot() {
    var r = document.documentElement.style;
    r.setProperty('--c-tl', corner(0)); r.setProperty('--c-tr', corner(90)); r.setProperty('--c-br', corner(180)); r.setProperty('--c-bl', corner(270));
    r.setProperty('--grain', 'url("data:image/svg+xml,' + encodeURIComponent(grain) + '")');
    if (!document.getElementById('nk-defs')) { var d = document.createElement('div'); d.id = 'nk-defs'; d.innerHTML = DEFS; document.body.appendChild(d); }
  }

  // ---------- значки (контурная гравюра) ----------
  var ICONS = {
    heart: '<path d="M24 41S9 32 9 20a8 8 0 0 1 15-4 8 8 0 0 1 15 4c0 12-15 21-15 21z"/><path d="M20 12V6M27 13l2-6M31 14l4-4" /><path d="M14 22q2 6 7 10" stroke-width="1"/><path d="M17 20q2 5 6 8" stroke-width="1"/>',
    shield: '<path d="M24 5l15 6v10c0 10-7 17-15 21C16 38 9 31 9 21V11z"/><path d="M24 5v37" /><path d="M24 11l10 4v6c0 7-4 12-10 15" fill="url(#nk-hatch)" stroke="none"/>',
    eye: '<path d="M4 24s8-12 20-12 20 12 20 12-8 12-20 12S4 24 4 24z"/><circle cx="24" cy="24" r="7"/><circle cx="24" cy="24" r="3" fill="currentColor"/><path d="M9 15l-3-3M15 11l-1-4M24 9V5M33 11l1-4M39 15l3-3" stroke-width="1.2"/>',
    sheet: '<path d="M13 7h22a4 4 0 0 1 0 8H35v22a4 4 0 0 1-4 4H11"/><path d="M13 7a4 4 0 0 0-4 4v26a4 4 0 0 0 4 4 4 4 0 0 0 4-4v-3h18"/><path d="M19 15h11M19 20h11M19 25h7" stroke-width="1.3"/>',
    bag: '<path d="M12 18a12 12 0 0 1 24 0v20a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z"/><path d="M18 14v-3a6 6 0 0 1 12 0v3"/><path d="M17 27h14v8H17z"/><path d="M24 27v4"/><path d="M12 22h24" stroke-width="1.2"/>',
    dice: '<path d="M24 4l17 10v20L24 44 7 34V14z"/><path d="M24 14l10 17H14z"/><path d="M24 4v10M7 14l7 17M41 14l-7 17M14 31l10 13 10-13"/>',
    talk: '<path d="M6 10h36v22H24l-9 8v-8H6z"/><path d="M13 18h22M13 24h14" stroke-width="1.3"/>',
    skull: '<path d="M10 24a14 14 0 1 1 28 0c0 5-3 7-5 8v6H15v-6c-2-1-5-3-5-8z"/><circle cx="18" cy="23" r="4" fill="currentColor"/><circle cx="30" cy="23" r="4" fill="currentColor"/><path d="M24 28l-2 4h4z"/><path d="M20 38v-4M24 38v-4M28 38v-4"/><path d="M27 8l-2 5 3 3" stroke-width="1.2"/>',
    horn: '<path d="M8 20h5l14-10v28L13 28H8z"/><path d="M33 16q4 8 0 16M37 12q7 12 0 24" />',
    roll: '<path d="M24 6l15 9v18L24 42 9 33V15z"/><path d="M24 15l9 15H15z"/><path d="M24 6v9M9 15l6 15M39 15l-6 15"/>',
    sword: '<path d="M10 38L34 14l4-6-6 4L8 36z"/><path d="M12 30l6 6M8 40l3-3"/>',
    star: '<path d="M24 6l5 12 13 1-10 8 3 13-11-7-11 7 3-13-10-8 13-1z"/>'
  };
  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  // ---------- лента с текстом ----------
  function ribbon(text, cls) {
    return '<div class="ribbon ' + (cls || '') + '"><svg viewBox="0 0 400 92" preserveAspectRatio="none" aria-hidden="true">' +
      '<g stroke="' + INK + '" stroke-width="2.4" stroke-linejoin="round">' +
      '<path d="M4 36h62v44H4l18-22z" fill="' + PAPER + '"/><path d="M4 36h62v44H4l18-22z" fill="url(#nk-hatch)" opacity=".55"/>' +
      '<path d="M396 36h-62v44h62l-18-22z" fill="' + PAPER + '"/><path d="M396 36h-62v44h62l-18-22z" fill="url(#nk-hatch)" opacity=".55"/>' +
      '<path d="M48 22l18 14v44L48 66z" fill="#c9b994"/><path d="M352 22l-18 14v44l18-14z" fill="#c9b994"/>' +
      '<path d="M48 22q152-12 304 0v44q-152-12-304 0z" fill="' + PAPER2 + '"/>' +
      '<path d="M60 30q140-10 280 0M60 58q140-10 280 0" fill="none" stroke-width="1"/></g></svg>' +
      '<div class="ribbon-tx">' + text + '</div></div>';
  }

  // ---------- сургучная печать ----------
  function sealPath(r, bumps, seed) {
    var d = '', n = 96;
    for (var i = 0; i <= n; i++) {
      var a = i / n * Math.PI * 2;
      var rr = r * (1 + 0.045 * Math.sin(a * bumps + seed) + 0.025 * Math.sin(a * (bumps * 2 + 3) + seed * 2));
      d += (i ? 'L' : 'M') + (100 + rr * Math.cos(a)).toFixed(1) + ' ' + (100 + rr * Math.sin(a)).toFixed(1);
    }
    return d + 'Z';
  }
  function seal(emblem, label) {
    return '<svg class="seal" viewBox="0 0 200 214" aria-hidden="true">' +
      '<path d="M120 170q8 26 0 36q-8 6-12-4q-2-14 4-32z" fill="url(#nk-wax)" stroke="' + INK + '" stroke-width="2.5"/>' +
      '<path d="' + sealPath(88, 9, 1.3) + '" fill="url(#nk-wax)" stroke="' + INK + '" stroke-width="3"/>' +
      '<path d="' + sealPath(88, 9, 1.3) + '" fill="url(#nk-wax-hi)"/>' +
      '<circle cx="100" cy="100" r="66" fill="none" stroke="#3a0f07" stroke-width="5" opacity=".7"/>' +
      '<circle cx="100" cy="100" r="62" fill="none" stroke="#d98a62" stroke-width="1.5" opacity=".55"/>' +
      '<circle cx="100" cy="100" r="58" fill="url(#nk-hatch)" opacity=".18"/>' +
      '<g transform="translate(52 52) scale(2)" color="#2a0c05">' + icon(emblem).replace('<svg class="ic "', '<svg width="48" height="48"') + '</g>' +
      '<g transform="translate(50.5 50) scale(2)" color="#f0b08c" opacity=".7">' + icon(emblem).replace('<svg class="ic "', '<svg width="48" height="48"') + '</g>' +
      (label ? '<text x="100" y="178" text-anchor="middle" font-family="Cormorant SC, serif" font-weight="700" font-size="17" letter-spacing="2" fill="' + PAPER + '">' + label + '</text>' : '') +
      '</svg>';
  }

  // ---------- кубики: гравированные многогранники ----------
  var C = PAPER, F1 = '#1b1613', F2 = '#2b231b';
  var DIE = {
    d4: { faces: [['M50 10L88 82L50 70z', F2, 1], ['M50 10L12 82L50 70z', F1, 0], ['M12 82L88 82L50 70z', F2, 1]], n: [44, 58] },
    d6: { faces: [['M50 12L86 30L50 48L14 30z', F2, 1], ['M14 30L50 48V90L14 72z', F1, 0], ['M86 30L50 48V90L86 72z', F2, 1]], n: [32, 72] },
    d8: { faces: [['M50 8L86 50L50 50z', F2, 1], ['M50 8L14 50L50 50z', F1, 0], ['M14 50L50 92L50 50z', F2, 1], ['M86 50L50 92L50 50z', F1, 0]], n: [36, 40] },
    d10: { faces: [['M50 8L84 44L50 60z', F2, 1], ['M50 8L16 44L50 60z', F1, 0], ['M16 44L50 92L50 60z', F2, 1], ['M84 44L50 92L50 60z', F1, 0]], n: [38, 46] },
    d12: { faces: [['M50 8L88 36L74 82H26L12 36z', F2, 1], ['M50 26L68 40L61 62H39L32 40z', F1, 0]], n: [50, 52] },
    d20: { faces: [['M50 6L88 28V72L50 94L12 72V28z', F2, 1], ['M50 26L74 66H26z', F1, 0], ['M50 6L50 26M12 28L26 66M88 28L74 66M26 66L50 94L74 66M12 28L50 26L88 28M12 72L26 66M88 72L74 66', 'none', 2]], n: [50, 56] }
  };
  function die(d, label) {
    var D = DIE[d] || DIE.d20, g = '';
    D.faces.forEach(function (f) {
      if (f[2] === 2) { g += '<path d="' + f[0] + '" fill="none" stroke="' + C + '" stroke-width="2.2" stroke-linejoin="round"/>'; return; }
      g += '<path d="' + f[0] + '" fill="' + f[1] + '" stroke="' + C + '" stroke-width="2.4" stroke-linejoin="round"/>';
      if (f[2]) g += '<path d="' + f[0] + '" fill="url(#nk-hatch-l)" opacity=".35"/>';
    });
    var t = label != null ? label : d.slice(1);
    return '<svg class="die" viewBox="0 0 100 100" aria-hidden="true"><g filter="url(#nk-rough)">' + g + '</g>' +
      '<text x="' + D.n[0] + '" y="' + D.n[1] + '" text-anchor="middle" dominant-baseline="middle" font-family="Kurale, serif" font-size="' + (String(t).length > 1 ? 27 : 32) + '" fill="' + C + '" stroke="#14100c" stroke-width="4" paint-order="stroke">' + t + '</text></svg>';
  }

  window.NKUI = { boot: boot, icon: icon, ribbon: ribbon, seal: seal, die: die };
})();
