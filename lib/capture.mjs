// 识海 · 自动沉淀（2026-10-23）
//
// 一轮聊完（agent/turn-stopping），把这一轮新回来的 user / assistant 话判一遍，
// 直接落进 memories —— 走的是跟 memory_write 工具同一条写入路径（lib/write.mjs）。
//
// 三条硬规矩：
//   1. **监听器里绝不 await 模型**。turn-stopping 是 serial 事件，等模型会把整轮收尾
//      拖住（memory-eternal 踩过）。这里只同步抓增量事件、丢进后台队列，立刻返回。
//   2. **原话由我们落，不让模型回抄**。模型只输出「第几号话归哪件事 / 多少分 / 什么情绪 /
//      是不是决定」，用编号引用；原文一个字都不会被改写，token 也省一半。
//   3. **剥噪声**。DSH 会把环境快照、system-reminder、技能目录伪装成 user 消息塞进会话，
//      不剥就会把一堆运行时垃圾写进记忆库。
//
// 还有一条兜底：模型漏说的编号，一律按「进闲聊池、40 分」落库 —— 宁可留平，不要漏。
import { appendFileSync, readFileSync, renameSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nowLocal, writeMemories } from './write.mjs';

/** 一条话最多喂给模型多少字（存库还是存全文） */
export const LINE_MAX_CHARS = 1200;

/** 写进 memories 的单条上限（跟 write.mjs 的校验对齐） */
const STORE_MAX_CHARS = 8000;

/**
 * 一轮有效字数下限。
 * 2026-10-24 老黄定：**全部存，一点不漏** —— 低于这个数不再整轮丢掉，
 * 只是免掉调模型那道判，原话照落库（闲聊池、40 分、不挂事）。见 captureTurn 里的 short 分支。
 */
export const MIN_TURN_CHARS = 60;

/** 一轮最多判多少条话（防上下文炸） */
export const MAX_LINES = 40;

/** 一轮喂给模型的**总**字数上限（超了留最近的，前面的标一下省略） */
export const MAX_TOTAL_CHARS = 20000;

/** 日志文件（跟插件同目录，plugin/data/capture-log.jsonl） */
export const LOG_PATH = fileURLToPath(new URL('./../data/capture-log.jsonl', import.meta.url));
const LOG_MAX_BYTES = 256 * 1024;

// ── 噪声剥离 ──────────────────────────────────────────────────────────────────

/** 运行时注入的成对标签块：整段剥掉。 */
const NOISE_BLOCKS = [
  /<local-command-caveat>[\s\S]*?<\/local-command-caveat>/gi,
  /<local-command-stdout>[\s\S]*?<\/local-command-stdout>/gi,
  /<system-reminder>[\s\S]*?<\/system-reminder>/gi,
  /<available_skills>[\s\S]*?<\/available_skills>/gi,
  /<team-[a-z-]+>[\s\S]*?<\/team-[a-z-]+>/gi,
  /<teammate[^>]*>[\s\S]*?<\/teammate>/gi,
  /<agent-message[^>]*>[\s\S]*?<\/agent-message>/gi,
  /<user-prompt-submit-hook>[\s\S]*?<\/user-prompt-submit-hook>/gi,
  /<command-[a-z-]+>[\s\S]*?<\/command-[a-z-]+>/gi,
  /\[Tool use: [^\]]*\]/gi,
];

/** 运行时注入的行前缀：整行丢掉。 */
const NOISE_LINE =
  /^\s*(相关上下文|Current runtime context|Runtime context|Approval prompts are disabled|DSH file policy|Current DSH file policy|You are a teammate|Team Lead|Teammate |Subagent |Note: the user|系统提示|环境快照|Background subagent )[：:]?/i;

/** 技能目录行（`- skill-name: 说明`）。 */
const SKILL_CATALOG_LINE = /^\s*[-*]\s*`[a-z0-9][a-z0-9-]{2,40}`:\s/;

/** 工具说明标题行（`# create-hook`、`## \`codex ...\``）。 */
const TOOL_DOC_HEADING = /^\s*#{1,4}\s*`?[a-z][a-z0-9-]{2,40}`?\s*$/i;

/**
 * 剥掉运行时注入：成对块、注入行、工具说明标题、技能目录。
 * @param {unknown} raw
 * @returns {string}
 */
export function stripNoise(raw) {
  let out = String(raw ?? '');
  for (const re of NOISE_BLOCKS) out = out.replace(re, '');
  const kept = [];
  for (const line of out.split('\n')) {
    if (NOISE_LINE.test(line) || TOOL_DOC_HEADING.test(line) || SKILL_CATALOG_LINE.test(line)) continue;
    kept.push(line);
  }
  return kept.join('\n').trim();
}

// ── 会话事件：取快照 / 取增量 ─────────────────────────────────────────────────

/**
 * 读会话事件快照。
 *
 * 优先 `ownEvents()`（DSH 公开 API：只含本会话自身事件，恢复 / 分叉不会把继承来的
 * 历史前缀重复沉淀），`snapshotEvents()` 次之，老结构的 `events` 兜底。
 * 三条都取不到就给空数组 —— 监听器里抛异常等于管线静默死亡。
 * @param {any} session
 * @returns {any[]}
 */
export function sessionEvents(session) {
  if (!session) return [];
  for (const pick of ['ownEvents', 'snapshotEvents']) {
    if (typeof session[pick] === 'function') {
      try {
        const out = session[pick]();
        if (Array.isArray(out)) return out;
      } catch {
        /* 换下一个取法 */
      }
    }
  }
  return Array.isArray(session.events) ? session.events : [];
}

/**
 * 取增量事件：seq 大于水位的 user / assistant 消息事件。
 * 没有 seq 的非常规事件也收，避免漏消息。
 * @param {any[]} events
 * @param {number} lastSeq
 * @returns {any[]}
 */
export function sliceNewEvents(events, lastSeq) {
  /** @type {any[]} */
  const out = [];
  const floor = typeof lastSeq === 'number' ? lastSeq : -1;
  for (const event of Array.isArray(events) ? events : []) {
    const seq = event?.seq;
    if (typeof seq === 'number' && seq <= floor) continue;
    const type = event?.type;
    if (type === 'user/message' || type === 'assistant/message') out.push(event);
  }
  return out;
}

// ── 事件 → 这一轮的话 ─────────────────────────────────────────────────────────

/** @param {number} n */
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * 任意时间戳 → 库里那种本地时间 `YYYY-MM-DD HH:mm:ss`；认不出就用现在。
 * @param {unknown} raw
 * @returns {string}
 */
export function toLocalAt(raw) {
  if (raw === undefined || raw === null || raw === '') return nowLocal();
  const text = String(raw).trim();
  // 已经是库里的格式：直接用
  if (/^\d{4}-\d{1,2}-\d{1,2}[ T]\d{1,2}:\d{2}(:\d{2})?$/.test(text)) {
    const [d, t] = text.replace('T', ' ').split(' ');
    const [y, mo, da] = d.split('-');
    const [h, mi, se] = (t || '00:00:00').split(':');
    return `${y}-${pad2(Number(mo))}-${pad2(Number(da))} ${pad2(Number(h))}:${pad2(Number(mi))}:${pad2(Number(se || 0))}`;
  }
  const date = /^\d+$/.test(text) ? new Date(Number(text)) : new Date(text);
  if (Number.isNaN(date.getTime())) return nowLocal();
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/**
 * 从一条会话事件里抽出「谁说的、什么时候、说了什么」。
 * @param {any} event
 * @returns {{ speaker: 0 | 1, at: string, text: string } | null}
 */
function readMessageEvent(event) {
  const type = event?.type;
  if (type !== 'user/message' && type !== 'assistant/message') return null;
  const data = event.data || event;
  const message = data.message || data;
  const content = message?.content;
  let text = '';
  if (Array.isArray(content)) {
    text = content
      .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n');
  } else if (typeof content === 'string') {
    text = content;
  }
  text = stripNoise(text);
  if (!text) return null;
  const speaker = /** @type {0 | 1} */ (type === 'user/message' ? 0 : 1);
  const at = toLocalAt(event?.at ?? event?.time ?? event?.ts ?? data?.at ?? data?.time ?? data?.ts ?? message?.at);
  return { speaker, at, text };
}

/**
 * 本轮增量事件 → 待判的话（带编号）。
 *
 * 太长就给近的：从末尾往前收，碰到 MAX_LINES 或 MAX_TOTAL_CHARS 就停 ——
 * 一轮里真正要紧的是后面那几句。
 * @param {any[]} events
 * @param {{ maxChars?: number, maxLines?: number, maxTotalChars?: number }} [opts]
 * @returns {{ i: number, speaker: 0 | 1, at: string, text: string }[]}
 */
export function collectLines(events, opts = {}) {
  const maxChars = Number(opts.maxChars) > 0 ? Number(opts.maxChars) : LINE_MAX_CHARS;
  const maxLines = Number(opts.maxLines) > 0 ? Number(opts.maxLines) : MAX_LINES;
  const maxTotal = Number(opts.maxTotalChars) > 0 ? Number(opts.maxTotalChars) : MAX_TOTAL_CHARS;

  /** @type {{ speaker: 0 | 1, at: string, text: string }[]} */
  const raw = [];
  for (const event of Array.isArray(events) ? events : []) {
    const got = readMessageEvent(event);
    if (!got) continue;
    raw.push({
      speaker: got.speaker,
      at: got.at,
      text: got.text.length > maxChars ? `${got.text.slice(0, maxChars)}…` : got.text,
    });
  }

  /** @type {{ speaker: 0 | 1, at: string, text: string }[]} */
  const kept = [];
  let chars = 0;
  for (let k = raw.length - 1; k >= 0; k -= 1) {
    if (kept.length >= maxLines) break;
    const line = raw[k];
    if (kept.length > 0 && chars + line.text.length > maxTotal) break;
    kept.unshift(line);
    chars += line.text.length;
  }

  return kept.map((line, idx) => ({ i: idx + 1, ...line }));
}

/** 全部话的有效字数（去掉空白）。 */
export function totalChars(lines) {
  return lines.reduce((sum, line) => sum + line.text.replace(/\s+/g, '').length, 0);
}

// ── 现有骨架：事名 / 版本名（给模型复用）──────────────────────────────────────

/**
 * 读现有的事 + 版本，作为「优先复用这些名字」的清单。
 * @param {{ all: (sql: string, ...params: unknown[]) => any[] }} store
 * @param {number} [limit]
 * @returns {{ name: string, n: number, versions: string[] }[]}
 */
export function readEventCandidates(store, limit = 40) {
  /** @type {{ name: string, n: number, versions: string[] }[]} */
  const out = [];
  try {
    const rows = store.all(
      'SELECT id, name, n FROM events ORDER BY n DESC, id ASC LIMIT ?',
      Number(limit) > 0 ? Number(limit) : 40,
    );
    const vers = new Map();
    try {
      const vrows = store.all('SELECT event_id, name, n FROM versions ORDER BY n DESC, id ASC');
      for (const v of vrows) {
        const key = Number(v.event_id);
        const list = vers.get(key) ?? [];
        if (list.length < 3 && typeof v.name === 'string' && v.name) list.push(v.name);
        vers.set(key, list);
      }
    } catch {
      /* versions 表读不到就只给事名 */
    }
    for (const row of rows) {
      if (!row || typeof row.name !== 'string' || !row.name) continue;
      out.push({ name: row.name, n: Number(row.n) || 0, versions: vers.get(Number(row.id)) ?? [] });
    }
  } catch {
    /* 库还没建好 / 表不在：当作没有现成的事，模型自己起名 */
  }
  return out;
}

/**
 * 现有骨架摊成一段给模型看的文字。
 * @param {{ name: string, n: number, versions: string[] }[]} candidates
 * @returns {string}
 */
export function renderCandidates(candidates) {
  if (!candidates.length) return '（库里还没有事，这次可以起新名）';
  return candidates
    .map((c, idx) => {
      const vers = c.versions.length ? `　版本：${c.versions.join(' / ')}` : '';
      return `${idx + 1}. ${c.name}（${c.n} 条）${vers}`;
    })
    .join('\n');
}

// ── prompt ────────────────────────────────────────────────────────────────────

/** 沉淀器的 system prompt（口径照判工手册，压成自动版）。 */
export const JUDGE_SYSTEM = [
  '你是识海的「自动沉淀器」。每轮聊完，你要把这一轮的话判一遍：归到哪件事、多少分、什么情绪、是不是决定。',
  '',
  '铁律：',
  '1. 原话系统已经保存，你只输出**编号和判断**，绝不回抄原话。',
  '2. 除纯寒暄、纯工具回执、纯重复，一律保留 —— 宁可留平，不要漏。',
  '3. 事名优先用下面清单里的；清单里没有、而且确实是一件新事，才起新名（动词+对象，4~12 字，一眼认得出）。',
  '4. 阶段 st 必须挂在版本 nd 下，nd 必须挂在事 ev 下；判不到就只填 ev。不是新方案就别乱给 nd。',
  '5. dec=1 只在「定了口径 / 方向 / 取舍」时标，并且必须给 decobj（比如「记忆怎么存」「接头形式判据」），别写「方案」「事情」这种泛词。',
  '6. 拿不准就 ev 留空（进闲聊池），分给 50。',
  '7. 分（s）0~100：90 = 这辈子不能忘；70 = 重要；50 = 正常聊到；30 = 随口一提；10 = 几乎没内容。',
  '8. 七情只标这条话里真有的：喜 怒 哀 惧 爱 恶 欲，没有就 []。',
  '9. **超过 400 字的「大肥鱼」回答**：先看它有没有实质内容 —— 有结论 / 方法 / 决定 / 说明，就照常放进 keep（照常挂事参加匹配）；纯粹是过程叙述、复述、寒暄（没信息量），才把编号放进 trash。',
  '10. 每条 keep 都要给 cat（门类，只能是这五个之一）：闲聊 / 暧昧 / 干活 / 知识 / 规矩。',
  '   干活 = 在推的具体活、排障、代码、配置；知识 = 原理、结论、盘出来的规律；规矩 = 人设、口径、底线、给 AI 的指令；',
  '   暧昧 = 想你、撒娇、黏、心里话这种；闲聊 = 日常、玩笑、没有下一步的话。',
  '',
  '输出**纯 JSON**，不要 markdown 代码块，不要任何解释：',
  '{"keep":[{"i":1,"ev":"桌宠改造","nd":"","st":"","s":60,"emo":["喜"],"dec":0,"decobj":"","cat":"干活"}],"drop":[3,4],"trash":[7]}',
  '11. **日程 / 作息类的话，哪怕只有一句、看着像闲聊，也必须挂到「日程」这件事上**：',
  '   比如「明后天双休」「今天不上班」「明天去车间」「今晚几点回来」「这周要出差」。',
  '   理由：这类是「以后还要靠它安排时间」的事实，丢进闲聊池就再也撞不到了 ——',
  '   2026-10-24 踩过一次：前一天晚上说了双休，第二天问「今天休息」我却想不起来。',
  '   事名统一叫「日程」，nd 填「双休 / 上班 / 出行」这类，st 不用填。',
  '12. 反过来，情绪、玩笑、撒娇、一次性问答不要往「日程」里塞，那是闲聊。',
  '每一条话必须在 keep 或 drop 里各出现一次，不许漏编号；trash 是可选的，只放「留档但不参加匹配」的编号。',
].join('\n');

/**
 * 这一轮喂给模型的正文。
 * @param {{ i: number, speaker: number, at: string, text: string }[]} lines
 * @param {string} candidatesText
 * @returns {string}
 */
export function renderTurnInput(lines, candidatesText) {
  const body = lines
    .map((line) => `[${line.i}] ${line.speaker === 0 ? '用户' : '大肥鱼'}（${String(line.at).slice(5, 16)}）：${line.text}`)
    .join('\n');
  return ['## 这一轮的话', body, '', '## 现有的事（优先复用这些名字）', candidatesText].join('\n');
}

// ── 解析模型输出 ──────────────────────────────────────────────────────────────

/**
 * 从模型回复里抠出 JSON（容忍 ```json 围栏、前后废话、截断）。
 * @param {string} raw
 * @returns {any | null}
 */
export function parseJudgeJson(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const fenced = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const candidates = [fenced, text];
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(fenced.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* 换下一种切法 */
    }
  }
  return null;
}

const EMO_SET = new Set(['喜', '怒', '哀', '惧', '爱', '恶', '欲']);

/** 老黄 2026-10-23 定的五个抽屉 */
const CATEGORIES = new Set(['闲聊', '暧昧', '干活', '知识', '规矩']);

/**
 * 模型输出 → 每条话的判词；模型漏说的编号一律按「闲聊池 40 分」补上。
 * @param {any} parsed
 * @param {{ i: number }[]} lines
 * @returns {Map<number, { ev: string, nd: string, st: string, s: number, emo: string[], dec: 0 | 1, decobj: string }>}
 */
export function normalizeJudge(parsed, lines) {
  /** @type {Map<number, any>} */
  const byIndex = new Map();
  const keep = Array.isArray(parsed?.keep) ? parsed.keep : [];
  for (const entry of keep) {
    if (!entry || typeof entry !== 'object') continue;
    const i = Number(entry.i);
    if (!Number.isFinite(i)) continue;
    const ev = typeof entry.ev === 'string' ? entry.ev.trim() : '';
    let nd = typeof entry.nd === 'string' ? entry.nd.trim() : '';
    let st = typeof entry.st === 'string' ? entry.st.trim() : '';
    if (!ev) {
      nd = '';
      st = '';
    }
    if (!nd) st = '';
    const rawScore = Number(entry.s);
    const s = Number.isFinite(rawScore) ? Math.min(100, Math.max(0, Math.round(rawScore))) : 50;
    const emo = Array.isArray(entry.emo) ? entry.emo.filter((e) => EMO_SET.has(String(e))) : [];
    let dec = Number(entry.dec) === 1 ? 1 : 0;
    const decobj = typeof entry.decobj === 'string' ? entry.decobj.trim() : '';
    if (dec === 1 && !decobj) dec = 0; // 没给 decobj 就不算决定（别让整批被写入校验拒掉）
    // 门类：只认老黄定的五个抽屉，别的当没给
    const catRaw = typeof entry.cat === 'string' ? entry.cat.trim() : '';
    const cat = CATEGORIES.has(catRaw) ? catRaw : '';
    byIndex.set(i, { ev, nd, st, s, emo: emo.map(String), dec: /** @type {0|1} */ (dec), decobj, cat });
  }
  /** @type {Map<number, any>} */
  const judged = new Map();
  for (const line of lines) {
    const got = byIndex.get(line.i);
    judged.set(
      line.i,
      got ?? { ev: '', nd: '', st: '', s: 40, emo: [], dec: 0, decobj: '', cat: '' },
    );
  }
  return judged;
}

// ── 路由（用哪个模型去判）───────────────────────────────────────────────────

/**
 * 找出这一轮用的 provider / model；找不到就退回第一个可用 provider 的第一个模型。
 * @param {any} llm
 * @param {any} agent
 * @param {{ provider?: string, model?: string }} [prefer]
 * @returns {Promise<{ provider: string, model: string } | null>}
 */
export async function resolveRoute(llm, agent, prefer = {}) {
  const pick = (obj, pKeys, mKeys) => {
    if (!obj || typeof obj !== 'object') return null;
    for (const pk of pKeys) {
      const pv = obj[pk];
      if (typeof pv === 'string' && pv.trim()) {
        let model = '';
        for (const mk of mKeys) {
          const mv = obj[mk];
          if (typeof mv === 'string' && mv.trim()) {
            model = mv.trim();
            break;
          }
        }
        return { provider: pv.trim(), model };
      }
    }
    return null;
  };
  try {
    // ① 跟当前会话同款模型（最省事、最不容易缺凭证）
    const session = agent?.session;
    if (session && typeof session.requestHeader === 'function') {
      const header = await session.requestHeader();
      const cfg = header?.config ?? header;
      const got = pick(cfg, ['providerId', 'provider'], ['modelId', 'model']);
      if (got) return got;
    }
    const fromAgent = pick(agent?.options, ['providerId', 'provider'], ['modelId', 'model']);
    if (fromAgent) return fromAgent;
    const fromSession = pick(session, ['providerId', 'provider'], ['modelId', 'model']);
    if (fromSession) return fromSession;
  } catch {
    /* 读不到就走下面的兜底 */
  }
  try {
    const want = String(prefer.provider ?? '').trim();
    const wantModel = String(prefer.model ?? '').trim();
    const providers = llm.listProviders() ?? [];
    if (!providers.length) return null;
    const ordered = want ? [...providers.filter((p) => p.id === want), ...providers.filter((p) => p.id !== want)] : providers;
    for (const provider of ordered) {
      if (!provider?.id) continue;
      if (provider.id === want && wantModel) return { provider: provider.id, model: wantModel };
      const models = await llm.listModels(provider.id);
      const model = Array.isArray(models) && models[0]?.id;
      if (model) return { provider: provider.id, model };
    }
  } catch {
    /* 一个都拿不到 */
  }
  return null;
}

// ── 调模型 ────────────────────────────────────────────────────────────────────
//
// 故意**不** import `@deepseek-ai/dsh-llm`：这个插件是 junction 装进 profile 的，
// 真实路径在 `~/.dsh/im/review/mindsea/plugin`，那儿解析不到 dsh-llm（会静默退回
// 一个只会拼字符串的 shim，最后一字不出）。这里只用 llm.stream 的公开形状：
// 发一个 `{ role:'user', content:[{type:'text'}] }`，收 `text-delta` 拼字，
// 收 `finish` 判成败。零依赖，宿主换版本也不容易碎。

/**
 * 调一次模型，返回纯文本。
 * @param {any} llm
 * @param {{ provider: string, model: string }} route
 * @param {{ system?: string, user: string, maxTokens?: number, timeoutMs?: number }} opts
 * @returns {Promise<{ text?: string, failure?: string }>}
 */
export async function callLlmText(llm, route, opts) {
  /** @type {any[]} */
  const messages = [{ role: 'user', content: [{ type: 'text', text: String(opts.user ?? '') }] }];
  /** @type {any} */
  let finish = { kind: 'stop' };
  let text = '';
  try {
    const stream = llm.stream({
      provider: route.provider,
      model: route.model,
      messages,
      ...(opts.system ? { system: opts.system } : {}),
      maxTokens: Number(opts.maxTokens) > 0 ? Number(opts.maxTokens) : 2000,
      signal: AbortSignal.timeout(Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 90000),
    });
    for await (const chunk of stream) {
      if (!chunk || typeof chunk !== 'object') continue;
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text;
      else if (chunk.type === 'finish' && chunk.reason) finish = chunk.reason;
    }
  } catch (error) {
    return { failure: `调用模型炸了：${error?.message ?? error}` };
  }
  if (finish && (finish.kind === 'error' || finish.kind === 'aborted')) {
    const f = finish.failure ?? {};
    return { failure: `模型调用失败：${f.code ?? finish.kind} ${f.message ?? ''}`.trim() };
  }
  const trimmed = text.trim();
  if (!trimmed) return { failure: '模型一个字都没吐（可能撞了 maxTokens 或路由不对）' };
  return { text: trimmed };
}

// ── 日志 ──────────────────────────────────────────────────────────────────────

/**
 * 追加一行沉淀日志（落盘，坏了静默；验的时候直接看这个文件）。
 * @param {Record<string, unknown>} entry
 */
export function appendLog(entry) {
  try {
    try {
      if (statSync(LOG_PATH).size > LOG_MAX_BYTES) renameSync(LOG_PATH, `${LOG_PATH}.old`);
    } catch {
      /* 文件还没有，第一次写 */
    }
    appendFileSync(LOG_PATH, `${JSON.stringify({ at: nowLocal(), ...entry })}\n`, 'utf8');
  } catch {
    /* 日志写不进去不影响沉淀 */
  }
}

/**
 * 读日志尾部（面板「自动化」页和重启后的验证都靠它）。
 * @param {number} [limit]
 * @returns {any[]}
 */
export function readLogTail(limit = 50) {
  try {
    const text = readFileSync(LOG_PATH, 'utf8');
    const lines = text.split('\n').filter((line) => line.trim());
    return lines.slice(-Math.max(1, Number(limit) || 50)).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
  } catch {
    return [];
  }
}

/**
 * 面板「自动化」页要的那一份：开关、今天的数、最近流水、库的现状。
 *
 * 数字全部从日志 + 库里现算，不缓存 —— 沉淀是后台管线，页面上慢一拍都算欺骗。
 *
 * @param {any} store 只读连接（lib/query.mjs 的 createStore）
 * @param {{ enabled?: boolean, limit?: number }} [opts]
 * @returns {any}
 */
export function readCaptureStatus(store, opts = {}) {
  const enabled = opts.enabled !== false;
  const limit = Math.min(500, Math.max(1, Number(opts.limit) || 60));
  const all = readLogTail(500);
  const today = nowLocal().slice(0, 10);

  /** 今天的账：写了几条、跳过几次、失败几次、这一轮一句都没判 */
  const todayStat = { wrote: 0, runs: 0, skipped: 0, failed: 0, chars: 0 };
  /** @type {Map<string, number>} 今天新开（或踩到）的事名 → 次数 */
  const eventHits = new Map();
  /** @type {{ provider: string, model: string } | null} */
  let route = null;

  for (const entry of all) {
    if (!String(entry?.at ?? '').startsWith(today)) continue;
    const level = String(entry?.level ?? '');
    if (level === 'ok' || level === 'partial') {
      todayStat.runs += 1;
      todayStat.wrote += Number(entry.written) || 0;
      todayStat.chars += Number(entry.chars) || 0;
      for (const name of entry?.created?.events ?? []) {
        if (name) eventHits.set(name, (eventHits.get(name) ?? 0) + 1);
      }
    } else if (level === 'skip') {
      todayStat.skipped += 1;
    } else if (level === 'fail') {
      todayStat.failed += 1;
    }
    if (!route && entry?.route?.provider) {
      route = { provider: String(entry.route.provider), model: String(entry.route.model ?? '') };
    }
  }

  /** @type {{ total: number, today: number, lastAt: string }} */
  const library = { total: 0, today: 0, lastAt: '' };
  try {
    library.total = Number(store.get('SELECT count(*) AS c FROM memories')?.c ?? 0);
    library.today = Number(store.get('SELECT count(*) AS c FROM memories WHERE at >= ?', today)?.c ?? 0);
    library.lastAt = String(store.get('SELECT at FROM memories ORDER BY at DESC, id DESC LIMIT 1')?.at ?? '');
  } catch {
    /* 库还没建好就当 0 */
  }

  const recent = all.filter((entry) => entry && entry.level !== 'boot').slice(-limit).reverse();

  return {
    ok: true,
    enabled,
    today,
    stat: todayStat,
    route,
    library,
    events: [...eventHits.entries()].map(([name, times]) => ({ name, times })).sort((a, b) => b.times - a.times),
    entries: recent,
  };
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

/**
 * 判一轮、落一轮。
 *
 * @param {{
 *   llm: any,
 *   writer: ReturnType<typeof import('./write.mjs').createWriter>,
 *   store: { all: (sql: string, ...params: unknown[]) => any[] },
 *   agent: any,
 *   events: any[],
 *   provider?: string,
 *   model?: string,
 *   maxTokens?: number,
 * }} args
 * @returns {Promise<{ ok: boolean, written: number, lines: number, chars: number, skipped?: string, errors?: string[] }>}
 */
export async function captureTurn(args) {
  const { llm, writer, store, agent, events } = args;
  /** 自测时传 noLog: true —— 别把假数据的流水写进面板 */
  const log = args.noLog ? () => {} : appendLog;
  const lines = collectLines(events);
  const chars = totalChars(lines);
  if (!lines.length) {
    log({ level: 'skip', reason: '这一轮没有可记的话', lines: 0 });
    return { ok: true, written: 0, lines: 0, chars: 0, skipped: 'empty' };
  }
  if (chars < MIN_TURN_CHARS) {
    // 2026-10-24 老黄定：全部存，一点不漏。
    // 短轮不调模型（省 token），但原话照落库：不挂事、不分类，进闲聊池、40 分。
    /** @type {any[]} */
    const plain = [];
    for (const line of lines) {
      try {
        const dup = writer.get('SELECT id FROM memories WHERE at = ? AND speaker = ? AND text = ? LIMIT 1', line.at, line.speaker, line.text);
        if (dup) continue;
      } catch {
        /* 查不了就照写，宁可重复也别丢 */
      }
      const text = line.text.length > STORE_MAX_CHARS ? `${line.text.slice(0, STORE_MAX_CHARS)}…` : line.text;
      plain.push({
        text,
        at: line.at,
        speaker: line.speaker,
        ev: '',
        nd: '',
        st: '',
        s: 40,
        emo: [],
        dec: 0,
        decobj: '',
        place: 'chat',
        category: '',
      });
    }
    if (!plain.length) {
      log({ level: 'skip', reason: '短轮，都已经落过', lines: lines.length, chars });
      return { ok: true, written: 0, lines: lines.length, chars, skipped: 'nothing-to-write' };
    }
    const direct = writeMemories(writer, { items: plain });
    log({
      level: direct.ok ? 'ok' : 'fail',
      reason: direct.ok ? '' : (direct.errors ?? []).join('；').slice(0, 300),
      lines: lines.length,
      chars,
      written: direct.written,
      ids: direct.ids,
      created: direct.created,
      note: '短轮直存（未判）',
    });
    return {
      ok: direct.ok,
      written: direct.written,
      lines: lines.length,
      chars,
      ...(direct.ok ? {} : { errors: direct.errors }),
    };
  }

  const route = await resolveRoute(llm, agent, { provider: args.provider, model: args.model });
  if (!route?.provider || !route.model) {
    log({ level: 'fail', reason: '找不到可用的 provider / model', lines: lines.length, chars });
    return { ok: false, written: 0, lines: lines.length, chars, errors: ['没有可用模型'] };
  }

  const candidates = readEventCandidates(store);
  const input = renderTurnInput(lines, renderCandidates(candidates));
  const reply = await callLlmText(llm, route, {
    system: JUDGE_SYSTEM,
    user: input,
    maxTokens: Number(args.maxTokens) > 0 ? Number(args.maxTokens) : 2000,
  });
  if (!reply.text) {
    log({ level: 'fail', reason: reply.failure ?? '模型没吐字', lines: lines.length, chars, route });
    return { ok: false, written: 0, lines: lines.length, chars, errors: [reply.failure ?? '模型没吐字'] };
  }

  const parsed = parseJudgeJson(reply.text);
  if (!parsed) {
    log({ level: 'fail', reason: '模型输出不是 JSON', lines: lines.length, chars, raw: String(reply.text).slice(0, 400) });
    return { ok: false, written: 0, lines: lines.length, chars, errors: ['模型输出不是 JSON'] };
  }

  const judged = normalizeJudge(parsed, lines);
  const dropped = new Set(
    (Array.isArray(parsed.drop) ? parsed.drop : []).map((v) => Number(v)).filter((v) => Number.isFinite(v)),
  );
  // 模型点名「留档但不参加匹配」的编号。只认「我的长回答」—— 别的话它乱标一律不认。
  const trashed = new Set(
    (Array.isArray(parsed.trash) ? parsed.trash : []).map((v) => Number(v)).filter((v) => Number.isFinite(v)),
  );

  /** @type {any[]} */
  const items = [];
  for (const line of lines) {
    if (dropped.has(line.i)) continue;
    const judge = judged.get(line.i);
    // 已经落过的就别落第二遍（水位丢了 / 重启后重跑同一批时兜底）
    try {
      const dup = writer.get('SELECT id FROM memories WHERE at = ? AND speaker = ? AND text = ? LIMIT 1', line.at, line.speaker, line.text);
      if (dup) continue;
    } catch {
      /* 查不了就照写，宁可重复也别丢 */
    }
    const text = line.text.length > STORE_MAX_CHARS ? `${line.text.slice(0, STORE_MAX_CHARS)}…` : line.text;

    // 老黄 2026-10-23 补的口径：长回答不是一刀切 —— 先看有没有信息。
    //   有结论 / 方法 / 决定 / 说明 → 正常留（照常挂事、照常匹配）；
    //   纯过程叙述、复述、寒暄 → 进废料池（留档，但不挂事、不参加匹配）。
    // 「有没有信息」这件事交模型判（prompt 第 9 条），这里只兜一层长度前提。
    const toTrash = trashed.has(line.i) && line.speaker === 1 && text.length > 400;
    items.push({
      text,
      at: line.at,
      speaker: line.speaker,
      ev: toTrash ? '' : judge.ev,
      nd: toTrash ? '' : judge.nd,
      st: toTrash ? '' : judge.st,
      s: judge.s,
      emo: judge.emo,
      dec: judge.dec,
      decobj: judge.decobj,
      place: toTrash ? 'trash' : '',
      category: judge.cat || '',
    });
  }

  if (!items.length) {
    log({ level: 'skip', reason: '全是 drop 或者都已经落过', lines: lines.length, chars });
    return { ok: true, written: 0, lines: lines.length, chars, skipped: 'nothing-to-write' };
  }

  const result = writeMemories(writer, { items });
  log({
    level: result.ok ? 'ok' : result.written > 0 ? 'partial' : 'fail',
    reason: result.ok ? '' : (result.errors ?? []).join('；').slice(0, 300),
    lines: lines.length,
    chars,
    dropped: dropped.size,
    written: result.written,
    ids: result.ids,
    created: result.created,
    route,
  });
  return {
    ok: result.ok,
    written: result.written,
    lines: lines.length,
    chars,
    ...(result.ok ? {} : { errors: result.errors }),
  };
}
