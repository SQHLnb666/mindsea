// 识海 · 面板数据层（只读）
//
// 给 client 侧那九个页面供数。规矩：
//   · sea2.db 只读 —— 走 lib/query.mjs 的 createStore（readOnly: true），这里一句写都没有
//   · 人设 / 日记读的是 md 文件，**白名单查表**，用户输入一律不进路径拼接（防穿越）
//   · lib/query.mjs 与 lib/write.mjs 的查询 / 写入逻辑一个字没动，这里只是 import 复用
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createStore, resolveDbPath, emotionNames } from './query.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** 家目录：从 plugin/lib 往上四级就是工作区根（人设 md、日记都在这儿）
 *  （作者原结构是 <家目录>/mindsea/plugin/lib，往上三级；这份挪到了 im/review/mindsea，所以多上一级） */
export const HOME_DIR = resolve(HERE, '../../../..');

/** cards.json（工作流页的成品卡表，判工产物，随插件走） */
export const CARDS_PATH = join(HERE, '..', 'data', 'cards.json');

/** 走神那个除数。跟 src/writer/heartbeat.js 里的 WANDER_DIVISOR 是同一个数，不许改。 */
export const WANDER_DIVISOR = 541;

/** 一屏最多给多少条话（前端分批拉，别指望一次吞 8 千条） */
const WORDS_MAX = 4000;
const WORDS_DEFAULT = 2000;

/** 人设那五份 md 的白名单（key → 相对家目录的文件） */
const PERSONA_FILES = [
  { key: 'soul', title: '人格', hint: 'SOUL.md · 灵魂原件', file: 'SOUL.md' },
  { key: 'identity', title: '名字与形象', hint: 'IDENTITY.md', file: 'IDENTITY.md' },
  { key: 'user', title: '用户', hint: 'USER.md · 他的资料', file: 'USER.md' },
  { key: 'memory', title: '长期记忆', hint: 'MEMORY.md · 铁律与规矩', file: 'MEMORY.md' },
  { key: 'relationship', title: '关系等级', hint: 'memory/relationship.md · 好感度本本', file: join('memory', 'relationship.md') },
];

/** 日记文件名白名单：只有 memory/YYYY-MM-DD.md 这一种形状 */
const DIARY_NAME = /^\d{4}-\d{2}-\d{2}\.md$/;

/**
 * 白名单内的文件读成文本。路径必须落在 HOME_DIR 里，且真的存在。
 * @param {string} rel 相对家目录的路径（只由代码里的常量给出，不接受外部输入）
 * @returns {{ ok: boolean, path: string, text: string, mtime: string, bytes: number }}
 */
function readHomeFile(rel) {
  const abs = resolve(HOME_DIR, rel);
  const base = HOME_DIR.endsWith('\\') || HOME_DIR.endsWith('/') ? HOME_DIR : HOME_DIR + '\\';
  const inside = abs === HOME_DIR || abs.startsWith(base) || abs.startsWith(HOME_DIR + '/');
  if (!inside) return { ok: false, path: abs, text: '', mtime: '', bytes: 0 };
  try {
    const info = statSync(abs);
    if (!info.isFile()) return { ok: false, path: abs, text: '', mtime: '', bytes: 0 };
    if (info.size > 4 * 1024 * 1024) {
      return { ok: false, path: abs, text: '', mtime: info.mtime.toISOString(), bytes: info.size };
    }
    return {
      ok: true,
      path: abs,
      text: readFileSync(abs, 'utf8'),
      mtime: info.mtime.toISOString(),
      bytes: info.size,
    };
  } catch {
    return { ok: false, path: abs, text: '', mtime: '', bytes: 0 };
  }
}

/**
 * 文件在不在、什么时候动的（自动化页只看这个，不查进程）
 * @param {string} abs
 */
function probeFile(abs) {
  try {
    const info = statSync(abs);
    return { ok: true, at: abs, mtime: info.mtime.toISOString(), bytes: info.size, dir: info.isDirectory() };
  } catch {
    return { ok: false, at: abs, mtime: '', bytes: 0, dir: false };
  }
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 */
function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

/**
 * 打开一个只读 store（每个请求一套，请求完就关 —— 面板闲着不占句柄）
 * @param {{ dbPath?: string }} config
 */
export function openStore(config) {
  return createStore(resolveDbPath(config ?? {}));
}

/**
 * 话列表。
 *   · 不给 since：按时间倒序分页（offset / limit），默认最近 2000 条
 *   · 给 since（2026-10-22 12:46:15 或 ISO）：只要 at 比它新的话，按时间正序
 * 字段形状跟原型吃的那份 words.json 一致：id / at / sp / text / s / emo[] / place / ev / nd / st / dec
 * @param {ReturnType<typeof openStore>} store
 * @param {Record<string, unknown>} q
 */
export function readWords(store, q) {
  const limit = clampInt(q.limit, WORDS_DEFAULT, 1, WORDS_MAX);
  const offset = clampInt(q.offset, 0, 0, 1e9);
  const since = typeof q.since === 'string' ? q.since.trim() : '';

  const base = `SELECT m.id AS id, m.at AS at, m.speaker AS speaker, m.s AS s, m.emotion AS emotion,
                       m.text AS text, m.place AS place, m.dec AS dec, m.category AS category,
                       e.name AS ev, e.topic AS topic, e.category AS evcat, v.name AS nd, g.name AS st
                  FROM memories m
                  LEFT JOIN events e ON e.id = m.event_id
                  LEFT JOIN versions v ON v.id = m.version_id
                  LEFT JOIN stages g ON g.id = m.stage_id`;

  const total = Number(store.get('SELECT count(*) AS c FROM memories')?.c ?? 0);

  let rows;
  if (since) {
    rows = store.all(`${base} WHERE m.at > ? ORDER BY m.at ASC, m.id ASC LIMIT ?`, since, limit);
  } else {
    rows = store.all(`${base} ORDER BY m.at DESC, m.id DESC LIMIT ? OFFSET ?`, limit, offset);
  }

  const words = rows.map((r) => ({
    id: Number(r.id),
    at: String(r.at ?? ''),
    sp: Number(r.speaker ?? 0),
    text: String(r.text ?? ''),
    s: Number(r.s ?? 0),
    emo: emotionNames(r.emotion),
    place: String(r.place ?? ''),
    ev: String(r.ev ?? ''),
    evcat: String(r.evcat ?? ''),
    evcat: String(r.evcat ?? ''),
    tp: String(r.topic ?? ''),
    nd: String(r.nd ?? ''),
    st: String(r.st ?? ''),
    cat: String(r.category ?? ''),
    dec: Number(r.dec ?? 0),
  }));

  return {
    ok: true,
    total,
    count: words.length,
    offset: since ? 0 : offset,
    limit,
    since,
    hasMore: since ? false : offset + words.length < total,
    words,
  };
}

/**
 * 把库里的「事 → 版本 → 阶段」一次捞全，给卡片表补层级用。
 * 只读连接，一次查完（1008 个版本 / 1747 个阶段），别做成按事查的 N+1。
 * @param {ReturnType<typeof openStore>} store
 */
function readHierarchy(store) {
  /** @type {Map<string, number>} 事件名 → 事件 id */
  const byName = new Map();
  /** @type {Map<number, any[]>} 事件 id → 它下面按条数排好的版本 */
  const versionsByEvent = new Map();
  /** @type {Map<number, any>} 版本 id → 版本对象 */
  const byVersion = new Map();
  try {
    for (const row of store.all('SELECT id, name FROM events')) {
      byName.set(String(row.name ?? ''), Number(row.id));
    }
    for (const row of store.all('SELECT id, event_id, name, n FROM versions ORDER BY n DESC, id ASC')) {
      const eventId = Number(row.event_id);
      const version = { id: Number(row.id), name: String(row.name ?? ''), n: Number(row.n ?? 0), stages: [] };
      if (!versionsByEvent.has(eventId)) versionsByEvent.set(eventId, []);
      versionsByEvent.get(eventId).push(version);
      byVersion.set(version.id, version);
    }
    for (const row of store.all('SELECT version_id, name, n FROM stages ORDER BY n DESC, id ASC')) {
      const version = byVersion.get(Number(row.version_id));
      if (version) version.stages.push({ name: String(row.name ?? ''), n: Number(row.n ?? 0) });
    }
  } catch {
    // 库读不到就当没有层级，页面照旧显示扁平的阶段
  }
  return { byName, versionsByEvent };
}

/**
 * 给一张卡挂上 versions（事 → 版本 → 阶段）。三条来源，优先级从高到低：
 *   ① 卡里本来就有 generations（判工聚好的「代 → 功能 → 阶段」，记忆系统就这一份）
 *   ② 库里按事件名（对不上再试别名）找得到版本 → 用它
 *   ③ 都没有 → 把扁平 stages 装进一个「（未分版本）」
 * 卡上原有字段一个都不动，只多一个 versions。
 * @param {any} event
 * @param {{ byName: Map<string, number>, versionsByEvent: Map<number, any[]> }} hier
 */
function attachHierarchy(event, hier) {
  const gens = Array.isArray(event.generations) ? event.generations : null;
  if (gens && gens.length) {
    event.versions = gens.map((g) => ({
      name: String(g.name ?? ''),
      n: Number(g.n ?? 0),
      features: (Array.isArray(g.features) ? g.features : []).map((f) => ({
        name: String(f.name ?? ''),
        n: Number(f.n ?? 0),
        dec: Number(f.dec ?? 0),
        stages: (Array.isArray(f.stages) ? f.stages : []).map((s) => ({
          name: String(s.name ?? ''),
          n: Number(s.n ?? 0),
        })),
      })),
    }));
    return event;
  }
  const names = [event.name, ...(Array.isArray(event.aliases) ? event.aliases : [])];
  for (const name of names) {
    const eventId = hier.byName.get(String(name ?? ''));
    if (eventId === undefined) continue;
    const versions = hier.versionsByEvent.get(eventId);
    if (versions && versions.length) {
      event.versions = versions;
      return event;
    }
  }
  const stages = Array.isArray(event.stages) ? event.stages : [];
  event.versions = stages.length ? [{ name: '（未分版本）', n: Number(event.n ?? 0), stages }] : [];
  return event;
}

/**
 * 工作流页的卡表：优先读插件自带的 data/cards.json（判工产物，形状就是原型那份）。
 * 读不到就从库里退化生成一份同形状的（话题 → 事 → 版本 / 阶段），页面不至于空着。
 * 不管走哪条路，每张卡出来都带 versions —— 页面就靠它画「事 → 版本 → 阶段」的树。
 * @param {ReturnType<typeof openStore>} store
 */
export function readCards(store) {
  const hier = readHierarchy(store);
  try {
    if (existsSync(CARDS_PATH)) {
      const text = readFileSync(CARDS_PATH, 'utf8');
      const data = JSON.parse(text);
      if (data && Array.isArray(data.topics)) {
        for (const topic of data.topics) {
          for (const ev of Array.isArray(topic.events) ? topic.events : []) attachHierarchy(ev, hier);
        }
        return { ok: true, source: 'data/cards.json', ...data };
      }
    }
  } catch {
    // 落到下面的退化生成
  }

  const events = store.all(
    `SELECT id, name, topic, n, dec_count FROM events ORDER BY n DESC, id ASC`,
  );
  /** @type {Map<string, any[]>} */
  const byTopic = new Map();
  for (const ev of events) {
    const topic = String(ev.topic || '') || '其它';
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    const versions = hier.versionsByEvent.get(Number(ev.id)) ?? [];
    byTopic.get(topic).push({
      name: String(ev.name),
      n: Number(ev.n ?? 0),
      dec: Number(ev.dec_count ?? 0),
      versions,
      stages: store
        .all('SELECT name, n FROM stages WHERE event_id = ? ORDER BY n DESC, id ASC', ev.id)
        .map((s) => ({ name: String(s.name), n: Number(s.n ?? 0) })),
    });
  }
  const topics = [...byTopic.entries()].map(([name, list]) => ({
    name,
    n: list.reduce((a, e) => a + e.n, 0),
    events: list.sort((a, b) => b.n - a.n),
  }));
  topics.sort((a, b) => b.n - a.n);
  return {
    ok: true,
    source: 'sea2.db（退化生成：events.topic → 事 → 阶段）',
    generatedAt: new Date().toISOString(),
    total: events.reduce((a, e) => a + Number(e.n ?? 0), 0),
    cardCount: events.length,
    topics,
  };
}

/**
 * 按事名取话：人设页「我对用户的看法」这种要「最新的那句」的地方用。
 * 按 at 倒序（同一秒的按 id 倒序 = 后写进来的在上）。事名对不上就回空，让页面走 md 兜底。
 * @param {ReturnType<typeof openStore>} store
 * @param {Record<string, unknown>} q
 */
export function readEventWords(store, q) {
  const name = typeof q.name === 'string' ? q.name.trim() : '';
  const limit = clampInt(q.limit, 200, 1, 1000);
  if (!name) return { ok: false, error: '要给事名（?name=…）' };
  const ev = store.get('SELECT id, name, n, dec_count FROM events WHERE name = ?', name);
  if (!ev) return { ok: true, event: null, count: 0, words: [] };
  const rows = store.all(
    `SELECT m.id AS id, m.at AS at, m.speaker AS speaker, m.s AS s, m.emotion AS emotion,
            m.text AS text, m.dec AS dec
       FROM memories m
      WHERE m.event_id = ?
      ORDER BY m.at DESC, m.id DESC
      LIMIT ?`,
    ev.id,
    limit,
  );
  const words = rows.map((r) => ({
    id: Number(r.id),
    at: String(r.at ?? ''),
    sp: Number(r.speaker ?? 0),
    text: String(r.text ?? ''),
    s: Number(r.s ?? 0),
    emo: emotionNames(r.emotion),
    dec: Number(r.dec ?? 0),
  }));
  return {
    ok: true,
    event: { name: String(ev.name), n: Number(ev.n ?? 0), dec: Number(ev.dec_count ?? 0) },
    count: words.length,
    words,
  };
}

/** 人设页：五份 md 全文 */
export function readPersona() {
  const files = PERSONA_FILES.map((f) => {
    const got = readHomeFile(f.file);
    return {
      key: f.key,
      title: f.title,
      hint: f.hint,
      path: got.path,
      ok: got.ok,
      bytes: got.bytes,
      mtime: got.mtime,
      text: got.text,
    };
  });
  return { ok: true, home: HOME_DIR, files };
}

/**
 * 时间页：按天分组的话数
 * @param {ReturnType<typeof openStore>} store
 * @param {Record<string, unknown>} q
 */
export function readDays(store, q) {
  const limit = clampInt(q.limit, 400, 1, 4000);
  const rows = store.all(
    `SELECT substr(at, 1, 10) AS day, count(*) AS n, max(at) AS lastAt
       FROM memories WHERE at IS NOT NULL AND at <> ''
      GROUP BY day ORDER BY day DESC LIMIT ?`,
    limit,
  );
  const total = Number(store.get('SELECT count(*) AS c FROM memories')?.c ?? 0);
  return {
    ok: true,
    total,
    days: rows.map((r) => ({ day: String(r.day), n: Number(r.n ?? 0), lastAt: String(r.lastAt ?? '') })),
  };
}

/**
 * 时间页右半边：某一天的话（按时间正序，一句一条）
 * @param {ReturnType<typeof openStore>} store
 * @param {Record<string, unknown>} q
 */
export function readOneDay(store, q) {
  const day = typeof q.day === 'string' ? q.day.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { ok: false, day, error: 'day 要写成 2026-10-22 这种', words: [] };
  }
  const limit = clampInt(q.limit, 3000, 1, 6000);
  const rows = store.all(
    `SELECT m.id, m.at, m.speaker, m.s, m.emotion, m.text, m.place, m.dec, e.name AS ev, e.category AS evcat
       FROM memories m LEFT JOIN events e ON e.id = m.event_id
      WHERE substr(m.at, 1, 10) = ? ORDER BY m.at ASC, m.id ASC LIMIT ?`,
    day,
    limit,
  );
  return {
    ok: true,
    day,
    count: rows.length,
    words: rows.map((r) => ({
      id: Number(r.id),
      at: String(r.at ?? ''),
      sp: Number(r.speaker ?? 0),
      text: String(r.text ?? ''),
      s: Number(r.s ?? 0),
      emo: emotionNames(r.emotion),
      ev: String(r.ev ?? ''),
      place: String(r.place ?? ''),
      dec: Number(r.dec ?? 0),
    })),
  };
}

/**
 * 遗忘页：细节已清（summary 空）/ 已沉底（status='sunken'）的事。
 * 「越久越淡」由前端按 last_mention 算，这里只给料。
 * @param {ReturnType<typeof openStore>} store
 */
export function readForget(store) {
  const cols = new Set(store.all('PRAGMA table_info(events)').map((c) => String(c.name)));
  const hasSummary = cols.has('summary');
  const hasStatus = cols.has('status');
  const hasMention = cols.has('last_mention');

  const rows = store.all(
    `SELECT id, name, topic, n, dec_count, first_at, last_at,
            ${hasSummary ? 'summary' : 'NULL'} AS summary,
            ${hasStatus ? "COALESCE(status,'live')" : "'live'"} AS status,
            ${hasMention ? 'last_mention' : 'last_at'} AS last_mention
       FROM events ORDER BY ${hasMention ? 'last_mention' : 'last_at'} ASC, id ASC`,
  );

  const sunken = [];
  const cleared = [];
  const live = [];
  for (const r of rows) {
    const item = {
      id: Number(r.id),
      name: String(r.name ?? ''),
      topic: String(r.topic ?? ''),
      n: Number(r.n ?? 0),
      decisions: Number(r.dec_count ?? 0),
      firstAt: String(r.first_at ?? ''),
      lastAt: String(r.last_at ?? ''),
      lastMention: String(r.last_mention ?? ''),
      summary: r.summary === null || r.summary === undefined ? null : String(r.summary),
      status: String(r.status ?? 'live'),
    };
    if (item.status === 'sunken' || item.status === 'void') sunken.push(item);
    else if (item.summary === null || item.summary === '') cleared.push(item);
    else live.push(item);
  }

  return {
    ok: true,
    total: rows.length,
    sunken,
    cleared,
    live: live.length,
    note: hasSummary
      ? 'summary 这一列是 2026-10-23 才加上的，老事件都还没填摘要 —— 所以「细节已清」现在几乎等于全量，不代表它们真被清过。'
      : '库里还没有 summary 列（老骨架），「细节已清」这一档暂时判不出来。',
  };
}

/** 走神页：wanders 表 + 现在算一次（纯计算，不写库） */
export function readWanders(store, q) {
  const limit = clampInt(q.limit, 200, 1, 2000);
  const total = Number(store.get('SELECT count(*) AS c FROM wanders')?.c ?? 0);
  const rows = store.all('SELECT id, at, start_tag, path, spoke FROM wanders ORDER BY at DESC LIMIT ?', limit);
  return {
    ok: true,
    total,
    divisor: WANDER_DIVISOR,
    rows: rows.map((r) => ({
      id: String(r.id ?? ''),
      at: String(r.at ?? ''),
      startTag: String(r.start_tag ?? ''),
      path: String(r.path ?? ''),
      spoke: Number(r.spoke ?? 0),
    })),
  };
}

/**
 * 现在这一拍算出来的数 —— 跟 src/writer/heartbeat.js 的 wanderValue() 一模一样，
 * 取数口径也照 sampleState()。**只算不写**：走神记账归 heartbeat 管。
 * @param {ReturnType<typeof openStore>} store
 */
export function previewWander(store) {
  const at = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const minutesOfDay = at.getHours() * 60 + at.getMinutes();

  const parseAt = (s) => {
    if (!s) return NaN;
    return new Date(String(s).replace(' ', 'T')).getTime();
  };

  const lastMsg = store.get('SELECT at FROM memories ORDER BY at DESC LIMIT 1');
  const sinceSpeakSec = lastMsg ? Math.max(0, Math.floor((at.getTime() - parseAt(lastMsg.at)) / 1000)) : 86400;
  const todayCount = Number(
    store.get('SELECT COUNT(*) AS n FROM memories WHERE substr(at, 1, 10) = ?', day)?.n ?? 0,
  );
  const lastWander = store.get('SELECT at FROM wanders ORDER BY at DESC LIMIT 1');
  const sinceWanderMin = lastWander
    ? Math.max(0, Math.floor((at.getTime() - parseAt(lastWander.at)) / 60000))
    : 24 * 60;

  const weekday = at.getDay();
  const state = { minutesOfDay, sinceSpeakSec, todayCount, sinceWanderMin, weekday };

  const d = WANDER_DIVISOR;
  const value =
    ((Math.floor(minutesOfDay) * 1000003) % d +
      (Math.floor(sinceSpeakSec) * 10007) % d +
      (Math.floor(todayCount) * 101) % d +
      (Math.floor(sinceWanderMin) * 7) % d +
      Math.floor(weekday)) %
    d;

  return {
    ok: true,
    at: `${day} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`,
    state,
    divisor: d,
    value,
    hit: value === 0,
    remain: value === 0 ? 0 : d - value,
    note: '只算不记账 —— 真撞上了由 heartbeat 那一路往下走，这一页只给你看数。',
  };
}

/** 日记页：memory/YYYY-MM-DD.md 的清单 */
export function readDiaryList() {
  const dir = join(HOME_DIR, 'memory');
  /** @type {{day:string, bytes:number, mtime:string, snippet:string}[]} */
  const days = [];
  try {
    for (const name of readdirSync(dir)) {
      if (!DIARY_NAME.test(name)) continue;
      const got = readHomeFile(join('memory', name));
      if (!got.ok) continue;
      const body = got.text.replace(/^\uFEFF/, '');
      const firstLine =
        body
          .split(/\r?\n/)
          .map((l) => l.replace(/^#+\s*/, '').trim())
          .find((l) => l.length > 0) || '';
      days.push({ day: name.slice(0, 10), bytes: got.bytes, mtime: got.mtime, snippet: firstLine.slice(0, 60) });
    }
  } catch {
    // 没有 memory 目录就是空的
  }
  days.sort((a, b) => b.day.localeCompare(a.day));
  return { ok: true, dir, count: days.length, days };
}

/**
 * 日记页右半边：某一天的日记正文
 * @param {Record<string, unknown>} q
 */
export function readDiary(q) {
  const day = typeof q.day === 'string' ? q.day.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { ok: false, day, error: 'day 要写成 2026-10-22 这种', text: '' };
  }
  const got = readHomeFile(join('memory', `${day}.md`));
  return {
    ok: got.ok,
    day,
    path: got.path,
    mtime: got.mtime,
    bytes: got.bytes,
    text: got.ok ? got.text.replace(/^\uFEFF/, '') : '',
    error: got.ok ? '' : `memory/${day}.md 不存在`,
  };
}

/**
 * 自动化页：把散着的那几摊东西列成清单 —— 现在在哪、文件在不在、什么时候动过。
 * 只探文件系统，**不查进程、不开关任何东西**。
 */
export function readAutomation() {
  const dsh = join(homedir(), '.dsh');
  const items = [
    {
      name: '走神心跳（识海）',
      note: '每分钟一拍，凑出来的数能被 541 整除才开口。记账写 wanders 表。',
      targets: [
        ['实现', join(HOME_DIR, 'mindsea', 'src', 'writer', 'heartbeat.js')],
        ['遗忘', join(HOME_DIR, 'mindsea', 'src', 'writer', 'forget.js')],
      ],
    },
    {
      name: '记忆写钩子（memory_write）',
      note: '本插件带的三个工具之一，每轮聊完往骨架里落话。',
      targets: [
        ['插件入口', join(HOME_DIR, 'mindsea', 'plugin', 'index.js')],
        ['写入核心', join(HOME_DIR, 'mindsea', 'plugin', 'lib', 'write.mjs')],
      ],
    },
    {
      name: '识海骨架库',
      note: 'sea2.db 单文件，只读接入。',
      targets: [['库', join(HOME_DIR, 'mindsea', 'sea2.db')]],
    },
    {
      name: '存档（save.bat）',
      note: '双击存一版快照。',
      targets: [['脚本', join(HOME_DIR, 'mindsea', 'save.bat')]],
    },
    {
      name: 'memory-sea 面板（老）',
      note: '老的记忆面板插件，侧边栏那个「识海」入口是它渲染的。',
      targets: [
        ['服务端', join(dsh, 'plugins', 'memory-sea', 'index.js')],
        ['前端', join(dsh, 'plugins', 'memory-sea', 'client.js')],
      ],
    },
    {
      name: 'sea-fish 星海面板',
      note: '识海节点画成星海的独立面板（/sea-fish/）。',
      targets: [['页面', join(HOME_DIR, 'tools', 'sea-fish', 'index.html')]],
    },
    {
      name: 'QQ 桥',
      note: 'QQ 收发通道。',
      targets: [['包', join(dsh, 'profiles', 'desktop', 'node_modules', 'dsh-qq-bridge')]],
    },
    {
      name: '桌宠（dsh-pet）',
      note: '桌面那只蓝毛大肥鱼。',
      targets: [['包', join(dsh, 'profiles', 'desktop', 'node_modules', 'dsh-pet')]],
    },
    {
      name: '每日记忆笔记',
      note: 'memory/YYYY-MM-DD.md，日记页读的就是它。',
      targets: [['目录', join(HOME_DIR, 'memory')]],
    },
  ];

  return {
    ok: true,
    note: '这一页只说实话的一半：文件在不在、什么时候动过，都按文件系统探的；跑没跑（进程）这里不查，也不给开关。',
    items: items.map((it) => ({
      name: it.name,
      note: it.note,
      targets: it.targets.map(([label, path]) => {
        const p = probeFile(path);
        return { label, path, ok: p.ok, mtime: p.mtime, bytes: p.bytes, dir: p.dir };
      }),
    })),
  };
}
