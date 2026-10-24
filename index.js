// 识海骨架 · 插件入口
// 只做一件事：把 sea2.db（只读）里的「事 → 版本 → 阶段 → 决定」注册成两个 agent 工具。
//
// 故意不做自动注入：老的 memory-sea 插件有两个坑（会话级封条、拿整条 user 消息撞库）
// 都出在「自动喂」上。这里是纯工具化查询 —— 我想查的时候才查，参数是我自己写的短词。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { searchMemories, readEvent, createStore, resolveDbPath } from './lib/query.mjs';
import { writeMemories, createWriter } from './lib/write.mjs';
import { createApiHandler } from './lib/routes.mjs';
import { tailText } from './lib/tail.mjs';
import { appendLog, captureTurn, sessionEvents, sliceNewEvents } from './lib/capture.mjs';
import { buildSeaSvg } from './lib/sea-svg.mjs';

/** 「最近 10 句」那一节在装配体里的名字 */
const TAIL_SECTION = 'mindsea:tail';

/**
 * 星云壁纸（静态 jpg，1912×1200 那个尺寸压到 400KB 以内）。
 * 路径按插件自己的目录算（import.meta.url），跟进程 cwd 无关。
 */
const NEBULA_BG_PATH = fileURLToPath(new URL('./data/nebula-bg.jpg', import.meta.url));

/**
 * 把星云壁纸当静态资源吐出去：/mindsea/bg/nebula.jpg
 * 只认 GET / HEAD；文件不在就给 404（面板照样开，只是底上没有星云）。
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export function serveNebulaBg(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET, HEAD' });
    res.end('壁纸这一路只读');
    return;
  }
  let buf;
  try {
    buf = readFileSync(NEBULA_BG_PATH);
  } catch (error) {
    console.warn(`[mindsea] 读不到星云壁纸：${NEBULA_BG_PATH}（${(error && error.message) || error}）`);
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('没有壁纸');
    return;
  }
  res.writeHead(200, {
    'content-type': 'image/jpeg',
    'content-length': buf.length,
    'cache-control': 'public, max-age=86400',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(buf);
}

/**
 * 面板样式表：把 memory-eternal 的界面那套 CSS 扒下来、作用域到 `.ms-eternal` 下
 * （2026-10-23 老黄要「可视化完全一样」）。文件在 lib/ui/eternal.css，跟插件一起走。
 */
const ETERNAL_CSS_PATH = fileURLToPath(new URL('./lib/ui/eternal.css', import.meta.url));

/**
 * 把面板样式表吐出去：/mindsea/ui/eternal.css
 * 只认 GET / HEAD；读不到就 404 —— 面板会退回旧的样式，但至少开得起来。
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export function serveEternalCss(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET, HEAD' });
    res.end('样式这一路只读');
    return;
  }
  let buf;
  try {
    buf = readFileSync(ETERNAL_CSS_PATH);
  } catch (error) {
    console.warn(`[mindsea] 读不到面板样式：${ETERNAL_CSS_PATH}（${(error && error.message) || error}）`);
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('没有样式');
    return;
  }
  res.writeHead(200, {
    'content-type': 'text/css; charset=utf-8',
    'content-length': buf.length,
    'cache-control': 'no-cache',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(buf);
}

export const name = 'mindsea-recall';
export const inject = ['tools'];
/** 模型能看见的轴说明，两个工具共用 */
const AXIS_DOC = [
  '三根轴：词轴 q（事名 / 记号词，撞 memories.text 与 events.name）、时间轴 day（2026-10-19 这种，按前缀撞）、情绪轴 emo（七情位图：喜 怒 哀 惧 爱 恶 欲，可连着写表示「或」）。',
  '任传一个或任意组合，多个条件是「并且」。',
].join('');

/**
 * 工具描述里那几个数从库里现算（别写死：库一直在长，写死之后模型看到的是旧账）。
 * @param {any} store
 * @returns {string}
 */
function describeSkeleton(store) {
  const count = (table) => {
    try {
      return Number(store.get(`SELECT count(*) AS c FROM ${table}`)?.c ?? 0);
    } catch {
      return 0;
    }
  };
  let lastAt = '';
  try {
    lastAt = String(store.get('SELECT at FROM memories ORDER BY at DESC, id DESC LIMIT 1')?.at ?? '');
  } catch {
    /* 库还没建好 */
  }
  return [
    `数据是识海骨架（sea2.db，只读）：events ${count('events')} 件事 / versions ${count('versions')} 个版本 / stages ${count('stages')} 个阶段 / decisions ${count('decisions')} 条决定 / memories ${count('memories')} 条话。`,
    '骨架只回答「有这回事、走到哪一步、定过什么」，要原话还得去 memories 里取。',
    lastAt ? `库里的原话到 ${lastAt.slice(0, 16)} 为止（之后的话走自动沉淀）。` : '库里还没有话。',
  ].join('');
}

/**
 * 把一件事摊成几行可读文本
 * @param {any} ev
 * @returns {string[]}
 */
function eventLines(ev) {
  const span = [ev.firstAt, ev.lastAt].map((t) => (t ? String(t).slice(0, 10) : '')).filter(Boolean).join(' ~ ');
  const head =
    `■ ${ev.name}　${ev.hits} 条` +
    (ev.decisions ? `　● 决定 ${ev.decisions}` : '') +
    (ev.topic ? `　【${ev.topic}】` : '') +
    (span ? `　${span}` : '');
  /** @type {string[]} */
  const lines = [head];
  for (const v of ev.versions) {
    lines.push(`    版本 · ${v.name}　${v.hits} 条` + (v.stages.length ? `　阶段：${v.stages.join(' / ')}` : ''));
  }
  for (const d of ev.recentDecisions) {
    lines.push(`    ● ${String(d.at).slice(0, 10)} [关于：${d.obj || '—'}] ${String(d.text).slice(0, 60)}`);
  }
  return lines;
}

/**
 * 闲聊池一条话摊成一行：时间 · 谁 · 分数 + 情绪 · 原文
 * @param {any} w
 * @returns {string}
 */
function wordLine(w) {
  const who = w.speaker === 0 ? '用户' : w.speaker === 1 ? '大肥鱼' : `#${w.speaker}`;
  const emo = w.emo && w.emo.length ? `　${w.emo.join('')}` : '';
  const text = String(w.text ?? '').replace(/\s+/g, ' ').slice(0, 80);
  return `${String(w.at).slice(0, 16)}　${who}　s${w.s}${emo}　${text}`;
}

/**
 * @param {string} axes
 * @param {any} value
 * @returns {string}
 */
function chatHead(axes, value) {
  const base = `=== 撞 ${axes} → 闲聊池命中 ${value.hitCount} 条（没挂事的话）`;
  return value.words.length ? `${base}，这里给最近 ${value.words.length} 条 ===` : `${base} ===`;
}

/**
 * @param {any} value
 * @returns {string}
 */
function allChatHead(value) {
  const base = `--- 没挂事的话（闲聊池 / 废话池）命中 ${value.chatHitCount} 条`;
  return value.words.length ? `${base}，这里给最近 ${value.words.length} 条 ---` : `${base} ---`;
}

/**
 * @param {any} _args
 * @param {any} value
 * @returns {{ type: 'text', text: string }[]}
 */
function renderSearch(_args, value) {
  /** @type {string[]} */
  const lines = [];
  const pool = value.pool ?? 'event';

  // pool=chat：没有事可摊，按时间倒序给一列话
  if (pool === 'chat') {
    lines.push(chatHead(value.axes, value));
    for (const w of value.words) lines.push(wordLine(w));
    if (value.note) lines.push('', value.note);
    return [{ type: 'text', text: lines.join('\n') }];
  }

  // pool=event（默认）跟 pool=all 的前半段，都是原样那一套
  if (!value.axes) {
    lines.push('没给轴。' + value.note);
  } else {
    lines.push(`=== 撞 ${value.axes} → 命中 ${value.hitCount} 条（只算挂在事上的），落在 ${value.eventCount} 件事上 ===`);
    for (const ev of value.events) {
      if (lines.length > 1) lines.push('');
      lines.push(...eventLines(ev));
    }
  }
  if (pool === 'all') {
    lines.push('', allChatHead(value));
    for (const w of value.words) lines.push(wordLine(w));
  }
  if (value.note) lines.push('', value.note);
  return [{ type: 'text', text: lines.join('\n') }];
}

/**
 * @param {any} value
 * @returns {{ type: 'text', text: string }[]}
 */
function renderEvent(_args, value) {
  /** @type {string[]} */
  const lines = [];
  if (!value.ok) {
    lines.push(`■ ${value.name}：骨架里没有这件。`);
    if (value.candidates.length) lines.push('相近的事：' + value.candidates.join(' / '));
    if (value.note && !value.note.includes('骨架里没有这件')) lines.push(value.note);
    return [{ type: 'text', text: lines.join('\n') }];
  }
  const span = [value.firstAt, value.lastAt].map((t) => (t ? t.slice(0, 10) : '')).filter(Boolean).join(' ~ ');
  lines.push(
    `■ ${value.name}　${value.hits} 条　● 决定 ${value.decisions}` +
      (value.topic ? `　【${value.topic}】` : '') +
      (span ? `　${span}` : ''),
  );
  if (!value.versions.length) lines.push('  （没有版本）');
  for (const v of value.versions) {
    lines.push(`  版本 · ${v.name}　${v.hits} 条`);
    if (v.stages.length) lines.push('    阶段：' + v.stages.map((s) => `${s.name}(${s.hits})`).join(' / '));
  }
  if (!value.decisionsList.length) lines.push('  （没有决定）');
  for (const d of value.decisionsList) {
    lines.push(`  ● ${d.at.slice(0, 10)} [关于：${d.obj || '—'}] ${d.text.slice(0, 60)}`);
  }
  if (value.note) lines.push('', value.note);
  return [{ type: 'text', text: lines.join('\n') }];
}

const MEMORY_HIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'topic', 'hits', 'decisions', 'totalInEvent', 'firstAt', 'lastAt', 'versions', 'recentDecisions'],
  properties: {
    name: { type: 'string', description: '事的名字' },
    topic: { type: 'string', description: '大话题，可能为空' },
    hits: { type: 'integer', description: '这次撞上的条数（只算挂在事上的话）' },
    decisions: { type: 'integer', description: '撞上的话里有几条是决定' },
    totalInEvent: { type: 'integer', description: '这件事总共有几条话' },
    firstAt: { type: 'string', description: '这件事最早一条话的时间' },
    lastAt: { type: 'string', description: '这件事撞上的话里最晚的时间' },
    versions: {
      type: 'array',
      description: '按撞上的条数排的版本分布（最多 4 个）',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'hits', 'stages'],
        properties: {
          name: { type: 'string' },
          hits: { type: 'integer' },
          stages: { type: 'array', items: { type: 'string' }, description: '这个版本走到的阶段名（最多 3 个）' },
        },
      },
    },
    recentDecisions: {
      type: 'array',
      description: '这件事最近几条决定，按时间正序',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['at', 'obj', 'text'],
        properties: {
          at: { type: 'string' },
          obj: { type: 'string', description: '这条决定「关于什么」' },
          text: { type: 'string' },
        },
      },
    },
  },
};

const WORD_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'at', 'speaker', 's', 'emo', 'text'],
  properties: {
    id: { type: 'integer', description: '这条话在 memories 里的 id' },
    at: { type: 'string', description: '时间，YYYY-MM-DD HH:mm:ss' },
    speaker: { type: 'integer', description: '0 = 用户，1 = 大肥鱼' },
    s: { type: 'integer', description: '这句话的分量 0~100' },
    emo: { type: 'array', items: { type: 'string' }, description: '七情（一句可以带几种），可能为空' },
    text: { type: 'string', description: '原话' },
  },
};

const SEARCH_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'axes', 'hitCount', 'note'],
  properties: {
    ok: { type: 'boolean', description: '查询本身跑通了没有' },
    axes: { type: 'string', description: '这次用了哪几根轴，例如 `词「云盘」`' },
    hitCount: {
      type: 'integer',
      description:
        '命中的话数（pool=chat 时是闲聊池命中的总数；pool=all 时这里只算挂在事上的，闲聊池那条数在 chatHitCount）',
    },
    eventCount: { type: 'integer', description: '命中落在几件事上（pool=chat 没有这个字段）' },
    events: { type: 'array', items: MEMORY_HIT_SCHEMA, description: '按命中条数排的事，最多 limit 件（pool=chat 没有这个字段）' },
    pool: {
      type: 'string',
      description: '这次查的是哪个池子（只有 chat / all 会带；默认的 event 不带这个字段，保持老格式不变）',
    },
    chatHitCount: { type: 'integer', description: 'pool=all 时：没挂事的话（闲聊池 / 废话池）命中多少条' },
    words: {
      type: 'array',
      items: WORD_ITEM_SCHEMA,
      description: 'pool=chat / all 时：按时间倒序的一列话（默认最多 30 条，limit 可调，最多 100）',
    },
    note: { type: 'string', description: '提示（没撞到 / 只摊了前几件 / 只给最近几条 / 空）' },
  },
};

const EVENT_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'name', 'topic', 'hits', 'decisions', 'firstAt', 'lastAt', 'versions', 'decisionsList', 'candidates', 'note'],
  properties: {
    ok: { type: 'boolean', description: '骨架里有没有这件' },
    name: { type: 'string', description: '实际摊开的事名（近似匹配时是库里的名字）' },
    topic: { type: 'string' },
    hits: { type: 'integer', description: '这件事总共几条话' },
    decisions: { type: 'integer', description: '这件事有决定几条' },
    firstAt: { type: 'string' },
    lastAt: { type: 'string' },
    versions: {
      type: 'array',
      description: '版本（按条数降序），每个版本带它自己的阶段',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'hits', 'stages'],
        properties: {
          name: { type: 'string' },
          hits: { type: 'integer' },
          stages: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'hits'],
              properties: { name: { type: 'string' }, hits: { type: 'integer' } },
            },
          },
        },
      },
    },
    decisionsList: {
      type: 'array',
      description: '全部决定，按时间正序',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['at', 'obj', 'text', 'memoryId'],
        properties: {
          at: { type: 'string' },
          obj: { type: 'string' },
          text: { type: 'string' },
          memoryId: { type: 'integer', description: '这条决定的原话 id（0 = 没记到原话）' },
        },
      },
    },
    candidates: { type: 'array', items: { type: 'string' }, description: '没找到时给出的相近事名' },
    note: { type: 'string' },
  },
};

/**
 * 把写入结果摊成几行人话
 * @param {any} value
 * @returns {{ type: 'text', text: string }[]}
 */
function renderWrite(_args, value) {
  /** @type {string[]} */
  const lines = [];
  const touched = value.created.events.length + value.created.versions.length + value.created.stages.length;
  if (value.ok) {
    lines.push(`✓ 写进去了 ${value.written} 条（id ${value.ids.join(', ')}）`);
  } else if (value.written > 0) {
    lines.push(`△ 只写进去 ${value.written} 条（id ${value.ids.join(', ')}），有 ${value.errors.length} 条没成`);
  } else {
    lines.push('✗ 一条都没写进去（库没动）');
  }
  if (touched) {
    /** @type {string[]} */
    const parts = [];
    if (value.created.events.length) parts.push(`事 ${value.created.events.length} 件（${value.created.events.join('、')}）`);
    if (value.created.versions.length) parts.push(`版本 ${value.created.versions.length} 个（${value.created.versions.join('、')}）`);
    if (value.created.stages.length) parts.push(`阶段 ${value.created.stages.length} 个（${value.created.stages.join('、')}）`);
    lines.push('新开：' + parts.join('　'));
  } else if (value.written > 0) {
    lines.push('没新开事 / 版本 / 阶段 —— 全复用了现有的。');
  }
  for (const err of value.errors) lines.push(`　! ${err}`);
  return [{ type: 'text', text: lines.join('\n') }];
}

const WRITE_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'written', 'ids', 'created', 'errors'],
  properties: {
    ok: { type: 'boolean', description: '整批都写进去了没有（false 时看 errors）' },
    written: { type: 'integer', description: '实际写进 memories 几条' },
    ids: { type: 'array', items: { type: 'integer' }, description: '刚写进去的 memories id，按传进来的顺序' },
    created: {
      type: 'object',
      additionalProperties: false,
      required: ['events', 'versions', 'stages'],
      properties: {
        events: { type: 'array', items: { type: 'string' }, description: '这一趟新开的事名（同名的复用，不列在这里）' },
        versions: { type: 'array', items: { type: 'string' }, description: '这一趟新开的版本名' },
        stages: { type: 'array', items: { type: 'string' }, description: '这一趟新开的阶段名' },
      },
      description: '这一趟新开了什么（复用的不列）',
    },
    errors: { type: 'array', items: { type: 'string' }, description: '写不进去的原因，一条一句人话；空 = 全写进去了' },
  },
};

/**
 * @param {{ dbPath?: string }} [config]
 */
export function apply(ctx, config) {
  const dbPath = resolveDbPath(config ?? {});
  /** 自动沉淀开着没（补丁里给 config.autoCapture = false 就关） */
  const captureEnabled = config?.autoCapture !== false;
  const store = createStore(dbPath);
  /** 工具描述里那行「数据是识海骨架…」—— 注册时从库里读一次真实计数 */
  const sharedNote = describeSkeleton(store);
  ctx.effect(() => () => store.close());

  // 写连接另开一个（store 那条保持只读），关的时候一起收
  const writer = createWriter(dbPath);
  ctx.effect(() => () => writer.close());

  ctx.tools.register({
    name: 'memory_search',
    description:
      '翻识海骨架：给一个词 / 一天 / 一种情绪，摊出「那是哪几件事」，每件事带版本分布、阶段、最近几条决定。' +
      ' pool 选查哪一摊：event（默认）＝只查挂在事上的话，摊成事；chat ＝不查事，直接查「没挂事的话」（判工里的闲聊池 chat / 废话池 trash，落到库里就是 event_id IS NULL），按时间倒序给一列话（id / 时间 / 谁 / 分数 / 七情 / 原话）；all ＝两边都要，先摊事，末尾再列一节没挂事的话。' +
      AXIS_DOC +
      ' 撞「还记得吗 / 上次那个 / 以前怎么定的」这类话，先查这里，别凭印象说。翻不到先换词（撞行为/结果而不是功能名）、实在没有再用 pool:"all" 把闲聊池也扫一遍，至少试三次再承认没有。' +
      sharedNote,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        q: {
          type: 'string',
          description: '词轴：一个短词或事名，比如「云盘」「一南」「桌宠改造」。pool=event / all 时撞 memories.text 和 events.name；pool=chat 时只撞 memories.text。',
        },
        day: { type: 'string', description: '时间轴：2026-10-19，也可以只给 2026-10 按前缀撞。' },
        emo: { type: 'string', description: '情绪轴：七情之一 喜 怒 哀 惧 爱 恶 欲，可以连着写（「喜爱」= 喜或爱）。' },
        pool: {
          type: 'string',
          enum: ['event', 'chat', 'all'],
          description:
            '查哪个池子，默认 event。event = 挂在事上的话，摊成「哪几件事」（原来的行为，输出格式不变）；' +
            'chat = 没挂事的话（闲聊池 / 废话池，库里 event_id IS NULL），不查事，按时间倒序给一列话；' +
            'all = 两边都要：先摊事，再补一节没挂事的话。',
        },
        limit: {
          type: 'integer',
          description:
            '摊几条。pool=event / all 时是「摊开几件事」，默认 6，最多 20；pool=chat 时是「给几条话」，默认 30，最多 100。',
        },
      },
    },
    output: { schema: SEARCH_OUTPUT, render: renderSearch },
    execute(args) {
      const input = /** @type {Record<string, unknown>} */ (args ?? {});
      const value = searchMemories(store, input);
      return Promise.resolve(value);
    },
    presentCall: (args) => ({
      card: 'generic',
      title: '翻识海骨架',
      kind: 'search',
      rawInput: args,
    }),
  });

  ctx.tools.register({
    name: 'memory_event',
    description:
      '翻识海骨架：给一个事名，把它整棵摊开 —— 版本 → 阶段 → 决定，一件不藏。' +
      ' 当 memory_search 已经指出是哪件事、要看清它走到哪一步时用它；事名记不准就给个大概，会回一份相近事名让你挑。' +
      sharedNote,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { type: 'string', description: '事名，比如「记忆跨设备同步」「桌宠改造」。' },
      },
    },
    output: { schema: EVENT_OUTPUT, render: renderEvent },
    execute(args) {
      const input = /** @type {Record<string, unknown>} */ (args ?? {});
      const value = readEvent(store, input);
      return Promise.resolve(value);
    },
    presentCall: (args) => ({
      card: 'generic',
      title: '摊开一件事',
      kind: 'read',
      rawInput: args,
    }),
  });

  ctx.tools.register({
    name: 'memory_write',
    description:
      '往识海骨架里写话：我把判好的话传进来，它负责落库 —— memories 落一条，缺的事 / 版本 / 阶段顺手建出来，是决定的再记一条决定。' +
      ' 每轮聊完调一次：这一轮值得留的话逐条给 text（原话）、at（本地时间）、speaker（0=用户 / 1=大肥鱼），' +
      '再判它属于哪件事（ev）、哪个版本（nd）、哪个阶段（st），打一个 0~100 的分（s），标七情（emo），是条决定就 dec=1 并给 decobj（这条决定关于什么）。' +
      ' 事名拿不准先 memory_search 撞一下现有清单，撞上就复用同名（同名自动复用，同一批里 ev 相同的只建一次），撞不上才新开。' +
      ' 不判就是不写 —— 拿不准归属就留空 ev（进闲聊池），别硬塞。' +
      ' 只 INSERT，绝不改老数据；写不进去会明确报错（errors[]），不会静默跳过。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          description: '要落库的话，一条一句',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['text', 'speaker'],
            properties: {
              text: { type: 'string', description: '那句原话（必填，尽量别截断）' },
              at: { type: 'string', description: '本地时间，写成 2026-10-23 11:30:00；不传就用当前时间' },
              speaker: { type: 'integer', enum: [0, 1], description: '0 = 用户，1 = 大肥鱼（必填）' },
              ev: { type: 'string', description: '事名，可空。空 = 不进事，落进闲聊池。' },
              nd: { type: 'string', description: '版本名，可空。给了 nd 必须给 ev。' },
              st: { type: 'string', description: '阶段名，可空。给了 st 必须给 nd。' },
              s: { type: 'integer', description: '分数 0~100，默认 50。不夹紧 —— 超范围直接报错。' },
              emo: {
                type: 'array',
                items: { type: 'string', enum: ['喜', '怒', '哀', '惧', '爱', '恶', '欲'] },
                description: '七情，可空；一句可以带几种',
              },
              dec: { type: 'integer', enum: [0, 1], description: '这条是不是决定（0 不是 / 1 是）' },
              decobj: { type: 'string', description: '决定关于什么，比如「记忆怎么存」；dec=1 时必填' },
            },
          },
        },
      },
    },
    output: { schema: WRITE_OUTPUT, render: renderWrite },
    execute(args) {
      const input = /** @type {Record<string, unknown>} */ (args ?? {});
      return Promise.resolve(writeMemories(writer, input));
    },
    presentCall: (args) => ({
      card: 'generic',
      title: '往骨架里写话',
      kind: 'write',
      rawInput: args,
    }),
  });

  // ── 读钩子 · 最小版（2026-10-23）────────────────────────────────────────────
  // 每个会话的**第一轮**，把最近 10 句原话（memories 里 ORDER BY at DESC LIMIT 10）
  // 正序推进系统提示词，让新窗口一开口就接得上上一场。
  //
  // 只封「推 10 句」这一件事，三条硬规矩写在下面：
  //   1. 一个会话只推一次 —— 封的是「会话 id → 推过了」这条内存 Map，
  //      不是会话状态。之后每轮都不会再追加（不然就是复读，白烧 token）。
  //   2. 绝不做「会话封条」—— 老插件把会话标成 complete 之后
  //      连工具召回一起锁死了。这里一个会话状态都不写：
  //      memory_search / memory_event / memory_write 照常每轮都能用。
  //   3. 只放原话 —— 不掺运行时快照、不掺系统提示、不掺工具结果。
  //
  // 不落库：进程重启 Map 就空（可接受：新进程里多推一次，比想不起来强）。
  const tailPushed = new Map();
  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    // 先让别的监听跑完，再在最终装配体上补一节（append 到 contexts 末尾）
    const result = await next();
    try {
      const agent = context?.agent;
      const session = agent?.session;
      const sid = session?.id ?? session?.header?.id;
      if (!sid || tailPushed.get(sid)) return result;
      // 只给用户真正看得见的窗口推：子代理（工具工人）是会话、但他不看，
      // 每个子代理都推一遍纯属白烧 token。确认不了就当是顶层，照推。
      const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined;
      const roots = typeof agents?.roots === 'function' ? agents.roots() : undefined;
      if (Array.isArray(roots) && roots.length > 0 && agent !== undefined && !roots.includes(agent)) return result;
      const list = result?.contexts;
      if (!Array.isArray(list)) return result;
      const text = tailText(store); // 只读连接；库不在 / 没话 → 空串
      if (!text) return result; // 读不到就不封，下一轮还能补
      if (!list.some((entry) => entry && entry.name === TAIL_SECTION)) {
        list.push({ name: TAIL_SECTION, text, interpolate: false });
      }
      tailPushed.set(sid, true);
    } catch (error) {
      // 钩子里出事一律不外抛，别拖垮这一轮
      console.warn(`[mindsea] 推最近原话失败（这一轮跳过）：${error?.message ?? error}`);
    }
    return result;
  });

  // ── 写钩子 · 自动沉淀（2026-10-23）──────────────────────────────────────────
  // 每轮聊完，把这一轮新回来的话判一遍、落进 memories。
  // 判的口径写在 lib/capture.mjs 的 JUDGE_SYSTEM 里；这里只负责接线和闸门：
  //   1. 监听器里**不 await 模型** —— turn-stopping 是 serial 事件，等模型会拖住整轮收尾。
  //   2. 只沉淀**顶层会话** —— 子代理（判工工人）的轮次不进记忆，不然库会被判工回执灌满。
  //   3. 后台**串行** —— 同一个库两条连接同时写容易撞 busy_timeout，排队最稳。
  // 要关掉：给补丁里这一行加 config: { autoCapture: false }。
  if (captureEnabled) {
    ctx.inject(['llm'], (scoped) => {
      const llm = scoped && scoped.llm;
      if (!llm || typeof llm.stream !== 'function') return;

      /** @type {Map<string, { agent: any, events: any[] }>} 每个会话攒着还没判的那一批 */
      const pending = new Map();
      /** @type {Map<string, number>} 每个会话已经交出去的 seq 水位 */
      const watermarks = new Map();
      /** @type {Promise<void>} 后台队列：一个接一个跑，不并发写库 */
      let chain = Promise.resolve();
      /** 见过的会话：第一次见到时记一条日志，方便查别的通道有没有在沉淀 */
      const seenSessions = new Set();

      const drain = async (sid) => {
        const job = pending.get(sid);
        if (!job) return;
        pending.delete(sid);
        try {
          const result = await captureTurn({
            llm,
            writer,
            store,
            agent: job.agent,
            events: job.events,
            provider: config?.captureProvider,
            model: config?.captureModel,
            maxTokens: config?.captureMaxTokens,
          });
          if (result.written > 0) {
            console.log(`[mindsea] 沉了 ${result.written} 条（这一轮 ${result.lines} 句 / ${result.chars} 字）`);
          }
        } catch (error) {
          // 后台出事不能拖垮主流程，但要留痕（日志文件 data/capture-log.jsonl）
          appendLog({ level: 'fail', session: sid, reason: `后台判轮炸了：${error?.message ?? error}` });
          console.warn(`[mindsea] 自动沉淀失败：${error?.message ?? error}`);
        }
      };

      const enqueue = (sid, agent, events) => {
        const waiting = pending.get(sid);
        if (waiting) waiting.events.push(...events);
        else pending.set(sid, { agent, events: [...events] });
        chain = chain.then(() => drain(sid)).catch(() => {});
      };

      scoped.on('agent/turn-stopping', ({ agent }) => {
        try {
          const session = agent?.session;
          const sid = session?.id ?? session?.header?.id ?? agent?.id;
          if (!sid) return;
          const key0 = String(sid);

          // 只给真人看得见的窗口沉淀：子代理也是会话，但它的话不进记忆。
          const agents = typeof scoped.get === 'function' ? scoped.get('agents') : undefined;
          const roots = typeof agents?.roots === 'function' ? agents.roots() : undefined;
          const isRoot =
            Array.isArray(roots) && roots.length > 0 && agent !== undefined ? roots.includes(agent) : true;

          // 每个会话第一次见到都留一条痕 —— 查「QQ / 微信那条线到底会不会沉淀」就靠它
          if (!seenSessions.has(key0)) {
            seenSessions.add(key0);
            appendLog({
              level: 'listen',
              session: key0,
              root: isRoot,
              cwd: String(session?.header?.cwd ?? session?.cwd ?? ''),
              reason: isRoot ? '会话接入：会沉淀' : '会话接入：不是顶层，跳过',
            });
          }
          if (!isRoot) return;

          const all = sessionEvents(session);
          if (!all.length) return;

          const key = String(sid);
          let lastSeq = watermarks.get(key);
          if (lastSeq === undefined) {
            // 第一次见这个会话：别把整段历史重判一遍（旧历史早判工进库了），
            // 从最近 20 条消息起算，最多把上一场的尾巴带上。
            const msgs = all.filter((e) => e?.type === 'user/message' || e?.type === 'assistant/message');
            const base = msgs.length > 20 ? msgs[msgs.length - 20]?.seq : undefined;
            lastSeq = typeof base === 'number' ? base - 1 : -1;
          }
          const fresh = sliceNewEvents(all, lastSeq);
          const tail = all[all.length - 1];
          const nextSeq = typeof tail?.seq === 'number' ? tail.seq : lastSeq;
          // 水位：把这一批交出去就算处理过（判失败也不重跑，免得下一轮把旧话重写一遍）
          if (nextSeq > lastSeq) watermarks.set(key, nextSeq);
          if (fresh.length) enqueue(key, agent, fresh);

          // 长跑进程里会话数会一直涨，超过 200 就把一天没动静的水位清掉
          if (watermarks.size > 200) {
            watermarks.clear();
            pending.clear();
          }
        } catch (error) {
          appendLog({ level: 'fail', reason: `监听异常：${error?.message ?? error}` });
          console.warn(`[mindsea] turn-stopping 监听器出事了（这一轮跳过）：${error?.message ?? error}`);
        }
      });

      ctx.effect(() => () => {
        pending.clear();
        chain = Promise.resolve();
      });
    });
  }

  // ── 面板的数据路由（只读）──────────────────────────────────────────────────
  // 浏览器那半边拿不到 sqlite，所以库里的东西得从这儿吐：
  // 挂在 webServer 的 /mindsea/api 前缀上，只认 GET；一句写都没有。
  // 三个工具的行为一个字没动 —— 这段是另加的，跟上面那些 register 不相干。
  //
  // 外加一条静态图：/mindsea/bg/nebula.jpg —— 面板那八页的星云壁纸。
  // 是**一张截好的 jpg**（data/nebula-bg.jpg），不是实时 canvas：8,335 个点一直重绘
  // 再叠大面积毛玻璃，帧率会掉到 20 上下。壁纸只在别的八页用，「识海」那一页
  // 还是活的 canvas（能拖能滚轮）。
  ctx.inject(['webServer'], (scoped) => {
    const server = scoped && scoped.webServer;
    if (!server || typeof server.register !== 'function') return;
    const handler = createApiHandler({ store, dbPath, capture: { enabled: captureEnabled }, writer });
    const disposers = [];

    // ① 数据（prefix）
    try {
      disposers.push(server.register({ kind: 'prefix', path: '/mindsea/api', handler }));
    } catch (error) {
      console.warn(`[mindsea] 面板路由挂载失败：${(error && error.message) || error}`);
      return;
    }

    // ② 星云壁纸（exact，静态文件）
    try {
      disposers.push(server.register({ kind: 'exact', path: '/mindsea/bg/nebula.jpg', handler: serveNebulaBg }));
    } catch (error) {
      console.warn(`[mindsea] 壁纸路由挂载失败（面板照常，只是底上没有星云）：${(error && error.message) || error}`);
    }

    // ③ 面板样式表（exact，静态文件）—— 跟 memory-eternal 的界面同一套
    try {
      disposers.push(server.register({ kind: 'exact', path: '/mindsea/ui/eternal.css', handler: serveEternalCss }));
    } catch (error) {
      console.warn(`[mindsea] 样式路由挂载失败（面板会退回旧样式）：${(error && error.message) || error}`);
    }

    // ④ 识海图谱（exact，现画现给）—— 知识卡页的背景就是这张图
    try {
      disposers.push(
        server.register({
          kind: 'exact',
          path: '/mindsea/ui/sea.svg',
          handler: (req, res) => {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
              res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET, HEAD' });
              res.end('图谱这一路只读');
              return;
            }
            let svg = '';
            try {
              svg = buildSeaSvg(store);
            } catch (error) {
              console.warn(`[mindsea] 画识海图谱失败：${(error && error.message) || error}`);
            }
            const buf = Buffer.from(svg || '<svg xmlns="http://www.w3.org/2000/svg"/>', 'utf8');
            res.writeHead(200, {
              'content-type': 'image/svg+xml; charset=utf-8',
              'content-length': buf.length,
              'cache-control': 'no-cache',
            });
            if (req.method === 'HEAD') {
              res.end();
              return;
            }
            res.end(buf);
          },
        }),
      );
    } catch (error) {
      console.warn(`[mindsea] 图谱路由挂载失败（背景会退回纯色）：${(error && error.message) || error}`);
    }

    scoped.effect(() => () => {
      for (const dispose of disposers.splice(0)) {
        try {
          dispose();
        } catch {
          /* 已经没了就算了 */
        }
      }
    });
  });
}
