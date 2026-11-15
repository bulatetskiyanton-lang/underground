// Карта одной локации: комнаты 3×3, двери, туман, находки. Секреты знает лич, игроки видят только открытое.
const NAMES = ['Кладовая', 'Грибница', 'Сырой коридор', 'Костяной склад', 'Крысиный лаз', 'Затопленный погреб', 'Старая кухня', 'Колодец', 'Чулан с банками', 'Паучий угол', 'Винный подвал', 'Комната с дырой'];
const FINDS = [
  { kind: 'chest', what: 'сундук под тряпьём', item: { name: 'Мутное зелье', desc: 'Выпить, чтобы вернуть 3 здоровья', kind: 'potion' } },
  { kind: 'trap', what: 'ловушка: верёвка с колокольчиком поперёк прохода' },
  { kind: 'neighbor', what: 'сосед: гоблин-старьёвщик, меняет вещи на кости' },
  { kind: 'secret', what: 'тайный лаз за бочкой, ведёт наверх' },
  { kind: 'chest', what: 'тайник в стене', item: { name: 'Мешочек костей', desc: 'Отдать соседу за услугу', kind: 'bone' } },
  { kind: 'chest', what: 'полка с грибами', item: { name: 'Светящийся гриб', desc: 'Осветить тёмный угол на один ход', kind: 'mushroom' } },
];
const KEY = { kind: 'chest', what: 'ржавый ключ на гвозде', item: { name: 'Ржавый ключ', desc: 'Открыть одну запертую дверь', kind: 'key' } };
const rnd = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const adj = (i) => { const x = i % 3, y = Math.floor(i / 3), r = []; if (x > 0) r.push(i - 1); if (x < 2) r.push(i + 1); if (y > 0) r.push(i - 3); if (y < 2) r.push(i + 3); return r; };

export function makeMap() {
  const start = 7, depth = { [start]: 0 }, order = [start], tree = [];
  // случайное дерево по сетке: 7 комнат из 9
  while (order.length < 7) {
    const from = order[rnd(order.length)], opts = adj(from).filter((c) => !(c in depth));
    if (!opts.length) continue;
    const to = opts[rnd(opts.length)];
    depth[to] = depth[from] + 1; order.push(to); tree.push([from, to]);
  }
  const names = shuffle(NAMES), finds = shuffle(FINDS);
  const rooms = order.map((cell, k) => ({ id: k, x: cell % 3, y: Math.floor(cell / 3), d: depth[cell], name: k === 0 ? 'Логово лича' : names[k], state: k === 0 ? 'seen' : 'unknown', find: null }));
  const idOf = (cell) => order.indexOf(cell);
  const doors = tree.map(([a, b]) => ({ a: idOf(a), b: idOf(b), state: 'closed' }));
  // пара лишних проходов, чтобы были петли
  for (const cell of shuffle(order)) for (const n of adj(cell)) {
    if (doors.length >= 8) break;
    const a = idOf(cell), b = idOf(n);
    if (b < 0 || doors.some((d) => (d.a === a && d.b === b) || (d.a === b && d.b === a))) continue;
    doors.push({ a, b, state: 'closed' });
  }
  // одна-две запертые двери в глубине; ключ — в комнате рядом с логовом
  const deep = shuffle(doors.filter((d) => rooms[d.a].d >= 1 && rooms[d.b].d >= 2 && d.a !== 0 && d.b !== 0)).slice(0, 2);
  deep.forEach((d) => { d.state = 'locked'; });
  const near = rooms.filter((r) => r.d === 1), keyRoom = near[rnd(near.length)] || rooms[1];
  keyRoom.find = { ...KEY, taken: false };
  let f = 0;
  for (const r of shuffle(rooms.slice(1))) { if (r.find) continue; if (f < finds.length && Math.random() < 0.8) r.find = { ...finds[f++], taken: false }; }
  const map = { rooms, doors, at: 0, want: null };
  enter(map, 0);
  return map;
}

export const doorBetween = (map, a, b) => map.doors.find((d) => (d.a === a && d.b === b) || (d.a === b && d.b === a));

export function enter(map, id) {
  const r = map.rooms[id]; if (!r) return;
  const d = doorBetween(map, map.at, id); if (d) d.state = 'open';
  map.at = id; map.want = null;
  if (r.state !== 'seen') r.state = 'open';
  for (const door of map.doors) { const o = door.a === id ? door.b : door.b === id ? door.a : -1; if (o >= 0 && map.rooms[o].state === 'unknown') map.rooms[o].state = 'door'; }
}

// что видят игроки
export function viewMap(map) {
  if (!map) return null;
  const known = (i) => ['open', 'seen'].includes(map.rooms[i].state);
  return {
    at: map.at,
    rooms: map.rooms.map((r) => ({ id: r.id, x: r.x, y: r.y, state: r.state, name: r.state === 'open' || r.state === 'seen' ? r.name : '', find: r.state === 'seen' && r.find ? { kind: r.find.kind, what: r.find.what, loot: !!r.find.item && !r.find.taken, taken: !!r.find.taken } : null })),
    doors: map.doors.filter((d) => known(d.a) || known(d.b)).map((d) => ({ a: d.a, b: d.b, state: d.state })),
  };
}

// что знает лич
export function mapForLich(map) {
  if (!map) return '';
  const cur = map.rooms[map.at];
  const line = (r) => `${r.name}${r.id === map.at ? ' (монстры здесь)' : ''}: ${r.find ? r.find.what + (r.find.taken ? ' — уже забрано' : '') : 'ничего спрятанного'}; ${r.state === 'seen' ? 'осмотрена' : r.state === 'open' ? 'вошли, не осматривали' : 'ещё не были'}`;
  const doors = map.doors.filter((d) => d.a === map.at || d.b === map.at).map((d) => `${map.rooms[d.a === map.at ? d.b : d.a].name} — дверь ${d.state === 'locked' ? 'ЗАПЕРТА (нужен ключ или взлом)' : d.state === 'closed' ? 'закрыта, но НЕ заперта — входят свободно' : 'открыта'}`);
  return `Карта этой локации (секрет, игроки видят только открытое):\n${map.rooms.map(line).join('\n')}\nИз комнаты «${cur.name}» можно пройти: ${doors.join('; ') || 'никуда'}.`;
}
