// Симуляция вечера на 15 ходов: настоящая комната (Room), мозги — заглушка вместо Anthropic.
// Проверяет кости, сценариста, «браво/мимо», живую паузу. Запуск: node test/sim15.mjs
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, ctx, next) {
  if (url.endsWith('.md')) { const fs = await import('node:fs'); return { format: 'module', shortCircuit: true, source: 'export default ' + JSON.stringify(fs.readFileSync(new URL(url), 'utf8')) }; }
  return next(url, ctx);
}`));
const { Room } = await import('../src/worker.js');

const rooms = new Map();
const pending = [];
const env = {
  ANTHROPIC_API_KEY: 'test',
  ROOMS: { idFromName: (n) => n, get: (id) => ({ fetch: (url, init) => roomFor(id).fetch(new Request(url, init)) }) },
};
function roomFor(id) {
  if (!rooms.has(id)) {
    const store = new Map();
    const ctx = { storage: { get: async (k) => store.get(k), put: async (k, v) => { store.set(k, structuredClone(v)); } }, blockConcurrencyWhile: (f) => f(), waitUntil: (p) => pending.push(p) };
    rooms.set(id, new Room(ctx, env));
  }
  return rooms.get(id);
}

// ---------- заглушка мозгов ----------
const calls = { lich: [], writer: [] };
let lichN = 0;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.anthropic.com')) {
    const body = JSON.parse(init.body);
    const tool = body.tools[0].name;
    const user = body.messages[0].content;
    if (tool === 'lich_reply') {
      calls.lich.push({ user, system: body.system[0].text, model: body.model });
      lichN++;
      const idle = user.includes('полминуты тишина');
      // лич «жадный»: пытается дать кости каждый ход — сервер должен пускать не чаще раза в 3 хода
      const out = idle ? { say: 'Достаёт кость, дует на неё. Пыль веков, Гимличек.', mood: 'ворчит', gesture: 'think' }
        : { say: `Реплика лича №${lichN}`, mood: 'ворчит', goal: 'Найти щель у трона', bones: { who: lichN % 2 ? 'Гимличек' : 'Лох', n: 2, why: 'за гриб в сапоге' } };
      if (!idle && lichN === 9) out.pay = { who: 'Гимличек', n: 1, why: 'выкупил ключ у Шныря' };
      return Response.json({ content: [{ type: 'tool_use', name: tool, input: out }], stop_reason: 'tool_use' });
    }
    if (tool === 'writer_notes') {
      calls.writer.push({ user, model: body.model });
      const out = { cheat: `Шпаргалка №${calls.writer.length}: Шнырь задолжал Тине, ведём к ссоре у кладовой.`, critique: 'Длинно, шутка про усы повторилась.', twists: [{ id: 'долг Шныря', hint: 'Шнырь прячет глаза при слове «вода».', reveal: 'Живая вода была из лужи.', ready: calls.writer.length >= 2 }, { id: 'ключ', hint: 'В сыре что-то звякает.', reveal: 'В сыре ключ от трона.' }], lore_add: ['Шнырь должен бабке Тине бочку живой воды'] };
      return Response.json({ content: [{ type: 'tool_use', name: tool, input: out }], stop_reason: 'tool_use' });
    }
  }
  throw new Error('нет сети в тесте: ' + url);
};

// ---------- комната и игроки ----------
const room = roomFor('TEST1');
const got = { screen: [], A: [], B: [] };
const conn = (cid, who) => room.conns.set(cid, { ws: { send: (m) => got[who].push(JSON.parse(m)) }, role: null, pid: null });
conn('s', 'screen'); conn('a', 'A'); conn('b', 'B');
room.handle('s', { t: 'hello', role: 'screen' });
room.handle('a', { t: 'hello', role: 'pad', pid: 'pa', name: 'Антон' });
room.handle('b', { t: 'hello', role: 'pad', pid: 'pb', name: 'Аня' });
const mk = (name) => ({ name, title: 'жилец', race: 'Крысолюд', traits: ['a', 'b', 'c'], skills: [{ name: 'Укус', desc: 'кусь', die: 'd6' }], items: [], hp: 10, weakness: 'сыр', phrase: 'пи' });
room.players.get('pa').monster = mk('Гимличек');
room.players.get('pb').monster = mk('Лох');

const flush = async () => { await room.chain; while (pending.length) await pending.shift(); await room.chain; };

room.handle('s', { t: 'start' });
await flush();
for (let i = 1; i <= 15; i++) {
  room.handle(i % 2 ? 'a' : 'b', { t: 'say', text: `Ход ${i}: кладу гриб в сапог герою` });
  await flush();
  if (i === 3) room.handle('a', { t: 'vote', id: room.lastLich.id, v: 1 });   // «браво» реплике после 3-го хода
  if (i === 5) room.handle('b', { t: 'vote', id: room.lastLich.id, v: -1 });  // «мимо»
  await flush();
}
// живая пауза: первая проходит, вторая сразу же — нет
const before = calls.lich.length;
room.handle('s', { t: 'idle' }); await flush();
room.handle('s', { t: 'idle' }); await flush();
const idleCalls = calls.lich.length - before;

// ---------- итоги ----------
const bonesMsgs = got.screen.filter((m) => m.t === 'bones');
const awards = bonesMsgs.filter((m) => m.n > 0), pays = bonesMsgs.filter((m) => m.n < 0);
const liked = room.lines.length && calls.lich.slice(-3).some((c) => c.user.includes('Игрокам понравилось') && c.user.includes('«Реплика лича №4»'));
const disliked = calls.lich.slice(-3).some((c) => c.user.includes('Не понравилось') && c.user.includes('«Реплика лича №6»'));
const cheatSeen = calls.lich.filter((c) => c.user.includes('Шпаргалка сценариста')).length;
const revealSeen = calls.lich.some((c) => c.user.includes('Пора раскрыть'));
const world = await (await roomFor('taste:home').fetch(new Request('https://taste/taste'))).json();
const res = {
  'ходов лича (без паузы)': room.turnNo,
  'выдано костей (раз)': awards.length,
  'ходы, на которых дали кости': awards.map((m) => m.total),
  'потрачено костей (раз)': pays.length,
  'кости: Гимличек / Лох': [room.players.get('pa').bones, room.players.get('pb').bones],
  'вызовов сценариста': calls.writer.length,
  'модель сценариста': calls.writer[0]?.model,
  'модель лича': calls.lich[0]?.model,
  'шпаргалка в запросе лича (раз)': cheatSeen,
  'развязка дошла до лича': revealSeen,
  'лайкнутая реплика видна личу': liked,
  '«мимо» видно личу': disliked,
  'Книга мира: новое': world.lore,
  'пауза: вызовов из двух просьб': idleCalls,
  'пауза не двинула счётчик ходов': room.turnNo === 15 + 1,
  'размер запроса лича, знаков (последний)': calls.lich.at(-1).user.length,
  'размер system лича, знаков': calls.lich.at(-1).system.length,
};
console.log(JSON.stringify(res, null, 1));
const ok = room.turnNo === 16 && awards.length >= 3 && awards.length <= 6 && calls.writer.length >= 2 && cheatSeen >= 1 && liked && disliked && idleCalls === 1 && pays.length === 1;
console.log(ok ? 'ВСЁ СХОДИТСЯ' : 'ЕСТЬ ПРОБЛЕМЫ');
process.exit(ok ? 0 : 1);
