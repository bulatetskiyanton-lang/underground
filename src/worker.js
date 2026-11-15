import { makeMap, enter, viewMap, mapForLich, doorBetween } from './map.js';
// Нижний Край. Один воркер: комнаты (Durable Object), мозги лича (Claude),
// голос (ElevenLabs), распознавание речи (ElevenLabs Scribe), портреты монстров (Workers AI).
// Ключи лежат секретами в Cloudflare: ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID.

import LORE from '../lore.md';

// Книга мира: лич получает раздел «Коротко для лича», сценарист — файл целиком.
const LORE_SHORT = (String(LORE).split('## Коротко для лича')[1] || '').split('\n## ')[0].trim();

// Образцы юмора лича. Черновик Claude по просьбе Антона (14.11) — Антон правит, меняет на свои.
const ANTON_LINES = [
  'Шестьдесят семь лет на пенсии, а покоя всё нет. Шесть-семь, как говорит молодёжь. Понятия не имею, что это значит.',
  'Герой опять вытер сапоги о мой коврик. О мой! Коврик! Я его триста лет назад у тролля выиграл.',
  'Справку о посмертии мне выдавали сорок лет. Твоя просьба подождёт пять минут, не рассыплешься.',
  'Усы — это всё, что у меня осталось от лица. Не трожь усы.',
  'Бессмертие — это когда сериал кончился, а ты всё ещё сидишь.',
  'Две кости за гриб в сапоге. Ещё и мало дал, я бы сам до такого не додумался.',
  'Паладины пахнут мылом. Это хуже, чем серебро.',
];

// компания, у которой копится вкус и новое в мире между вечерами (пока одна — дом Антона)
const CREW = 'home';
const plural = (n, a, b, c) => { const k = Math.abs(n) % 100, d = k % 10; return k > 10 && k < 20 ? c : d === 1 ? a : d >= 2 && d <= 4 ? b : c; };
const bonesWord = (n) => `${n} ${plural(n, 'кость', 'кости', 'костей')}`;

// реплика лича: без обращения по имени в начале (кроме приветствия) и не длиннее ~200 знаков — первая фраза + последний вопрос
function trimSay(t, names, max = 290) {
  if (names) for (const n of names) {
    for (const k of [n, ...n.split(' ')]) {
      const re = new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[,!.]?\\s+', 'i');
      if (k.length > 2 && re.test(t)) { t = t.replace(re, ''); t = t.charAt(0).toUpperCase() + t.slice(1); break; }
    }
  }
  if (t.length > max) {
    const parts = t.match(/[^.!?…]+[.!?…]+["»]?\s*/g) || [t];
    if (parts.length > 2) { const last = parts[parts.length - 1], q = last.includes('?') ? last : ''; let out = ''; for (const x of parts.slice(0, -1)) { if ((out + x + q).length > max) break; out += x; } t = (out + (q || '')).trim() || (parts[0] + q).trim(); }
  }
  return t;
}

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

Ты ведёшь игру как мастер настольной ролевой игры и рассказчик. Твоя главная работа — погружать в приключение и вести историю: у вечера есть главное дело, у каждого места — атмосфера, у каждого действия — последствия. Ты не собеседник, который поддакивает, а ведущий, который рассказывает.

Характер: ворчливый, язвительный, с чёрным юмором, но за своих болеешь. Говоришь живо и разговорно, рублеными фразами: ворчишь, ахаешь, возмущаешься. Никакого «кхе-кхе» и кашля. Вместо этого у тебя свои монстрячьи присказки, чередуй и придумывай новые в том же духе: «Гниль да плесень!», «Чтоб мне рассыпаться!», «Мох тебе в глазницы!», «Клянусь филактерией!», «Тьфу, герои!», «Червь меня догрызи!», «Кости мои старые…». Присказка не в каждой реплике и не всегда в начале; две реплики подряд с одной и той же не начинай.

Правила реплики:
- Когда монстры входят в новое место — ОПИШИ его, погрузи: 3–5 предложений, до 450 знаков. Что видно, что слышно, чем пахнет, что лежит или шевелится, следы чьих-то дел. Описывай то, чего нет на картинке, а не пересказывай её. Закончи тем, что тут можно сделать: два-три варианта.
- В остальное время — коротко: два-три предложения, до 250 знаков. Это озвучивается голосом.
- Каждая реплика двигает историю: последствие действия, новая деталь, намёк, просьба соседа, шорох героев наверху. Никогда не отвечай пустым поддакиванием («да, ты прав», «конечно») и не уходи в шутку вместо ответа.
- На вопрос игрока отвечай по делу, как рассказчик, который знает этот мир: что тут есть, что можно сделать, чем это грозит.
- Последнее предложение — вопрос монстру с конкретными вариантами («Отодвинешь бочку, позовёшь гоблина или пойдёшь на звук капель?»). Не приказывай — спрашивай.
- Юмор — приправа, а не блюдо: шутка или присказка не чаще, чем в каждой третьей реплике. Остальное — живой рассказ ворчливого старика.
- Не начинай реплику с имени монстра: имя — в середине или в вопросе, не чаще раза в две реплики.
- Без списков, звёздочек, эмодзи и ремарок в скобках.
- Обращайся к монстрам по именам. Используй их умения, слабости и легенды.
- Если исход действия неясен — попроси бросок: заполни roll (кто бросает, какой кубик из d4, d6, d8, d10, d12, d20, зачем). Чем сложнее дело, тем крупнее кубик не нужен: обычно d20, для мелочей d6.
- Когда приходит результат броска: 1 — позорный провал, максимум — триумф, середина — получилось криво. Опиши последствия сразу.
- Не решай за игроков, что делают их монстры.
- Когда монстры приходят в новое место или происходит что-то, что стоит показать, заполни place: название места и описание картинки по-английски. Картинка появится на экране, а место — на карте. Не чаще раза в два-три хода.
- У монстров всегда есть цель: заполняй goal — что им сейчас надо сделать. Если случилось важное (нашли, потеряли, победили, сбежали, узнали), запиши одной фразой в note — это летопись, по ней ты помнишь весь путь.
- На столе лежит карта локации из комнат. Монстры ходят по ней сами, кнопками. Ты знаешь, что спрятано в каждой комнате, — они нет. Когда монстр осматривает комнату: если там что-то спрятано — попроси бросок d20; на 8 и больше он находит, тогда расскажи и поставь reveal: true; на меньшее — не нашёл, пусть пробует иначе. Если в комнате пусто — скажи это без броска и поставь reveal: true. Запертую дверь открывают ключом, подходящей вещью или броском d20 на 12+; когда открыли — поставь unlock: true. Не выдумывай комнат и находок, которых нет на карте.
- Когда есть развилка, заполни paths: два-три коротких варианта, куда пойти дальше. Они появятся на карте и у игроков кнопками.
- Вещи появляются только из истории: монстр нашёл её, обыскав комнату, выменял, получил за помощь соседу. Ничего не дари просто так. Заполни give: кому и что. В реплике скажи, откуда вещь (где лежала, кто дал и за что) и где она пригодится по сюжету. В desc — что ею можно сделать, с глагола («Открыть одну запертую дверь»).
- Когда монстр использует вещь — всегда скажи прямо, сработала ли она здесь и что вышло. Если здесь она не к месту — так и скажи и подскажи, где пригодится.
- Ловушки и колокольчики не превращай в подарки: если монстр задел ловушку — это событие (шум, герой проснулся, сосед прибежал), а не вещь.
- Веди список заданий quests: от одного до четырёх коротких заданий, которые сейчас стоят перед монстрами (главное и побочные, у соседей тоже бывают просьбы). Отдавай список целиком, когда он изменился: новое задание, выполнено (done: true), провалено — убери.
- Говори на том языке, на котором говорят игроки (русский или украинский).

Карта: двери бывают закрытые и запертые. Закрытая дверь открывается просто так — монстр входит, ничего не надо. Заперта только та, что помечена ЗАПЕРТА. Если монстр говорит, что идёт в соседнюю комнату, — заполни move её названием и опиши, что видно с порога. Варианты в paths называй именами соседних комнат.

Кости — твоя награда:
- За находчивое решение или смешную реплику игрока дай кости: заполни bones (кому, сколько от 1 до 3, за что) и скажи вслух, например: «Ха! За гриб в сапог — две кости». Не чаще раза в три-четыре хода: в запросе написано, можно ли сейчас.
- Кости копятся у монстра и тратятся словами: выкупить вещь у соседа, уговорить соседа, растолкать вырубленного напарника, купить подсказку. Если монстр тратит кости и их хватает — заполни pay (кто, сколько, на что). Не хватает — ворчи, в долг не даёшь.

Юмор — твои темы: кости и усы, скука бессмертия, герои как назойливые соседи сверху, подземный быт (сырость, сквозняки, плесень, соседи), бюрократия мёртвых (справки, очереди, Контора Упокоения). Шутка не повторяется: если уже было — придумай другую.
Иногда, когда к слову пришлись шесть и семь («шестьдесят семь лет назад», «шестьсот семьдесят костей»), делай модный жест: gesture = sixseven. Редко, раз за вечер.
Жесты (gesture) вообще по желанию: think — задумался, listen — прислушался, laugh — хохочет, map — показывает на карту, point — указывает. Обычно не нужен.

Если в запросе есть «Шпаргалка сценариста» — держись её: веди сюжет туда, подбрасывай намёки тонко, вслух её не пересказывай. «Замечание редактора» — учти в этой реплике.
«Игрокам понравилось» — образцы тона, длины и шуток. «Не понравилось» — так больше не делай.

Мир — коротко:
${LORE_SHORT}`;

const ANTON_BLOCK = ANTON_LINES.length ? `\n\nОбразцы юмора от автора игры — держи этот тон:\n${ANTON_LINES.map((l) => '- ' + l).join('\n')}` : '';
const LICH_SYSTEM = LICH_PROMPT + ANTON_BLOCK;

const WRITER_PROMPT = `Ты — сценарист и редактор настольной игры «Нижний Край». Игроки тебя не слышат. Ведущий игры — старый лич (быстрая модель): он говорит вслух короткими репликами. Твоя работа — держать сюжет вечера и подсказывать личу.

Что делаешь каждый раз:
1. Шпаргалка личу (cheat), до 600 знаков: куда ведёт сюжет прямо сейчас, какой намёк подбросить в ближайшие ходы, чем закончить текущую главу. Конкретно, с именами и предметами из игры. Без раскрытия тайн.
2. Скрытые повороты (twists): держи 2–3 поворота на вечер. Каждый — намёк (hint), который лич может подбросить, и развязка (reveal). ready = true, только когда пора раскрыть. Уже рассказанные (told) не меняй, можно заменить новым.
3. Разбор (critique): одна-две строки о последних репликах лича: «длинно», «шутка про усы повторилась», «забыл про верёвку у входа», «не дал Гимличеку слова». Только по делу, если всё хорошо — так и пиши коротко.
4. Новое в мире (lore_add): что появилось в игре и стоит помнить между вечерами — имена, места, вещи, долги, ссоры. Только новое, не повторяй Книгу мира.

Приёмы: для каждого поворота придумай три развязки и выбери самую неожиданную, но честную — чтобы игроки потом сказали «а ведь были намёки». Один переворот на главу. Конец главы — крючок на следующий вечер. Используй то, что игроки сами придумали и подготовили: ловушки, вещи, обещания.
Запрещено: пророчества, избранные, тёмные властелины, древнее зло, судьба мира, пафос. Никто не умирает навсегда.

Арка вечера — пять глав: 1 заселение, 2 соседи, 3 слухи о героях, 4 подготовка к рейду, 5 рейд.`;

const WRITER_TOOL = {
  name: 'writer_notes',
  description: 'Заметки сценариста для лича',
  input_schema: {
    type: 'object',
    properties: {
      cheat: { type: 'string', description: 'Шпаргалка личу, до 600 знаков' },
      twists: {
        type: 'array', description: '2-3 скрытых поворота на вечер',
        items: { type: 'object', properties: { id: { type: 'string', description: 'Короткий ярлык, 1-3 слова' }, hint: { type: 'string', description: 'Намёк, который лич может подбросить, до 140 знаков' }, reveal: { type: 'string', description: 'Развязка, до 220 знаков' }, ready: { type: 'boolean', description: 'Пора раскрыть' } }, required: ['id', 'hint', 'reveal'] },
      },
      critique: { type: 'string', description: 'Разбор последних реплик лича, 1-2 строки, до 220 знаков' },
      lore_add: { type: 'array', items: { type: 'string' }, description: 'До 3 новых фактов мира, по одной фразе' },
    },
    required: ['cheat', 'twists', 'critique'],
  },
};

const LICH_TOOL = {
  name: 'lich_reply',
  description: 'Реплика лича-мастера',
  input_schema: {
    type: 'object',
    properties: {
      say: { type: 'string', description: 'Что лич говорит вслух. В новом месте — описание 3-5 предложений до 450 знаков; иначе 2-3 предложения до 250 знаков. Двигает историю, не поддакивает. Последнее — вопрос с вариантами. Имя монстра не в начале.' },
      mood: { type: 'string', enum: ['ворчит', 'смеётся', 'злится', 'шепчет', 'доволен'] },
      scene: { type: 'string', description: 'Где сейчас монстры, 2-4 слова' },
      place: {
        type: 'object',
        description: 'Новое место или сцена, которую стоит показать',
        properties: { name: { type: 'string', description: 'Название места, 1-3 слова' }, hot: { type: 'string', enum: ['слева', 'центр', 'справа'], description: 'Где на картинке главное — туда поедет камера' }, look_en: { type: 'string', description: 'English: what the place looks like, one sentence, no characters names' } },
        required: ['name', 'look_en'],
      },
      goal: { type: 'string', description: 'Текущая цель монстров одной короткой фразой, до 60 знаков. Заполняй всегда.' },
      note: { type: 'string', description: 'Запись в летопись: что важного только что случилось, одна фраза. Только если случилось.' },
      quests: { type: 'array', description: 'Список заданий целиком, 1-4 штуки. Только когда изменился.', items: { type: 'object', properties: { text: { type: 'string', description: 'Задание, до 50 знаков' }, done: { type: 'boolean' } }, required: ['text'] } },
      reveal: { type: 'boolean', description: 'true — монстры осмотрели текущую комнату и теперь знают, что в ней (или что в ней пусто)' },
      unlock: { type: 'boolean', description: 'true — монстры только что открыли запертую дверь, в которую ломились (ключом, вещью или удачным броском)' },
      paths: { type: 'array', items: { type: 'string' }, description: 'До трёх вариантов, куда идти дальше, по 1-3 слова' },
      focus: { type: 'string', enum: ['лич', 'место', 'кубик', 'монстр', 'карта'], description: 'Режиссёр: что сейчас главное показать на экране. лич — ты сам говоришь важное; место — описываешь, где они; кубик — ждёшь бросок или объявляешь результат; монстр — речь об одном монстре (тогда укажи его в focus_who); карта — выбирают, куда идти.' },
      focus_who: { type: 'string', description: 'Имя монстра, если focus = монстр' },
      give: {
        type: 'object',
        description: 'Заполни, только если монстр получил вещь',
        properties: {
          who: { type: 'string', description: 'Имя монстра' },
          name: { type: 'string', description: 'Название вещи, 1-3 слова' },
          desc: { type: 'string', description: 'Что этой вещью можно сделать: конкретное действие с глагола, до 70 знаков' },
          kind: { type: 'string', enum: ITEM_KINDS },
        },
        required: ['who', 'name', 'desc', 'kind'],
      },
      roll: {
        type: 'object',
        description: 'Заполни, только если просишь бросок',
        properties: { who: { type: 'string' }, die: { type: 'string', enum: DICE }, why: { type: 'string' } },
        required: ['who', 'die', 'why'],
      },
      bones: {
        type: 'object',
        description: 'Награда костями за находчивость или смешную реплику. Только если в запросе сказано, что сейчас можно',
        properties: { who: { type: 'string', description: 'Имя монстра' }, n: { type: 'integer', minimum: 1, maximum: 3 }, why: { type: 'string', description: 'За что, до 60 знаков' } },
        required: ['who', 'n', 'why'],
      },
      pay: {
        type: 'object',
        description: 'Монстр тратит свои кости (выкуп, уговор, растолкать напарника, подсказка)',
        properties: { who: { type: 'string', description: 'Имя монстра' }, n: { type: 'integer', minimum: 1, maximum: 10 }, why: { type: 'string', description: 'На что, до 60 знаков' } },
        required: ['who', 'n', 'why'],
      },
      move: { type: 'string', description: 'Если монстр сказал, что идёт в соседнюю комнату карты, и дверь туда не заперта — название этой комнаты, точно как на карте. Фишки сами перейдут.' },
      gesture: { type: 'string', enum: ['think', 'listen', 'laugh', 'map', 'point', 'sixseven'], description: 'Жест лича, если нужен' },
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
          properties: { name: { type: 'string', description: 'Название, 1-3 слова' }, desc: { type: 'string', description: 'Что этой вещью можно сделать: конкретное действие с глагола, до 70 знаков' }, kind: { type: 'string', enum: ITEM_KINDS, description: 'На что похож: зелье, ключ, свиток, кинжал, монеты, кость, фонарь, лопата, гриб, книга, сундук, верёвка, бомба, сыр, череп, карта. Все 6 разные' } },
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

// ---------- анкета жильца ----------
// порядок рас — как в public/quiz.js
const RACE_LOOK = [
  'a burly orc with tusks, tiny round spectacles and a knitted scarf',
  'a small cheeky goblin with big ears juggling three silver spoons',
  'a polite skeleton in a tattered waistcoat holding an abacus',
  'a swamp hag kikimora with moss hair holding a jar of toadstool jam',
  'a friendly translucent slime blob with a half-digested book inside',
  'a nervous rat-man with a faintly glowing tail and a rolled map',
  'a treasure chest mimic with sharp teeth, a long tongue and one curious eye',
  'a huge mossy cave troll holding a tiny lantern',
];
const QUIZ_STEPS = ['race', 'from', 'fear', 'loot', 'phrase'];
const QUIZ_ASK = ['Кто ты', 'Откуда тебя выгнали', 'Чего боишься', 'Что стащил с собой', 'Твоя коронная фраза'];
const QUIZ_PROMPT = `Ты — старый лич на пенсии, сторож подземелья «Нижний Край». Новый монстр заселяется к тебе и отвечает на анкету жильца. Откликнись на его ответ одной фразой до 90 знаков: ворчливо, смешно, по существу ответа, с чёрным юмором про кости и подземный быт. Без кавычек, без эмодзи, без «кхе-кхе». Говори на языке ответа (русский или украинский).`;
const QUIZ_TOOL = { name: 'lich_comment', description: 'Одна фраза лича', input_schema: { type: 'object', properties: { say: { type: 'string', description: 'Одна фраза, до 90 знаков' } }, required: ['say'] } };

async function claude(env, { system, user, tool, maxTokens = 400, timeout = 20000, model }) {
  if (!env.ANTHROPIC_API_KEY) return { error: 'нет ключа ANTHROPIC_API_KEY в Cloudflare' };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: model || env.LICH_MODEL || 'claude-haiku-5-5',
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
const genPortrait = (env, look) => genPicture(env, `Bust portrait of a dungeon monster: ${clean(look, 400)}.`);
async function genPicture(env, prompt, w = 768, h = 768) {
  if (!env.AI) return null;
  const form = new FormData();
  form.append('prompt', `${prompt} ${STYLE}`);
  form.append('width', String(w));
  form.append('height', String(h));
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
    this.places = [{ name: 'Логово лича', v: 0 }];
    this.map = makeMap();
    this.edges = [];
    this.cur = 0;
    this.paths = [];
    this.goal = '';
    this.notes = [];
    this.quests = [];
    this.lastLich = null;
    this.intro = '';             // '' — ещё не было, 'play' — идёт на экране, 'done' — прошло
    this.chain = Promise.resolve();
    this.seq = 0;
    this.turnNo = 0;             // ходы лича (без пауз)
    this.bonesAt = -99;          // на каком ходу лич последний раз дал кости
    this.lines = [];             // последние реплики лича: { id, text, after } — за них голосуют
    this.votes = {};             // id реплики → { pid: 1 | -1 }
    this.writer = { cheat: '', critique: '', twists: [], at: 0 };
    this.writing = false;
    this.taste = null;           // вкус компании: { good, bad, lore } — живёт в отдельной комнате «taste:home»
    this.busy = false;
    this.lastIdle = 0;
    ctx.blockConcurrencyWhile(async () => {
      try {
        const s = await ctx.storage.get('snap');
        if (s) {
          this.players = new Map(s.players.map((p) => [p.pid, { ...p, online: false, making: false }]));
          this.log = s.log || []; this.started = !!s.started; this.scene = s.scene || this.scene; this.lastLich = s.lastLich || null;
          if (s.map?.rooms?.length) this.map = s.map;
          if (s.places?.length) { this.places = s.places; this.edges = s.edges || []; this.cur = s.cur || 0; this.paths = s.paths || []; }
          this.goal = s.goal || ''; this.notes = s.notes || []; this.quests = s.quests || [];
          this.seq = this.lastLich?.id || 0; this.turnNo = s.turnNo || 0; this.bonesAt = s.bonesAt ?? -99;
          this.lines = s.lines || []; this.votes = s.votes || {}; if (s.writer) this.writer = s.writer;
          this.intro = s.intro === 'play' ? 'done' : (s.intro || '');
        }
      } catch (e) { console.error('restore', e); }
    });
  }

  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      try { await this.ctx.storage.put('snap', { players: [...this.players.values()], log: this.log.slice(-40), started: this.started, scene: this.scene, lastLich: this.lastLich, map: this.map, places: this.places, edges: this.edges, cur: this.cur, paths: this.paths, goal: this.goal, notes: this.notes, quests: this.quests, turnNo: this.turnNo, bonesAt: this.bonesAt, lines: this.lines.slice(-20), votes: this.votes, writer: this.writer, intro: this.intro }); } catch (e) { console.error('save', e); }
    }, 400);
  }

  // ---------- вкус компании: отдельная комната «taste:<компания>», копится между вечерами ----------
  async tasteFetch(path, body) {
    const stub = this.env.ROOMS.get(this.env.ROOMS.idFromName('taste:' + CREW));
    const res = await stub.fetch('https://taste' + path, body ? { method: 'POST', body: JSON.stringify(body) } : undefined);
    return res.json();
  }
  async loadTaste() {
    if (this.taste) return this.taste;
    try { this.taste = await this.tasteFetch('/taste'); } catch (e) { console.error('taste', e); this.taste = { good: [], bad: [], lore: [] }; }
    return this.taste;
  }
  async tasteStore(request) {
    const t = (await this.ctx.storage.get('taste')) || { good: [], bad: [], lore: [] };
    if (request.method === 'POST') {
      let b = {}; try { b = await request.json(); } catch { /* пусто */ }
      if (b.op === 'vote' && b.text) {
        const text = clean(b.text, 260);
        t.good = t.good.filter((x) => x.text !== text); t.bad = t.bad.filter((x) => x.text !== text);
        if (b.v > 0) t.good = [...t.good, { text, after: clean(b.after, 140) }].slice(-12);
        if (b.v < 0) t.bad = [...t.bad, { text, after: clean(b.after, 140) }].slice(-8);
      }
      if (b.op === 'lore' && Array.isArray(b.add)) {
        const have = new Set(t.lore);
        t.lore = [...t.lore, ...b.add.map((x) => clean(x, 160)).filter((x) => x && !have.has(x))].slice(-40);
      }
      await this.ctx.storage.put('taste', t);
    }
    return Response.json(t);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname === 'taste') return this.tasteStore(request);
    if (url.pathname === '/api/portrait') {
      const buf = await this.ctx.storage.get(`img:${url.searchParams.get('pid')}`);
      if (!buf) return new Response('нет портрета', { status: 404 });
      return new Response(buf, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=600' } });
    }
    if (url.pathname === '/api/race') return this.raceArt(Number(url.searchParams.get('i')));
    if (url.pathname === '/api/scene') {
      const buf = await this.ctx.storage.get(`scene:${Number(url.searchParams.get('i')) || 0}`);
      if (!buf) return new Response('нет картинки', { status: 404 });
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
      if (c?.role === 'screen' && this.intro === 'play' && !this.hasScreen()) { this.intro = 'done'; this.state(); }
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
      t: 'state', started: this.started, intro: this.intro, scene: this.scene, lich: this.lastLich, map: viewMap(this.map), places: this.places, edges: this.edges, cur: this.cur, paths: this.paths, goal: this.goal, notes: this.notes.slice(-6), quests: this.quests,
      players: [...this.players.values()].map((p) => ({ pid: p.pid, name: p.name, race: p.race, monster: p.monster, gear: p.gear || [], fresh: p.fresh ?? -1, making: !!p.making, online: !!p.online, pv: p.pv || 0, bones: p.bones || 0, quiz: p.quizStep || 0, sealed: !!p.sealed })),
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
      else if (m.t === 'intro') { const v = m.on ? 'play' : 'done'; if (this.intro !== v && !(v === 'play' && this.intro === 'done')) { this.intro = v; this.state(); } }
      else if (m.t === 'reset') { const keep = new Map([...this.players.values()].map((p) => [p.pid, p.name])); this.players.clear(); for (const c of this.conns.values()) if (c.role === 'pad' && c.pid) this.players.set(c.pid, { pid: c.pid, name: keep.get(c.pid) || '', race: '', legend: '', monster: null, pv: 0, online: true }); this.chain = Promise.resolve(); this.cast({ t: 'reset' }); this.log = []; this.started = false; this.lastLich = null; this.scene = 'Логово лича'; this.places = [{ name: 'Логово лича', v: 0 }]; this.map = makeMap(); this.edges = []; this.cur = 0; this.paths = []; this.goal = ''; this.notes = []; this.quests = []; this.turnNo = 0; this.bonesAt = -99; this.lines = []; this.votes = {}; this.writer = { cheat: '', critique: '', twists: [], at: 0 }; this.intro = ''; this.state(); }
      else if (m.t === 'idle') this.idle();
      else if (m.t === 'vol_state') { this.vol = { voice: Number(m.voice), amb: Number(m.amb) }; this.cast({ t: 'vol_state', ...this.vol }, 'pad'); }
      return;
    }
    const p = this.players.get(c.pid);
    if (!p) return;
    if (m.t === 'name') { p.name = clean(m.name, 20); this.state(); }
    else if (m.t === 'make') { p.quizStep = 0; this.make(p, m); }
    else if (m.t === 'quiz_at') {
      const step = Math.max(1, Math.min(5, Number(m.step) || 1));
      if (!p.quizStep || p.quizStep > 5 || p.sealed) { p.quiz = {}; p.sealed = false; p.quizMade = false; }
      p.quizStep = step; this.state();
      if (m.voice) this.cast({ t: 'quiz_say', kind: 'q', step, pid: p.pid, name: p.name }, 'screen');
    }
    else if (m.t === 'quiz') this.quiz(p, m);
    else if (m.t === 'quiz_remake') { if (p.quiz && p.quizMade && !p.sealed && !p.making) this.make(p, this.quizMake(p)); }
    else if (m.t === 'skip_intro') { if (this.intro === 'play') this.cast({ t: 'skip_intro' }, 'screen'); }
    else if (m.t === 'talking') this.cast({ t: 'talking', pid: p.pid, on: !!m.on }, 'screen');
    else if (m.t === 'look') this.cast({ t: 'look', pid: p.pid, on: !!m.on }, 'screen');
    else if (m.t === 'vol') { const v = {}; if (m.voice != null) v.voice = Math.max(0, Math.min(1, Number(m.voice) || 0)); if (m.amb != null) v.amb = Math.max(0, Math.min(1, Number(m.amb) || 0)); this.vol = { ...(this.vol || {}), ...v }; this.cast({ t: 'vol', ...v }, 'screen'); }
    else if (m.t === 'gear') {
      const n = p.monster?.items?.length || 0;
      p.gear = [...new Set((Array.isArray(m.idx) ? m.idx : []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < n))].slice(0, 3);
      if (p.fresh != null && p.gear.includes(p.fresh)) p.fresh = -1;
      this.state();
    } else if (m.t === 'use') {
      const it = p.monster?.items?.[Number(m.i)];
      if (!it || !(p.gear || []).includes(Number(m.i))) return;
      const text = `Использую предмет «${it.name}» (${it.desc}). Скажи прямо: срабатывает ли он здесь и что выходит.`;
      p.lastSaid = Date.now();
      this.log.push({ who: this.label(p), text });
      this.cast({ t: 'said', pid: p.pid, name: this.label(p), text });
      this.turn({ kind: 'say', who: this.label(p), text });
    }
    else if (m.t === 'go') {
      const to = Number(m.room), d = doorBetween(this.map, this.map.at, to), r = this.map.rooms[to];
      if (!d || !r) return;
      const who = this.label(p);
      if (d.state === 'locked') {
        this.map.want = to;
        const text = 'Дёргаю запертую дверь в соседнюю комнату. Как её открыть?';
        this.log.push({ who, text }); this.cast({ t: 'said', pid: p.pid, name: who, text });
        this.turn({ kind: 'say', who, text });
        return;
      }
      enter(this.map, to); this.scene = r.name;
      const text = `Идём в комнату «${r.name}».`;
      this.log.push({ who, text }); this.cast({ t: 'said', pid: p.pid, name: who, text });
      this.state();
      this.turn({ kind: 'say', who, text: text + ' Опиши новое место, погрузи в него: 3–5 предложений — что видно, слышно, чем пахнет, что тут происходит и как это связано с главным делом. Спрятанное не выдавай, пока не осмотрят. В конце — два-три варианта, что тут можно сделать.' });
    } else if (m.t === 'search') {
      const who = this.label(p), text = 'Осматриваю комнату.';
      this.log.push({ who, text }); this.cast({ t: 'said', pid: p.pid, name: who, text });
      this.turn({ kind: 'say', who, text });
    } else if (m.t === 'loot') {
      const r = this.map.rooms[this.map.at], f = r?.find;
      if (!f || r.state !== 'seen' || !f.item || f.taken) return;
      f.taken = true;
      const who = this.label(p);
      this.give({ who, ...f.item });
      const text = `Забираю: ${f.item.name}.`;
      this.log.push({ who, text }); this.cast({ t: 'said', pid: p.pid, name: who, text });
      this.state();
      this.turn({ kind: 'say', who, text });
    }
    else if (m.t === 'say') {
      const text = clean(m.text, 500);
      if (!text) return;
      p.lastSaid = Date.now();
      this.log.push({ who: this.label(p), text });
      this.cast({ t: 'said', pid: p.pid, name: this.label(p), text });
      this.turn({ kind: 'say', who: this.label(p), text });
    } else if (m.t === 'vote') this.vote(p, Number(m.id), Number(m.v));
    else if (m.t === 'roll') {
      const die = DICE.includes(m.die) ? m.die : 'd20';
      const power = Math.max(0.1, Math.min(1, Number(m.power) || 0.6));
      if (this.hasScreen()) this.cast({ t: 'do_roll', pid: p.pid, name: this.label(p), die, power }, 'screen');
      else this.rolled(p.pid, die, 1 + Math.floor(Math.random() * Number(die.slice(1))));
    }
  }

  goto(pl) {
    const name = clean(pl.name, 30);
    let i = this.places.findIndex((x) => x.name.toLowerCase() === name.toLowerCase());
    const isNew = i < 0;
    if (isNew) { if (this.places.length >= 24) return; this.places.push({ name, v: 0, hot: ['слева', 'центр', 'справа'].includes(pl.hot) ? pl.hot : 'центр' }); i = this.places.length - 1; }
    if (i !== this.cur && !this.edges.some(([a, b]) => (a === this.cur && b === i) || (a === i && b === this.cur))) this.edges.push([this.cur, i]);
    this.cur = i; this.scene = name;
    if (!isNew && this.places[i].v) { this.cast({ t: 'scene', i, name, v: this.places[i].v, hot: this.places[i].hot || 'центр' }, 'screen'); return; }
    this.ctx.waitUntil((async () => {
      const bytes = await genPicture(this.env, `Wide establishing view of a place in an underground monster dungeon, seen from inside like a stage backdrop, the upper two thirds hold everything important, the bottom is dark floor: ${clean(pl.look_en, 400)}. No people, no hands, no figures. Warm candle light from the right.`, 1024, 768);
      if (!bytes || bytes.byteLength > 1_900_000) return;
      await this.ctx.storage.put(`scene:${i}`, bytes);
      this.places[i].v = (this.places[i].v || 0) + 1;
      this.cast({ t: 'scene', i, name, v: this.places[i].v, hot: this.places[i].hot || 'центр' }, 'screen');
      this.state();
    })());
  }

  give(g) {
    const p = this.findMonster(g.who);
    if (!p) return;
    const item = { name: clean(g.name, 30), desc: clean(g.desc, 80), kind: ITEM_KINDS.includes(g.kind) ? g.kind : 'chest', gift: true };
    p.monster.items = [...(p.monster.items || []), item].slice(-12);
    const i = p.monster.items.length - 1;
    p.gear = (p.gear || []).filter((k) => k < p.monster.items.length);
    if (p.gear.length < 3) p.gear.push(i);
    p.fresh = i;
    this.log.push({ who: this.label(p), text: `получил: ${item.name}` });
    this.cast({ t: 'gift', pid: p.pid, name: this.label(p), item, i });
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

  // ---------- анкета жильца: ответ → фраза лича; после 4-го ответа монстр лепится в фоне ----------
  async quiz(p, m) {
    const step = Number(m.step);
    if (!(step >= 1 && step <= 5)) return;
    const q = p.quiz || (p.quiz = {});
    const key = QUIZ_STEPS[step - 1];
    if (step === 4) {
      const it = m.loot || {};
      q.loot = { name: clean(it.name, 30), desc: clean(it.desc, 80), kind: ITEM_KINDS.includes(it.kind) ? it.kind : 'chest' };
      if (!q.loot.name) return;
    } else {
      const v = clean(m.text, step === 5 ? 140 : 160);
      if (!v) return;
      q[key] = v;
    }
    p.quizStep = Math.max(p.quizStep || 1, step + 1);
    this.state();
    if (step === 4 && !p.quizMade) { p.quizMade = true; this.make(p, this.quizMake(p)); }
    let say = clean(m.c, 160);
    if (m.custom || !say) {
      const r = await claude(this.env, { system: QUIZ_PROMPT, tool: QUIZ_TOOL, maxTokens: 160, timeout: 6000, user: `Вопрос анкеты: ${QUIZ_ASK[step - 1]}?\nРаса жильца: ${q.race || 'ещё не сказал'}\nОтвет (${p.name || 'жилец'}): ${q[key]}` });
      say = clean(r.out?.say, 160) || clean(m.spare, 160) || 'Хм. Запишу.';
    }
    for (const [cid, c] of this.conns) if (c.pid === p.pid) this.send(cid, { t: 'quiz_c', step, text: say });
    this.cast({ t: 'quiz_say', kind: 'c', step, pid: p.pid, name: p.name, text: say }, 'screen');
    if (step < 5) this.cast({ t: 'quiz_say', kind: 'q', step: step + 1, pid: p.pid, name: p.name }, 'screen');
    else this.trySeal(p);
  }

  quizMake(p) {
    const q = p.quiz || {};
    const legend = [q.from && `Откуда выгнали: ${q.from}.`, q.fear && `Чего боится: ${q.fear}.`, q.loot && `Стащил с собой: ${q.loot.name}.`, q.phrase && `Коронная фраза: «${q.phrase}».`].filter(Boolean).join(' ');
    return { race: q.race, legend, loot: q.loot, quiz: true };
  }

  // печать ставится, когда и анкета пройдена, и монстр слеплен
  trySeal(p) {
    if (p.sealed || (p.quizStep || 0) < 6 || !p.monster || p.making || !p.quizMade) return;
    if (p.quiz?.phrase) p.monster.phrase = clean(p.quiz.phrase, 80);
    p.sealed = true;
    this.cast({ t: 'seal', pid: p.pid, name: this.label(p) });
    this.state();
    if (this.started) this.turn({ kind: 'join', who: this.label(p) });
    else this.autoStart();
  }

  // все, кто на связи, заселены — через несколько секунд игра начинается сама
  autoStart() {
    clearTimeout(this.autoT);
    this.autoT = setTimeout(() => {
      const on = [...this.players.values()].filter((p) => p.online);
      if (this.started || !on.length || on.some((p) => !p.monster || p.making || (p.quizStep >= 1 && p.quizStep <= 5) || (p.quizStep === 6 && !p.sealed))) return;
      this.started = true; this.state(); this.turn({ kind: 'start' });
    }, 7000);
  }

  // картинки рас для анкеты: рисуются один раз и хранятся в отдельной «комнате» __art__
  async raceArt(i) {
    if (!(i >= 0 && i < RACE_LOOK.length)) return new Response('нет такой расы', { status: 404 });
    const key = `race:${i}`;
    let buf = await this.ctx.storage.get(key);
    if (!buf) {
      this.artJobs = this.artJobs || new Map();
      if (!this.artJobs.has(i)) this.artJobs.set(i, genPortrait(this.env, RACE_LOOK[i]).then(async (b) => { if (b && b.byteLength < 1_900_000) await this.ctx.storage.put(key, b); return b; }).finally(() => this.artJobs.delete(i)));
      buf = await this.artJobs.get(i);
    }
    if (!buf) return new Response('картинка не нарисовалась', { status: 503 });
    return new Response(buf, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=604800' } });
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
      items: [...(m.loot ? [{ ...m.loot, stolen: true }] : []), ...(o.items || []).map((it) => ({ name: clean(it.name, 30), desc: clean(it.desc, 80), kind: ITEM_KINDS.includes(it.kind) ? it.kind : 'chest' }))].slice(0, 6),
      hp: Math.max(6, Math.min(20, Number(o.hp) || 10)), weakness: clean(o.weakness, 80), phrase: clean(o.phrase, 80),
    };
    if (m.quiz && p.quiz?.phrase) p.monster.phrase = clean(p.quiz.phrase, 80);
    p.gear = m.loot ? [0] : [];
    this.state();
    if (m.quiz) this.trySeal(p);
    else if (this.started) this.turn({ kind: 'join', who: this.label(p) });
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

  // монстр по имени из ответа лича: «Гимличек», «Гимличек (Антон)», имя игрока
  findMonster(who) {
    const w = clean(who, 60).toLowerCase();
    const ps = [...this.players.values()].filter((p) => p.monster);
    return ps.find((x) => w && (w.includes(x.monster.name.toLowerCase()) || (x.name && w.includes(x.name.toLowerCase())))) || (ps.length === 1 ? ps[0] : null);
  }

  // ---------- кости ----------
  award(b) {
    const p = this.findMonster(b.who);
    if (!p) return;
    const n = Math.max(1, Math.min(3, Math.round(Number(b.n) || 1)));
    p.bones = (p.bones || 0) + n;
    this.bonesAt = this.turnNo;
    const why = clean(b.why, 70);
    this.log.push({ who: this.label(p), text: `получил ${bonesWord(n)}${why ? ' — ' + why : ''}` });
    this.cast({ t: 'bones', pid: p.pid, name: this.label(p), n, why, total: p.bones });
  }
  pay(b) {
    const p = this.findMonster(b.who);
    if (!p) return;
    const n = Math.max(1, Math.min(10, Math.round(Number(b.n) || 1)));
    if ((p.bones || 0) < n) return;           // в долг лич не даёт
    p.bones -= n;
    const why = clean(b.why, 70);
    this.log.push({ who: this.label(p), text: `отдал ${bonesWord(n)}${why ? ' — ' + why : ''}` });
    this.cast({ t: 'bones', pid: p.pid, name: this.label(p), n: -n, why, total: p.bones });
  }

  // ---------- «браво» / «мимо» с телефона ----------
  async vote(p, id, v) {
    const line = this.lines.find((l) => l.id === id);
    if (!line || ![1, -1, 0].includes(v)) return;
    const vs = (this.votes[id] = this.votes[id] || {});
    if (v === 0) delete vs[p.pid]; else vs[p.pid] = v;
    const sum = Object.values(vs).reduce((a, x) => a + x, 0);
    const keys = Object.keys(this.votes).map(Number).sort((a, b) => a - b);
    while (keys.length > 30) delete this.votes[keys.shift()];
    const up = Object.values(vs).filter((x) => x > 0).length, down = Object.values(vs).filter((x) => x < 0).length;
    this.cast({ t: 'votes', id, up, down, mine: { [p.pid]: v } });
    this.save();
    try { this.taste = await this.tasteFetch('/taste', { op: 'vote', v: Math.sign(sum), text: line.text, after: line.after }); } catch (e) { console.error('vote', e); }
  }

  // ---------- живая пауза: экран прислал «полминуты тишины» ----------
  idle() {
    const now = Date.now();
    if (!this.started || this.busy || now - this.lastIdle < 120000) return;
    if (![...this.players.values()].some((p) => p.monster)) return;
    this.lastIdle = now;
    const quiet = [...this.players.values()].filter((p) => p.monster && p.online !== false).sort((a, b) => (a.lastSaid || 0) - (b.lastSaid || 0))[0];
    this.turn({ kind: 'idle', who: quiet ? this.label(quiet) : '' });
  }

  // ---------- сценарист-критик: раз в 4 хода, в фоне, игру не держит ----------
  maybeWrite() {
    if (this.writing || this.turnNo < 1 || (this.writer.at && this.turnNo - this.writer.at < 4)) return;   // сценарист подключается с первого хода — у вечера сразу есть сюжет
    this.writing = true;
    this.ctx.waitUntil(this.write().catch((e) => console.error('writer', e)).finally(() => { this.writing = false; }));
  }
  async write() {
    const taste = await this.loadTaste();
    const monsters = [...this.players.values()].filter((p) => p.monster).map((p) => `${this.label(p)} — ${p.monster.race}, ${p.monster.title}; слабость: ${p.monster.weakness}; кости: ${p.bones || 0}; легенда: ${p.legend || '—'}`);
    const at = this.turnNo;
    const r = await claude(this.env, {
      system: WRITER_PROMPT, tool: WRITER_TOOL, maxTokens: 1400, timeout: 60000, model: this.env.WRITER_MODEL || 'claude-opus-5-5',
      user: `Книга мира:\n${LORE}\n\nНовое в мире из прошлых вечеров:\n${(taste.lore || []).join('\n') || 'пока ничего'}\n\nМонстры:\n${monsters.join('\n')}\n\nГде сейчас: ${this.scene}. Места: ${this.places.map((x) => x.name).join(', ')}\nЦель: ${this.goal || '—'}\nЗадания: ${this.quests.map((q) => (q.done ? '[выполнено] ' : '') + q.text).join('; ') || '—'}\n\nЛетопись:\n${this.notes.join('\n') || 'пусто'}\n\nЖурнал (последнее):\n${this.log.slice(-30).map((l) => `${l.who}: ${l.text}`).join('\n')}\n\nИгрокам понравилось:\n${(taste.good || []).map((x) => '- ' + x.text).join('\n') || '—'}\nНе понравилось:\n${(taste.bad || []).map((x) => '- ' + x.text).join('\n') || '—'}\n\nТвоя прошлая шпаргалка: ${this.writer.cheat || '—'}\nТвои повороты сейчас:\n${(this.writer.twists || []).map((t) => `- ${t.id}${t.told ? ' [уже рассказан]' : ''}: намёк «${t.hint}» → развязка «${t.reveal}»`).join('\n') || 'ещё нет, придумай 2-3'}\n\nХод ${at}. Обнови заметки.`,
    });
    if (r.error || !r.out) { console.error('writer', r.error); this.writer.at = at; return; }
    const o = r.out, old = this.writer.twists || [];
    this.writer = {
      at,
      cheat: clean(o.cheat, 650),
      critique: clean(o.critique, 240),
      twists: (Array.isArray(o.twists) ? o.twists : []).slice(0, 3).map((t) => {
        const prev = old.find((x) => x.id === clean(t.id, 30));
        return { id: clean(t.id, 30), hint: clean(t.hint, 160), reveal: clean(t.reveal, 240), ready: !!t.ready, told: !!prev?.told };
      }),
    };
    this.save();
    const add = (Array.isArray(o.lore_add) ? o.lore_add : []).slice(0, 3).map((x) => clean(x, 160)).filter(Boolean);
    if (add.length) { try { this.taste = await this.tasteFetch('/taste', { op: 'lore', add }); } catch (e) { console.error('lore', e); } }
  }

  async lich(ev) {
    this.busy = true;
    try { await this.lichTurn(ev); } finally { this.busy = false; }
  }
  async lichTurn(ev) {
    const idle = ev.kind === 'idle';
    this.cast({ t: 'think', on: true, idle });
    const taste = await this.loadTaste();
    const monsters = [...this.players.values()].filter((p) => p.monster).map((p) => ({
      игрок: p.name, имя: p.monster.name, раса: p.monster.race, прозвище: p.monster.title, черты: p.monster.traits,
      умения: p.monster.skills.map((s) => `${s.name} (${s.die}): ${s.desc}`), амуниция: (p.gear || []).map((i) => p.monster.items?.[i]).filter(Boolean).map((it) => `${it.name}: ${it.desc}`), здоровье: p.monster.hp, кости: p.bones || 0, слабость: p.monster.weakness, легенда: p.legend,
    }));
    const what = ev.kind === 'start' && this.intro === 'done' ? 'Игра началась. Ты уже представился в интро и заселил монстров по анкете — не повторяйся. Отведи их в нору, назови по именам и предложи первое дело в подземелье.'
      : ev.kind === 'start' ? 'Игра началась. Встреть монстров в логове и сразу дай главное дело вечера — ясную задачу с причиной: сосед просит помочь, пропала вещь, наверху собираются герои, в норе завелось что-то чужое. Опиши логово в двух фразах, поставь задачу и спроси, с чего начнут. Заполни goal и quests. До 450 знаков.'
      : ev.kind === 'join' ? `К игре присоединился новый монстр: ${ev.who}. Коротко поприветствуй его и встрой в происходящее.`
      : ev.kind === 'roll' ? `${ev.who} бросил ${ev.die}, выпало ${ev.n}. Расскажи, что из этого вышло.`
      : idle ? `За столом полминуты тишина. Сделай одно живое короткое действие, сюжет не двигай: достань кость и разглядывай её, полистай летопись, поправь усы или подколи того, кто давно молчит${ev.who ? ` (${ev.who})` : ''}. Одна фраза до 120 знаков. Без броска, без костей, без новых мест. Выбери gesture: think, listen или laugh.`
      : `${ev.who} говорит: «${ev.text}». Ответь как мастер.`;
    const since = this.turnNo - this.bonesAt;
    const bonesNow = idle ? 'нельзя' : since >= 3 ? 'можно, если есть за что' : `пока рано (давал ${since} ${plural(since, 'ход', 'хода', 'ходов')} назад)`;
    const w = this.writer, ready = (w.twists || []).filter((t) => t.ready && !t.told), hints = (w.twists || []).filter((t) => !t.ready && !t.told);
    const extra = [
      w.cheat && `Шпаргалка сценариста (игроки не видят):\n${w.cheat}`,
      hints.length && `Скрытые повороты — можно тонко намекнуть:\n${hints.map((t) => '- ' + t.hint).join('\n')}`,
      ready.length && !idle && `Пора раскрыть (в этой или ближайшей реплике):\n${ready.map((t) => '- ' + t.reveal).join('\n')}`,
      w.critique && `Замечание редактора к твоим прошлым репликам: ${w.critique}`,
      (taste.good || []).length && `Игрокам понравилось — так держать:\n${taste.good.map((x) => '- «' + x.text + '»').join('\n')}`,
      (taste.bad || []).length && `Не понравилось — так не надо:\n${taste.bad.map((x) => '- «' + x.text + '»').join('\n')}`,
      (taste.lore || []).length && `Новое в мире из прошлых вечеров:\n${taste.lore.slice(-8).join('\n')}`,
    ].filter(Boolean).join('\n\n');
    const user = `Монстры за столом:\n${JSON.stringify(monsters)}\n\nГде они сейчас: ${this.scene}\n\nКарта: уже известные места — ${this.places.map((x) => x.name).join(', ')}\n\n${mapForLich(this.map)}\n\nЦель сейчас: ${this.goal || 'ещё нет, придумай'}\n\nЗадания сейчас: ${this.quests.map((q) => (q.done ? '[выполнено] ' : '') + q.text).join('; ') || 'ещё нет, придумай'}\n\nЛетопись (что уже было):\n${this.notes.slice(-20).join('\n') || 'пока пусто'}\n\n${extra ? extra + '\n\n' : ''}Последние события:\n${this.log.slice(-14).map((l) => `${l.who}: ${l.text}`).join('\n') || 'пока ничего'}\n\nКости сейчас давать: ${bonesNow}.\n\nСейчас: ${what}`;
    const r = await claude(this.env, { system: LICH_SYSTEM, tool: LICH_TOOL, maxTokens: 500, timeout: 15000, user });
    this.cast({ t: 'think', on: false });
    let say, mood = 'ворчит', roll = null, gesture = '';
    if (r.error || !r.out) {
      if (idle) return;                         // пауза не удалась — просто молчим
      say = 'Кхм. Мозги отсырели. Повтори-ка ещё раз.';
      this.cast({ t: 'error', text: r.error || 'мозги молчат' });
    } else {
      const arrive = ev.kind === 'start' || !!r.out.move || !!r.out.place || /^Идём в комнату/.test(ev.text || '');
      say = trimSay(clean(r.out.say, 600), ev.kind === 'start' || ev.kind === 'join' ? null : [...this.players.values()].filter((p) => p.monster).map((p) => p.monster.name), arrive ? 520 : 290); mood = r.out.mood || mood;
      if (['think', 'listen', 'laugh', 'map', 'point', 'sixseven'].includes(r.out.gesture)) gesture = r.out.gesture;
      if (!idle && r.out.scene) this.scene = clean(r.out.scene, 40);
      if (!idle && r.out.roll && DICE.includes(r.out.roll.die)) {
        const target = this.findMonster(r.out.roll.who);
        roll = { pid: target?.pid || null, who: clean(r.out.roll.who, 40), die: r.out.roll.die, why: clean(r.out.roll.why, 80) };
      }
    }
    if (r.out && !idle) {
      this.turnNo++;
      if (r.out.give) this.give(r.out.give);
      if (r.out.pay) this.pay(r.out.pay);
      if (r.out.bones && this.turnNo - 1 - this.bonesAt >= 3) this.award(r.out.bones);
      if (r.out.goal) this.goal = clean(r.out.goal, 80);
      if (Array.isArray(r.out.quests) && r.out.quests.length) this.quests = r.out.quests.slice(0, 4).map((q) => ({ text: clean(q.text, 70), done: !!q.done })).filter((q) => q.text);
      if (r.out.note) { this.notes.push(clean(r.out.note, 140)); if (this.notes.length > 40) this.notes = this.notes.slice(-40); }
      this.paths = (Array.isArray(r.out.paths) ? r.out.paths : []).map((x) => clean(x, 30)).filter(Boolean).slice(0, 3);
      if (r.out.place?.name) this.goto(r.out.place);
      if (r.out.reveal && this.map.rooms[this.map.at]) this.map.rooms[this.map.at].state = 'seen';
      if (r.out.move && this.map) {   // монстр сказал «иду туда» голосом — фишки переходят сами
        const want = clean(r.out.move, 40).toLowerCase().replace(/ё/g, 'е');
        const rr = this.map.rooms.find((x) => x.name && x.name.toLowerCase().replace(/ё/g, 'е') === want) || this.map.rooms.find((x) => x.name && want.includes(x.name.toLowerCase().replace(/ё/g, 'е')));
        const d = rr && rr.id !== this.map.at ? doorBetween(this.map, this.map.at, rr.id) : null;
        if (d && d.state !== 'locked') { enter(this.map, rr.id); this.scene = rr.name; }
      }
      if (r.out.unlock && this.map.want != null) { const to = this.map.want, rr = this.map.rooms[to]; if (rr && doorBetween(this.map, this.map.at, to)) { enter(this.map, to); this.scene = rr.name; } }
      for (const t of ready) t.told = true;     // развязку отдали — второй раз не подсказываем
    }
    const after = ev.kind === 'say' ? `${ev.who}: ${clean(ev.text, 120)}` : ev.kind === 'roll' ? `${ev.who} выбросил ${ev.n} на ${ev.die}` : idle ? 'тишина за столом' : ev.kind;
    this.log.push({ who: 'Лич', text: say });
    if (this.log.length > 60) this.log.splice(0, this.log.length - 60);
    let focus = r.out?.focus || '', focusPid = null;
    if (focus === 'монстр') { const fw = clean(r.out.focus_who, 40).toLowerCase(); focusPid = [...this.players.values()].find((p) => p.monster && fw && (fw.includes(p.monster.name.toLowerCase()) || (p.name && fw.includes(p.name.toLowerCase()))))?.pid || null; if (!focusPid) focus = ''; }
    this.lastLich = { id: ++this.seq, text: say, mood, roll, gesture, focus, focusPid };
    this.lines = [...this.lines, { id: this.seq, text: say, after }].slice(-20);
    this.cast({ t: 'lich', ...this.lastLich });
    this.state();
    if (!idle) this.maybeWrite();
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
      if (url.pathname === '/api/race') return env.ROOMS.get(env.ROOMS.idFromName('__art__')).fetch(request);
      if (url.pathname === '/ws' || url.pathname === '/api/portrait' || url.pathname === '/api/scene') {
        const room = roomOf(url, 'room');
        if (room.length < 4) return new Response('Bad room code', { status: 400 });
        return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
      }
      if (url.pathname === '/api/world') {
        let t = {};
        try { t = await (await env.ROOMS.get(env.ROOMS.idFromName('taste:' + CREW)).fetch('https://taste/taste')).json(); } catch { /* пусто */ }
        const list = (xs, f) => (xs || []).map(f).join('\n') || '—';
        const text = `${LORE}\n${list(t.lore, (x) => '- ' + x)}\n\n## Игрокам понравилось\n\n${list(t.good, (x) => '- ' + x.text)}\n\n## Не понравилось\n\n${list(t.bad, (x) => '- ' + x.text)}\n`;
        return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
      }
      if (url.pathname === '/api/stt' && request.method === 'POST') return stt(request, env);
      if (url.pathname === '/api/voice' && request.method === 'POST') return voice(request, env);
      return env.ASSETS.fetch(request);
    } catch (e) {
      return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: 503 });
    }
  },
};
