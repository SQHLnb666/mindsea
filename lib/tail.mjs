// 识海 · 读钩子的最小版：最近 10 句原话
//
// 只做一件事：把 memories 里最近 10 条话（时间正序）摊成一小节文本，
// 给「每个会话第一轮」的系统提示词用 —— 新窗口一打开就接得上上一场。
//
// 硬约束：
//   1. 只读：走的还是 lib/query.mjs 那个 readOnly 连接，库一个字节都不写。
//   2. 只放原话：不掺运行时快照、不掺系统提示、不掺工具结果。
//   3. 一节只有 10 行、每行截 120 字 —— 长了占地方。

/** 推几句 */
export const TAIL_COUNT = 10;

/** 每句截多长（字符） */
export const TAIL_MAX_CHARS = 120;

/** 那一节的标题 */
export const TAIL_TITLE = '【识海 · 刚才那几句】（上次聊到这儿）';

/**
 * `2026-10-22 12:44:30` → `10-22 12:44`
 * @param {unknown} at
 * @returns {string}
 */
export function shortAt(at) {
  const text = String(at ?? '').trim();
  // 库里是 `YYYY-MM-DD HH:mm:ss`；短了也不强求，能截多少截多少
  return text.length >= 16 ? text.slice(5, 16) : text;
}

/**
 * speaker 0 → 用户，1 → 我
 * @param {unknown} speaker
 * @returns {string}
 */
export function whoOf(speaker) {
  const n = Number(speaker);
  if (n === 0) return '用户';
  if (n === 1) return '我';
  return `#${String(speaker)}`;
}

/**
 * 原话压成一行：空白折成一个空格，超长截断加省略号
 * @param {unknown} text
 * @returns {string}
 */
export function flatText(text) {
  const one = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return one.length > TAIL_MAX_CHARS ? `${one.slice(0, TAIL_MAX_CHARS)}…` : one;
}

/**
 * 取最近 N 条话（先按时间倒序取，再翻成正序）
 * @param {ReturnType<typeof import('./query.mjs').createStore>} store
 * @param {number} [limit]
 * @returns {{ id: number, at: string, speaker: number, text: string }[]}
 */
export function readTail(store, limit = TAIL_COUNT) {
  const rows = store.all(
    `SELECT id AS id, at AS at, speaker AS speaker, text AS text
       FROM memories
      ORDER BY at DESC, id DESC
      LIMIT ?`,
    limit,
  );
  return rows
    .map((row) => ({
      id: Number(row.id),
      at: String(row.at ?? ''),
      speaker: Number(row.speaker ?? 0),
      text: String(row.text ?? ''),
    }))
    .reverse();
}

/**
 * 摊成那一节文本；库里没话就返回空串（空串 = 这一轮不推）
 * @param {ReturnType<typeof import('./query.mjs').createStore>} store
 * @param {number} [limit]
 * @returns {string}
 */
export function tailText(store, limit = TAIL_COUNT) {
  let rows;
  try {
    rows = readTail(store, limit);
  } catch (error) {
    // 库打不开 / 表不在：这一轮就当没话，别把整轮拖垮
    if (typeof console !== 'undefined') console.warn(`[mindsea] 取最近原话失败：${error?.message ?? error}`);
    return '';
  }
  const lines = rows.filter((row) => flatText(row.text).length > 0).map((row) => `· ${shortAt(row.at)} ${whoOf(row.speaker)}：${flatText(row.text)}`);
  if (lines.length === 0) return '';
  return [TAIL_TITLE, ...lines].join('\n');
}
