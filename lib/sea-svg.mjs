// 识海图谱 · 服务端生成的一张 SVG（2026-10-23）
//
// 老黄要的是「背景就是识海的图谱，只是图」——那就不折腾 canvas 了：
// 后端直接照库里的「事」画一张静态图，前端当背景贴上去，稳得很。
//
// 画法：中心一团核，事按条数排在环上，事越大点越大越亮；核到事的连线当经络。

/**
 * 画一张 1600×1000 的识海图谱。
 * @param {{ all: (sql: string, ...params: unknown[]) => any[] }} store
 * @returns {string} SVG 字符串
 */
export function buildSeaSvg(store) {
  const W = 1600;
  const H = 1000;
  const cx = W / 2;
  const cy = H / 2;

  /** @type {{ name: string, n: number }[]} */
  let events = [];
  try {
    events = store
      .all('SELECT name, n FROM events ORDER BY n DESC, id ASC LIMIT 120')
      .map((row) => ({ name: String(row.name ?? ''), n: Number(row.n) || 0 }))
      .filter((ev) => ev.name);
  } catch {
    events = [];
  }

  /** @type {string[]} */
  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">`,
    '<defs>',
    '<radialGradient id="core" cx="50%" cy="50%" r="50%">',
    '<stop offset="0%" stop-color="#6c5ce0" stop-opacity="0.55"/>',
    '<stop offset="55%" stop-color="#3a2f7a" stop-opacity="0.20"/>',
    '<stop offset="100%" stop-color="#000000" stop-opacity="0"/>',
    '</radialGradient>',
    '<radialGradient id="vign" cx="50%" cy="50%" r="72%">',
    '<stop offset="55%" stop-color="#000000" stop-opacity="0"/>',
    '<stop offset="100%" stop-color="#000000" stop-opacity="0.85"/>',
    '</radialGradient>',
    '</defs>',
    `<rect width="${W}" height="${H}" fill="#080a0f"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${Math.min(W, H) * 0.46}" fill="url(#core)"/>`,
  );

  const total = Math.max(1, events.length);
  /** @type {{ x: number, y: number, n: number }[]} */
  const nodes = events.map((ev, i) => {
    const ang = (i / total) * Math.PI * 2 - Math.PI / 2;
    const r = Math.min(W, H) * 0.14 + Math.sqrt(Math.max(1, ev.n)) * 15 + (i % 7) * 20;
    return { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r * 0.82, n: ev.n };
  });

  // 核 → 事：经络
  for (const node of nodes) {
    out.push(
      `<line x1="${cx}" y1="${cy}" x2="${node.x.toFixed(1)}" y2="${node.y.toFixed(1)}" ` +
        'stroke="#6b7bc8" stroke-opacity="0.14" stroke-width="1"/>',
    );
  }
  // 事与事之间：只连相邻两颗，给一点网的质感
  for (let i = 0; i < nodes.length; i += 2) {
    const a = nodes[i];
    const b = nodes[(i + 3) % nodes.length];
    if (!a || !b) continue;
    out.push(
      `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" ` +
        'stroke="#7d8fd8" stroke-opacity="0.07" stroke-width="1"/>',
    );
  }

  // 点：越大越亮
  for (const node of nodes) {
    const r = 2 + Math.min(6.5, node.n / 55);
    const color = node.n > 120 ? '#b7abff' : node.n > 40 ? '#8fa6d8' : '#5f7aa8';
    out.push(
      `<circle cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" fill-opacity="0.92"/>`,
      `<circle cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}" r="${(r * 3.4).toFixed(1)}" fill="${color}" fill-opacity="0.09"/>`,
    );
  }

  // 中心核
  out.push(
    `<circle cx="${cx}" cy="${cy}" r="5" fill="#cfc6ff" fill-opacity="0.95"/>`,
    `<circle cx="${cx}" cy="${cy}" r="18" fill="#8a7cff" fill-opacity="0.16"/>`,
    `<circle cx="${cx}" cy="${cy}" r="44" fill="none" stroke="#8a7cff" stroke-opacity="0.18" stroke-width="1"/>`,
    `<rect width="${W}" height="${H}" fill="url(#vign)"/>`,
    '</svg>',
  );

  return out.join('');
}
