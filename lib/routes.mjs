// 识海 · 面板 HTTP 路由（只读）
//
// 挂在 webServer 的 /mindsea/api 前缀上。只认 GET，别的一律 405 —— 这一页没有写口子。
// 数据全部来自 lib/api.mjs（库只读、md 白名单）。
import {
  CARDS_PATH,
  HOME_DIR,
  readWords,
  readEventWords,
  readCards,
  readPersona,
  readDays,
  readOneDay,
  readForget,
  readWanders,
  previewWander,
  readDiaryList,
  readDiary,
  readAutomation,
} from './api.mjs';
import { readCaptureStatus, readLogTail } from './capture.mjs';
import { updateMemory } from './write.mjs';

/** @type {ReadonlySet<string>} */
const ENDPOINTS = new Set([
  'words',
  'event-words',
  'cards',
  'persona',
  'days',
  'day',
  'forget',
  'wanders',
  'wander/now',
  'diary/list',
  'diary',
  'automation',
  'capture',
  'capture-log',
  'ping',
]);

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * 建一个处理函数。
 * @param {{ store: any, dbPath: string, capture?: { enabled?: boolean }, writer?: any }} deps
 */
export function createApiHandler({ store, dbPath, capture, writer }) {
  return function handler(req, res) {
    let url;
    try {
      url = new URL(req.url ?? '/', 'http://mindsea.local');
    } catch {
      sendJson(res, 400, { ok: false, error: '看不懂的 URL' });
      return;
    }

    const pathname = url.pathname.replace(/\/+$/, '');
    const route = pathname.startsWith('/mindsea/api/') ? pathname.slice('/mindsea/api/'.length) : '';

    // 唯一的写口子：改一条话的门类 / 去处（POST /mindsea/api/memory）
    // 老黄 2026-10-23 要的「判错了能改」——只动这两列，原文一个字不碰。
    if (req.method === 'POST' && route === 'memory') {
      if (!writer) {
        sendJson(res, 503, { ok: false, error: '写连接没准备好' });
        return;
      }
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 200000) req.destroy();
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const result = updateMemory(writer, payload);
          sendJson(res, result.ok ? 200 : 400, result);
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String((error && error.message) || error) });
        }
      });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { ok: false, error: '面板这一路只读，只认 GET' });
      return;
    }

    if (!route) {
      sendJson(res, 200, { ok: true, endpoints: [...ENDPOINTS] });
      return;
    }
    if (!ENDPOINTS.has(route)) {
      sendJson(res, 404, { ok: false, error: `没有这个端点：${route}`, endpoints: [...ENDPOINTS] });
      return;
    }

    const q = Object.fromEntries(url.searchParams.entries());
    try {
      switch (route) {
        case 'ping': {
          const counts = {};
          for (const table of ['memories', 'events', 'versions', 'stages', 'decisions', 'wanders']) {
            try {
              counts[table] = Number(store.get(`SELECT count(*) AS c FROM ${table}`)?.c ?? 0);
            } catch {
              counts[table] = null;
            }
          }
          sendJson(res, 200, {
            ok: true,
            dbPath,
            home: HOME_DIR,
            cardsPath: CARDS_PATH,
            counts,
            now: new Date().toISOString(),
          });
          return;
        }
        case 'words':
          sendJson(res, 200, readWords(store, q));
          return;
        case 'event-words':
          sendJson(res, 200, readEventWords(store, q));
          return;
        case 'cards':
          sendJson(res, 200, readCards(store));
          return;
        case 'persona':
          sendJson(res, 200, readPersona());
          return;
        case 'days':
          sendJson(res, 200, readDays(store, q));
          return;
        case 'day':
          sendJson(res, 200, readOneDay(store, q));
          return;
        case 'forget':
          sendJson(res, 200, readForget(store));
          return;
        case 'wanders':
          sendJson(res, 200, readWanders(store, q));
          return;
        case 'wander/now':
          sendJson(res, 200, previewWander(store));
          return;
        case 'diary/list':
          sendJson(res, 200, readDiaryList());
          return;
        case 'diary':
          sendJson(res, 200, readDiary(q));
          return;
        case 'automation':
          sendJson(res, 200, readAutomation());
          return;
        case 'capture': {
          // 自动沉淀的总览：开关 / 今天写了多少 / 最近流水 / 库的现状
          sendJson(res, 200, readCaptureStatus(store, {
            enabled: capture?.enabled !== false,
            limit: Number(q.limit) || 60,
          }));
          return;
        }
        case 'capture-log': {
          // 自动沉淀的运行轨迹：最近 N 条（默认 50，最多 500）
          const limit = Math.min(500, Math.max(1, Number(q.limit) || 50));
          sendJson(res, 200, { ok: true, entries: readLogTail(limit) });
          return;
        }
        default:
          sendJson(res, 404, { ok: false, error: `没有这个端点：${route}` });
      }
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: String((error && error.message) || error),
        route,
      });
    }
  };
}
