// 识海骨架 · 写入核心（2026-10-23）
//
// 口径（用户定的）：话由我判好再传进来，工具只负责落库 —— 不猜、不归类、不改老账。
//
// 四条硬约束：
//   1. 只 INSERT。老行的原文 / 分数 / 归属一个字节都不碰（回填只回填自己刚插的那行）。
//   2. 写不进去必须喊 —— 校验不过、数据库报错，全进 errors[]，绝不静默跳过。
//   3. 事 / 版本 / 阶段同名就复用；同一批里 ev 相同的，事只建一次。
//   4. 查询那条路径（lib/query.mjs）仍是**只读**连接；这边另开一个**可写**连接，两边互不影响。
//
// 编码（照库里现有数据的样子，2026-10-23 逐条对过）：
//   emotion : 7 位位图，位序 喜1 怒2 哀3 惧4 爱5 恶6 欲7，取位公式 substr(emotion, 8-idx, 1)
//             ⇒ 第 idx 情落在字符串第 (8-idx) 个字符（1-based）。喜在最右，欲在最左。
//   digest  : sha256(text) 的十六进制前 8 位（拿库里 8323 条验过，一字不差）
//   occurred: JSON 数组，只有自己这一条时间
//   body / platform / hits / voiced / unconfirmed：照旧行填 '00000000' / 0 / 1 / 0 / 0
//   code / old_id：**留 NULL** —— 那是老编号体系（ms-1-n-20260929-001 那种）的产物，
//                  新的话没有老编号，不伪造；全库没有任何读端读这两列（已 grep 确认），
//                  留空反而能让"新话"跟"迁进来的老话"一眼分开。
//   vector：留 NULL（向量是另一趟活，不在这条路上顺手造）。
//   importance：老列（1~5），按 s 折算 ceil(s/20)，只为不让老界面读到空。
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { EMO_ORDER, resolveDbPath } from './query.mjs';

const EMO_BITS = new Map(EMO_ORDER.map((ch, i) => [ch, i + 1]));

const AT_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/** @param {number} n */
const pad2 = (n) => String(n).padStart(2, '0');

/** 本地时间（Asia/Shanghai 的机器本地时区），格式跟库里一致 */
export function nowLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/**
 * 七情数组 → 7 位位图（位序 喜1 怒2 哀3 惧4 爱5 恶6 欲7）
 * 第 idx 情写在第 (8-idx) 个字符上，正好是 `substr(emotion, 8-idx, 1)` 读的那一位。
 * @param {string[]} emos
 * @returns {string}
 */
export function emotionBitmap(emos) {
  /** @type {string[]} */
  const chars = ['0', '0', '0', '0', '0', '0', '0'];
  for (const emo of emos) {
    const bit = EMO_BITS.get(emo);
    if (bit) chars[8 - bit - 1] = '1';
  }
  return chars.join('');
}

/**
 * 位图 → 七情名数组（自测用，跟 emotionBitmap 互逆）
 * @param {string} emotion
 * @returns {string[]}
 */
export function emotionNames(emotion) {
  /** @type {string[]} */
  const out = [];
  for (let idx = 1; idx <= 7; idx += 1) {
    if (String(emotion ?? '')[8 - idx - 1] === '1') out.push(EMO_ORDER[idx - 1]);
  }
  return out;
}

/**
 * 开一个**可写**连接并缓存。跟 query.mjs 的只读 store 是两个独立连接。
 * @param {string} [dbPath]
 */
export function createWriter(dbPath = resolveDbPath()) {
  /** @type {DatabaseSync | null} */
  let db = null;
  const handle = () => {
    if (db) return db;
    try {
      db = new DatabaseSync(dbPath); // 不带 readOnly ⇒ 可读写
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`打不开识海库（可写）：${dbPath}\n原因：${reason}`);
    }
    try {
      db.exec('PRAGMA busy_timeout = 5000');
      db.exec('PRAGMA foreign_keys = ON');
    } catch {
      /* pragma 不支持就跳过，不影响主流程 */
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
    /** @param {string} sql @param {...unknown} params */
    run: (sql, ...params) => handle().prepare(sql).run(...params),
    /** @param {string} sql */
    exec: (sql) => handle().exec(sql),
    close: () => {
      if (db) {
        try {
          db.close();
        } catch {
          /* 关不掉交给进程回收 */
        }
        db = null;
      }
    },
  };
}

/** @param {unknown} value */
function trimText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

/**
 * 时间：接受 `YYYY-MM-DD HH:mm:ss` / `YYYY-MM-DD HH:mm` / `YYYY-MM-DD`（补 00:00:00）/
 * 中间 T 也行。没给（或空）就用当前本地时间。
 * 返回库里那一种格式：`YYYY-MM-DD HH:mm:ss`
 * @param {unknown} value
 * @param {string} where 出错时报告的位置，例如 `items[2].at`
 * @returns {string}
 */
export function normalizeAt(value, where = 'at') {
  const text = trimText(value);
  if (!text) return nowLocal();
  const m = AT_RE.exec(text);
  if (!m) {
    throw new Error(`${where} 时间格式不对，要写成 2026-10-23 11:30:00（也收 2026-10-23 11:30 / 2026-10-23）。收到：${text}`);
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = m[4] === undefined ? 0 : Number(m[4]);
  const minute = m[5] === undefined ? 0 : Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  const probe = new Date(year, month - 1, day, hour, minute, second);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day ||
    probe.getHours() !== hour ||
    probe.getMinutes() !== minute ||
    probe.getSeconds() !== second
  ) {
    throw new Error(`${where} 不是一个真的时间（月份/日期/时分秒越界）：${text}`);
  }
  return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

/**
 * 七情：收数组，也收字符串（"喜爱" = 喜 + 爱）。不认识的直接报错，不悄悄吞。
 * @param {unknown} value
 * @param {string} where
 * @returns {string[]}
 */
export function normalizeEmo(value, where = 'emo') {
  if (value === undefined || value === null || value === '') return [];
  /** @type {string[]} */
  const raw = [];
  if (Array.isArray(value)) {
    for (const item of value) raw.push(...String(item ?? '').trim());
  } else {
    raw.push(...String(value).trim());
  }
  /** @type {string[]} */
  const out = [];
  for (const ch of raw) {
    if (!ch.trim()) continue;
    if (!EMO_BITS.has(ch)) {
      throw new Error(`${where} 里有一个不认识的七情字「${ch}」，只能写：${EMO_ORDER.join(' ')}`);
    }
    if (!out.includes(ch)) out.push(ch);
  }
  return out;
}

/**
 * 分数：0~100 整数。越界报错（不夹紧 —— 夹紧等于替人改判）。
 * @param {unknown} value
 * @param {string} where
 * @returns {number}
 */
export function normalizeScore(value, where = 's') {
  if (value === undefined || value === null || value === '') return 50;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${where} 要整数 0~100，收到：${String(value)}`);
  }
  if (n < 0 || n > 100) {
    throw new Error(`${where} 要在 0~100 之间，收到：${n}`);
  }
  return n;
}

/**
 * @param {unknown} value
 * @param {string} where
 * @param {0 | 1} fallback
 * @returns {0 | 1}
 */
function normalizeFlag(value, where, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (n !== 0 && n !== 1) throw new Error(`${where} 只能写 0 或 1，收到：${String(value)}`);
  return /** @type {0 | 1} */ (n);
}

/**
 * 把一条 item 校成能直接落库的样子。任何一处不对就抛错（带上第几条、哪个字段）。
 * @param {unknown} raw
 * @param {number} index
 */
/**
 * 噪声闸门：这些不是「话」，是运行时消息 / 工具名 / 系统注入。
 * 命中就强制进 trash，不挂事、不挂版本、不进闲聊池。
 * （2026-10-23：库里混进过「background job」「用了 create_goal」「<goal_round>」，
 *  都是从这儿漏的 —— 补一道闸，别让下一轮再漏。）
 */
const NOISE_PATTERNS = [
  /^(background job|Background subagent|Agent [0-9a-f-]{8,} (sent|finished|is running))/i,
  /^用了\s*(pwsh|bash|node|git|python|write|edit|read|subagent|workflow|read_image|create_goal|update_goal|get_goal|memory_\w+|taste_\w+|divine\w*)\s*$/i,
  /<goal_round>|<goal_objective>/i,
  /^(When the user asks|The user asks for|If the user|Note:)/i,
  /^审批(策略|权限)/,
  /^(交付文件统一走|发文件\/图片要调)/,
];

function isNoise(text) {
  return NOISE_PATTERNS.some((re) => re.test(text));
}

function normalizeItem(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`items[${index}] 不是一条话（要对象），收到：${JSON.stringify(raw)}`);
  }
  const item = /** @type {Record<string, unknown>} */ (raw);
  const at = `items[${index}]`;

  const text = trimText(item.text);
  if (!text) throw new Error(`${at}.text 是必填的（就是那句原话），现在是空的`);
  if (text.length > 8000) throw new Error(`${at}.text 太长（${text.length} 字），一条话别超过 8000 字，拆开传`);

  const atText = normalizeAt(item.at, `${at}.at`);

  if (item.speaker === undefined || item.speaker === null || item.speaker === '') {
    throw new Error(`${at}.speaker 是必填的：0 = 用户，1 = 大肥鱼`);
  }
  const speaker = Number(item.speaker);
  if (speaker !== 0 && speaker !== 1) {
    throw new Error(`${at}.speaker 只能是 0（用户）或 1（大肥鱼），收到：${String(item.speaker)}`);
  }

  // 噪声：强制进 trash，把挂位全清掉（调用方给的 ev/nd/st 一律作废）
  if (isNoise(text)) {
    return {
      text,
      at: atText,
      speaker: /** @type {0 | 1} */ (speaker),
      ev: '',
      nd: '',
      st: '',
      s: normalizeScore(item.s, `${at}.s`),
      emo: normalizeEmo(item.emo, `${at}.emo`),
      dec: 0,
      decobj: '',
      place: 'trash',
      category: '',
      noise: true,
    };
  }

  const ev = trimText(item.ev);
  const nd = trimText(item.nd);
  const st = trimText(item.st);
  if (st && !nd) {
    throw new Error(`${at} 给了阶段 st「${st}」却没给版本 nd —— 阶段得挂在版本下，补个版本名，或者把 st 去掉`);
  }
  if (nd && !ev) {
    throw new Error(`${at} 给了版本 nd「${nd}」却没给事 ev —— 版本得挂在事下面，补个事名，或者把 nd 去掉`);
  }

  const s = normalizeScore(item.s, `${at}.s`);
  const emo = normalizeEmo(item.emo, `${at}.emo`);
  const dec = normalizeFlag(item.dec, `${at}.dec`, 0);
  const decobj = trimText(item.decobj);
  if (dec === 1 && !decobj) {
    throw new Error(`${at} 标了 dec=1（是条决定），就得给 decobj —— 这条决定「关于什么」，比如「记忆怎么存」`);
  }

  // place：调用方可以显式塞 trash（老黄 2026-10-23：长回答、重复的话扔废料池，不参加匹配）
  const placeRaw = trimText(item.place);
  const place = placeRaw === 'trash' || placeRaw === 'chat' || placeRaw === 'event' ? placeRaw : '';

  // category：老黄定的五个抽屉，只认这五个，别的当没给
  const CATEGORIES = new Set(['闲聊', '暧昧', '干活', '知识', '规矩']);
  const categoryRaw = trimText(item.category);
  const category = CATEGORIES.has(categoryRaw) ? categoryRaw : '';

  return {
    text,
    at: atText,
    speaker: /** @type {0 | 1} */ (speaker),
    ev,
    nd,
    st,
    s,
    emo,
    dec,
    decobj,
    place,
    category,
    noise: false,
  };
}

/** @param {unknown} value */
function toId(value) {
  return value === undefined || value === null ? 0 : Number(value);
}

/**
 * 写入一批话。
 *
 * 流程：先**全批校验**（有一条不合格就一条都不写，直接报错）→ 事务里逐条落库
 * → 事 / 版本 / 阶段同名复用（同一批里 ev 相同的只建一次）→ 重算 n / dec_count。
 *
 * @param {ReturnType<typeof createWriter>} writer
 * @param {{ items?: unknown }} [args]
 */
export function writeMemories(writer, args = {}) {
  const rawItems = args?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return {
      ok: false,
      written: 0,
      ids: /** @type {number[]} */ ([]),
      created: { events: /** @type {string[]} */ ([]), versions: /** @type {string[]} */ ([]), stages: /** @type {string[]} */ ([]) },
      errors: ['items 是空的（或者不是数组）—— 没东西可写。要写成 [{ text, at, speaker, ... }]'],
    };
  }

  // ── 一、全批先校验：一条不合格就整批不动，别留半截账 ──────────────
  /** @type {ReturnType<typeof normalizeItem>[]} */
  const items = [];
  /** @type {string[]} */
  const errors = [];
  for (let i = 0; i < rawItems.length; i += 1) {
    try {
      items.push(normalizeItem(rawItems[i], i));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length) {
    return {
      ok: false,
      written: 0,
      ids: [],
      created: { events: [], versions: [], stages: [] },
      errors: [`有 ${errors.length} 条不合格，整批一条都没写（免得写半截）：`, ...errors],
    };
  }

  const db = writer.handle();
  /** @type {number[]} */
  const ids = [];
  /** @type {string[]} */
  const createdEvents = [];
  /** @type {string[]} */
  const createdVersions = [];
  /** @type {string[]} */
  const createdStages = [];
  // 同批次里同名复用（事 / 版本 / 阶段）
  /** @type {Map<string, number>} */
  const eventCache = new Map();
  /** @type {Map<string, number>} */
  const versionCache = new Map();
  /** @type {Map<string, number>} */
  const stageCache = new Map();
  /** @type {Set<number>} */
  const touchedEvents = new Set();
  /** @type {Set<number>} */
  const touchedVersions = new Set();
  /** @type {Set<number>} */
  const touchedStages = new Set();

  /**
   * 找到或新建一件事。同名复用 —— 这就是「同一批里 ev 相同只建一次」。
   * @param {string} name
   * @param {string} at
   * @returns {number}
   */
  const ensureEvent = (name, at, category) => {
    const cached = eventCache.get(name);
    if (cached !== undefined) return cached;
    const row = writer.get('SELECT id FROM events WHERE name = ?', name);
    if (row) {
      const id = toId(row.id);
      // 老事没门类、这次带了 → 顺手补上（新事名第一次出现就靠这一手定门类）
      if (category) {
        try {
          writer.run('UPDATE events SET category = ? WHERE id = ? AND (category IS NULL OR category = ?)', category, id, '');
        } catch {
          /* 补不上不影响主流程 */
        }
      }
      eventCache.set(name, id);
      return id;
    }
    const result = writer.run(
      'INSERT INTO events (name, topic, n, dec_count, first_at, last_at, category) VALUES (?, ?, 0, 0, ?, ?, ?)',
      name,
      '',
      at,
      at,
      category || null,
    );
    const id = toId(result.lastInsertRowid);
    if (!id) throw new Error(`新建事「${name}」没拿到 id（数据库没回自增主键）`);
    createdEvents.push(name);
    eventCache.set(name, id);
    return id;
  };

  /**
   * @param {number} eventId
   * @param {string} name
   * @returns {number}
   */
  const ensureVersion = (eventId, name) => {
    const key = `${eventId}\u0000${name}`;
    const cached = versionCache.get(key);
    if (cached !== undefined) return cached;
    const row = writer.get('SELECT id FROM versions WHERE event_id = ? AND name = ?', eventId, name);
    if (row) {
      const id = toId(row.id);
      versionCache.set(key, id);
      return id;
    }
    const result = writer.run('INSERT INTO versions (event_id, name, n) VALUES (?, ?, 0)', eventId, name);
    const id = toId(result.lastInsertRowid);
    if (!id) throw new Error(`新建版本「${name}」没拿到 id`);
    createdVersions.push(name);
    versionCache.set(key, id);
    return id;
  };

  /**
   * @param {number} eventId
   * @param {number} versionId
   * @param {string} name
   * @returns {number}
   */
  const ensureStage = (eventId, versionId, name) => {
    const key = `${eventId}\u0000${versionId}\u0000${name}`;
    const cached = stageCache.get(key);
    if (cached !== undefined) return cached;
    const row = writer.get('SELECT id FROM stages WHERE event_id = ? AND version_id = ? AND name = ?', eventId, versionId, name);
    if (row) {
      const id = toId(row.id);
      stageCache.set(key, id);
      return id;
    }
    const result = writer.run('INSERT INTO stages (event_id, version_id, name, n) VALUES (?, ?, ?, 0)', eventId, versionId, name);
    const id = toId(result.lastInsertRowid);
    if (!id) throw new Error(`新建阶段「${name}」没拿到 id`);
    createdStages.push(name);
    stageCache.set(key, id);
    return id;
  };

  // ── 二、事务里逐条落库 ────────────────────────────────────────────
  db.exec('BEGIN IMMEDIATE');
  let committed = false;
  /** @type {{id:number, text:string}[]} */
  const skipped = [];
  try {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];

      // ── 去重：同一天里同样的 text 只留一条 ──
      // 跨天的不算：「我想你啦」说过十二次，那十二次都是真的，不能当重复去掉。
      // 噪声条（item.noise）不用查 —— 它们本来就该进 trash，重复不重复都无所谓。
      if (!item.noise) {
        const sameDay = String(item.at).slice(0, 10);
        const dup = writer.get(
          'SELECT id FROM memories WHERE text = ? AND substr(at, 1, 10) = ? ORDER BY at DESC LIMIT 1',
          item.text,
          sameDay,
        );
        if (dup) {
          skipped.push({ id: toId(dup.id), text: item.text.slice(0, 24) });
          continue;
        }
      }

      db.exec(`SAVEPOINT w_${i}`);
      try {
        /** @type {number | null} */
        let eventId = null;
        /** @type {number | null} */
        let versionId = null;
        /** @type {number | null} */
        let stageId = null;

        if (item.ev) {
          eventId = ensureEvent(item.ev, item.at, item.category);
          if (item.nd) {
            versionId = ensureVersion(eventId, item.nd);
            if (item.st) stageId = ensureStage(eventId, versionId, item.st);
          }
        }

        const emotion = emotionBitmap(item.emo);
        const digest = createHash('sha256').update(item.text, 'utf8').digest('hex').slice(0, 8);
        const occurred = JSON.stringify([item.at]);
        // importance 是列在表里的老档位（1~5），按 s 折算，只为别让老界面读到空
        const importance = Math.min(5, Math.max(1, Math.ceil(item.s / 20)));

        const inserted = writer.run(
          `INSERT INTO memories
             (code, at, speaker, body, platform, emotion, importance, hits, voiced, unconfirmed,
              origin, text, occurred, vector, digest, old_id, event_id, version_id, stage_id, s, dec, emotion_old, place, category)
           VALUES
             (NULL, ?, ?, '00000000', 0, ?, ?, 1, 0, 0,
              '', ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, NULL, ?, ?)`,
          item.at,
          item.speaker,
          emotion,
          importance,
          item.text,
          occurred,
          digest,
          eventId,
          versionId,
          stageId,
          item.s,
          item.dec,
          // place：调用方显式给了就用它（能塞 trash），否则按有没有挂事推断
          item.place || (eventId !== null ? 'event' : 'chat'),
          // category：五个抽屉（闲聊/暧昧/干活/知识/规矩），没给就留空，前端有兜底
          item.category || null,
        );
        const memoryId = toId(inserted.lastInsertRowid);
        if (!memoryId) throw new Error('insert 进去了却没拿到 memories.id');

        if (eventId !== null) touchedEvents.add(eventId);
        if (versionId !== null) touchedVersions.add(versionId);
        if (stageId !== null) touchedStages.add(stageId);

        if (item.dec === 1) {
          writer.run(
            'INSERT INTO decisions (memory_id, event_id, obj, text, at) VALUES (?, ?, ?, ?, ?)',
            memoryId,
            eventId,
            item.decobj,
            item.text,
            item.at,
          );
        }

        ids.push(memoryId);
        db.exec(`RELEASE w_${i}`);
      } catch (cause) {
        db.exec(`ROLLBACK TO w_${i}`);
        db.exec(`RELEASE w_${i}`);
        const reason = cause instanceof Error ? cause.message : String(cause);
        errors.push(`items[${i}]「${item.text.slice(0, 24)}」没写进去：${reason}`);
      }
    }

    // ── 三、重算 n / dec_count（用 COUNT(*)，不用 +1 —— 免得漂）────────
    // 老库实测：118 件事 / 1008 个版本 / 1746 个阶段的 n 本来就跟实际条数一模一样，
    // 所以重算不会改动任何老行的数字。first_at / last_at 只往两头**扩**，不往里缩。
    for (const eventId of touchedEvents) {
      const span = writer.get('SELECT MIN(at) AS f, MAX(at) AS l FROM memories WHERE event_id = ?', eventId);
      const firstAt = trimText(span?.f) || null;
      const lastAt = trimText(span?.l) || null;
      writer.run(
        `UPDATE events SET
            n = (SELECT COUNT(*) FROM memories WHERE event_id = events.id),
            dec_count = (SELECT COUNT(*) FROM memories WHERE event_id = events.id AND dec = 1),
            first_at = MIN(COALESCE(first_at, ?), ?),
            last_at = MAX(COALESCE(last_at, ?), ?)
          WHERE id = ?`,
        firstAt,
        firstAt,
        lastAt,
        lastAt,
        eventId,
      );
    }
    for (const versionId of touchedVersions) {
      writer.run('UPDATE versions SET n = (SELECT COUNT(*) FROM memories WHERE version_id = versions.id) WHERE id = ?', versionId);
    }
    for (const stageId of touchedStages) {
      writer.run('UPDATE stages SET n = (SELECT COUNT(*) FROM memories WHERE stage_id = stages.id) WHERE id = ?', stageId);
    }

    db.exec('COMMIT');
    committed = true;
  } catch (cause) {
    if (!committed) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* 事务可能已经自己退了 */
      }
    }
    const reason = cause instanceof Error ? cause.message : String(cause);
    return {
      ok: false,
      written: 0,
      ids: [],
      created: { events: [], versions: [], stages: [] },
      errors: [`整批写入失败，已经回滚（库还是原样）：${reason}`],
    };
  }

  return {
    ok: errors.length === 0 && ids.length + skipped.length === items.length,
    written: ids.length,
    skipped,
    ids,
    created: { events: createdEvents, versions: createdVersions, stages: createdStages },
    errors,
  };
}

/**
 * 改一条话的门类 / 去处（2026-10-23，老黄在时间页手动纠沉淀判错的地方）。
 *
 * 只动 category 和 place 两列，别的一个字节都不碰：
 * 原文、分数、情绪、挂的事 / 版本 / 阶段都保持原样 —— 纠错不该顺手改别的。
 *
 * @param {ReturnType<typeof createWriter>} writer
 * @param {{ id?: unknown, category?: unknown, place?: unknown }} [args]
 */
export function updateMemory(writer, args = {}) {
  const id = Number(args?.id);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'id 不对（要 memories.id 那个整数）' };

  const CATEGORIES = new Set(['闲聊', '暧昧', '干活', '知识', '规矩']);
  const places = new Set(['event', 'chat', 'trash']);

  /** @type {string[]} */
  const sets = [];
  /** @type {unknown[]} */
  const params = [];

  if (args?.category !== undefined) {
    const c = trimText(args.category);
    if (c && !CATEGORIES.has(c)) {
      return { ok: false, error: `门类只能是 ${[...CATEGORIES].join(' / ')}，收到「${c}」` };
    }
    sets.push('category = ?');
    params.push(c || null);
  }
  if (args?.place !== undefined) {
    const p = trimText(args.place);
    if (!places.has(p)) {
      return { ok: false, error: `去处只能是 event / chat / trash，收到「${p}」` };
    }
    sets.push('place = ?');
    params.push(p);
  }
  if (!sets.length) return { ok: false, error: '没给要改的东西（category 或 place）' };

  const row = writer.get('SELECT id FROM memories WHERE id = ?', id);
  if (!row) return { ok: false, error: `库里没有 id=${id} 这条话` };

  writer.run(`UPDATE memories SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  return { ok: true, id, changed: sets.length };
}
