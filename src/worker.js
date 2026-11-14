// Нижний Край. Один воркер: комнаты (Durable Object), мозги лича (Claude),
// голос (ElevenLabs), распознавание речи (ElevenLabs Scribe), портреты монстров (Workers AI).
// Ключи лежат секретами в Cloudflare: ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID.

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = (len = 5) => {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return [...b].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
};
const clean = (t, max = 600) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
const ITEM_KINDS = ['potion', 'key', 'scroll', 'dagger', 'coins', 'bone', 'lantern', 'shovel', 'mushroom', 'book', 'chest', 'rope', 'bomb', 'cheese', 'skull', 'map'];

const STYLE = 'Style: black ink engraving and woodcut illustration with dense cross-hatching on aged cream paper, heavy black outlines, monochrome black and bone white, one small glowing teal accent. Plate from an old bestiary book. No text, no letters, no frame.';

// ---------- мозги ----------
const LICH_PROMPT = `Ты — старый лич на пенсии, мастер подземелья в мире «Нижний Край». Триста лет назад герои убили последнего дракона и теперь от скуки ходят рейдами по подземельям. Игроки — монстры, которые поселились в твоих пещерах: им надо обустроить нору, пройти испытания, подружиться с соседями и пережить рейд героев.

Ты ведёшь игру как мастер настольной ролевой игры: описываешь, что происходит, отвечаешь на действия игроков, просишь бросить кубик, когда исход неясен, и рассказываешь результат.

Характер: ворчливый, язвительный, с чёрным юмором, но за своих болеешь. Говоришь живо и разговорно, рублеными фразами: ворчишь, ахаешь, хрипло посмеиваешься («кхе-кхе»), возмущаешься.

Правила реплики:
- Очень коротко: одно-два предложения, не больше 180 знаков. Это озвучивается голосом, длинное слушать скучно. Лучше недосказать и спросить, чем расписать.
- Без списков, звёздочек, эмодзи и ремарок в скобках.
- Обращайся к монстрам по именам. Используй их умения, слабости и легенды.
- Часто заканчивай вопросом или выбором: что делаешь дальше?
- Если исход действия неясен — попроси бросок: заполни roll (кто бросает, какой кубик из d4, d6, d8, d10, d12, d20, зачем). Чем сложнее дело, тем крупнее кубик не нужен: обычно d20, для мелочей d6.
- Когда приходит результат броска: 1 — позорный провал, максимум — триумф, середина — получилось криво. Опиши последствия сразу.
- Не решай за игроков, что делают их монстры.
- Говори на том языке, на котором говорят игроки (русский или украинский).`;

const LICH_TOOL = {
  name: 'lich_reply',
  description: 'Реплика лича-мастера',
  input_schema: {
    type: 'object',
    properties: {
      say: { type: 'string', description: 'Что лич говорит вслух: 1-2 предложения, до 180 знаков' },
      mood: { type: 'string', enum: ['ворчит', 'смеётся', 'злится', 'шепчет', 'доволен'] },
      scene: { type: 'string', description: 'Где сейчас монстры, 2-4 слова' },
      roll: {
        type: 'object',
        description: 'Заполни, только если просишь бросок',
        properties: { who: { type: 'string' }, die: { type: 'string', enum: DICE }, why: { type: 'string' } },
        required: ['who', 'die', 'why'],
      },
    },
    required: ['say', 'mood'],
  },
};

const MONSTER_PROMPT = `Ты придумываешь монстра-игрока для настольной ролевой игры «Нижний Край» — игры за монстров, к которым в подземелье приходят герои. Тон: чёрный юмор, уютная жуть, как в старом бестиарии. По расе и легенде игрока собери персонажа. Всё по-русски (или по-украински, если легенда на украинском), кроме look_en — он строго по-английски.`;

const MONSTER_TOOL = {
  name: 'monster_sheet',
  description: 'Лист монстра',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Имя монстра, 1-2 слова. Если игрок назвал имя в легенде — возьми его' },
      title: { type: 'string', description: 'Прозвище или род занятий, 2-4 слова' },
      traits: { type: 'array', items: { type: 'string' }, description: 'Ровно 3 черты характера, по 1-3 слова' },
      skills: {
        type: 'array',
        description: 'Ровно 3 умения',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, desc: { type: 'string', description: 'Что делает, до 70 знаков' }, die: { type: 'string', enum: DICE } },
          required: ['name', 'desc', 'die'],
        },
      },
      items: {
        type: 'array',
        description: 'Ровно 6 предметов амуниции на выбор, под характер и легенду монстра, смешные и полезные',
        items: {
          type: 'object',
          properties: { name: { type: 'string', description: 'Название, 1-3 слова' }, desc: { type: 'string', description: 'Что даёт, до 60 знаков' }, kind: { type: 'string', enum: ITEM_KINDS, description: 'На что похож: зелье, ключ, свиток, кинжал, монеты, кость, фонарь, лопата, гриб, книга, сундук, верёвка, бомба, сыр, череп, карта. Все 6 разные' } },
          required: ['name', 'desc', 'kind'],
        },
      },
      hp: { type: 'integer', description: 'Здоровье, от 6 до 20' },
      weakness: { type: 'string', description: 'Слабость, до 60 знаков, смешная' },
      phrase: { type: 'string', description: 'Коронная фраза монстра, до 60 знаков' },
      look_en: { type: 'string', description: 'English: what the monster looks like for a portrait, one sentence, bust portrait, no names' },
    },
    required: ['name', 'title', 'traits', 'skills', 'items', 'hp', 'weakness', 'phrase', 'look_en'],
  },
};

async function claude(env, { system, user, tool, maxTokens = 400, timeout = 20000 }) {
  if (!env.ANTHROPIC_API_KEY) return { error: 'нет ключа ANTHROPIC_API_KEY в Cloudflare' };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.LICH_MODEL || 'claude-haiku-5-5',
        max_tokens: maxTokens,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
        messages: [{ role: 'user', content: user }],
      }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      let msg = body;
      try { msg = JSON.parse(body).error?.message || body; } catch { /* как есть */ }
      return { error: `Anthropic ${res.status}: ${msg}` };
    }
    const j = await res.json();
    const tu = (j.content || []).find((c) => c.type === 'tool_use' && c.name === tool.name);
    if (!tu?.input) return { error: `мозги не ответили (${j.stop_reason})` };
    return { out: tu.input };
  } catch (e) {
    return { error: `мозги: ${e.name === 'TimeoutError' ? 'таймаут' : String(e.message || e)}` };
  }
}

// ---------- портрет монстра ----------
async function genPortrait(env, look) {
  if (!env.AI) return null;
  const form = new FormData();
  form.append('prompt', `Bust portrait of a dungeon monster: ${clean(look, 400)}. ${STYLE}`);
  form.append('width', '768');
  form.append('height', '768');
  const packed = new Response(form);
  try {
    const out = await env.AI.run('@cf/black-forest-labs/flux-2-klein-4b', { multipart: { body: packed.body, contentType: packed.headers.get('content-type') } });
    if (!out?.image) return null;
    return Uint8Array.from(atob(out.image), (c) => c.charCodeAt(0));
  } catch (e) { console.error('portrait', String(e?.message || e)); return null; }
}

// ---------- комната ----------
export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.conns = new Map();      // cid → { ws, role, pid }
    this.players = new Map();    // pid → { pid, name, race, legend, monster, making, pv, online }
    this.log = [];               // { who, text }
    this.started = false;
    this.scene = 'Логово лича';
    this.lastLich = null;
    this.chain = Promise.resolve();
    this.seq = 0;
    ctx.blockConcurrencyWhile(async () => {
      try {
        const s = await ctx.storage.get('snap');
        if (s) {
          this.players = new Map(s.players.map((p) => [p.pid, { ...p, online: false, making: false }]));
          this.log = s.log || []; this.started = !!s.started; this.scene = s.scene || this.scene; this.lastLich = s.lastLich || null;
        }
      } catch (e) { console.error('restore', e); }
    });
  }

  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      try { await this.ctx.storage.put('snap', { players: [...this.players.values()], log: this.log.slice(-40), started: this.started, scene: this.scene, lastLich: this.lastLich }); } catch (e) { console.error('save', e); }
    }, 400);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/portrait') {
      const buf = await this.ctx.storage.get(`img:${url.searchParams.get('pid')}`);
      if (!buf) return new Response('нет портрета', { status: 404 });
      return new Response(buf, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=600' } });
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const cid = randomCode(10);
    this.conns.set(cid, { ws: server, role: null, pid: null });
    server.addEventListener('message', (ev) => {
      let m;
      try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch { return; }
      if (!m) return;
      if (m.t === 'ping') { this.send(cid, { t: 'pong' }); return; }
      try { this.handle(cid, m); } catch (e) { console.error('handle', e); }
    });
    const close = () => {
      const c = this.conns.get(cid);
      if (!this.conns.delete(cid)) return;
      if (c?.pid && this.players.has(c.pid) && ![...this.conns.values()].some((x) => x.pid === c.pid)) { this.players.get(c.pid).online = false; this.state(); }
    };
    server.addEventListener('close', close);
    server.addEventListener('error', close);
    return new Response(null, { status: 101, webSocket: client });
  }

  send(cid, msg) { try { this.conns.get(cid)?.ws.send(JSON.stringify(msg)); } catch { /* закрыт */ } }
  cast(msg, role) { for (const [cid, c] of this.conns) if (!role || c.role === role) this.send(cid, msg); }
  hasScreen() { return [...this.conns.values()].some((c) => c.role === 'screen'); }

  view() {
    return {
      t: 'state', started: this.started, scene: this.scene, lich: this.lastLich,
      players: [...this.players.values()].map((p) => ({ pid: p.pid, name: p.name, race: p.race, monster: p.monster, gear: p.gear || [], making: !!p.making, online: !!p.online, pv: p.pv || 0 })),
      log: this.log.slice(-8),
    };
  }
  state() { this.save(); this.cast(this.view()); }

  handle(cid, m) {
    const c = this.conns.get(cid);
    if (m.t === 'hello') {
      c.role = m.role === 'screen' ? 'screen' : 'pad';
      if (c.role === 'pad') {
        const pid = clean(m.pid, 24) || randomCode(8);
        c.pid = pid;
        const p = this.players.get(pid) || { pid, name: '', race: '', legend: '', monster: null, pv: 0 };
        if (m.name) p.name = clean(m.name, 20);
        p.online = true;
        this.players.set(pid, p);
        this.send(cid, { t: 'you', pid });
      }
      this.state();
      return;
    }
    if (c.role === 'screen') {
      if (m.t === 'start') { this.started = true; this.state(); this.turn({ kind: 'start' }); }
      else if (m.t === 'rolled') this.rolled(m.pid, m.die, m.n);
      else if (m.t === 'reset') { this.players.clear(); this.log = []; this.started = false; this.lastLich = null; this.scene = 'Логово лича'; this.state(); }
      return;
    }
    const p = this.players.get(c.pid);
    if (!p) return;
    if (m.t === 'name') { p.name = clean(m.name, 20); this.state(); }
    else if (m.t === 'make') this.make(p, m);
    else if (m.t === 'talking') this.cast({ t: 'talking', pid: p.pid, on: !!m.on }, 'screen');
    else if (m.t === 'gear') {
      const n = p.monster?.items?.length || 0;
      p.gear = [...new Set((Array.isArray(m.idx) ? m.idx : []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < n))].slice(0, 3);
      this.state();
    } else if (m.t === 'use') {
      const it = p.monster?.items?.[Number(m.i)];
      if (!it || !(p.gear || []).includes(Number(m.i))) return;
      const text = `Использую предмет «${it.name}» (${it.desc}).`;
      this.log.push({ who: this.label(p), text });
      this.cast({ t: 'said', pid: p.pid, name: this.label(p), text });
      this.turn({ kind: 'say', who: this.label(p), text });
    }
    else if (m.t === 'say') {
      const text = clean(m.text, 500);
      if (!text) return;
      this.log.push({ who: this.label(p), text });
      this.cast({ t: 'said', pid: p.pid, name: this.label(p), text });
      this.turn({ kind: 'say', who: this.label(p), text });
    } else if (m.t === 'roll') {
      const die = DICE.includes(m.die) ? m.die : 'd20';
      if (this.hasScreen()) this.cast({ t: 'do_roll', pid: p.pid, name: this.label(p), die }, 'screen');
      else this.rolled(p.pid, die, 1 + Math.floor(Math.random() * Number(die.slice(1))));
    }
  }

  label(p) {
    const m = p.monster?.name;
    if (!m) return p.name || 'Игрок';
    return !p.name || p.name.toLowerCase() === m.toLowerCase() ? m : `${m} (${p.name})`;
  }

  rolled(pid, die, n) {
    const p = this.players.get(pid);
    const who = p ? this.label(p) : 'Кто-то';
    const max = Number(String(die).slice(1)) || 20;
    const val = Math.max(1, Math.min(max, Math.round(Number(n) || 1)));
    this.log.push({ who, text: `[бросок ${die}: ${val}]` });
    this.cast({ t: 'rolled', pid, name: who, die, n: val });
    this.turn({ kind: 'roll', who, die, n: val });
  }

  async make(p, m) {
    if (p.making) return;
    p.race = clean(m.race, 30) || 'Монстр';
    p.legend = clean(m.legend, 700);
    p.making = true; this.state();
    const r = await claude(this.env, {
      system: MONSTER_PROMPT, tool: MONSTER_TOOL, maxTokens: 1100,
      user: `Имя игрока: ${p.name || 'без имени'}\nРаса: ${p.race}\nЛегенда игрока: ${p.legend || 'нет, придумай сам'}`,
    });
    p.making = false;
    if (r.error || !r.out) {
      this.cast({ t: 'error', text: r.error || 'монстр не собрался' });
      for (const [cid, c] of this.conns) if (c.pid === p.pid) this.send(cid, { t: 'make_failed', text: r.error || 'монстр не собрался, попробуй ещё раз' });
      this.state();
      return;
    }
    const o = r.out;
    p.monster = {
      name: clean(o.name, 24), title: clean(o.title, 40), race: p.race,
      traits: (o.traits || []).slice(0, 3).map((t) => clean(t, 30)),
      skills: (o.skills || []).slice(0, 3).map((s) => ({ name: clean(s.name, 30), desc: clean(s.desc, 90), die: DICE.includes(s.die) ? s.die : 'd20' })),
      items: (o.items || []).slice(0, 6).map((it) => ({ name: clean(it.name, 30), desc: clean(it.desc, 80), kind: ITEM_KINDS.includes(it.kind) ? it.kind : 'chest' })),
      hp: Math.max(6, Math.min(20, Number(o.hp) || 10)), weakness: clean(o.weakness, 80), phrase: clean(o.phrase, 80),
    };
    p.gear = [];
    this.state();
    if (this.started) this.turn({ kind: 'join', who: this.label(p) });
    // портрет рисуется в фоне, игру не задерживает
    this.ctx.waitUntil((async () => {
      const bytes = await genPortrait(this.env, o.look_en);
      if (!bytes || bytes.byteLength > 1_900_000) return;
      await this.ctx.storage.put(`img:${p.pid}`, bytes);
      p.pv = (p.pv || 0) + 1;
      this.state();
    })());
  }

  // ходы лича идут строго по очереди
  turn(ev) {
    this.chain = this.chain.then(() => this.lich(ev)).catch((e) => console.error('turn', e));
  }

  async lich(ev) {
    this.cast({ t: 'think', on: true });
    const monsters = [...this.players.values()].filter((p) => p.monster).map((p) => ({
      игрок: p.name, имя: p.monster.name, раса: p.monster.race, прозвище: p.monster.title, черты: p.monster.traits,
      умения: p.monster.skills.map((s) => `${s.name} (${s.die}): ${s.desc}`), амуниция: (p.gear || []).map((i) => p.monster.items?.[i]).filter(Boolean).map((it) => `${it.name}: ${it.desc}`), здоровье: p.monster.hp, слабость: p.monster.weakness, легенда: p.legend,
    }));
    const what = ev.kind === 'start' ? 'Игра началась. Встреть монстров в своём логове: коротко представься, подколи каждого по его легенде и предложи первое дело в подземелье.'
      : ev.kind === 'join' ? `К игре присоединился новый монстр: ${ev.who}. Коротко поприветствуй его и встрой в происходящее.`
      : ev.kind === 'roll' ? `${ev.who} бросил ${ev.die}, выпало ${ev.n}. Расскажи, что из этого вышло.`
      : `${ev.who} говорит: «${ev.text}». Ответь как мастер.`;
    const r = await claude(this.env, {
      system: LICH_PROMPT, tool: LICH_TOOL, maxTokens: 350, timeout: 15000,
      user: `Монстры за столом:\n${JSON.stringify(monsters)}\n\nГде они сейчас: ${this.scene}\n\nПоследние события:\n${this.log.slice(-14).map((l) => `${l.who}: ${l.text}`).join('\n') || 'пока ничего'}\n\nСейчас: ${what}`,
    });
    this.cast({ t: 'think', on: false });
    let say, mood = 'ворчит', roll = null;
    if (r.error || !r.out) {
      say = 'Кхм. Мозги отсырели. Повтори-ка ещё раз.';
      this.cast({ t: 'error', text: r.error || 'мозги молчат' });
    } else {
      say = clean(r.out.say, 260); mood = r.out.mood || mood;
      if (r.out.scene) this.scene = clean(r.out.scene, 40);
      if (r.out.roll && DICE.includes(r.out.roll.die)) {
        const who = clean(r.out.roll.who, 40).toLowerCase();
        const target = [...this.players.values()].find((p) => p.monster && (who.includes(p.monster.name.toLowerCase()) || (p.name && who.includes(p.name.toLowerCase()))));
        roll = { pid: target?.pid || null, who: clean(r.out.roll.who, 40), die: r.out.roll.die, why: clean(r.out.roll.why, 80) };
      }
    }
    this.log.push({ who: 'Лич', text: say });
    if (this.log.length > 60) this.log.splice(0, this.log.length - 60);
    this.lastLich = { id: ++this.seq, text: say, mood, roll };
    this.cast({ t: 'lich', ...this.lastLich });
    this.state();
  }
}

// ---------- распознавание речи ----------
async function stt(request, env) {
  if (!env.ELEVENLABS_API_KEY) return Response.json({ error: 'нет ключа ELEVENLABS_API_KEY в Cloudflare' }, { status: 503 });
  const buf = await request.arrayBuffer();
  if (buf.byteLength < 800) return Response.json({ text: '' });
  if (buf.byteLength > 8_000_000) return Response.json({ error: 'слишком длинная запись' }, { status: 413 });
  const type = (request.headers.get('content-type') || 'audio/webm').split(';')[0];
  const ext = type.includes('mp4') || type.includes('aac') || type.includes('m4a') ? 'm4a' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm';
  const call = async (model) => {
    const form = new FormData();
    form.append('file', new Blob([buf], { type }), `say.${ext}`);
    form.append('model_id', model);
    return fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': env.ELEVENLABS_API_KEY }, body: form, signal: AbortSignal.timeout(25000) });
  };
  try {
    let res = await call(env.STT_MODEL || 'scribe_v2');
    if (!res.ok && (res.status === 400 || res.status === 422)) res = await call('scribe_v1');
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      return Response.json({ error: /missing the permission|missing_permissions/.test(body) ? 'У ключа ElevenLabs выключено распознавание речи. В ElevenLabs: Developers → API Keys → ключ → Edit → включи Speech to Text' : `ElevenLabs ${res.status}: ${body.slice(0, 160)}` }, { status: 502 });
    }
    const j = await res.json();
    return Response.json({ text: clean(j.text, 600) });
  } catch (e) { return Response.json({ error: `распознавание: ${String(e.message || e)}` }, { status: 502 }); }
}

// ---------- голос ----------
async function voice(request, env) {
  if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID) return new Response('нет ключей ElevenLabs', { status: 503 });
  let body;
  try { body = await request.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
  const text = clean(body.text, 600);
  if (!text) return new Response('нет текста', { status: 400 });
  const call = (model) => fetch(`https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}/stream?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.45, similarity_boost: 0.8, speed: 1.1 } }),
    signal: AbortSignal.timeout(30000),
  });
  try {
    let res = await call(env.VOICE_MODEL || 'eleven_flash_v2_5');
    if (!res.ok && (res.status === 400 || res.status === 422)) res = await call('eleven_multilingual_v2');
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      const msg = /missing the permission|missing_permissions/.test(body) ? 'у ключа ElevenLabs выключена озвучка. В ElevenLabs открой Developers → API Keys → свой ключ → Edit и включи Text to Speech и Speech to Text' : `ElevenLabs ${res.status}: ${body.slice(0, 160)}`;
      return new Response(msg, { status: 502 });
    }
    return new Response(res.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
  } catch (e) { return new Response(`голос: ${String(e.message || e)}`, { status: 502 }); }
}

const roomOf = (url, key) => (url.searchParams.get(key) || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api/new') return Response.json({ room: randomCode(5) });
      if (url.pathname === '/api/status') return Response.json({ brain: !!env.ANTHROPIC_API_KEY, voice: !!(env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID), ears: !!env.ELEVENLABS_API_KEY, art: !!env.AI });
      if (url.pathname === '/ws' || url.pathname === '/api/portrait') {
        const room = roomOf(url, 'room');
        if (room.length < 4) return new Response('Bad room code', { status: 400 });
        return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
      }
      if (url.pathname === '/api/stt' && request.method === 'POST') return stt(request, env);
      if (url.pathname === '/api/voice' && request.method === 'POST') return voice(request, env);
      return env.ASSETS.fetch(request);
    } catch (e) {
      return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: 503 });
    }
  },
};
