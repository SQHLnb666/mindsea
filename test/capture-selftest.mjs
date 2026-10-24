// 自动沉淀 · 离线自测（2026-10-23）
//
// 不碰真模型、不碰真库：用假 llm + 一份 sea2.db 的副本，端到端跑一遍
// 「事件 → 话 → 判词 → 落库」，验四条：
//   1. 运行时注入（system-reminder / 环境快照）能被剥干净
//   2. 事件能按 seq 水位切成「这一轮」
//   3. 模型输出（带 ```json 围栏）能解析；漏编号的按闲聊池补上；dec 没 decobj 要降级
//   4. 落库真的写进去了，且再跑一遍不会重复写（去重兜底）
//
// 跑法：node test/capture-selftest.mjs
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWriter } from './../lib/write.mjs';
import { createStore, resolveDbPath } from './../lib/query.mjs';
import {
  captureTurn,
  collectLines,
  normalizeJudge,
  parseJudgeJson,
  sliceNewEvents,
  stripNoise,
} from './../lib/capture.mjs';

let failed = 0;

/**
 * @param {string} name
 * @param {boolean} cond
 * @param {string} [detail]
 */
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${name}`);
    return;
  }
  failed += 1;
  console.log(`  ✗ ${name}${detail ? `　（${detail}）` : ''}`);
}

function equal(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok, ok ? '' : `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

console.log('一、剥噪声');
{
  const raw = [
    'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.',
    '老黄：把今天的判工收尾一下',
    '<system-reminder>',
    '这个文件是 DSH 给每个 agent 的第一手规则',
    '</system-reminder>',
    '- `demo-skill`: 示例技能',
    '# create-hook',
    '我：好，今晚判完',
  ].join('\n');
  const got = stripNoise(raw);
  check('注入行 / 标签块 / 技能目录 / 工具标题都剥掉', !/runtime context|system-reminder|demo-skill|create-hook/.test(got), got);
  check('真话留着', got.includes('把今天的判工收尾一下') && got.includes('今晚判完'), got);
}

console.log('二、事件 → 这一轮的话');
const events = [
  { type: 'session/start', seq: 1 },
  {
    type: 'user/message',
    seq: 2,
    at: '2026-10-23T09:30:00+08:00',
    data: { message: { role: 'user', content: [{ type: 'text', text: '老黄：自动沉淀今天得弄完' }] } },
  },
  {
    type: 'assistant/message',
    seq: 3,
    at: '2026-10-23T09:30:20+08:00',
    data: { message: { role: 'assistant', content: [{ type: 'text', text: '好，我照 memory-eternal 的机制来。' }] } },
  },
];
{
  const fresh = sliceNewEvents(events, 1);
  equal('水位 1 之后只捞到两条消息事件', fresh.length, 2);
  const lines = collectLines(fresh);
  equal('切成两句', lines.length, 2);
  equal('谁是用户谁是助手', [lines[0]?.speaker, lines[1]?.speaker], [0, 1]);
  check('时间转成库里格式', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(lines[0]?.at ?? ''), lines[0]?.at);
  equal('编号从 1 起', [lines[0]?.i, lines[1]?.i], [1, 2]);
}

console.log('三、模型输出解析');
{
  const fenced = '```json\n{"keep":[{"i":1,"ev":"识海自动沉淀","nd":"钩子","st":"开工","s":72,"emo":["喜"],"dec":1,"decobj":"记忆怎么沉淀"}],"drop":[2]}\n```';
  const parsed = parseJudgeJson(fenced);
  check('带围栏的 JSON 能解析', parsed !== null && Array.isArray(parsed.keep));
  const lines = [{ i: 1 }, { i: 2 }, { i: 3 }];
  const judged = normalizeJudge(parsed, lines);
  equal('判过的保留字段', [judged.get(1).ev, judged.get(1).nd, judged.get(1).st, judged.get(1).s], ['识海自动沉淀', '钩子', '开工', 72]);
  equal('决定带 decobj', [judged.get(1).dec, judged.get(1).decobj], [1, '记忆怎么沉淀']);
  equal('模型漏说的编号兜底成闲聊池 40 分', [judged.get(3).ev, judged.get(3).s], ['', 40]);

  const bad = normalizeJudge(
    { keep: [{ i: 1, ev: '', nd: '某版本', st: '某阶段', s: 999, dec: 1, decobj: '' }] },
    [{ i: 1 }],
  );
  equal('没 ev 就把 nd / st 清掉', [bad.get(1).ev, bad.get(1).nd, bad.get(1).st], ['', '', '']);
  equal('分超范围夹回 100', bad.get(1).s, 100);
  equal('dec=1 但没 decobj → 降级成 0', bad.get(1).dec, 0);
}

console.log('四、端到端落库（假模型 + 库副本）');
{
  const source = resolveDbPath();
  if (!existsSync(source)) {
    console.log(`  ! 找不到库 ${source}，跳过这一段`);
  } else {
    const dir = mkdtempSync(join(tmpdir(), 'mindsea-selftest-'));
    const dbPath = join(dir, 'sea2.db');
    copyFileSync(source, dbPath);
    const store = createStore(dbPath);
    const writer = createWriter(dbPath);
    const reply = JSON.stringify({
      keep: [
        { i: 1, ev: '识海自动沉淀', nd: '钩子', st: '端到端自测', s: 70, emo: ['喜'], dec: 1, decobj: '记忆怎么沉淀' },
        { i: 2, ev: '', nd: '', st: '', s: 50, emo: [], dec: 0, decobj: '' },
      ],
      drop: [3],
    });
    const fakeLlm = {
      listProviders: () => [{ id: 'fake', name: '假模型' }],
      listModels: async () => [{ id: 'fake-1', name: '假模型一号' }],
      async *stream(options) {
        if (!options || !options.messages || !options.messages.length) throw new Error('没给 messages');
        yield { type: 'text-delta', index: 0, text: reply.slice(0, 40) };
        yield { type: 'text-delta', index: 0, text: reply.slice(40) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    };
    const turn = [
      { type: 'user/message', seq: 10, at: '2026-10-23 21:00:00', data: { message: { role: 'user', content: [{ type: 'text', text: '自动沉淀的钩子今天必须接上，别再拖了。' }] } } },
      { type: 'assistant/message', seq: 11, at: '2026-10-23 21:00:30', data: { message: { role: 'assistant', content: [{ type: 'text', text: '接了：挂 turn-stopping，后台队列串行判，判完直接写 memories。' }] } } },
      { type: 'assistant/message', seq: 12, at: '2026-10-23 21:00:40', data: { message: { role: 'assistant', content: [{ type: 'text', text: '好的。' }] } } },
    ];

    const first = await captureTurn({ llm: fakeLlm, writer, store, agent: undefined, events: turn, noLog: true });
    check('第一次跑写进去了', first.written === 2, `written=${first.written} errors=${(first.errors ?? []).join('；')}`);
    const row = writer.get('SELECT text, s, dec, event_id FROM memories WHERE at = ? ORDER BY id DESC LIMIT 1', '2026-10-23 21:00:00');
    check('原话一字不改落库', String(row?.text ?? '').includes('自动沉淀的钩子今天必须接上'), row?.text);
    check('分是模型给的那一档', Number(row?.s) === 70, `s=${row?.s}`);
    check('事建出来了', Number(row?.event_id) > 0, `event_id=${row?.event_id}`);
    const ev = writer.get('SELECT name FROM events WHERE id = ?', row?.event_id);
    equal('事名照模型给的', ev?.name, '识海自动沉淀');
    const dec = writer.get('SELECT obj, text FROM decisions WHERE event_id = ?', row?.event_id);
    equal('决定也记了一条，关于「记忆怎么沉淀」', dec?.obj, '记忆怎么沉淀');

    const second = await captureTurn({ llm: fakeLlm, writer, store, agent: undefined, events: turn, noLog: true });
    equal('再跑一遍不会重复写（去重兜底）', second.written, 0);

    const short = await captureTurn({ llm: fakeLlm, writer, store, agent: undefined, noLog: true, events: [{ type: 'user/message', seq: 99, data: { message: { role: 'user', content: [{ type: 'text', text: '嗯' }] } } }] });
    // 2026-10-24 老黄定「全部存，一点不漏」：短轮不再整轮丢掉，只免掉判，原话照落闲聊池
    equal('短的一轮也照存（不再整轮丢）', short.written, 1);
    const shortRow = writer.get('SELECT place, s, event_id FROM memories WHERE text = ? ORDER BY id DESC LIMIT 1', '嗯');
    equal('短句落在闲聊池', shortRow?.place, 'chat');
    equal('短句给 40 分', shortRow?.s, 40);
    equal('短句不挂事', shortRow?.event_id, null);

    store.close();
    writer.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('');
if (failed) {
  console.log(`✗ 有 ${failed} 项没过`);
  process.exitCode = 1;
} else {
  console.log('✓ 全过');
}
