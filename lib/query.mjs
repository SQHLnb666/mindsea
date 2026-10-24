// 识海骨架 · 只读查询核心
// 口径照抄 mindsea/scripts/msq.mjs（那边已跑通），这里把它做成可被插件 import 的函数。
// 铁律：sea2.db 只读，一个字节都不写。
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

/** 七情位图的顺序（跟老 msq.mjs 一致：喜=1 … 欲=7，取位用 substr(emotion, 8-idx, 1)） */
export const EMO_ORDER = ['喜', '怒', '哀', '惧', '爱', '恶', '欲'];
const EMO_BITS = new Map(EMO_ORDER.map((ch, i) => [ch, i + 1]));

/** 默认库：本文件在 mindsea/plugin/lib/ 下，库在 mindsea/sea2.db（往上两级） */
export const DEFAULT_DB_PATH = fileURLToPath(new URL('../../sea2.db', import.meta.url));

const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 6;
const DEFAULT_DECISIONS = 3;

/** 闲聊池一列话：默认给最近 30 条，最多 100 条 */
const MAX_WORDS = 100;
const DEFAULT_WORDS = 30;

/** 三个池子：事上挂的话 / 没挂事的（闲聊池、废话池）/ 两边都要 */
const POOLS = /** @type {const} */ (['event', 'chat', 'all']);

/**
 * 库路径优先级：环境变量 DSH_MINDSEA_DB > 插件配置 dbPath > 默认（mindsea/sea2.db）
 * @param {{ dbPath?: string }} [config]
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function resolveDbPath(config = {}, env = process.env) {
  const fromEnv = typeof env?.DSH_MINDSEA_DB === 'string' ? env.DSH_MINDSEA_DB.trim() : '';
  const fromConfig = config?.dbPath ? String(config.dbPath).trim() : '';
  return fromEnv || fromConfig || DEFAULT_DB_PATH;
}

/**
 * 开一个只读连接并缓存；库不干净、路径不对时给出中文原因。
 * @param {string} dbPath
 */
export function createStore(dbPath = DEFAULT_DB_PATH) {
  let db = null;
  const handle = () => {
    if (db) return db;
    try {
      db = new DatabaseSync(dbPath, { readOnly: true });
    } catch (cause) {
      throw new Error(`打不开识海库（只读）：${dbPath}\n原因：${cause?.message ?? cause}`);
    }
    return db;
  };
  return {
    path: dbPath,
    handle,
    /** @param {string} sql @param {...unknown} params */
    all: (sql, ...params) => handle().prepare(sql).all(...params),
    /** @param {string} sql @param {...unknown} params */
    get: (sql, ...params) => handle().prepare(sql).get(...params),
    close: () => {
      if (db) {
        try {
          db.close();
        } catch {
          /* 关不掉就交给进程回收 */
        }
        db = null;
      }
    },
  };
}

/** 模块级默认 store（给 node 直接调用 / 自测用） */
let defaultStore = null;
export function defaultStore_() {
  if (!defaultStore) defaultStore = createStore(resolveDbPath());
  return defaultStore;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function trimText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

/**
 * @param {unknown} limit
 * @returns {number}
 */
function clampLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_LIMIT);
}

/**
 * 闲聊池给几条话：默认 30，上限 100（跟 event 的 limit 是两套夹法，别混）
 * @param {unknown} limit
 * @returns {number}
 */
function clampWordsLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_WORDS;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_WORDS);
}

/**
 * 池子：event（默认）/ chat（没挂事的话）/ all（两边都要）。
 * 不认识就报错 —— 跟 emo 轴一个口径，不悄悄当成默认值吞掉。
 * @param {unknown} value
 * @returns {'event' | 'chat' | 'all'}
 */
function parsePool(value) {
  const text = trimText(value).toLowerCase();
  if (!text) return 'event';
  if (!POOLS.includes(/** @type {any} */ (text))) {
    throw new Error(`pool 只能写 event / chat / all，收到：${text}`);
  }
  return /** @type {'event' | 'chat' | 'all'} */ (text);
}

/**
 * 位图 → 七情名数组（跟 lib/write.mjs 的 emotionBitmap 互逆；取位公式同 EMO_ORDER 那行注释）
 * @param {unknown} emotion
 * @returns {string[]}
 */
export function emotionNames(emotion) {
  const text = String(emotion ?? '');
  /** @type {string[]} */
  const out = [];
  for (let idx = 1; idx <= 7; idx += 1) {
    if (text[8 - idx - 1] === '1') out.push(EMO_ORDER[idx - 1]);
  }
  return out;
}

/**
 * 时间轴：接受 2026-10-19 / 2026-10 / 2026-10-1（按前缀撞）
 * @param {unknown} day
 * @returns {string}
 */
function parseDay(day) {
  const text = trimText(day);
  if (!text) return '';
  if (!/^\d{4}(-\d{1,2}){0,2}$/.test(text)) {
    throw new Error(`day 要写成 2026-10-19 这种（也可以只给 2026-10），收到：${text}`);
  }
  return text;
}

/**
 * 情绪轴：可以一个，也可以连着写（「喜爱」= 喜 or 爱）
 * @param {unknown} emo
 * @returns {{ ch: string, bit: number }[]}
 */
function parseEmo(emo) {
  const text = trimText(emo);
  if (!text) return [];
  /** @type {{ ch: string, bit: number }[]} */
  const bits = [];
  for (const ch of text) {
    const bit = EMO_BITS.get(ch);
    if (bit) bits.push({ ch, bit });
  }
  if (bits.length === 0) {
    throw new Error(`emo 要写七情之一：${EMO_ORDER.join(' ')}（可以连着写，比如「喜爱」）。收到：${text}`);
  }
  return bits;
}

/**
 * 撞词：文本命中，或者事名本身命中（设计里「词只挂在事上」）
 * @param {unknown} q
 * @returns {string}
 */
function parseQ(q) {
  return trimText(q);
}

/**
 * @param {{ q: string, day: string, bits: { ch: string, bit: number }[] }} axes
 * @returns {string}
 */
function describeAxes({ q, day, bits }) {
  const parts = [];
  if (q) parts.push(`词「${q}」`);
  if (day) parts.push(`时间「${day}」`);
  if (bits.length) parts.push(`情绪「${bits.map((b) => b.ch).join('')}」`);
  return parts.join(' + ');
}

/**
 * 【池子 · event】三根轴任传一个或组合 → 命中的事（按命中条数排），每件事带版本分布 + 阶段 + 最近的决定。
 * ⚠️ 这条路径的返回格式是对外承诺过的（有别的代码 / 文档依赖它），**一个字都不许改**。
 * @param {ReturnType<typeof createStore>} store
 * @param {{ q: string, day: string, bits: { ch: string, bit: number }[], limit: number, perEvent: number }} axes
 */
function searchEventPool(store, { q, day, bits, limit, perEvent }) {
  const where = [];
  const params = [];
  if (q) {
    where.push('(m.text LIKE ? OR e.name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (day) {
    where.push('m.at LIKE ?');
    params.push(`${day}%`);
  }
  if (bits.length) {
    // 位图第 bit 位（从右数）：8 - bit 即字符位置；位置都是白名单算出来的，直接内联
    where.push('(' + bits.map((b) => `substr(m.emotion, ${8 - b.bit}, 1) = '1'`).join(' OR ') + ')');
  }

  const rows = store.all(
    `SELECT m.id AS id, m.at AS at, m.dec AS dec, m.event_id AS event_id, m.version_id AS version_id
       FROM memories m
       JOIN events e ON e.id = m.event_id
      WHERE ${where.join(' AND ')}`,
    ...params,
  );

  /** @type {Map<number, { hits: number, dec: number, vers: Map<number, number>, lastAt: string }>} */
  const byEvent = new Map();
  for (const row of rows) {
    let slot = byEvent.get(row.event_id);
    if (!slot) {
      slot = { hits: 0, dec: 0, vers: new Map(), lastAt: '' };
      byEvent.set(row.event_id, slot);
    }
    slot.hits += 1;
    if (Number(row.dec) === 1) slot.dec += 1;
    if (row.version_id !== null && row.version_id !== undefined) {
      slot.vers.set(row.version_id, (slot.vers.get(row.version_id) ?? 0) + 1);
    }
    if (row.at && String(row.at) > slot.lastAt) slot.lastAt = String(row.at);
  }

  const ordered = [...byEvent.entries()].sort(
    (a, b) => b[1].hits - a[1].hits || b[1].dec - a[1].dec || (a[1].lastAt < b[1].lastAt ? 1 : -1),
  );
  const picked = ordered.slice(0, limit);

  const events = picked.map(([eventId, slot]) => {
    const ev = store.get('SELECT id, name, topic, n, dec_count, first_at, last_at FROM events WHERE id = ?', eventId);
    const versions = [...slot.vers.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([versionId, count]) => {
        const v = store.get('SELECT name FROM versions WHERE id = ?', versionId);
        const stages = store
          .all('SELECT name, n FROM stages WHERE version_id = ? ORDER BY n DESC, id ASC LIMIT 3', versionId)
          .map((s) => String(s.name));
        return { name: v ? String(v.name) : '（版本已不在表里）', hits: count, stages };
      });
    const recent = store
      .all(
        'SELECT at, obj, text FROM decisions WHERE event_id = ? ORDER BY at DESC, id DESC LIMIT ?',
        eventId,
        perEvent,
      )
      .reverse()
      .map((d) => ({
        at: String(d.at ?? ''),
        obj: String(d.obj ?? ''),
        text: String(d.text ?? '').replace(/\s+/g, ' '),
      }));
    return {
      name: ev ? String(ev.name) : `（事 #${eventId} 已不在表里）`,
      topic: ev ? String(ev.topic ?? '') : '',
      hits: slot.hits,
      decisions: slot.dec,
      totalInEvent: ev ? Number(ev.n ?? 0) : 0,
      firstAt: ev ? String(ev.first_at ?? '') : '',
      lastAt: slot.lastAt || (ev ? String(ev.last_at ?? '') : ''),
      versions,
      recentDecisions: recent,
    };
  });

  let note = '';
  if (ordered.length === 0) {
    note = '没撞到。换个词（撞行为/结果而不是功能名）、换根轴，或者用 memory_event 直接报事名。';
  } else if (ordered.length > events.length) {
    note = `一共撞上 ${ordered.length} 件事，这里只摊前 ${events.length} 件。`;
  }

  return {
    ok: true,
    axes: describeAxes({ q, day, bits }),
    hitCount: rows.length,
    eventCount: ordered.length,
    events,
    note,
  };
}

/**
 * 【池子 · chat】**不 join events**：直接撞 memories 里没挂事的那些话。
 * 判工里 `place: chat`（闲聊池）和 `place: trash`（废话池）的共同特征就是「没挂事」——
 * 库里没有 place 这一列（place 只活在判工的中间结果 chunk-*.json 里），落到库上就是 event_id IS NULL，
 * 所以一个条件就把这两类全兜住了。
 * 闲聊池没有「事」可以分组，所以按时间倒序给一列话。
 * @param {ReturnType<typeof createStore>} store
 * @param {{ q: string, day: string, bits: { ch: string, bit: number }[] }} axes
 * @param {number} wordsLimit
 */
function searchChatPool(store, { q, day, bits }, wordsLimit) {
  const where = ['m.event_id IS NULL'];
  const params = [];
  if (q) {
    where.push('m.text LIKE ?');
    params.push(`%${q}%`);
  }
  if (day) {
    where.push('m.at LIKE ?');
    params.push(`${day}%`);
  }
  if (bits.length) {
    where.push('(' + bits.map((b) => `substr(m.emotion, ${8 - b.bit}, 1) = '1'`).join(' OR ') + ')');
  }
  const cond = where.join(' AND ');

  const total = store.get(`SELECT count(*) AS c FROM memories m WHERE ${cond}`, ...params);
  const rows = store.all(
    `SELECT m.id AS id, m.at AS at, m.speaker AS speaker, m.s AS s, m.emotion AS emotion, m.text AS text
       FROM memories m
      WHERE ${cond}
      ORDER BY m.at DESC, m.id DESC
      LIMIT ?`,
    ...params,
    wordsLimit,
  );

  const words = rows.map((row) => ({
    id: Number(row.id),
    at: String(row.at ?? ''),
    speaker: Number(row.speaker ?? 0),
    s: Number(row.s ?? 0),
    emo: emotionNames(row.emotion),
    text: String(row.text ?? ''),
  }));

  return { hitCount: Number(total?.c ?? 0), words };
}

/**
 * 闲聊池那节的提示：没撞到 / 只给了前几条
 * @param {number} hitCount
 * @param {number} shown
 * @returns {string}
 */
function chatPoolNote(hitCount, shown) {
  if (hitCount === 0) return '没挂事的话（闲聊池 / 废话池）也没撞到。';
  if (hitCount > shown) return `闲聊池一共撞上 ${hitCount} 条，这里只给最近 ${shown} 条（limit 可调，最多 100）。`;
  return '';
}

/**
 * 三根轴任传一个或组合 → 命中的话。
 * pool：`event`（默认，摊事）/ `chat`（没挂事的闲聊池，按时间给一列话）/ `all`（两边都要）。
 * @param {ReturnType<typeof createStore>} store
 * @param {{ q?: unknown, day?: unknown, emo?: unknown, pool?: unknown, limit?: unknown, decisionsPerEvent?: unknown }} [args]
 */
export function searchMemories(store, args = {}) {
  const q = parseQ(args.q);
  const day = parseDay(args.day);
  const bits = parseEmo(args.emo);
  const limit = clampLimit(args.limit);
  const perEvent = Math.min(Math.max(Math.trunc(Number(args.decisionsPerEvent)) || DEFAULT_DECISIONS, 1), 8);
  const pool = parsePool(args.pool);

  if (!q && !day && !bits.length) {
    throw new Error('三根轴至少给一个：q（词）/ day（时间）/ emo（情绪）');
  }

  if (pool === 'chat') {
    const chat = searchChatPool(store, { q, day, bits }, clampWordsLimit(args.limit));
    return {
      ok: true,
      pool: 'chat',
      axes: describeAxes({ q, day, bits }),
      hitCount: chat.hitCount,
      words: chat.words,
      note: chatPoolNote(chat.hitCount, chat.words.length),
    };
  }

  const onEvents = searchEventPool(store, { q, day, bits, limit, perEvent });
  if (pool === 'event') return onEvents; // ← 默认路径：原样交回去，格式一个字节都不动

  const chat = searchChatPool(store, { q, day, bits }, clampWordsLimit(args.limit));
  const chatSummary =
    chat.hitCount === 0
      ? '没挂事的话（闲聊池 / 废话池）也撞了 0 条。'
      : `另有 ${chat.hitCount} 条没挂事的话（闲聊池 / 废话池）` +
        (chat.hitCount > chat.words.length ? `，这里只给最近 ${chat.words.length} 条。` : '，全列在下面。');
  return {
    ...onEvents,
    pool: 'all',
    chatHitCount: chat.hitCount,
    words: chat.words,
    note: [onEvents.note, chatSummary].filter(Boolean).join(' '),
  };
}

/**
 * 给事名，摊开它的全部：版本 → 阶段 → 决定。
 * @param {ReturnType<typeof createStore>} store
 * @param {{ name?: unknown }} args
 */
export function readEvent(store, args = {}) {
  const wanted = trimText(args.name);
  if (!wanted) throw new Error('name 要给事名，比如「记忆跨设备同步」');

  let ev = store.get('SELECT id, name, topic, n, dec_count, first_at, last_at FROM events WHERE name = ?', wanted);
  let note = '';

  if (!ev) {
    const fuzzy = store.all('SELECT id, name, topic, n, dec_count, first_at, last_at FROM events WHERE name LIKE ? ORDER BY n DESC, id ASC LIMIT 8', `%${wanted}%`);
    if (fuzzy.length === 1) {
      ev = fuzzy[0];
      note = `没有一模一样的事名，按近似匹配成了「${ev.name}」。`;
    } else {
      return {
        ok: false,
        name: wanted,
        topic: '',
        hits: 0,
        decisions: 0,
        firstAt: '',
        lastAt: '',
        versions: [],
        decisionsList: [],
        candidates: fuzzy.map((r) => String(r.name)),
        note: fuzzy.length
          ? `没有一模一样的事名，撞到 ${fuzzy.length} 个相近的，挑一个再来。`
          : '骨架里没有这件。换个词、换根轴（memory_search），或者老实说没有。',
      };
    }
  }

  const eventId = ev.id;
  const versions = store
    .all('SELECT id, name, n FROM versions WHERE event_id = ? ORDER BY n DESC, id ASC', eventId)
    .map((v) => ({
      name: String(v.name),
      hits: Number(v.n ?? 0),
      stages: store
        .all('SELECT name, n FROM stages WHERE version_id = ? ORDER BY n DESC, id ASC', v.id)
        .map((s) => ({ name: String(s.name), hits: Number(s.n ?? 0) })),
    }));

  const decisionsList = store
    .all('SELECT memory_id, obj, text, at FROM decisions WHERE event_id = ? ORDER BY at ASC, id ASC', eventId)
    .map((d) => ({
      at: String(d.at ?? ''),
      obj: String(d.obj ?? ''),
      text: String(d.text ?? '').replace(/\s+/g, ' '),
      memoryId: d.memory_id === null || d.memory_id === undefined ? 0 : Number(d.memory_id),
    }));

  const loose = store.get('SELECT count(*) AS c FROM memories WHERE event_id = ? AND version_id IS NULL', eventId);

  return {
    ok: true,
    name: String(ev.name),
    topic: String(ev.topic ?? ''),
    hits: Number(ev.n ?? 0),
    decisions: Number(ev.dec_count ?? decisionsList.length),
    firstAt: String(ev.first_at ?? ''),
    lastAt: String(ev.last_at ?? ''),
    versions,
    decisionsList,
    candidates: [],
    note: note || (Number(loose?.c ?? 0) > 0 ? `${loose.c} 条话没挂版本（只挂在这件事上）。` : ''),
  };
}
