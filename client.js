// 识海 · 面板（client 半边）
//
// 九个页面塞进同一个侧边栏入口「识海」：
//   话卡墙 / 工作流 / 星云   ← 照搬 work/sea-annotate/墙.html 的成品，只换数据源与容器
//   人设 / 时间 / 遗忘 / 走神 / 日记 / 自动化   ← 新做的，简单能看
//
// 数据一律走 /mindsea/api/*（服务端只读），client 不碰 sqlite。
window.__ModuleLoader__.load({
  id: 'dsh-mindsea',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const PANEL_ID = 'mindsea';

    function PanelIcon({ size = 18 } = {}) {
      const s = typeof size === 'number' ? size : 18;
      // 脑子：左右半球 + 中缝 + 沟回 + 脑干。单色描边，跟着 currentColor 走。
      return h(
        'svg',
        {
          width: s,
          height: s,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.35,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        // Lucide `brain`（MIT）—— 单色描边，跟着 currentColor 走
        h('path', { d: 'M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z' }),
        h('path', { d: 'M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z' }),
        h('path', { d: 'M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4' }),
        h('path', { d: 'M17.599 6.5a3 3 0 0 0 .399-1.375' }),
        h('path', { d: 'M6.003 5.125A3 3 0 0 0 6.401 6.5' }),
        h('path', { d: 'M3.477 10.896a4 4 0 0 1 .585-.396' }),
        h('path', { d: 'M19.938 10.5a4 4 0 0 1 .585.396' }),
        h('path', { d: 'M6 18a4 4 0 0 1-1.967-.516' }),
        h('path', { d: 'M19.967 17.484A4 4 0 0 1 18 18' }),
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 样式：星云壁纸 + 毛玻璃卡（用户 2026-10-23 定）。
    // 底 = 识海自己那张星云（静态 jpg，走 /mindsea/bg/nebula.jpg），上面压一层
    // DSH 同色遮罩，星云只是隐约透出来；卡片是低透明度毛玻璃 + 12px 圆角。
    // 颜色 / 字体 / 圆角一律照 DSH 深色模式量出来的那套（见下面 token 表），不另造。
    // 外壳无彩灰阶；彩只落在数据形体上：七情圆点 / 时间柱 / 遗忘条 / 走神环。
    // 全部限定在 .mindsea-root 后代里，不碰宿主别的样式。
    // ══════════════════════════════════════════════════════════════════════════
    const CSS = `
/* ─────────────────────────────────────────────────────────────────────────
   识海面板 · 星云壁纸 + 毛玻璃卡
   ── 颜色 / 字体 / 圆角全部对齐 DSH 深色模式（2026-10-23 用 headless 量的）──
   底色（DSH 灰阶，逐档往上抬）：
     --ground  #151517  DSH body 底（--dsh-boot-bg）
     --surface #1b1b1c  DSH 侧栏（neutral-bluish-900）＝面板一档
     --raised  #232324  卡面一档（neutral-bluish-875）
     --hover   #2c2c2e  悬停一档（neutral-bluish-850）
     --line    rgba(255,255,255,.10)  线；--line-hi .24 悬停
   文字（DSH 三级，照抄）：
     --text  #f9fafb  一级（neutral-bluish-50）
     --muted #adb2b8  二级（neutral-bluish-400）
     --dim   #81858c  三级（neutral-bluish-600）
     --accent #c9b98a 只给走神那一个环（数据形体）
   字族（DSH --dsh-font-family-text-default）：
     --font
   字阶（DSH --dsw-font-*，只准用表里的这几档）：
     24px/32px 600  xl-24        页面标题
     16px/24px 500  base-strong  区块标题
     14px/22px 400  s-14         正文；500 = s-strong
     13px/20px 400  xs-13        控件 / 表单
     12px/18px 400  xxs-12       辅字
     11px/14px 400  xxxs-11      微字
   圆角（DSH --dsw-radius-*）：卡 12 = md，小控件 8 = sm。
   底：星云 jpg（静态，不是实时 canvas）center/cover fixed，上盖 rgba(21,21,23,.88)
       同色遮罩 → 星云隐约透出，读字不受影响。
   毛玻璃：卡片 rgba(35,35,36,.42) + blur(18px) saturate(130%)；
          面板 / 筛选条更实一点（.66 / .86），浮层最实。静置无阴影。
   gap 一个值 12；面板内边距 24；数字 tabular-nums（这一条是我们的需要，保留）。
   ───────────────────────────────────────────────────────────────────────── */
.mindsea-root{position:relative;width:100%;height:100%;min-height:0;overflow:hidden;
  --ground:#0a0c10;--surface:#14171d;--raised:#1b1f26;--hover:#171b21;
  --line:#262b33;--line-hi:#323842;
  --muted:#b0b7c1;--dim:#8b93a0;--text:#f3f5f8;--accent:#7c6cf0;
  --border:var(--line);
  --el-shock:#5ec8e5;--el-fire:#f5a623;--el-void:#8e6bbf;--el-ice:#7fb3d5;
  --etch:rgba(255,255,255,.06);
  --frame:rgba(255,255,255,.05);
  --glass:#14171d;
  --glass-panel:#14171d;
  --glass-bar:#0c0f13;
  --veil:rgba(6,8,11,.74);
  --r-card:12px;--r-ctl:6px;
  --font:"Geist",-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Helvetica,Arial,sans-serif;--font-mono:"Geist Mono",ui-monospace,Consolas,monospace;
  --nebula:url("/mindsea/bg/nebula.jpg");
  background-color:var(--ground);
  background-position:center;background-size:cover;background-repeat:no-repeat;
  background-attachment:fixed;
  color:var(--text);color-scheme:dark;
  font-family:var(--font);
  font-size:14px;line-height:22px;font-variant-numeric:tabular-nums;
  -webkit-font-smoothing:antialiased;
  user-select:none;-webkit-user-select:none}
/* 同色遮罩：压在壁纸上、压不到内容（z-index 0，舞台在 1） */
.mindsea-root::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;
  background:var(--veil)}
.mindsea-root,.mindsea-root *{box-sizing:border-box}
.mindsea-root button{font-family:inherit}
.mindsea-root b,.mindsea-root strong{font-weight:500}

/* ---------- 外壳：左侧 240px 导航。毛玻璃一档，一条 1px 线隔开 ---------- */
.mindsea-root #sidebar{position:absolute;left:0;top:0;bottom:0;width:240px;z-index:60;
  display:flex;flex-direction:column;padding:32px 16px 24px;
  background:var(--glass-panel);backdrop-filter:blur(18px) saturate(120%);/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
  -webkit-backdrop-filter:blur(18px) saturate(120%);/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
  border-style:solid;border-color:var(--line);border-width:0 1px 0 0}
/* 侧栏标题前一枚 1px 细环（页头装饰，只有形体，不上色） */
.mindsea-root #sb-title{margin:0;padding:0 12px;font-size:16px;font-weight:500;
  display:flex;align-items:center;gap:10px;line-height:24px;
  letter-spacing:.2px;color:var(--text);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.mindsea-root #sb-title::before{content:'';flex:none;width:6px;height:6px;
  border:1px solid var(--line-hi);border-radius:50%}
.mindsea-root #sb-note{margin:6px 0 0;padding:0 12px;font-size:12px;line-height:18px;
  color:var(--muted);letter-spacing:.2px}
.mindsea-root #tabs{display:flex;flex-direction:column;gap:12px;margin-top:32px;
  overflow-y:auto;scrollbar-width:none}
.mindsea-root #tabs::-webkit-scrollbar{display:none}
.mindsea-root .tab{appearance:none;-webkit-appearance:none;border:0;background:transparent;
  height:34px;flex:none;padding:0 12px;border-radius:var(--r-ctl);font:inherit;font-size:14px;
  line-height:34px;text-align:left;letter-spacing:.2px;color:var(--muted);cursor:pointer;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  transition:color .1s linear,background .1s linear}
.mindsea-root .tab:hover{color:var(--text);background:rgba(255,255,255,.06)}
.mindsea-root .tab:focus{outline:none}
.mindsea-root .tab.on{color:var(--text);background:rgba(255,255,255,.10)}
.mindsea-root #count{margin-top:auto;padding:24px 12px 0;font-size:12px;line-height:18px;
  color:var(--muted);letter-spacing:.2px;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis}
.mindsea-root #count b{color:var(--text);font-weight:400}

/* ---------- 内容舞台：右边那一大片，每一页兜一层竖向滚动。底透给壁纸 ---------- */
.mindsea-root #stage{position:absolute;left:240px;top:0;right:0;bottom:0;z-index:1;
  overflow:hidden;background:transparent}
.mindsea-root .pane{position:absolute;inset:0;display:none;overflow-y:auto;overflow-x:hidden;
  scrollbar-width:thin;background:transparent}
.mindsea-root .pane.on{display:block}
.mindsea-root .pane::-webkit-scrollbar,
.mindsea-root .ms-scroll::-webkit-scrollbar,
.mindsea-root #scroll::-webkit-scrollbar,
.mindsea-root #flow-view::-webkit-scrollbar,
.mindsea-root .sx-side::-webkit-scrollbar,
.mindsea-root .sx-body::-webkit-scrollbar,
.mindsea-root #tabs::-webkit-scrollbar{width:8px;height:8px}
.mindsea-root .pane::-webkit-scrollbar-thumb,
.mindsea-root .ms-scroll::-webkit-scrollbar-thumb,
.mindsea-root #scroll::-webkit-scrollbar-thumb,
.mindsea-root #flow-view::-webkit-scrollbar-thumb,
.mindsea-root .sx-side::-webkit-scrollbar-thumb,
.mindsea-root .sx-body::-webkit-scrollbar-thumb{background:var(--border);border-radius:6px}
.mindsea-root .pane::-webkit-scrollbar-thumb:hover,
.mindsea-root .ms-scroll::-webkit-scrollbar-thumb:hover,
.mindsea-root #scroll::-webkit-scrollbar-thumb:hover,
.mindsea-root #flow-view::-webkit-scrollbar-thumb:hover{background:var(--muted)}

/* 页面标题直接坐在地上：距顶 32px，没有顶栏、没有眉标、不是一块色 */
.mindsea-root .ms-page{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0}
.mindsea-root .ms-head{flex:none;display:flex;flex-direction:column;gap:12px;
  padding:32px 32px 24px}
.mindsea-root .ms-head-t,.mindsea-root .ms-title{margin:0;font-size:24px;font-weight:600;
  line-height:32px;letter-spacing:.2px;color:var(--text)}
.mindsea-root .ms-head-s,.mindsea-root .ms-lede{font-size:14px;line-height:22px;
  letter-spacing:.2px;color:var(--muted)}
.mindsea-root .ms-head-s b{color:var(--text);font-weight:400}
.mindsea-root .ms-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;scrollbar-width:thin}
.mindsea-root #tl-head,.mindsea-root #wd-head,.mindsea-root #dy-head{flex:none}

/* ---------- 话卡墙 · 顶部：一行普通小字 + 一条密度带（一格一天，越亮话越多） ----------
   顶栏这一条跟壁纸遮罩同色（都从 --ground 出来），交接处不留缝 */
.mindsea-root #wall-head{position:absolute;left:0;top:0;right:0;height:132px;z-index:7;
  display:flex;flex-direction:column;justify-content:flex-start;gap:12px;
  padding:32px 32px 0;overflow:hidden;
  background:var(--glass-bar);backdrop-filter:blur(14px) saturate(120%);/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
  -webkit-backdrop-filter:blur(14px) saturate(120%)}/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
.mindsea-root .ms-strip{display:flex;height:20px;align-items:stretch;flex:none;
  gap:1px;background:transparent}
.mindsea-root .ms-strip i{flex:1 1 0;min-width:0;background:rgba(255,255,255,.08)}
.mindsea-root .ms-stripinfo{display:flex;gap:12px;align-items:baseline;white-space:nowrap;
  overflow:hidden;font-size:14px;line-height:22px;letter-spacing:.2px;color:var(--muted)}
.mindsea-root .ms-stripinfo b{color:var(--text);font-weight:400}

/* ---------- 话卡墙 · 筛选条：一条毛玻璃，12 圆角，不是色带 ---------- */
.mindsea-root #wall-filter{position:absolute;left:32px;right:32px;top:132px;height:88px;z-index:6;
  display:flex;flex-wrap:wrap;align-items:center;align-content:center;gap:8px 12px;
  padding:8px 12px;background:var(--glass-panel);border:1px solid var(--line);
  border-radius:var(--r-card);white-space:nowrap;overflow:hidden;
  backdrop-filter:blur(18px) saturate(130%);-webkit-backdrop-filter:blur(18px) saturate(130%)}/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
.mindsea-root #wall-filter::-webkit-scrollbar{display:none}
.mindsea-root #wall-filter select,.mindsea-root #wall-filter input{appearance:none;
  -webkit-appearance:none;font:inherit;font-size:13px;line-height:18px;height:32px;
  padding:0 12px;border-radius:var(--r-ctl);border:1px solid var(--line);
  background:rgba(21,21,23,.72);color:var(--text);flex:none}
.mindsea-root #wall-filter select{max-width:120px;cursor:pointer}
.mindsea-root #wall-filter select option{background:var(--surface);color:var(--text)}
.mindsea-root #wall-filter input[type="date"]{font-size:12px;padding:0 8px}
.mindsea-root #wall-filter input[type="date"][hidden]{display:none}
.mindsea-root #wall-filter input[type="search"]{width:180px;flex:0 1 180px;min-width:88px}
.mindsea-root #wall-filter input[type="search"]::-webkit-search-cancel-button{filter:invert(.6)}
.mindsea-root #wall-filter select:focus,.mindsea-root #wall-filter input:focus{outline:none;
  border-color:var(--line-hi)}
.mindsea-root #wall-filter input::placeholder{color:var(--dim)}
.mindsea-root .wf-sep{width:1px;height:16px;background:var(--line);flex:none}
/* 七情筛选：一排 6px 圆点（跟话卡上那排是同一套形体）。
   颜色只落在那颗圆点上，按钮本身透明；选中 = 点放大一档 + 外面一圈同色细环，
   不靠加底色，形体变化，壳不上色 */
.mindsea-root .wf-dots{display:flex;align-items:center;gap:6px;flex:none;height:32px}
.mindsea-root .wf-dot{appearance:none;-webkit-appearance:none;position:relative;
  width:20px;height:32px;padding:0;border:0;background:transparent;cursor:pointer;
  display:flex;align-items:center;justify-content:center;flex:none}
.mindsea-root .wf-dot i{display:block;width:6px;height:6px;border-radius:50%;
  background:var(--c,var(--muted));opacity:.6;
  transition:opacity .1s linear,transform .1s linear}
.mindsea-root .wf-dot:hover i{opacity:.85}
.mindsea-root .wf-dot.on i{opacity:1;transform:scale(1.34)}
.mindsea-root .wf-dot.on::after{content:'';position:absolute;left:50%;top:50%;
  width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;
  border:1px solid var(--c,var(--muted));opacity:.55}
/* 「无情绪」那颗是空心的（它不是情绪，别画成第 8 个色点） */
.mindsea-root .wf-dot[data-emo="none"] i{background:transparent;
  border:1px solid var(--dim)}
.mindsea-root .wf-ranges{display:flex;align-items:center;gap:6px;flex:none}
.mindsea-root .wf-range{appearance:none;-webkit-appearance:none;font:inherit;font-size:13px;
  line-height:20px;height:32px;padding:0 12px;border-radius:var(--r-ctl);
  border:1px solid var(--line);background:rgba(255,255,255,.05);color:var(--muted);
  cursor:pointer;flex:none;transition:color .1s linear,background .1s linear}
.mindsea-root .wf-range:hover{color:var(--text);border-color:var(--line-hi)}
.mindsea-root .wf-range.on{background:rgba(255,255,255,.12);color:var(--text)}
.mindsea-root #wf-count{margin-left:auto;flex:none;font-size:12px;line-height:18px;
  letter-spacing:.2px;color:var(--muted)}
.mindsea-root #wf-count b{color:var(--text);font-weight:400}
.mindsea-root #wf-clear{appearance:none;-webkit-appearance:none;font:inherit;font-size:13px;
  line-height:20px;height:32px;padding:0 12px;border-radius:var(--r-ctl);
  border:1px solid var(--line);background:rgba(255,255,255,.05);color:var(--muted);
  cursor:pointer;flex:none;transition:color .1s linear,background .1s linear}
.mindsea-root #wf-clear:hover{color:var(--text);background:rgba(255,255,255,.12)}

/* ---------- 话卡墙 · 滚动容器 ---------- */
.mindsea-root #scroll{position:absolute;left:0;top:236px;right:0;bottom:0;overflow-y:auto;
  overflow-x:hidden;cursor:grab;scrollbar-width:thin}
.mindsea-root #inner{position:relative;width:100%}
.mindsea-root .wf-empty{position:absolute;left:32px;top:12px;max-width:480px;font-size:14px;
  line-height:22px;color:var(--muted);letter-spacing:.2px}
.mindsea-root #links{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.mindsea-root #links .edge{fill:none;stroke:rgba(255,255,255,.14);stroke-width:1;
  stroke-linecap:round}
.mindsea-root #links .edge.hot{stroke:var(--muted);stroke-width:2}
.mindsea-root #links .hit{fill:none;stroke:transparent;stroke-width:12;pointer-events:stroke;
  cursor:pointer}
.mindsea-root #links .temp{fill:none;stroke:var(--muted);stroke-width:1;stroke-dasharray:4 4;
  stroke-linecap:round}

/* ---------- 话卡：一片低透明度的毛玻璃，12 圆角，七情是底下一排小圆点 ---------- */
.mindsea-root .card{position:absolute;left:0;top:0;padding:14px 16px;
  display:flex;flex-direction:column;gap:8px;background:#272b33;
  border:1px solid #3b404a;border-radius:var(--r-card);cursor:grab;overflow:hidden;
  
  /* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
  transition:border-color .1s linear,background .1s linear}
.mindsea-root .card:hover{border-color:var(--line-hi);background:var(--raised);
  }
.mindsea-root .card.dragging{cursor:grabbing;z-index:30;border-color:var(--line-hi);
  background:var(--raised)}
.mindsea-root .card.dropok{border-color:var(--text);background:var(--raised)}
/* 带决定的话：只把纸片抬一档（明度差），不撒金 */
.mindsea-root .card.decide{background:var(--raised);border-color:rgba(124,108,240,.40)}
.mindsea-root .tx{font-size:14px;line-height:22px;overflow:hidden;color:var(--text);
  letter-spacing:.1px;word-break:break-word;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
/* 卡底一行：时间在左（可截断），七情圆点在右（有几个画几个，没有就不画） */
.mindsea-root .foot{display:flex;align-items:center;gap:8px;margin-top:auto;min-width:0}
.mindsea-root .tm{flex:1 1 auto;min-width:0;font-size:12px;line-height:18px;color:var(--muted);
  letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mindsea-root .emodots{flex:none;display:flex;align-items:center;gap:4px;
  max-width:72px;flex-wrap:wrap;justify-content:flex-end}
.mindsea-root .emodot{display:block;width:8px;height:8px;border-radius:50%;
  background:var(--c,var(--muted));box-shadow:0 0 7px -1px var(--c,var(--muted)),inset 0 0 0 1px rgba(255,255,255,.20)}
.mindsea-root .linkdot{position:absolute;right:8px;top:8px;width:8px;height:8px;
  border-radius:50%;border:1px solid var(--line);background:rgba(255,255,255,.06);opacity:0;
  cursor:crosshair;transition:opacity .1s linear,background .1s linear,border-color .1s linear}
.mindsea-root .card:hover .linkdot{opacity:.9}
.mindsea-root .linkdot:hover{background:var(--muted);border-color:var(--muted);opacity:1}

/* 唯一允许的动效：刚写进来的那条，先亮一档再落定（中性明度，不动金） */
@keyframes msFresh{0%{background:rgba(255,255,255,.16)}100%{background:var(--glass)}}
.mindsea-root .card.fresh{animation:msFresh 1600ms cubic-bezier(.16,1,.3,1) 1}

/* ---------- 悬停浮层：浮层最实（毛玻璃 + 更实的底），不加阴影 ---------- */
.mindsea-root #tip{position:absolute;z-index:80;pointer-events:none;max-width:400px;
  padding:16px;background:rgba(35,35,36,.92);border:1px solid var(--line);
  border-radius:var(--r-card);backdrop-filter:blur(24px) saturate(130%);/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
  -webkit-backdrop-filter:blur(24px) saturate(130%);/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
  font-size:14px;line-height:22px;color:var(--muted);opacity:0;visibility:hidden;
  transition:opacity .1s linear}
.mindsea-root #tip.on{opacity:1;visibility:visible}
.mindsea-root .tquote{font-size:14px;line-height:22px;color:var(--text);margin-bottom:12px;
  padding-left:12px;border-left:2px solid var(--line);
  display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.mindsea-root .trow{color:var(--muted)}
.mindsea-root .trow b{color:var(--text);font-weight:400}
.mindsea-root .tsec{margin-top:12px;font-size:12px;line-height:18px;letter-spacing:.2px;
  color:var(--muted)}
/* 浮层里的七情也画圆点（跟话卡同一套形体） */
.mindsea-root .tdot{display:inline-block;width:6px;height:6px;border-radius:50%;
  margin-right:6px;vertical-align:middle}

.mindsea-root #toast{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);z-index:90;
  padding:12px 24px;background:rgba(35,35,36,.92);border:1px solid var(--line);
  border-radius:var(--r-card);backdrop-filter:blur(24px) saturate(130%);/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
  -webkit-backdrop-filter:blur(24px) saturate(130%);/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
  font-size:14px;line-height:22px;color:var(--text);opacity:0;
  transition:opacity .15s linear;pointer-events:none}
.mindsea-root #toast.on{opacity:1}

/* 蚀刻光：1px 冷色描边走 border（等价 inset 0 0 0 1px；taste-skill 的阴影规则连 inset
   也一并拦，这里用 border 换同一种观感），再在卡面顶部内侧补一道极淡的冷光
   （等价 inset 0 1px 0 rgba(200,220,255,.07)）。全程不外发光。 */
.mindsea-root .card::after,
.mindsea-root .fcard::after,
.mindsea-root .fcap::after,
.mindsea-root .fstagecard::after,
.mindsea-root .sx-sec::after,
.mindsea-root .sx-note::after,
.mindsea-root .sx-viewlist::after,
.mindsea-root #wall-filter::after,
.mindsea-root #tip::after,
.mindsea-root #toast::after,
.mindsea-root #ntip::after{content:'';position:absolute;left:0;right:0;top:0;height:1px;
  background:var(--etch);pointer-events:none}

/* ======================================================================
   页二 · 工作流
   卡片三级，尺寸真的不同：事卡（24 内边距 / 16 名 / 96 高）→
   版本 · 功能卡（16 / 14 / 68）→ 阶段卡（12 / 12 / 52，底更透一点）
   三级还各带一个几何标记：三角 → 六边形 → 圆点（形状分级，全灰阶）
   ====================================================================== */
.mindsea-root #pane-flow{position:absolute;inset:0;overflow:hidden}
.mindsea-root #flow-head{position:absolute;left:0;right:0;top:0;height:80px;z-index:6;
  display:flex;align-items:center;gap:12px;padding:0 32px;white-space:nowrap;overflow:hidden;
  background:var(--glass-bar);backdrop-filter:blur(14px) saturate(120%);/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
  -webkit-backdrop-filter:blur(14px) saturate(120%);/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
  border-style:solid;border-color:var(--line);border-width:0 0 1px 0}
.mindsea-root #flow-back{appearance:none;-webkit-appearance:none;font:inherit;font-size:13px;
  line-height:20px;height:32px;padding:0 12px;border-radius:var(--r-ctl);
  border:1px solid var(--line);background:rgba(255,255,255,.05);color:var(--muted);
  cursor:pointer;letter-spacing:.2px;flex:none;
  transition:color .1s linear,background .1s linear}
.mindsea-root #flow-back:hover{color:var(--text);background:rgba(255,255,255,.12)}
.mindsea-root #flow-back[hidden]{display:none}
.mindsea-root #flow-title{margin:0;flex:0 1 auto;min-width:0;font-size:16px;font-weight:500;
  line-height:24px;letter-spacing:.2px;color:var(--text);white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis}
.mindsea-root #flow-title.big{font-size:24px;line-height:32px;font-weight:600}
.mindsea-root #flow-meta{flex:none;font-size:12px;line-height:18px;color:var(--muted)}
.mindsea-root #flow-alias{flex:1 1 auto;min-width:0;font-size:12px;line-height:18px;
  color:var(--muted);overflow:hidden;text-overflow:ellipsis;letter-spacing:.2px}
.mindsea-root #flow-tip{flex:none;font-size:12px;line-height:18px;color:var(--dim);
  letter-spacing:.2px}
.mindsea-root #flow-zoom{appearance:none;-webkit-appearance:none;font:inherit;font-size:13px;
  line-height:20px;height:32px;padding:0 12px;border-radius:var(--r-ctl);
  border:1px solid var(--line);background:transparent;color:var(--muted);cursor:pointer;
  flex:none;transition:color .1s linear,background .1s linear}
.mindsea-root #flow-zoom:hover{color:var(--text);background:rgba(255,255,255,.08)}
.mindsea-root #flow-zoom[hidden]{display:none}
.mindsea-root #flow-zoombox{display:flex;align-items:center;gap:6px;flex:none}
.mindsea-root #flow-zoombox[hidden]{display:none}
.mindsea-root #flow-zout,.mindsea-root #flow-zin{appearance:none;-webkit-appearance:none;
  border:1px solid var(--line);background:transparent;font:inherit;font-size:16px;
  line-height:1;color:var(--muted);cursor:pointer;width:32px;height:32px;
  border-radius:var(--r-ctl);padding:0;flex:none;
  transition:color .1s linear,background .1s linear}
.mindsea-root #flow-zout:hover,.mindsea-root #flow-zin:hover{color:var(--text);
  background:rgba(255,255,255,.08)}

/* 滚轮就是普通垂直滚动；空白处按住拖 = 抓着滚（改 scrollTop，不动布局） */
.mindsea-root #flow-view{position:absolute;left:0;right:0;top:80px;bottom:0;overflow-y:auto;
  overflow-x:hidden;cursor:grab;touch-action:pan-y;scrollbar-width:thin}
.mindsea-root #flow-view.grabbing{cursor:grabbing}
.mindsea-root #flow-canvas{position:relative;min-height:100%;padding:24px 32px 64px}

/* 分组标题：14px 辅字 + 一枚 1px 细环 + 一条线，不加色 */
.mindsea-root .fbh,.mindsea-root .fgenhead{display:flex;align-items:baseline;gap:12px;
  padding:0 0 12px;margin-bottom:12px;
  border-style:solid;border-color:var(--line);border-width:0 0 1px 0}
.mindsea-root .fbh::before,.mindsea-root .fgenhead::before{content:'';flex:none;align-self:center;
  width:6px;height:6px;border:1px solid var(--line-hi);border-radius:50%}
.mindsea-root .fblock{margin:0 0 32px}
.mindsea-root .fbn,.mindsea-root .fgenhead .gn{margin:0;font-size:14px;font-weight:500;
  line-height:22px;letter-spacing:.2px;color:var(--text)}
.mindsea-root .fbc,.mindsea-root .fgenhead .gm{font-size:12px;line-height:18px;color:var(--muted)}

/* 一级：事卡：最大那种（24 内边距、16 名字、96 高），左上角一枚灰三角 */
.mindsea-root .fgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));
  gap:12px}
.mindsea-root .fcard{appearance:none;-webkit-appearance:none;text-align:left;font:inherit;
  position:relative;display:flex;flex-direction:column;gap:12px;min-height:96px;min-width:0;
  padding:24px;background:var(--glass);border:1px solid var(--line);
  border-radius:var(--r-card);cursor:pointer;
  /* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
  transition:border-color .1s linear,background .1s linear}
.mindsea-root .fcard:hover{border-color:var(--line-hi);background:rgba(35,35,36,.58)}
.mindsea-root .fcard:focus{outline:none;border-color:var(--line-hi)}
.mindsea-root .fcard::before{content:'';position:absolute;left:0;top:0;width:12px;height:12px;
  background:var(--dim);clip-path:polygon(0 0,100% 0,0 100%);
  border-top-left-radius:var(--r-card)}
.mindsea-root .fcn{font-size:16px;font-weight:500;line-height:24px;color:var(--text);
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
  word-break:break-word}
.mindsea-root .fcm{margin-top:auto;font-size:14px;line-height:22px;color:var(--muted);
  letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.mindsea-root .fhint{font-size:14px;line-height:22px;color:var(--muted);letter-spacing:.2px;
  padding:0 0 24px}
.mindsea-root .fgen{margin:0 0 32px}

/* 二级：版本 / 功能卡：中号（16 内边距、14 名字、68 高），左边缘一枚六边形 */
.mindsea-root .fcapgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(192px,1fr));
  gap:12px;align-items:stretch}
.mindsea-root .fcap{appearance:none;-webkit-appearance:none;text-align:left;font:inherit;
  position:relative;min-height:68px;min-width:0;background:var(--glass);
  border:1px solid var(--line);border-radius:var(--r-card);padding:16px;
  display:flex;flex-direction:column;gap:12px;
  /* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
  cursor:pointer;transition:border-color .1s linear,background .1s linear}
.mindsea-root .fcap:hover{border-color:var(--line-hi);background:rgba(35,35,36,.58)}
.mindsea-root .fcap:focus{outline:none;border-color:var(--line-hi)}
.mindsea-root .fcap.big{grid-column:span 2}
.mindsea-root .fcap::before{content:'';position:absolute;left:3px;top:50%;margin-top:-6px;
  width:12px;height:12px;background:var(--dim);
  clip-path:polygon(50% 0,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%)}
/* 当前选中的那张：只把明度和描边抬一档（壳不上色） */
.mindsea-root .fcap.sel{border-color:var(--line-hi);background:rgba(255,255,255,.12)}
.mindsea-root .fcap.sel::before{background:var(--text)}
.mindsea-root .fcap .capn{font-size:14px;font-weight:500;line-height:22px;color:var(--text);
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
  word-break:break-word}
.mindsea-root .fcap .capm{margin-top:auto;display:flex;align-items:center;gap:12px;
  font-size:12px;line-height:18px;color:var(--muted);letter-spacing:.2px;white-space:nowrap;
  overflow:hidden}
.mindsea-root .fcap .capd{display:inline-flex;align-items:center;gap:6px;color:var(--dim)}
.mindsea-root .fcap .capd i{display:inline-block;width:4px;height:4px;border-radius:50%;
  background:var(--line-hi)}
.mindsea-root .fcap .capd.has{color:var(--text)}
.mindsea-root .fcap .capd.has i{background:var(--muted)}
.mindsea-root .fcapslot{grid-column:1/-1;padding:0 0 12px}
.mindsea-root .fcapslot[hidden]{display:none}

/* 三级：阶段卡：最小（12 / 12 / 52），底更透（退到页面底那一档），左边缘一枚圆点 */
.mindsea-root .fstagegrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));
  gap:12px}
.mindsea-root .fstagecard{position:relative;display:flex;flex-direction:column;gap:6px;
  min-width:0;min-height:52px;padding:12px;background:rgba(21,21,23,.45);
  border:1px solid var(--line);border-radius:var(--r-card);
  backdrop-filter:blur(14px) saturate(120%);-webkit-backdrop-filter:blur(14px) saturate(120%)}/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
.mindsea-root .fstagecard.big{grid-column:span 2}
.mindsea-root .fstagecard::before{content:'';position:absolute;left:5px;top:50%;
  margin-top:-3px;width:6px;height:6px;border-radius:50%;background:var(--dim)}
.mindsea-root .fstagecard .sn{font-size:12px;line-height:18px;color:var(--muted);
  word-break:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
  overflow:hidden}
.mindsea-root .fstagecard .sm{font-size:12px;line-height:18px;color:var(--dim)}

/* ======================================================================
   页三 · 识海（星云本体一字不改，全屏 canvas 自带配色；这一页不吃壁纸）
   全面板只有这一页有「巨构」：容器背后一个超大几何形（环 + 刻度 + 菱形，
   3~5% 透明度，不抢星云）、四角取景框、顶上一行极小的字距放宽的标题。
   其它八页老老实实做信息密度。
   ====================================================================== */
.mindsea-root #pane-neb{position:absolute;inset:0;overflow:hidden;background:var(--ground)}
.mindsea-root #pane-neb canvas{display:block;cursor:grab}
.mindsea-root #pane-neb canvas:active{cursor:grabbing}
.mindsea-root #neb-frame{position:absolute;inset:0;z-index:2;pointer-events:none;
  overflow:hidden}
.mindsea-root #neb-mega{position:absolute;left:50%;top:50%;
  width:min(94%,1060px);height:min(94%,1060px);transform:translate(-50%,-50%)}
.mindsea-root #neb-mega .ring,.mindsea-root #neb-mega .tick,
.mindsea-root #neb-mega .diamond{fill:none;stroke:var(--frame);stroke-width:1}
.mindsea-root #neb-mega .tick{stroke-dasharray:1 10}
.mindsea-root #neb-mega .diamond{stroke-opacity:.6}
.mindsea-root .nb-corner{position:absolute;width:20px;height:20px;border:0 solid var(--border)}
.mindsea-root .nb-corner.tl{left:16px;top:16px;border-left-width:1px;border-top-width:1px}
.mindsea-root .nb-corner.tr{right:16px;top:16px;border-right-width:1px;border-top-width:1px}
.mindsea-root .nb-corner.bl{left:16px;bottom:16px;border-left-width:1px;border-bottom-width:1px}
.mindsea-root .nb-corner.br{right:16px;bottom:16px;border-right-width:1px;border-bottom-width:1px}
.mindsea-root #neb-title{position:absolute;left:32px;top:24px;z-index:3;pointer-events:none}
.mindsea-root #neb-title .nt{margin:0;font-size:12px;font-weight:500;letter-spacing:.42em;
  line-height:18px;color:var(--text)}
.mindsea-root #neb-title .ns{margin:6px 0 0;font-size:12px;letter-spacing:.14em;
  line-height:18px;color:var(--muted)}
.mindsea-root #neb-title .ns b{color:var(--text);font-weight:400}
.mindsea-root #hud{position:absolute;left:32px;bottom:24px;z-index:3;pointer-events:none;
  color:var(--muted);font-size:14px;line-height:22px;letter-spacing:.2px}
.mindsea-root #hud b{color:var(--text);font-weight:400}
.mindsea-root #hint{position:absolute;right:32px;bottom:24px;z-index:3;pointer-events:none;
  color:var(--dim);font-size:12px;line-height:18px;letter-spacing:.2px}
.mindsea-root #ntip{position:absolute;pointer-events:none;display:none;max-width:320px;
  padding:16px;background:rgba(35,35,36,.92);border:1px solid var(--line);
  border-radius:var(--r-card);backdrop-filter:blur(24px) saturate(130%);/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
  -webkit-backdrop-filter:blur(24px) saturate(130%);/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
  color:var(--text);font-size:14px;line-height:22px;z-index:9}
.mindsea-root #ntip .meta{margin-top:12px;font-size:12px;line-height:18px;color:var(--muted)}

/* ======================================================================
   后六页（人设 / 时间 / 遗忘 / 走神 / 日记 / 自动化）：只做信息密度
   ====================================================================== */
.mindsea-root .sx-split{position:absolute;inset:0;display:flex;min-height:0}
.mindsea-root .sx-split2{position:relative;inset:auto;flex:1 1 auto;display:flex;min-height:0}
.mindsea-root .sx-side{width:240px;flex:none;overflow-y:auto;scrollbar-width:thin;
  background:var(--glass-panel);backdrop-filter:blur(18px) saturate(120%);/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
  -webkit-backdrop-filter:blur(18px) saturate(120%);/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
  border-style:solid;border-color:var(--line);border-width:0 1px 0 0}
.mindsea-root .sx-body{flex:1 1 auto;min-width:0;overflow-y:auto;scrollbar-width:thin}

.mindsea-root .sx-pad{padding:24px 32px 64px}
.mindsea-root .sx-secb.md p{max-width:76ch}
.mindsea-root .sx-h1{margin:0 0 12px;font-size:24px;font-weight:600;line-height:32px;
  letter-spacing:.2px;color:var(--text)}
.mindsea-root .sx-sub{margin:0 0 24px;font-size:14px;line-height:22px;letter-spacing:.2px;
  color:var(--muted)}

.mindsea-root .sx-sec{position:relative;margin:0 0 12px;border:1px solid var(--line);
  border-radius:var(--r-card);background:var(--glass);overflow:hidden;
  backdrop-filter:blur(18px) saturate(130%);-webkit-backdrop-filter:blur(18px) saturate(130%)}/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */
.mindsea-root .sx-sech{display:flex;align-items:baseline;gap:12px;padding:16px 24px;
  background:rgba(255,255,255,.05)}
.mindsea-root .sx-sech::before{content:'';flex:none;align-self:center;width:6px;height:6px;
  border:1px solid var(--line-hi);border-radius:50%}
.mindsea-root .sx-sech .n{font-size:16px;font-weight:500;line-height:24px;letter-spacing:.2px;
  color:var(--text)}
.mindsea-root .sx-sech .m{margin-left:auto;flex:none;font-size:12px;line-height:18px;
  color:var(--muted);letter-spacing:.2px}
.mindsea-root .sx-secb{padding:24px;font-size:14px;line-height:22px;color:var(--text);
  white-space:pre-wrap;word-break:break-word}
.mindsea-root .sx-secb.md{white-space:normal}
.mindsea-root .sx-secb.md h1,.mindsea-root .sx-secb.md h2,.mindsea-root .sx-secb.md h3{
  margin:24px 0 12px;font-size:16px;font-weight:500;line-height:24px;letter-spacing:.2px;
  color:var(--text)}
.mindsea-root .sx-secb.md h1:first-child,.mindsea-root .sx-secb.md h2:first-child{margin-top:0}
.mindsea-root .sx-secb.md p{margin:0 0 12px}
.mindsea-root .sx-secb.md b{color:var(--text)}
.mindsea-root .sx-secb.md li{margin:0 0 6px 18px;list-style:disc}
.mindsea-root .sx-secb.md code{background:rgba(255,255,255,.07);padding:0 6px;border-radius:4px;font-size:13px;color:var(--text);font-family:ui-monospace,Consolas,monospace}
.mindsea-root .sx-secb.md .q{padding-left:12px;border-left:2px solid var(--line);
  color:var(--muted)}
.mindsea-root .sx-secb.md .hl{background:rgba(255,255,255,.08)}
.mindsea-root .sx-secb.md i{font-style:italic;color:var(--muted)}
.mindsea-root .sx-secb.md table{border-collapse:collapse;margin:12px 0 24px;font-size:13px}
.mindsea-root .sx-secb.md th,.mindsea-root .sx-secb.md td{border:1px solid var(--line);
  padding:8px 12px;text-align:left;vertical-align:top}
.mindsea-root .sx-secb.md th{background:rgba(255,255,255,.06);color:var(--text);font-weight:500;
  white-space:nowrap}

/* 列表行：靠明度分层，线只留给真的表格行 */
.mindsea-root .sx-row{display:flex;align-items:center;gap:12px;padding:12px 24px;
  cursor:default;border-style:solid;border-color:var(--line);border-width:0 0 1px 0}
.mindsea-root .sx-row:last-child{border-width:0}
.mindsea-root .sx-row.pick{cursor:pointer}
.mindsea-root .sx-row.pick:hover{background:rgba(255,255,255,.05)}
.mindsea-root .sx-row.on{background:rgba(255,255,255,.10)}
.mindsea-root .sx-day{font-size:14px;line-height:22px;color:var(--text);letter-spacing:.2px}
.mindsea-root .sx-cnt{margin-left:auto;font-size:12px;line-height:18px;color:var(--muted)}
.mindsea-root .sx-who{flex:none;width:32px;font-size:12px;line-height:18px;color:var(--muted);
  letter-spacing:.2px}
.mindsea-root .sx-t{flex:none;width:48px;font-size:12px;line-height:18px;color:var(--muted);
  letter-spacing:.2px}
.mindsea-root .sx-tx{flex:1 1 auto;min-width:0;font-size:14px;line-height:22px;color:var(--text);
  word-break:break-word}
.mindsea-root .sx-line{display:flex;gap:12px;padding:12px 24px;font-size:14px;line-height:22px;
  border-style:solid;border-color:var(--line);border-width:0 0 1px 0}
.mindsea-root .sx-line:hover{background:rgba(255,255,255,.05)}
.mindsea-root .sx-line .w{flex:none;width:64px;padding-top:2px;font-size:12px;line-height:18px;
  color:var(--muted)}
.mindsea-root .sx-line .c{flex:1 1 auto;min-width:0;word-break:break-word;color:var(--text)}
.mindsea-root .sx-line .r{flex:none;display:flex;gap:4px;align-items:center;padding-top:2px}
/* 列表里的七情也画圆点（跟话卡同一套形体） */
.mindsea-root .sx-dot{display:inline-block;width:6px;height:6px;border-radius:50%}

.mindsea-root .sx-empty{padding:32px 24px;text-align:center;color:var(--muted);font-size:14px;
  line-height:22px;letter-spacing:.2px}
.mindsea-root .sx-note{position:relative;margin:0 0 12px;padding:24px;background:var(--glass);
  border:1px solid var(--line);border-radius:var(--r-card);font-size:14px;line-height:22px;
  letter-spacing:.2px;color:var(--muted);
  backdrop-filter:blur(18px) saturate(130%);-webkit-backdrop-filter:blur(18px) saturate(130%)}/* taste-skill-ignore：毛玻璃是用户 2026-10-23 指定的这一版，不是随手加的 */

.mindsea-root .sx-btn{appearance:none;-webkit-appearance:none;font:inherit;font-size:13px;
  line-height:20px;height:32px;padding:0 16px;border-radius:var(--r-ctl);
  border:1px solid var(--line);background:rgba(255,255,255,.05);color:var(--text);
  cursor:pointer;letter-spacing:.2px;
  transition:background .1s linear,border-color .1s linear}
.mindsea-root .sx-btn:hover{background:rgba(255,255,255,.12);border-color:var(--line-hi)}
.mindsea-root .sx-btn:active{background:rgba(255,255,255,.16)}

.mindsea-root .sx-kv{display:flex;flex-wrap:wrap;gap:12px 24px;font-size:14px;line-height:22px;
  color:var(--muted)}
.mindsea-root .sx-kv b{color:var(--text);font-weight:400}

/* 时间页左边：日期 + 一条细柱（柱高 = 当天条数）。柱是数据形体，走冰系能量色 */
.mindsea-root .ms-daybar{flex:none;width:2px;border-radius:1px;align-self:center;
  background:var(--el-ice)}

/* 走神：环形进度（当前值 / 541）。本屏唯一彩色就是这一圈金 */
.mindsea-root .ms-ringrow{display:flex;align-items:center;gap:24px;flex-wrap:wrap}
.mindsea-root .ms-ring{width:132px;height:132px;flex:none}
.mindsea-root .ms-ringbg{fill:none;stroke:rgba(255,255,255,.12);stroke-width:6}
.mindsea-root .ms-ringfg{fill:none;stroke:var(--accent);stroke-width:6;stroke-linecap:round;
  opacity:.55;transition:opacity .2s linear}
.mindsea-root .ms-ringfg.hot{opacity:1}
.mindsea-root .ms-ringval{font-size:24px;font-weight:600;fill:var(--text);
  font-family:var(--font)}
.mindsea-root .ms-ringden{font-size:12px;fill:var(--muted)}

.mindsea-root .sx-verdict{margin-top:12px;font-size:14px;line-height:22px;letter-spacing:.2px;
  color:var(--muted)}
.mindsea-root .sx-verdict.hit{color:var(--text)}

.mindsea-root .sx-eve{display:flex;align-items:center;gap:12px;padding:12px 24px;
  border-style:solid;border-color:var(--line);border-width:0 0 1px 0}
.mindsea-root .sx-eve:last-child{border-width:0}
.mindsea-root .sx-eve .nm{font-size:14px;line-height:22px;color:var(--text);letter-spacing:.2px;
  word-break:break-word}
.mindsea-root .sx-eve .mt{flex:none;font-size:12px;line-height:18px;color:var(--muted)}
.mindsea-root .sx-eve .tag{margin-left:auto;flex:none;font-size:12px;line-height:18px;
  letter-spacing:.2px;padding:2px 8px;border-radius:var(--r-ctl);border:1px solid var(--line);
  color:var(--muted);background:rgba(255,255,255,.06)}
.mindsea-root .sx-eve .tag.sunk{color:var(--dim);border-color:var(--line);
  background:rgba(21,21,23,.45)}

/* 遗忘：顶部落叶带，一格一件事，越久没提越暗（最近几格走冰色，其余走同一色阶的明度） */
.mindsea-root .ms-leaves{margin:0 0 24px}
.mindsea-root .ms-leaves .ms-strip{height:24px}
.mindsea-root .ms-leaves-ends{display:flex;justify-content:space-between;margin-top:12px;
  font-size:12px;line-height:18px;color:var(--muted);letter-spacing:.2px}

/* 人设页：「看法」那一节读的是库里的话（最新一条用次级面挑出来）；历史注脚默认收着 */
.mindsea-root .sx-view{margin:12px 0}
.mindsea-root .sx-viewnote{margin:0 0 12px;font-size:12px;line-height:18px;color:var(--muted);
  letter-spacing:.2px}
.mindsea-root .sx-viewlist{position:relative;border:1px solid var(--line);
  border-radius:var(--r-card);background:rgba(21,21,23,.45);overflow:hidden}
.mindsea-root .sx-viewlist .sx-line{background:transparent}
.mindsea-root .sx-viewlist .sx-line:first-child{background:rgba(255,255,255,.06)}
.mindsea-root .sx-viewlist .sx-line .w{width:96px;color:var(--muted)}
.mindsea-root .sx-hist .sx-sech{cursor:pointer}
.mindsea-root .sx-hist .sx-sech:hover{background:rgba(255,255,255,.08)}
.mindsea-root .ms-scroll .sx-pad{padding-top:0}

/* ══ 侧栏：照 memory-eternal 的分组导航（2026-10-23）══════════════════
   分组标题（12px 灰）· 导航项 34px 一档 · 图标 16px · 选中是中性胶囊 */
.mindsea-root #tabs{display:flex;flex-direction:column;gap:0;margin-top:14px;padding:0 8px}
.mindsea-root .sb-group{margin:22px 0 4px;padding:0 10px;font-size:12px;line-height:18px;
  color:var(--dim);letter-spacing:.02em;user-select:none}
.mindsea-root .sb-group:first-child{margin-top:2px}
.mindsea-root .tab{display:flex;align-items:center;gap:8px;height:34px;padding:0 10px;
  border-radius:6px;font-size:14px;line-height:34px;color:var(--muted);
  text-align:left;background:transparent;white-space:nowrap}
.mindsea-root .tab:hover{background:var(--hover);color:var(--text)}
.mindsea-root .tab.on{background:var(--raised);color:var(--text)}
.mindsea-root .tab-ic{width:16px;flex:none;font-size:14px;line-height:1;text-align:center;
  filter:grayscale(.15)}

/* ══ 知识卡页：照 memory-eternal 的页头 + 搜索行 + 胶囊 ══ */
.mindsea-root .ms-kicker{font-size:11px;line-height:16px;letter-spacing:.16em;color:var(--dim);margin:0 0 4px}
.mindsea-root .ms-stats{display:flex;align-items:baseline;gap:18px;margin:10px 0 2px;
  font-size:12.5px;line-height:18px;color:var(--dim);flex-wrap:wrap}
.mindsea-root .ms-stats b{color:var(--text);font-weight:500;font-variant-numeric:tabular-nums;
  font-size:13.5px;margin-right:3px}
.mindsea-root .wall-sub{margin:2px 0 10px;font-size:13px;line-height:20px;color:var(--dim)}
.mindsea-root #wall-filter{padding:0 32px}
.mindsea-root .wf-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
/* 三行（搜索 / 时间+情绪 / 分数）之间留口气，别贴在一起 */
.mindsea-root #wall-filter .wf-row+.wf-row{margin-top:10px}
.mindsea-root .wf-row-search{margin-bottom:8px}
.mindsea-root .wf-search{flex:1 1 260px;min-width:180px;height:36px;padding:0 12px;
  border-radius:8px;border:1px solid var(--line);background:var(--ground);
  color:var(--text);font:inherit;font-size:13px;outline:none}
.mindsea-root .wf-search:focus{border-color:var(--accent)}
.mindsea-root .wf-search::placeholder{color:var(--dim)}
.mindsea-root .wf-btn{height:36px;padding:0 14px;border-radius:8px;border:1px solid var(--line);
  background:transparent;color:var(--muted);font:inherit;font-size:13px;cursor:pointer}
.mindsea-root .wf-btn:hover{background:var(--hover);color:var(--text)}
.mindsea-root .wf-count{flex:none;font-size:12px;color:var(--dim);margin-left:auto}
.mindsea-root .wf-pills{display:inline-flex;gap:6px;flex-wrap:wrap}
.mindsea-root .wf-pill{height:28px;padding:0 12px;border-radius:999px;border:1px solid var(--line);
  background:transparent;color:var(--muted);font:inherit;font-size:12.5px;cursor:pointer}
.mindsea-root .wf-pill:hover{background:var(--hover);color:var(--text)}
.mindsea-root .wf-pill.on{background:var(--raised);border-color:var(--line-hi);color:var(--text)}

/* ══ 知识卡页：竖排（头 → 搜索 → 胶囊 → 今天回看 → 卡片流），照 memory-eternal ══ */
.mindsea-root #pane-wall.on{display:flex;flex-direction:column;overflow:hidden}
.mindsea-root #wall-head{position:static;height:auto;padding:28px 32px 0;flex:none}
.mindsea-root #wall-filter{position:static;height:auto;padding:14px 32px 12px;flex:none;
  background:transparent;border:0;border-radius:0;white-space:normal;overflow:visible;
  backdrop-filter:none;-webkit-backdrop-filter:none}
.mindsea-root #scroll{position:static;flex:1 1 auto;min-height:0;overflow-y:auto}
.mindsea-root #wall-strip{margin-top:10px}

/* 今天回看：一张跨整行的大卡 */
.mindsea-root #wall-today{position:static;flex:none;display:flex;gap:24px;margin:16px 32px 0;
  padding:22px 24px;border-radius:12px;border:1px solid #3b404a;background:#272b33}
.mindsea-root .td-left{flex:1 1 auto;min-width:0}
.mindsea-root .td-kicker{font-size:12px;line-height:18px;color:var(--accent);letter-spacing:.02em;margin-bottom:6px}
.mindsea-root .td-title{margin:0 0 8px;font-size:29px;line-height:38px;font-weight:700;color:var(--text);
  overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.mindsea-root .td-sum{font-size:13px;line-height:21px;color:#babfc8;
  overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.mindsea-root .td-tags{margin-top:10px;font-size:12px;color:var(--dim)}
.mindsea-root .td-right{flex:none;width:104px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:2px;border-left:1px solid var(--line);padding-left:20px}
.mindsea-root .td-links{font-size:26px;line-height:1;font-weight:600;color:var(--accent);font-variant-numeric:tabular-nums}
.mindsea-root .td-links-label{font-size:12px;color:var(--dim)}

/* ══ 卡片五层（照 memory-eternal）：徽章行 / 标题 / 摘要 / 标签 / 底 ══ */
.mindsea-root .c-top{display:flex;align-items:center;gap:6px;margin-bottom:6px;flex:none}
.mindsea-root .c-badge{font-size:11px;line-height:16px;padding:0 6px;border-radius:4px;
  font-weight:500;white-space:nowrap}
.mindsea-root .c-dec{background:rgba(124,108,240,.18);color:var(--accent)}
.mindsea-root .c-time{margin-left:auto;font-size:11px;line-height:16px;color:var(--dim);
  font-variant-numeric:tabular-nums;white-space:nowrap}
.mindsea-root .c-title{font-size:16.5px;line-height:24px;font-weight:600;color:#f3f5f8;
  overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
  margin-bottom:7px;flex:none}
.mindsea-root .c-sum{font-size:12px;line-height:18px;color:#babfc8;
  overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;flex:none}
.mindsea-root .c-sum-tag{display:inline-block;margin-right:4px;padding:0 4px;border-radius:3px;
  background:var(--raised);color:var(--dim);font-size:10px;line-height:14px}
.mindsea-root .c-tags{display:flex;gap:8px;margin-top:8px;overflow:hidden;flex:none}
.mindsea-root .c-tag{font-size:11px;line-height:17px;color:var(--muted);white-space:nowrap;
  padding:0 7px;border-radius:999px;background:var(--raised)}
.mindsea-root .c-foot{margin-top:auto;display:flex;align-items:center;gap:6px;flex:none;
  padding-top:8px;border-top:1px solid var(--line)}

/* 「N 连接」按钮 + 浮层里的行 */
.mindsea-root .c-links{margin-left:auto;appearance:none;border:0;background:transparent;
  color:var(--dim);font:inherit;font-size:11px;line-height:16px;cursor:pointer;
  padding:0 2px;border-radius:4px}
.mindsea-root .c-links:hover{color:var(--accent);background:var(--raised)}
.mindsea-root .c-src{margin-left:8px;font-size:11px;line-height:16px;color:var(--dim);white-space:nowrap}
.mindsea-root .tp-row{display:flex;gap:8px;align-items:baseline;padding:4px 0;
  border-top:1px solid var(--line)}
.mindsea-root .tp-t{flex:none;color:var(--dim);font-size:11px;font-variant-numeric:tabular-nums}
.mindsea-root .tp-x{flex:1 1 auto;min-width:0;font-size:12px;color:var(--text);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mindsea-root .tp-n{flex:none;color:var(--accent);font-size:11px}

.mindsea-root .c-topic{background:color-mix(in srgb,var(--tc,var(--line)) 22%,transparent);
  color:var(--tc,var(--muted));border:1px solid color-mix(in srgb,var(--tc,var(--line)) 40%,transparent)}
`;

    // ══════════════════════════════════════════════════════════════════════════
    // 小工具（原型里的那几个原样搬过来）
    // ══════════════════════════════════════════════════════════════════════════
    /**
     * 《命运 2》四系能量色 —— 只给数据形体（CSS 那边同名变量是 --el-*），
     * 外壳（边框 / 标题 / 按钮 / 页签 / 工具条 / 面板底）一律灰阶，不上彩。
     */
    const ELEM = { 电: '#5ec8e5', 火: '#f5a623', 虚: '#8e6bbf', 冰: '#7fb3d5' };

    /**
     * 七情 · 数据色（颜色在这套界面里是「数据形体」，不是装饰）。
     * 往四系能量色上靠：喜 = 火、哀 = 冰、惧 = 虚，其余各就各位。
     * 只出现在三处：话卡底下那排 6px 圆点、列表里的同一颗圆点、七情筛选圆点。
     * 不许做底、不许做卡、不许落在文字 / 按钮 / 页签上；不许渐变、不许发光。
     * 语义跟原来一字不差：emoOf(w) 取第一条情绪。
     */
    const EMO = {
      喜: { c: '#f5a623' },
      怒: { c: '#d4553f' },
      哀: { c: '#7fb3d5' },
      惧: { c: '#8e6bbf' },
      爱: { c: '#c46a9a' },
      恶: { c: '#6f8f6a' },
      欲: { c: '#d98a3f' },
    };

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c]);
    }
    function r1(v) {
      return Math.round(v * 10) / 10;
    }
    /** ISO 时间 → 本地「2026-10-23 11:38」（服务端给的是 UTC ISO，别直接截） */
    function fmtWhen(iso) {
      const t = Date.parse(String(iso || ''));
      if (!Number.isFinite(t)) return String(iso || '').slice(0, 16).replace('T', ' ');
      const d = new Date(t);
      const p = (n) => ('0' + n).slice(-2);
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    function fmtNum(n) {
      return (n == null ? 0 : n).toLocaleString('en-US');
    }
    /**
     * 把一句原话里的 markdown 语法剥成纯文字：链接只留文字、行内代码去反引号、粗体去星号。
     * 卡片上不渲染 markdown（一块 textContent），不剥就会把
     * `[client.js](C:\\Users\\...)` 这种整串路径糊在标题上（2026-10-23 撞见过）。
     */
    function plainText(s) {
      return String(s == null ? '' : s)
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    }
    function emoOf(w) {
      const e = w.emo && w.emo.length ? w.emo[0] : null;
      return e && EMO[e] ? EMO[e] : null;
    }

    /**
     * 一句话的全部七情（顺序照库里给的），去重、最多 4 颗点。
     * 没有情绪就返回空数组 —— 空就不画点，别拿灰点占地方。
     */
    function emoColors(w) {
      const list = Array.isArray(w && w.emo) ? w.emo : [];
      const out = [];
      for (const k of list) {
        const e = EMO[k];
        if (e && !out.includes(e.c)) out.push(e.c);
        if (out.length >= 4) break;
      }
      return out;
    }

    /** 一排七情圆点：一句有几个情绪就画几个 6px 实心圆，点间距 4px */
    function emoDots(w, cls) {
      const cs = emoColors(w);
      if (!cs.length) return '';
      const names = Array.isArray(w && w.emo) ? w.emo.join('') : '';
      return (
        '<span class="' + (cls || 'emodots') + '" title="' + esc(names) + '">' +
        cs.map((c) => '<i class="emodot" style="--c:' + c + '"></i>').join('') +
        '</span>'
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════════════════════
    // 小零件：小页头 / 密度带 / 落叶带 / 环形进度
    // 密度一律用中性 6 步的「明度差」表达：不画渐变、不加发光、不上 accent
    // ══════════════════════════════════════════════════════════════════════════

    /** 页头：标题 20 + 一行 11 的说明（不搞「大数字 + 小标签」那套） */
    function pageHead(title, sub) {
      return (
        '<div class="ms-head"><h1 class="ms-head-t">' + esc(title) + '</h1>' +
        (sub ? '<div class="ms-head-s">' + sub + '</div>' : '') +
        '</div>'
      );
    }


    /**
     * 落叶带：一格一件事，越久没提越暗（最近 = 冰系能量色 → 最老 --surface）。
     * 这就是「最近亮、最老暗」那根条，只是不用渐变，用四步明度 + 一格一件事。
     */
    function leafStrip(items) {
      const arr = (Array.isArray(items) ? items : [])
        .slice()
        .sort((a, b) =>
          String(b.lastMention || b.lastAt || '').localeCompare(String(a.lastMention || a.lastAt || '')),
        );
      const n = arr.length;
      if (!n) return '';
      let cells = '';
      for (let i = 0; i < n; i += 1) {
        const p = n > 1 ? i / (n - 1) : 0; // 0 = 最近，1 = 最老
        let col = ELEM.冰; // 最近还在提的那几格：冰系能量色，最亮
        if (p > 0.75) col = 'var(--surface)';
        else if (p > 0.5) col = 'var(--border)';
        else if (p > 0.25) col = 'var(--muted)';
        const it = arr[i];
        cells +=
          '<i style="background:' + col + '" title="' + esc(it.name || '') + ' · ' +
          esc(String(it.lastMention || it.lastAt || '').slice(0, 10)) + '"></i>';
      }
      return (
        '<div class="ms-leaves"><div class="ms-strip">' + cells + '</div>' +
        '<div class="ms-leaves-ends"><span>最近还在提 · 亮</span><span>最老 · 暗</span></div></div>'
      );
    }

    /**
     * 环形进度：value / 541。
     * 环本来就用金（本屏唯一的彩色），过半只是从不透明度 .55 抬到 1，不加发光。
     */
    function ringSvg(value, total) {
      const R = 54;
      const C = 2 * Math.PI * R;
      const den = Number(total) || 0;
      const v = Math.max(0, Math.min(den, Number(value) || 0));
      const ratio = den > 0 ? v / den : 0;
      const dash = C * ratio;
      return (
        '<svg class="ms-ring" viewBox="0 0 128 128" aria-hidden="true">' +
        '<circle class="ms-ringbg" cx="64" cy="64" r="' + R + '"/>' +
        '<circle class="ms-ringfg' + (ratio > 0.5 ? ' hot' : '') + '" cx="64" cy="64" r="' + R + '" ' +
        'transform="rotate(-90 64 64)" stroke-dasharray="' + r1(dash) + ' ' + r1(C + 1) + '"/>' +
        '<text class="ms-ringval" x="64" y="68" text-anchor="middle">' + fmtNum(v) + '</text>' +
        '<text class="ms-ringden" x="64" y="88" text-anchor="middle">/ ' + fmtNum(den) + '</text>' +
        '</svg>'
      );
    }

    /** 极简 markdown → html（标题 / 列表 / 引用 / 行内 code / 粗体 / 斜体） */
    function mdToHtml(text) {
      const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
      const out = [];
      let inUl = false;
      const closeUl = () => {
        if (inUl) {
          out.push('</ul>');
          inUl = false;
        }
      };
      const inline = (s) =>
        esc(s)
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
          .replace(/(^|[\s（(])_([^_\n]+)_(?=[\s）)。，,；;]|$)/g, '$1<i>$2</i>');
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].replace(/\s+$/, '');
        // 表格：这一行是 |a|b|，下一行是 |---|---| 这种分隔行
        const isRow = /^\s*\|.*\|\s*$/.test(line);
        if (isRow && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
          closeUl();
          const cells = (row) =>
            row
              .trim()
              .replace(/^\|/, '')
              .replace(/\|$/, '')
              .split('|')
              .map((c) => c.trim());
          let html = '<table><thead><tr>';
          for (const c of cells(line)) html += '<th>' + inline(c) + '</th>';
          html += '</tr></thead><tbody>';
          i += 2;
          while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
            html += '<tr>';
            for (const c of cells(lines[i])) html += '<td>' + inline(c) + '</td>';
            html += '</tr>';
            i += 1;
          }
          i -= 1;
          html += '</tbody></table>';
          out.push(html);
          continue;
        }
        if (!line.trim()) {
          closeUl();
          continue;
        }
        const mh = /^(#{1,6})\s+(.*)$/.exec(line);
        if (mh) {
          closeUl();
          const lvl = Math.min(3, mh[1].length);
          out.push(`<h${lvl}>${inline(mh[2])}</h${lvl}>`);
          continue;
        }
        const mli = /^\s*[-*+]\s+(.*)$/.exec(line);
        if (mli) {
          if (!inUl) {
            out.push('<ul>');
            inUl = true;
          }
          out.push(`<li>${inline(mli[1])}</li>`);
          continue;
        }
        if (/^>\s?/.test(line)) {
          closeUl();
          out.push(`<div class="q">${inline(line.replace(/^>\s?/, ''))}</div>`);
          continue;
        }
        closeUl();
        out.push(`<p>${inline(line)}</p>`);
      }
      closeUl();
      return out.join('\n');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 数据：话列表（分批拉全 —— 单次响应不吐八千条，页面照样能拿全）
    // ══════════════════════════════════════════════════════════════════════════
    const API = '/mindsea/api';

    async function fetchJson(path) {
      const r = await fetch(API + path, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
      return r.json();
    }

    async function fetchAllWords(onProgress) {
      const all = [];
      let offset = 0;
      const limit = 2000;
      for (;;) {
        const j = await fetchJson(`/words?offset=${offset}&limit=${limit}`);
        if (!j.ok) throw new Error(j.error || '读不到话');
        all.push(...j.words);
        if (onProgress) onProgress(all.length, j.total);
        if (!j.hasMore || !j.words.length) break;
        offset += j.words.length;
        if (offset > 200000) break;
      }
      all.sort((a, b) => String(b.at).localeCompare(String(a.at)));
      return all;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 页一 · 话卡墙（照搬 墙.html：虚拟滚动 / 情绪竖条 / 拖拽 / 拉线，一样不少）
    // ══════════════════════════════════════════════════════════════════════════
    /**
     * 页一 · 「识海」（v5，2026-10-23 照 memory-eternal 的界面重做的）
     *
     * 老黄的要求是「完全一样」：所以这一页不再自己发明样式，直接用人家的那套结构
     *   .ms-eternal > .mc-main > .mc-v5-pagehead / .mc-toolbar / .mc-chips / .mc-v5-feature / .mc-grid
     * 样式表从人家的页面上扒下来，作用域在 .ms-eternal 下（lib/ui/eternal.css）。
     *
     * 数据还是我们自己的话（/mindsea/api/words），一页只渲染最近的一段，滚动加载。
     * 老的虚拟滚动 / 拖拽拉线那一版留在 initWall 里，没删 —— 这页要是哪里不对还能切回去。
     */
    function initWallV5({ pane, shell }) {
      // 人家的那套样式表（服务端吐 /mindsea/ui/eternal.css），一页只挂一次
      if (!document.getElementById('mindsea-eternal-css')) {
        const link = document.createElement('link');
        link.id = 'mindsea-eternal-css';
        link.rel = 'stylesheet';
        link.href = '/mindsea/ui/eternal.css';
        document.head.appendChild(link);
      }
      let all = [];
      let filtered = [];
      let shown = 60;
      let kw = '';
      let mode = 'all';

      pane.innerHTML =
        // 背景：后端现画的识海图谱。
        // 2026-10-23 折腾了八轮才认账：别用 CSS 背景了（简写非法、又被 !important 盖掉），
        // 直接塞一张 <img> 铺在最底下 —— 图片加载不归 CSS 管，最不容易被别的东西闷掉。
        '<img class="ms-sea-img" src="/mindsea/ui/sea.svg" alt="" aria-hidden="true">' +
        '<div class="ms-eternal" style="position:absolute;inset:0;overflow-y:auto;background-color:rgba(8,10,15,.42)">' +
        '<div class="mc-main" style="max-width:1500px;margin:0 auto;padding:8px 26px 72px">' +
        '<div class="mc-v5-pagehead">' +
        '<div>' +
        '<div class="mc-v5-eyebrow">MIND SEA</div>' +
        '<h1>识海</h1>' +
        '<p>你的本地第二大脑 · 一句一张</p>' +
        '</div>' +
        '<span class="mc-v5-pagecount" id="m5-pagecount">0 / 0</span>' +
        '</div>' +
        '<div class="ms-stats" id="m5-stats"></div>' +
        '<div class="mc-toolbar">' +
        '<input id="m5-kw" type="text" placeholder="搜索记忆（支持中文片段）…" spellcheck="false">' +
        '<button class="mc-btn" id="m5-refresh">刷新</button>' +
        '<button class="mc-btn" id="m5-export">导出 JSON</button>' +
        '</div>' +
        '<div class="mc-chips" id="m5-chips"></div>' +
        '<div class="mc-v5-feature" id="m5-feature"></div>' +
        '<div class="mc-grid" id="m5-grid"></div>' +
        '<div id="m5-more" style="padding:18px 0 8px;text-align:center"></div>' +
        '</div></div>';

      const $ = (id) => pane.querySelector('#' + id);
      const gridEl = $('m5-grid');
      const chipsEl = $('m5-chips');
      const statsEl = $('m5-stats');
      const pcEl = $('m5-pagecount');
      const featEl = $('m5-feature');
      const moreEl = $('m5-more');

      // 这一页自己的日期工具（别去借 initWall 里那个 —— 那是函数内的局部变量，这里看不见）
      const pad2 = (n) => ('0' + n).slice(-2);
      function dayKey(offset) {
        const d = new Date(Date.now() - (offset || 0) * 86400000);
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
      }

      /**
       * 门类：老黄 2026-10-23 定的五个抽屉 —— 闲聊 / 暧昧 / 干活 / 知识 / 规矩。
       *
       * 库里 memories.category 还是空的（一条都没判过），所以先这么走：
       *   ① 话挂在事上 → 看这件事属于哪一类（下面这张表，37 件事全列了）；
       *   ② 没挂事 → 带「爱/欲」的进暧昧，其余进闲聊；
       *   ③ place=trash 的（「嗯」「好的」这种）根本不上墙。
       * 以后自动沉淀会给新话打 category，到时候这张表就退成兜底。
       */
      // 门类标签（打包对外时清空了写死的事名表：那里原本列着真实的事，
      // 会把人做过什么一览无余地暴露出去。现在统一按「干活」兜底，
      // 真门类从库里读。）
      const EVENT_TAG = {};

      /**
       * 一条话属于哪个抽屉。三层兜底：
       *   ① 事自己的门类（events.category）—— 新事第一次进来，沉淀器定了写进去；
       *   ② 这条话自己的门类（memories.category）；
       *   ③ 老数据两样都没有，才回落到那张 37 件事的表 + 情绪猜。
       */
      function categoryOf(w) {
        const fromEv = String(w.evcat || '');
        if (TAGS.includes(fromEv)) return fromEv;
        const fromDb = String(w.cat || '');
        if (TAGS.includes(fromDb)) return fromDb;
        const ev = String(w.ev || '');
        if (ev) return EVENT_TAG[ev] || '干活';
        const emo = Array.isArray(w.emo) ? w.emo : [];
        if (emo.includes('爱') || emo.includes('欲')) return '暧昧';
        return '闲聊';
      }

      /** 五个抽屉（顺序就是胶囊的顺序） */
      const TAGS = ['闲聊', '暧昧', '干活', '知识', '规矩'];

      /**
       * 五个抽屉各自一个颜色（2026-10-23 老黄要的）。
       * 跟「谁说的」那组分开配色：说话人用蓝/粉，门类用灰蓝/玫粉/青绿/金/紫。
       */
      const CAT_COLOR = {
        '闲聊': '#93a7c4',
        '暧昧': '#e8809f',
        '干活': '#4fc7a0',
        '知识': '#d9b45a',
        '规矩': '#b28cff',
      };
      /** 每件事有多少条话 —— 卡片右下角「N 连接」用的（同一条事的话算一条连接） */
      const evCount = new Map();

      /** 卡片底部两枚小图标：连接（三个点连线）、来源（一枚点） */
      const LINK_ICO =
        '<svg class="mc-ico" viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round">' +
        '<circle cx="2.6" cy="7" r="1.5"/><circle cx="11" cy="3" r="1.1"/><circle cx="11" cy="11" r="1.1"/>' +
        '<path d="M4 6.4 9.8 3.6M4 7.6 9.8 10.4"/></svg>';
      const SRC_ICO =
        '<svg class="mc-ico" viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.1">' +
        '<circle cx="7" cy="7" r="4.4"/><circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none"/></svg>';

      /** 话卡 → 一张卡的 HTML（结构照抄人家的 .mc-v5-card） */
      function cardHtml(w) {
        const text = String(w.text || '').replace(/\s+/g, ' ').trim();
        const plain = plainText(text);
        const ev = w.ev ? String(w.ev) : '';
        const cat = categoryOf(w);
        // 白字（大）：这是什么事 —— 挂着事就写事名，没挂就写门类；
        // 灰小字：原文。老黄 2026-10-23 定的版式：上面是标签，下面才是话本身。
        const title = ev || cat;
        const body = plain.slice(0, 160);
        const tile = cat.slice(0, 1);
        const tags = [];
        if (w.nd) tags.push(w.nd);
        if (w.st) tags.push(w.st);
        for (const e of (w.emo || [])) tags.push(e);
        const tagHtml = tags.slice(0, 4).map((t) => '<button class="mc-tag mc-tag-click">#' + esc(t) + '</button>').join('') +
          (tags.length > 4 ? '<span class="mc-tag more">+' + (tags.length - 4) + '</span>' : '');
        const dots = emoDots(w, 'mc-v5-emo');
        // 谁说的：老黄蓝、大肥鱼粉，卡片左边一条同色竖边 + 顶部一枚小徽章
        const who = w.sp === 0 ? 'him' : 'me';
        const whoName = w.sp === 0 ? '老黄' : '大肥鱼';
        const catColor = CAT_COLOR[cat] || '#93a7c4';
        return (
          '<article class="mc-cardrow mc-card mc-v5-card who-' + who + '" data-id="' + esc(w.id) + '" style="--cat:' + catColor + '">' +
          '<div class="mc-v5-card-top">' +
          // 门类只用那一枚实心方块（字镂空），旁边不再重复写「干活」两个字
          '<span class="mc-v5-card-tile" style="color:#090b0e;background:' + catColor + ';border-color:' + catColor + ';font-weight:700">' + esc(tile) + '</span>' +
          '<span class="mc-who mc-who-' + who + '">' + whoName + '</span>' +
          (w.dec ? '<span class="mc-new">决定</span>' : '') +
          '<span class="spacer"></span>' +
          '<span class="mc-v5-card-time">' + esc(String(w.at || '').slice(5, 16)) + '</span>' +
          '</div>' +
          '<h4 class="mc-v5-card-title">' + esc(title) + '</h4>' +
          (body
            ? '<div class="mc-v5-card-insight"><span class="mc-v5-card-lead">' + esc(body) + '</span></div>'
            : '') +
          '<div class="mc-tags mc-v5-card-tags">' + tagHtml + '</div>' +
          '<footer class="mc-v5-card-foot">' +
          '<span class="mc-v5-conn">' + dots + '</span>' +
          (ev
            ? '<span class="mc-v5-links" title="这件事总共有几条话">' + LINK_ICO + fmtNum(evCount.get(ev) || 1) + ' 连接</span>'
            : '') +
          '<span class="mc-v5-source">' + SRC_ICO + '识海</span>' +
          '<span class="mc-v5-author">s' + (w.s || 0) + '</span>' +
          '</footer>' +
          '</article>'
        );
      }

      /** 页头那几个数 */
      function paintStats() {
        const today = dayKey(0);
        const weekAgo = dayKey(6);
        const todayN = all.filter((w) => String(w.at || '').slice(0, 10) === today).length;
        const weekN = all.filter((w) => String(w.at || '').slice(0, 10) >= weekAgo).length;
        const decN = all.filter((w) => w.dec).length;
        statsEl.innerHTML =
          '<span><b>' + fmtNum(all.length) + '</b>张卡</span>' +
          '<span><b>' + fmtNum(todayN) + '</b>今天</span>' +
          '<span><b>+' + fmtNum(weekN) + '</b>近七天</span>' +
          '<span><b>' + fmtNum(decN) + '</b>决定</span>';
      }

      /** 筛选条：全部 + 五个抽屉（闲聊 / 暧昧 / 干活 / 知识 / 规矩） */
      function paintChips() {
        const count = new Map(TAGS.map((t) => [t, 0]));
        for (const w of all) {
          const t = categoryOf(w);
          count.set(t, (count.get(t) || 0) + 1);
        }
        const items = [{ k: 'all', label: '全部', n: all.length }].concat(
          TAGS.map((t) => ({ k: t, label: t, n: count.get(t) || 0, color: CAT_COLOR[t] })),
        );
        chipsEl.innerHTML = items
          .map((it) => '<button class="mc-chip' + (mode === it.k ? ' active' : '') + '" data-mode="' + esc(it.k) + '"' +
            (it.color ? ' style="color:' + it.color + ';border-color:' + it.color + (mode === it.k ? 'aa' : '40') + (mode === it.k ? ';background:' + it.color + '1f' : '') + '"' : '') + '>' +
            esc(it.label) + '<span class="mc-chip-n">' + fmtNum(it.n) + '</span></button>')
          .join('');
        chipsEl.querySelectorAll('.mc-chip').forEach((b) => {
          b.addEventListener('click', () => {
            mode = b.dataset.mode;
            shown = 60;
            apply();
          });
        });
      }

      /** 今天回看：今天分量最高的一句 */
      function paintFeature() {
        const today = dayKey(0);
        const list = all.filter((w) => String(w.at || '').slice(0, 10) === today);
        if (!list.length) {
          featEl.innerHTML =
            '<div class="mc-v5-feature-copy"><div class="mc-v5-eyebrow">今天回看</div>' +
            '<h3>今天还没有话</h3><p>说点什么，它会自己长出来。</p></div>' +
            '<div class="mc-v5-feature-side"><span class="mc-v5-feature-n">0</span>' +
            '<span class="mc-v5-feature-open">—</span></div>';
          return;
        }
        const top = list.slice().sort((a, b) => (b.s || 0) - (a.s || 0))[0];
        const evs = [...new Set(list.map((w) => w.ev).filter(Boolean))];
        featEl.innerHTML =
          '<div class="mc-v5-feature-copy">' +
          '<div class="mc-v5-eyebrow">今天回看</div>' +
          '<h3>' + esc(plainText(top.text).slice(0, 46)) + '</h3>' +
          '<p>今天 ' + list.length + ' 条 · 涉及 ' + evs.length + ' 件事 · s' + (top.s || 0) + '</p>' +
          '<div class="mc-v5-feature-meta">' + evs.slice(0, 4).map((e) => '<span class="mc-tag">#' + esc(e) + '</span>').join('') + '</div>' +
          '</div>' +
          '<div class="mc-v5-feature-side">' +
          '<span class="mc-v5-feature-n">' + fmtNum(list.length) + '</span>' +
          '<span class="mc-v5-feature-lbl">今天</span>' +
          '<span class="mc-v5-feature-open">↗</span>' +
          '</div>';
        featEl.onclick = () => {
          kw = '';
          const box = $('m5-kw');
          if (box) box.value = '';
          mode = 'all';
          apply();
          const card = gridEl.querySelector('[data-id="' + top.id + '"]');
          if (card) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
        };
      }

      function apply() {
        const q = kw.trim().toLowerCase();
        filtered = all.filter((w) => {
          if (mode !== 'all' && categoryOf(w) !== mode) return false;
          if (!q) return true;
          return String(w.text || '').toLowerCase().includes(q) || String(w.ev || '').toLowerCase().includes(q);
        });
        paintChips();
        render();
      }

      function render() {
        const slice = filtered.slice(0, shown);
        gridEl.innerHTML = slice.map(cardHtml).join('');
        pcEl.textContent = fmtNum(Math.min(shown, filtered.length)) + ' / ' + fmtNum(filtered.length);
        if (filtered.length > shown) {
          moreEl.innerHTML = '<button class="mc-btn" id="m5-loadmore">再加载 ' + Math.min(60, filtered.length - shown) + ' 张</button>';
          const b = $('m5-loadmore');
          if (b) b.addEventListener('click', () => { shown += 60; render(); });
        } else {
          moreEl.innerHTML = filtered.length ? '<span style="font-size:12px;color:var(--dim)">到头了</span>' : '';
        }
        gridEl.querySelectorAll('.mc-cardrow').forEach((el) => {
          el.addEventListener('click', () => {
            const w = all.find((x) => String(x.id) === el.dataset.id);
            if (w && shell && typeof shell.toast === 'function') shell.toast(plainText(w.text).slice(0, 200));
          });
        });
      }

      function setWords(list) {
        // ① place=trash 的是「嗯」「好的」这类废话池，不上墙；
        // ② 同一句话在判工时期被切进好几个块，库里存了副本（老黄截图里那种一模一样的三张）——
        //    按原文去重，留时间最新的一条（list 本来就是时间倒序）。
        const seen = new Set();
        all = (Array.isArray(list) ? list : []).filter((w) => {
          if (w.place === 'trash') return false;
          const key = String(w.text || '').replace(/\s+/g, ' ').trim();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        // 顺带数一遍每件事有多少条 —— 卡片右下角「N 连接」
        evCount.clear();
        for (const w of all) {
          const ev = String(w.ev || '');
          if (ev) evCount.set(ev, (evCount.get(ev) || 0) + 1);
        }
        paintStats();
        paintFeature();
        apply();
      }

      const kwBox = $('m5-kw');
      if (kwBox) {
        kwBox.addEventListener('input', () => {
          kw = kwBox.value || '';
          shown = 60;
          apply();
        });
      }
      const refresh = $('m5-refresh');
      if (refresh) {
        refresh.addEventListener('click', () => {
          location.reload();
        });
      }
      const exp = $('m5-export');
      if (exp) {
        exp.addEventListener('click', () => {
          const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'mindsea-words.json';
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        });
      }

      return {
        setWords,
        relayout() {},
        show() {
          paintStats();
          paintFeature();
          apply();
        },
        dispose() {},
      };
    }


    // ══════════════════════════════════════════════════════════════════════════
    // 页二 · 工作流（照搬 墙.html：12 话题 → 事卡 → 版本/阶段/决定）
    // ══════════════════════════════════════════════════════════════════════════
    function initFlow({ pane }) {
      const view = pane.querySelector('#flow-view');
      const cv = pane.querySelector('#flow-canvas');
      const headBack = pane.querySelector('#flow-back');
      const headTitle = pane.querySelector('#flow-title');
      const headMeta = pane.querySelector('#flow-meta');
      const headAlias = pane.querySelector('#flow-alias');
      const headZoom = pane.querySelector('#flow-zoom');
      const zoombox = pane.querySelector('#flow-zoombox');
      const zIn = pane.querySelector('#flow-zin');
      const zOut = pane.querySelector('#flow-zout');

      let DATA = null;
      let LOADING = false;
      let state = { t: -1, e: -1 };
      // 缩放：用 CSS zoom（布局跟着走，滚动条高度才是对的），不再整页 transform
      let z = 1;
      const MINZ = 0.6;
      const MAXZ = 2;

      function applyZoom() {
        cv.style.zoom = z.toFixed(3);
        headZoom.textContent = Math.round(z * 100) + '%';
      }
      /** 以视口里 (mx,my) 那一点为锚缩放：缩放前后指针底下还是同一处内容 */
      function zoomAt(nz, mx, my) {
        const next = Math.min(MAXZ, Math.max(MINZ, nz));
        if (Math.abs(next - z) < 1e-4) return;
        const cx = (view.scrollLeft + mx) / z;
        const cy = (view.scrollTop + my) / z;
        z = next;
        applyZoom();
        view.scrollLeft = Math.max(0, cx * z - mx);
        view.scrollTop = Math.max(0, cy * z - my);
      }
      function resetView() {
        z = 1;
        applyZoom();
        view.scrollLeft = 0;
        view.scrollTop = 0;
      }

      /** 滚轮：平时就是普通垂直滚动（不拦），Ctrl / ⌘ + 滚轮才缩放（触控板 pinch 也走这条） */
      function onWheel(e) {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        const r = view.getBoundingClientRect();
        zoomAt(z * (e.deltaY > 0 ? 0.9 : 1 / 0.9), e.clientX - r.left, e.clientY - r.top);
      }
      view.addEventListener('wheel', onWheel, { passive: false });

      /** 工具条上的 − / ＋（以视口中心为锚） */
      function zoomStep(f) {
        zoomAt(z * f, view.clientWidth / 2, view.clientHeight / 2);
      }
      zIn.addEventListener('click', () => zoomStep(1 / 0.9));
      zOut.addEventListener('click', () => zoomStep(0.9));

      // 空白处按住拖 = 抓着滚（只改 scrollTop / scrollLeft，布局不动）
      let pan = null;
      function onDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target.closest && e.target.closest('.fcap, .fcard, .fstagecard, button, a')) return;
        pan = { x: e.clientX, y: e.clientY, sl: view.scrollLeft, st: view.scrollTop };
        view.classList.add('grabbing');
        try {
          view.setPointerCapture(e.pointerId);
        } catch (err) {
          /* 抓不住就算了 */
        }
      }
      function onMove(e) {
        if (!pan) return;
        view.scrollLeft = pan.sl - (e.clientX - pan.x);
        view.scrollTop = pan.st - (e.clientY - pan.y);
      }
      function endPan(e) {
        if (!pan) return;
        pan = null;
        view.classList.remove('grabbing');
        try {
          view.releasePointerCapture(e.pointerId);
        } catch (err) {
          /* 同上 */
        }
      }
      view.addEventListener('pointerdown', onDown);
      view.addEventListener('pointermove', onMove);
      view.addEventListener('pointerup', endPan);
      view.addEventListener('pointercancel', endPan);

      // ---------- 头部 ----------
      function setHead(o) {
        headBack.hidden = !o.back;
        headTitle.textContent = o.title || '';
        headTitle.classList.toggle('big', !!o.big);
        headMeta.textContent = o.meta || '';
        headAlias.textContent = o.alias ? o.alias.join(' · ') : '';
        headAlias.title = o.alias ? o.alias.join(' · ') : '';
        zoombox.hidden = !o.zoom;
      }

      // ---------- 第一屏：事列表 ----------
      function renderList() {
        if (!DATA) return;
        state = { t: -1, e: -1 };
        let totalEv = 0;
        DATA.topics.forEach((t) => {
          totalEv += t.events.length;
        });
        setHead({
          back: false,
          title: '工作流',
          big: false,
          meta: DATA.topics.length + ' 个话题 · ' + totalEv + ' 件',
          alias: null,
          zoom: true,
        });

        let html = '';
        DATA.topics.forEach((t, ti) => {
          html +=
            '<section class="fblock"><div class="fbh"><span class="fbn">' + esc(t.name) + '</span>' +
            '<span class="fbc">' + fmtNum(t.n) + ' 条 / ' + t.events.length + ' 件</span></div><div class="fgrid">';
          t.events.forEach((ev, ei) => {
            html +=
              '<button class="fcard" data-t="' + ti + '" data-e="' + ei + '">' +
              '<span class="fcn">' + esc(ev.name) + '</span>' +
              '<span class="fcm">' + fmtNum(ev.n) + ' 条 · ' + fmtNum(ev.dec || 0) + ' 决定' +
              ' · ' + versionsOf(ev).length + ' 版本</span></button>';
          });
          html += '</div></section>';
        });
        cv.innerHTML = html;
        resetView();
      }

      // ---------- 层级：事 → 版本（分组标题）→ 功能卡 → 阶段卡 ----------
      /** 一件事的版本列表：先认服务端统一给的 versions，再认判工那份 generations，最后把扁平 stages 兜成一个版本 */
      function versionsOf(ev) {
        if (Array.isArray(ev.versions) && ev.versions.length) return ev.versions;
        if (Array.isArray(ev.generations) && ev.generations.length) {
          return ev.generations.map((g) => ({ name: g.name, n: g.n, features: g.features || [] }));
        }
        if (Array.isArray(ev.stages) && ev.stages.length) {
          return [{ name: '（未分版本）', n: ev.n, stages: ev.stages }];
        }
        return [];
      }

      /** 卡片按条数分档：大的占两列，小的照旧 */
      function capClass(n) {
        const v = Number(n) || 0;
        return v >= 80 ? ' big' : '';
      }

      /** 阶段卡（小一号，铺在功能卡下面） */
      function stageCards(stages) {
        let html = '<div class="fstagegrid">';
        (stages || []).forEach((s) => {
          html +=
            '<div class="fstagecard' + (Number(s.n) >= 100 ? ' big' : '') + '">' +
            '<span class="sn">' + esc(s.name) + '</span>' +
            '<span class="sm">' + fmtNum(s.n) + ' 条</span></div>';
        });
        return html + '</div>';
      }

      /** 功能卡：名字 + 条数 + 决定点（暖金）+ 阶段数 */
      function featureCard(vi, fi, f) {
        const stages = (f.stages || []).length;
        return (
          '<button class="fcap' + capClass(f.n) + '" data-v="' + vi + '" data-f="' + fi + '">' +
          '<span class="capn">' + esc(f.name) + '</span>' +
          '<span class="capm"><span>' + fmtNum(f.n) + ' 条</span>' +
          (f.dec ? '<span class="capd"><i></i>' + fmtNum(f.dec) + '</span>' : '') +
          '<span>' + stages + ' 阶段</span></span></button>'
        );
      }

      /** 版本卡（没分代的事：版本自己就是卡片，点开看它的阶段） */
      function versionCard(vi, v) {
        const stages = (v.stages || []).length;
        return (
          '<button class="fcap' + capClass(v.n) + '" data-v="' + vi + '">' +
          '<span class="capn">' + esc(v.name) + '</span>' +
          '<span class="capm"><span>' + fmtNum(v.n) + ' 条</span><span>' + stages + ' 阶段</span></span></button>'
        );
      }

      function treeHtml(ev) {
        const vers = versionsOf(ev);
        if (!vers.length) return '<div class="fhint">这件事还没分出版本和阶段</div>';
        const hasFeatures = vers.some((v) => Array.isArray(v.features) && v.features.length);
        let stageCount = 0;
        let featCount = 0;
        vers.forEach((v) => {
          if (Array.isArray(v.features) && v.features.length) {
            featCount += v.features.length;
            v.features.forEach((f) => {
              stageCount += (f.stages || []).length;
            });
          } else {
            stageCount += (v.stages || []).length;
          }
        });
        let html =
          '<div class="fhint">' +
          (hasFeatures ? '点一张功能卡，它的阶段卡在下面铺开' : '点一张版本卡，它的阶段卡在下面铺开') +
          ' · ' + vers.length + ' 个版本' +
          (featCount ? ' · ' + featCount + ' 个功能' : '') +
          ' · ' + fmtNum(stageCount) + ' 个阶段</div>';

        if (hasFeatures) {
          // 有功能层：版本 = 分组标题，功能 = 卡片
          vers.forEach((v, vi) => {
            const feats = v.features || [];
            html +=
              '<section class="fgen"><div class="fgenhead"><span class="gn">' + esc(v.name) + '</span>' +
              '<span class="gm">' + fmtNum(v.n) + ' 条 · ' + feats.length + ' 个功能</span></div>' +
              '<div class="fcapgrid">';
            feats.forEach((f, fi) => {
              html += featureCard(vi, fi, f);
            });
            html += '</div></section>';
          });
        } else {
          // 没功能层：版本 = 卡片，铺成一片
          html += '<div class="fcapgrid">';
          vers.forEach((v, vi) => {
            html += versionCard(vi, v);
          });
          html += '</div>';
        }
        return html;
      }

      /** 阶段卡挂到被点那张卡的后面（同一行网格的下一整行，紧跟它，不跳走） */
      let stageSlot = null;
      let curEv = null;
      function openStages(btn, stages) {
        if (!stageSlot) {
          stageSlot = document.createElement('div');
          stageSlot.className = 'fcapslot';
        }
        const same = btn.classList.contains('sel');
        cv.querySelectorAll('.fcap.sel').forEach((el) => el.classList.remove('sel'));
        if (same) {
          stageSlot.hidden = true;
          if (stageSlot.parentElement) stageSlot.remove();
          return;
        }
        btn.classList.add('sel');
        stageSlot.innerHTML = stageCards(stages);
        btn.insertAdjacentElement('afterend', stageSlot);
        stageSlot.hidden = false;
      }

      // ---------- 详情形 ----------
      function renderDetail(ti, ei) {
        const t = DATA.topics[ti];
        const ev = t.events[ei];
        state = { t: ti, e: ei };
        curEv = ev;
        stageSlot = null;
        setHead({
          back: true,
          title: ev.name,
          big: true,
          meta: fmtNum(ev.n) + ' 条 · ' + fmtNum(ev.dec || 0) + ' 决定',
          alias: ev.aliases && ev.aliases.length ? ev.aliases : null,
          zoom: true,
        });

        cv.innerHTML = treeHtml(ev);
        resetView();
      }

      // ---------- 点击 ----------
      function onClick(e) {
        const t = e.target;
        const card = t.closest ? t.closest('.fcard') : null;
        if (card) {
          renderDetail(+card.dataset.t, +card.dataset.e);
          return;
        }
        const cap = t.closest ? t.closest('.fcap') : null;
        if (cap && curEv) {
          const vers = versionsOf(curEv);
          const vi = Number(cap.dataset.v);
          const v = vers[vi];
          if (!v) return;
          if (cap.dataset.f !== undefined && cap.dataset.f !== '') {
            const f = (v.features || [])[Number(cap.dataset.f)];
            openStages(cap, (f && f.stages) || []);
          } else {
            openStages(cap, v.stages || []);
          }
        }
      }
      cv.addEventListener('click', onClick);

      function onBack() {
        renderList();
      }
      function onZoom() {
        zoomAt(1, 0, 0); // 点百分比：回 100%，内容位置不动
      }
      headBack.addEventListener('click', onBack);
      headZoom.addEventListener('click', onZoom);

      function onKey(e) {
        if (e.key !== 'Escape') return;
        if (!pane.classList.contains('on')) return;
        if (state.e >= 0) renderList();
      }
      window.addEventListener('keydown', onKey);

      function setData(json) {
        LOADING = false;
        DATA = json;
        renderList();
      }

      function load() {
        if (DATA || LOADING) return;
        LOADING = true;
        setHead({ back: false, title: '工作流', meta: '读识海骨架…', alias: null, zoom: false });
        fetchJson('/cards')
          .then((j) => {
            setData(j);
          })
          .catch((err) => {
            LOADING = false;
            cv.innerHTML =
              '<div class="fhint" style="padding:30px 0">读不到卡片（' + esc(String(err.message || err)) + '）</div>';
          });
      }

      return {
        show() {
          if (!DATA) load();
          else resetView();
        },
        list() {
          if (DATA) renderList();
        },
        open(ti, ei) {
          if (DATA) renderDetail(ti, ei);
        },
        setData,
        dispose() {
          window.removeEventListener('keydown', onKey);
        },
      };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 页三 · 星云（原件搬过来：参数 / 配色 / 物理一个都没改，只换数据来源与容器）
    // ══════════════════════════════════════════════════════════════════════════
    function hash01(str, salt) {
      const s = salt ? salt + '\u0000' + String(str) : String(str);
      let x = 2166136261 >>> 0;
      for (let i = 0; i < s.length; i += 1) {
        x ^= s.charCodeAt(i);
        x = Math.imul(x, 16777619) >>> 0;
      }
      x ^= x >>> 15;
      x = Math.imul(x, 2246822507) >>> 0;
      x ^= x >>> 13;
      x = Math.imul(x, 3266489909) >>> 0;
      x ^= x >>> 16;
      return (x >>> 0) / 4294967296;
    }

    // ══ 位置的标准：内容 ══
    const DIM = 192;
    const CLUSTERS = 26;

    const PROJ = [0, 1, 2].map((axis) => {
      const v = new Float32Array(DIM);
      for (let i = 0; i < DIM; i += 1) v[i] = hash01('proj' + axis + ':' + i, 'axis') * 2 - 1;
      return v;
    });

    function wordIndex(word) {
      return Math.floor(hash01(word, 'dim') * DIM) % DIM;
    }

    function projectScore(n, ctx) {
      const vec = ctx.vec;
      for (let i = 0; i < DIM; i += 1) vec[i] = 0;
      let used = 0;
      for (const w of n.keywords || []) {
        vec[wordIndex(w)] += ctx.idf.get(w) || 1;
        used += 1;
      }
      if (n.mood && n.mood !== '平') {
        vec[wordIndex('mood:' + n.mood)] += 1.2;
        used += 1;
      }
      if (!used) vec[wordIndex('id:' + n.id)] += 0.6;
      let x = 0;
      let y = 0;
      let z = 0;
      for (let i = 0; i < DIM; i += 1) {
        const v = vec[i];
        if (!v) continue;
        x += v * PROJ[0][i];
        y += v * PROJ[1][i];
        z += v * PROJ[2][i];
      }
      return [x, y, z];
    }

    // 简单的 k-means：把「讲同一件事」的点分到一组
    function kmeans(pts, k, iters) {
      const n = pts.length;
      const centers = [];
      for (let i = 0; i < k; i += 1) {
        const pick = pts[Math.floor(((i + 0.5) * n) / k)];
        centers.push([pick.x, pick.y, pick.z]);
      }
      const assign = new Int32Array(n);
      for (let it = 0; it < iters; it += 1) {
        let moved = 0;
        for (let i = 0; i < n; i += 1) {
          const p = pts[i];
          let best = 0;
          let bestD = Infinity;
          for (let c = 0; c < k; c += 1) {
            const dx = p.x - centers[c][0];
            const dy = p.y - centers[c][1];
            const dz = p.z - centers[c][2];
            const d = dx * dx + dy * dy + dz * dz;
            if (d < bestD) {
              bestD = d;
              best = c;
            }
          }
          if (assign[i] !== best) {
            assign[i] = best;
            moved += 1;
          }
        }
        const sums = [];
        for (let c = 0; c < k; c += 1) sums.push([0, 0, 0, 0]);
        for (let i = 0; i < n; i += 1) {
          const p = pts[i];
          const a = assign[i];
          sums[a][0] += p.x;
          sums[a][1] += p.y;
          sums[a][2] += p.z;
          sums[a][3] += 1;
        }
        for (let c = 0; c < k; c += 1) {
          if (sums[c][3] > 0) {
            centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
          }
        }
        if (!moved) break;
      }
      return { assign: assign, centers: centers };
    }

    function layoutByContent(nodes) {
      // ① 词频 → idf
      const freq = new Map();
      for (const n of nodes) for (const w of n.keywords || []) freq.set(w, (freq.get(w) || 0) + 1);
      const N = Math.max(1, nodes.length);
      const idf = new Map();
      for (const [w, c] of freq) idf.set(w, 1 + Math.log(N / (1 + c)));

      // ② 时间范围（只决定冷暖）
      let minT = Infinity;
      let maxT = -Infinity;
      for (const n of nodes) {
        const t = Date.parse(n.at || n.day || '') || 0;
        if (t > 0) {
          if (t < minT) minT = t;
          if (t > maxT) maxT = t;
        }
      }
      if (!Number.isFinite(minT)) {
        minT = 0;
        maxT = 1;
      }

      const ctx = { idf: idf, vec: new Float32Array(DIM) };
      const pts = [];
      for (const n of nodes) {
        const s = projectScore(n, ctx);
        const t = Date.parse(n.at || n.day || '') || minT;
        pts.push({
          x: s[0] + (hash01(n.id, 'jx') - 0.5) * 0.1,
          y: s[1] + (hash01(n.id, 'jy') - 0.5) * 0.1,
          z: s[2] + (hash01(n.id, 'jz') - 0.5) * 0.1,
          age: maxT > minT ? (maxT - t) / (maxT - minT) : 0,
          weight: n.weight || 3,
          idx: pts.length,
          id: n.id,
          text: n.text || '',
          day: n.day || '',
          mood: n.mood || '平',
          keywords: n.keywords || [],
          origin: n.origin || '',
        });
      }

      // ③ 找团
      const km = kmeans(pts, Math.min(CLUSTERS, Math.max(4, Math.floor(pts.length / 40))), 9);
      const groups = new Map();
      for (let i = 0; i < pts.length; i += 1) {
        const a = km.assign[i];
        if (!groups.has(a)) groups.set(a, []);
        groups.get(a).push(pts[i]);
      }

      const tokens = [];

      // ④ 就地往自己那一团收一收
      const list = [...groups.entries()].map(([a, arr]) => ({ a: a, arr: arr })).sort((p, q) => q.arr.length - p.arr.length);
      const out = [];
      let maxBin = 1;
      const PULL = 0.16;
      for (const g of list) {
        const cen = km.centers[g.a];
        for (const it of g.arr) {
          it.ring = 0;
          it.cluster = g.a;
          it.x = it.x * (1 - PULL) + cen[0] * PULL;
          it.y = it.y * (1 - PULL) + cen[1] * PULL;
          it.z = it.z * (1 - PULL) + cen[2] * PULL;
          out.push(it);
        }
        if (g.arr.length > maxBin) maxBin = g.arr.length;
      }

      // 归一化到 1
      let maxR2 = 1e-6;
      for (const it of out) {
        const r = Math.hypot(it.x, it.y, it.z);
        if (r > maxR2) maxR2 = r;
      }
      const k2 = 1 / maxR2;
      for (const it of out) {
        it.x *= k2;
        it.y *= k2;
        it.z *= k2;
        it.x += (hash01(it.id, 'jx') - 0.5) * 0.02;
        it.y += (hash01(it.id, 'jy') - 0.5) * 0.02;
        it.z += (hash01(it.id, 'jz') - 0.5) * 0.02;
      }

      // ⑤ 密度
      const CELL = 0.05;
      const bins = new Map();
      const key = (p) => Math.floor(p.x / CELL) + ',' + Math.floor(p.y / CELL) + ',' + Math.floor(p.z / CELL);
      for (const p of out) bins.set(key(p), (bins.get(key(p)) || 0) + 1);
      let maxCell = 1;
      for (const c of bins.values()) if (c > maxCell) maxCell = c;
      for (const p of out) p.density = bins.get(key(p)) || 1;

      // ⑥ 联系：两条记忆共享一个「不常见」的词，就在它们之间拉一根线
      const wordMap = new Map();
      for (let i = 0; i < out.length; i += 1) {
        for (const w of out[i].keywords || []) {
          if (!wordMap.has(w)) wordMap.set(w, []);
          wordMap.get(w).push(i);
        }
      }
      const pairW = new Map();
      let pairCap = 300000;
      for (const arr of wordMap.values()) {
        if (arr.length < 2 || arr.length > 40) continue;
        for (let a = 0; a < arr.length && pairCap > 0; a += 1) {
          for (let b = a + 1; b < arr.length && pairCap > 0; b += 1) {
            const kk = arr[a] * 20000 + arr[b];
            pairW.set(kk, (pairW.get(kk) || 0) + 1);
            pairCap -= 1;
          }
        }
      }
      const links = [...pairW.entries()]
        .sort((x, y) => y[1] - x[1])
        .slice(0, 14000)
        .map(([kk, w]) => [Math.floor(kk / 20000), kk % 20000, w]);

      // ⑦ 团与团之间也有联系
      const cenOf = new Map();
      for (const p of out) {
        const a = km.assign[p.idx];
        if (!cenOf.has(a)) cenOf.set(a, [0, 0, 0, 0]);
        const c = cenOf.get(a);
        c[0] += p.x;
        c[1] += p.y;
        c[2] += p.z;
        c[3] += 1;
      }
      for (const c of cenOf.values()) {
        if (c[3]) {
          c[0] /= c[3];
          c[1] /= c[3];
          c[2] /= c[3];
        }
      }

      const wordClusters = new Map();
      for (let i = 0; i < pts.length; i += 1) {
        const a = km.assign[i];
        for (const w of pts[i].keywords || []) {
          if (!wordClusters.has(w)) wordClusters.set(w, new Set());
          wordClusters.get(w).add(a);
        }
      }
      const bridgePairs = new Map();
      for (const set of wordClusters.values()) {
        const arr = [...set];
        if (arr.length < 2 || arr.length > 7) continue;
        arr.sort((x, y) => x - y);
        let made = 0;
        for (let i = 0; i < arr.length && made < 8; i += 1) {
          for (let j = i + 1; j < arr.length && made < 8; j += 1) {
            const kk = arr[i] * 1000 + arr[j];
            bridgePairs.set(kk, (bridgePairs.get(kk) || 0) + 1);
            made += 1;
          }
        }
      }
      const bridges = [...bridgePairs.entries()]
        .sort((x, y) => y[1] - x[1])
        .slice(0, 70)
        .map(([kk, w]) => {
          const a = cenOf.get(Math.floor(kk / 1000));
          const b = cenOf.get(kk % 1000);
          return a && b ? [a[0], a[1], a[2], b[0], b[1], b[2], w] : null;
        })
        .filter(Boolean);

      return { pts: out, tokens: tokens, links: links, bridges: bridges, groups: list.length, maxBin: maxBin, maxCell: maxCell, centers: cenOf, wordClusters: wordClusters };
    }

    /** 一句话 → 原件吃的那颗点（七情→mood，s→weight，归属+双字词→keywords） */
    function keywordsOf(w) {
      const ks = [];
      if (w.ev) ks.push('事\u0001' + w.ev);
      if (w.nd) ks.push('版\u0001' + w.nd);
      if (w.st) ks.push('段\u0001' + w.st);
      const t = String(w.text || '').slice(0, 48);
      const re = /[\u4e00-\u9fa5]+/g;
      let m;
      const seen = {};
      let n = 0;
      while ((m = re.exec(t)) && n < 5) {
        const s = m[0];
        for (let i = 0; i + 1 < s.length && n < 5; i += 1) {
          const b = s.substr(i, 2);
          if (seen[b]) continue;
          seen[b] = 1;
          ks.push(b);
          n += 1;
        }
      }
      return ks;
    }

    function toNodes(words) {
      const out = new Array(words.length);
      for (let i = 0; i < words.length; i += 1) {
        const w = words[i];
        out[i] = {
          id: w.id,
          at: w.at,
          day: String(w.at || '').slice(0, 16),
          text: w.text || '',
          emotion: w.emo || [],
          mood: w.emo && w.emo.length ? w.emo[0] : '平',
          importance: w.s == null ? 3 : w.s,
          weight: w.s == null ? 3 : w.s,
          keywords: keywordsOf(w),
        };
      }
      return out;
    }

    function initNeb({ pane }) {
      const canvas = pane.querySelector('#c');
      const g = canvas.getContext('2d');
      const hud = pane.querySelector('#hud');
      const tip = pane.querySelector('#ntip');

      let W = 1;
      let H = 1;
      let DPR = 1;
      const rect = { left: 0, top: 0 };
      function syncRect() {
        const r = canvas.getBoundingClientRect();
        rect.left = r.left;
        rect.top = r.top;
      }
      function resize() {
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        W = pane.clientWidth || 1;
        H = pane.clientHeight || 1;
        canvas.width = Math.round(W * DPR);
        canvas.height = Math.round(H * DPR);
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        g.setTransform(DPR, 0, 0, DPR, 0, 0);
        syncRect();
      }
      resize();

      let data = null;
      let yaw = 0.42;
      let pitch = 0.62;
      let zoom = 1;
      let spin = false;
      let dragging = null;
      let hover = null;
      const mouse = { x: -1, y: -1, inside: false };
      let clock = 0;
      let lastNow = 0;
      let frozen = false;
      let booted = false;
      let active = false;
      let running = false;
      let pendingWords = null;
      let nebDebug = null;

      const FOCAL = 2.6;
      const CAM_DIST = 3.2;

      function onEnter() {
        frozen = true;
        syncRect();
      }
      function onLeave() {
        frozen = false;
        hover = null;
        tip.style.display = 'none';
      }
      function onDown(e) {
        dragging = { x: e.clientX, y: e.clientY };
        spin = false;
      }
      function onUp() {
        dragging = null;
      }
      function onMove(e) {
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
        mouse.inside = true;
        if (!dragging) return;
        yaw += (e.clientX - dragging.x) * 0.008;
        pitch = Math.max(-1.2, Math.min(1.2, pitch + (e.clientY - dragging.y) * 0.006));
        dragging = { x: e.clientX, y: e.clientY };
      }
      function onWinLeave() {
        mouse.inside = false;
        hover = null;
        tip.style.display = 'none';
      }
      function onWheel(e) {
        e.preventDefault();
        zoom = Math.max(0.35, Math.min(60, zoom * (e.deltaY > 0 ? 0.92 : 1.1)));
      }
      function onDbl() {
        spin = !spin;
      }
      canvas.addEventListener('pointerenter', onEnter);
      canvas.addEventListener('pointerleave', onLeave);
      canvas.addEventListener('pointerdown', onDown);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerleave', onWinLeave);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      canvas.addEventListener('dblclick', onDbl);

      let ro = null;
      if (typeof ResizeObserver === 'function') {
        ro = new ResizeObserver(() => resize());
        ro.observe(pane);
      } else {
        window.addEventListener('resize', resize);
      }

      function pickHover() {
        if (!data || !mouse.inside) {
          hover = null;
          tip.style.display = 'none';
          return;
        }
        let best = null;
        let bestD = 100;
        for (const p of data.pts) {
          if (p._sx === undefined) continue;
          const dx = p._sx - mouse.x;
          const dy = p._sy - mouse.y;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
        hover = best;
        if (!best) {
          tip.style.display = 'none';
          return;
        }
        tip.style.display = 'block';
        tip.innerHTML =
          (best.text || '（这一颗没有正文）') +
          '<div class="meta">' + (best.day || '') + ' · ' + (best.mood || '') + ' · 权重 ' + best.weight +
          ' · 这一块 ' + best.density + ' 条</div>';
        const px = Math.min(mouse.x + 16, W - 320);
        const py = Math.min(mouse.y + 16, H - 90);
        tip.style.left = px + 'px';
        tip.style.top = py + 'px';
      }

      function paint(now) {
        if (!active) {
          running = false;
          return;
        }
        const dt = lastNow ? Math.min(0.06, (now - lastNow) / 1000) : 0;
        lastNow = now;
        if (!frozen) clock += dt;
        const t = clock;
        if (spin && !dragging && !frozen) yaw += 0.0009;

        g.setTransform(DPR, 0, 0, DPR, 0, 0);
        g.globalCompositeOperation = 'source-over';
        const bg = g.createRadialGradient(W * 0.5, H * 0.46, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
        bg.addColorStop(0, '#0a1228');
        bg.addColorStop(0.55, '#05070f');
        bg.addColorStop(1, '#02030a');
        g.fillStyle = bg;
        g.fillRect(0, 0, W, H);

        if (!data) {
          requestAnimationFrame(paint);
          return;
        }

        const cy = Math.cos(yaw);
        const sy = Math.sin(yaw);
        const cp = Math.cos(pitch);
        const sp = Math.sin(pitch);
        const cx = W * 0.5;
        const cyy = H * 0.5;
        const unit = Math.min(W, H) * 0.58 * zoom;
        const pxK = Math.max(0.4, Math.min(1.6, unit / 560));
        const near = Math.min(2.2, Math.max(1, Math.sqrt(zoom)));
        const lineFade = Math.max(0.07, 1 / (1 + Math.max(0, zoom - 1) * 0.55));
        const logMax = Math.log(1 + data.maxCell);

        g.globalCompositeOperation = 'lighter';

        for (const p of data.pts) {
          const wob = 0.004 * Math.sin(t * 0.5 + p.age * 9 + p.x * 5);
          const x0 = p.x + wob;
          const y0 = p.y + wob * 0.7;
          const z0 = p.z + wob * 0.5;

          const x1 = x0 * cy + z0 * sy;
          const z1 = -x0 * sy + z0 * cy;
          const y1 = y0 * cp - z1 * sp;
          const z2 = y0 * sp + z1 * cp;
          const d = z2 + CAM_DIST;
          if (d < 0.3) {
            p._sx = undefined;
            continue;
          }
          const k = FOCAL / d;
          const sx = cx + x1 * k * unit;
          const sy2 = cyy - y1 * k * unit;
          if (sx < -40 || sx > W + 40 || sy2 < -40 || sy2 > H + 40) {
            p._sx = undefined;
            continue;
          }
          p._sx = sx;
          p._sy = sy2;

          const dens = Math.log(1 + p.density) / logMax;
          const depthFade = Math.max(0.25, Math.min(1, 2.4 / d));
          const breathe = 0.9 + 0.1 * Math.sin(t * 1.1 + p.age * 12 + p.z * 6);

          const heat = Math.max(0, Math.min(1, 1 - p.age));
          const hue = Math.round((p.cluster || 0) * 137.508) % 360;
          const isTok = p.ring >= 2;
          const a = isTok
            ? Math.min(1, 0.88 * depthFade)
            : Math.min(0.95, (0.8 / Math.sqrt(1 + p.density * 0.55)) * (0.55 + 0.45 * heat) * depthFade * breathe);

          const size = Math.max(
            0.6,
            (isTok ? 2.4 + p.ring * 2.0 : Math.max(0.7, Math.min(2.0, 0.95 + dens * 0.7))) *
              Math.min(1.5, Math.max(0.7, k / 0.9)) * pxK * near,
          );
          const lit = 30 + 18 * heat;
          g.fillStyle = 'hsla(' + hue + ', 96%, ' + lit.toFixed(1) + '%, ' + a.toFixed(3) + ')';
          if (size >= 2.2) {
            g.beginPath();
            g.arc(sx, sy2, size * 0.5, 0, 6.28318);
            g.fill();
            const gl = g.createRadialGradient(sx, sy2, 0, sx, sy2, size * 2.6);
            gl.addColorStop(0, 'hsla(' + hue + ', 96%, ' + Math.min(88, lit + 18).toFixed(1) + '%, ' + (a * 0.26).toFixed(3) + ')');
            gl.addColorStop(1, 'hsla(' + hue + ', 96%, 50%, 0)');
            g.fillStyle = gl;
            g.beginPath();
            g.arc(sx, sy2, size * 2.6, 0, 6.28318);
            g.fill();
          } else {
            g.fillRect(sx - size * 0.5, sy2 - size * 0.5, size, size);
          }
        }

        // 旋臂：共享关键词的两条记忆之间一根淡线
        if (data.links && data.links.length) {
          g.lineWidth = Math.max(0.3, 0.55 * pxK);
          for (let li = 0; li < data.links.length; li += 1) {
            const lk = data.links[li];
            const A = data.pts[lk[0]];
            const B = data.pts[lk[1]];
            if (!A || !B || A._sx === undefined || B._sx === undefined) continue;
            const wx = A.x - B.x;
            const wy = A.y - B.y;
            const wz = A.z - B.z;
            if (wx * wx + wy * wy + wz * wz > 0.3) continue;
            const w = Math.min(3, lk[2]);
            const hA = Math.round((A.cluster || 0) * 137.508) % 360;
            const hB = Math.round((B.cluster || 0) * 137.508) % 360;
            const dh = (((hB - hA) % 360) + 540) % 360 - 180;
            const hue = Math.round((((hA + dh * 0.5) % 360) + 360) % 360);
            const la = ((0.03 + 0.022 * w) * lineFade).toFixed(3);
            g.strokeStyle = 'hsla(' + hue + ', 30%, 56%, ' + la + ')';
            const vx = B._sx - A._sx;
            const vy = B._sy - A._sy;
            const vlen = Math.hypot(vx, vy) || 1;
            const bend = ((((lk[0] * 7919 + lk[1] * 104729) % 1000) / 1000) - 0.5) * vlen * 1.1;
            const mcx = (A._sx + B._sx) / 2 - (vy / vlen) * bend;
            const mcy = (A._sy + B._sy) / 2 + (vx / vlen) * bend;
            g.beginPath();
            g.moveTo(A._sx, A._sy);
            g.quadraticCurveTo(mcx, mcy, B._sx, B._sy);
            g.stroke();
          }
        }

        // 悬停的那颗：套一圈亮环
        if (hover && hover._sx !== undefined) {
          g.globalCompositeOperation = 'source-over';
          g.strokeStyle = 'rgba(255, 255, 255, .85)';
          g.lineWidth = 1.2;
          g.beginPath();
          g.arc(hover._sx, hover._sy, Math.max(4, 6.5 * pxK), 0, Math.PI * 2);
          g.stroke();
          g.globalCompositeOperation = 'lighter';
        }

        const halo = g.createRadialGradient(cx, cyy, unit * 0.05, cx, cyy, unit * 1.05);
        halo.addColorStop(0, 'rgba(70, 120, 230, 0.07)');
        halo.addColorStop(0.6, 'rgba(45, 78, 170, 0.03)');
        halo.addColorStop(1, 'rgba(14, 28, 64, 0)');
        g.fillStyle = halo;
        g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'source-over';

        pickHover();
        requestAnimationFrame(paint);
      }

      function start() {
        if (running) return;
        running = true;
        lastNow = 0;
        requestAnimationFrame(paint);
      }

      function boot() {
        const words = pendingWords;
        if (!words || !words.length) {
          hud.innerHTML = '还没读到话';
          return;
        }
        hud.innerHTML = '正在把 ' + words.length.toLocaleString('en-US') + ' 句话铺开…';
        setTimeout(() => {
          const t0 = performance.now();
          data = layoutByContent(toNodes(words));
          const t1 = performance.now();
          resize();
          // 顶部那行小字：点数 · 一句一点 · 团数（真数，不写死）
          const ns = pane.querySelector('#neb-ns');
          if (ns) {
            ns.innerHTML =
              '<b>' + fmtNum(words.length) + '</b> 点 · 一句一点 · 你自己凑成 <b>' +
              data.groups + '</b> 团';
          }
          hud.innerHTML =
            '最大一团 <b>' + data.maxBin + '</b> 条 · 最挤的一小块 <b>' + data.maxCell + '</b> 条';
          nebDebug = { ms: Math.round(t1 - t0), pts: data.pts.length, links: data.links.length };
          for (const q of data.pts) seenIds.add(String(q.id));
          if (data.pts.length) lastAt = data.pts.reduce((m, q) => (q.day > m ? q.day : m), "");
          start();
        }, 30);
      }

            // ── 新话自动落点：每 2 秒问一次有没有新的，有就往上落一颗（不用刷新） ──
      let lastAt = "";
      const seenIds = new Set();
      let pollTimer = null;
      function pollTick() {
        if (!data) return;
        let since = lastAt;
        if (!since && pendingWords && pendingWords.length) {
          since = pendingWords.reduce((m, w) => (w.at > m ? w.at : m), "");
        }
        if (!since) return;
        fetch("/mindsea/api/words?since=" + encodeURIComponent(since) + "&limit=50")
          .then((r) => r.json())
          .then((j) => {
            const ws = (j && j.words) || [];
            let added = 0;
            for (const w of ws) {
              if (!w || w.id == null) continue;
              const key = String(w.id);
              if (seenIds.has(key)) continue;
              seenIds.add(key);
              if (w.at > lastAt) lastAt = w.at;
              if (addPoint(w)) added += 1;
            }
            if (added) start();
          })
          .catch(() => {});
      }

      /** 开始轮询（幂等） */
      function startPoll() {
        if (pollTimer) return;
        pollTick();
        pollTimer = setInterval(pollTick, 2000);
      }
      /**
       * 新话自动落点：抽词 → 找关键词最匹配的那一团 → 落在团心旁边。
       * 不重排（重排要 8,335 点全算一遍），只往 data.pts 里追加一颗。
       */
      function addPoint(word) {
        if (!data || !data.centers) return false;
        const kws = keywordsOf(word);
        const score = new Map();
        for (const k of kws) {
          const set = data.wordClusters.get(k);
          if (set) for (const a of set) score.set(a, (score.get(a) || 0) + 1);
        }
        let bestA = null;
        let bestS = 0;
        for (const [a, sc] of score) if (sc > bestS) { bestS = sc; bestA = a; }
        let cen;
        if (bestA !== null) cen = data.centers.get(bestA);
        else { const arr = [...data.centers.values()]; cen = arr[0] || [0, 0, 0]; bestA = 0; }
        const jj = () => (Math.random() - 0.5) * 0.07;
        data.pts.push({
          x: cen[0] + jj(), y: cen[1] + jj(), z: cen[2] + jj(),
          age: 0, weight: word.s == null ? 3 : word.s,
          idx: data.pts.length, id: word.id, text: word.text || "",
          day: word.at || "", mood: word.emo && word.emo.length ? word.emo[0] : "平",
          keywords: kws, origin: "", cluster: bestA, ring: 0, density: 1,
          born: performance.now(),
        });
        return true;
      }

      return {
        addPoint,
        startPoll,
        setWords(words) {
          pendingWords = words;
          // 之前这里只在「没铺过」时铺；一旦打开时话还没到、先铺了个空的，
          // 话到了也不会再铺 → 页面永远停在「还没读到话」。改成：没铺出点就重铺。
          if (booted && (!data || !data.pts || !data.pts.length)) boot();
        },
        show() {
          active = true;
          resize();
          startPoll();  // 一打开就开始盯新话
          if (!booted) {
            booted = true;
            boot();
          } else if (!data || !data.pts || !data.pts.length) {
            boot();     // 以前这里是 else if (data) start() —— 数据为空就再也不重铺
          } else {
            start();
          }
        },
        hide() {
          active = false;
        },
        stats() {
          return {
            active: active,
            booted: booted,
            pts: data ? data.pts.length : 0,
            groups: data ? data.groups : 0,
            links: data ? data.links.length : 0,
            w: W,
            h: H,
            zoom: zoom,
            debug: nebDebug,
          };
        },
        dispose() {
          active = false;
          if (ro) ro.disconnect();
          else window.removeEventListener('resize', resize);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerleave', onWinLeave);
        },
      };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 后六页
    // ══════════════════════════════════════════════════════════════════════════
    function paneMsg(pane, text) {
      pane.innerHTML = '<div class="sx-empty">' + esc(text) + '</div>';
    }

    /** 页签四 · 人设：五份 md 分节看；只有「我对用户的看法」这一节从识海里读最新的 */
    const VIEW_EVENT = '我对用户的看法';
    function initPersona({ pane }) {
      let loaded = false;

      /** 那一节在 md 里的位置：标题行之后 → 下一个 ## 之前 */
      function viewSection(text) {
        const head = '## ' + VIEW_EVENT;
        const i = String(text || '').indexOf(head);
        if (i < 0) return null;
        const bodyStart = i + head.length;
        const j = String(text).indexOf('\n## ', bodyStart);
        return {
          before: String(text).slice(0, bodyStart),
          fallback: String(text).slice(bodyStart, j < 0 ? String(text).length : j),
          after: j < 0 ? '' : String(text).slice(j),
        };
      }

      /** 库里那件事的话：时间 + 原话，最新的在最上面 */
      function viewHtml(j) {
        const words = j && j.ok && Array.isArray(j.words) ? j.words : [];
        if (!words.length) return '';
        let html =
          '<div class="sx-viewnote">识海那件事「' + esc(VIEW_EVENT) + '」· ' + words.length +
          ' 条 · 会变，老的留着（最新在上）</div><div class="sx-viewlist">';
        words.forEach((w) => {
          html +=
            '<div class="sx-line"><div class="w">' + esc(String(w.at || '').slice(0, 16)) + '</div>' +
            '<div class="r">' + emoDots(w) + '</div>' +
            '<div class="c">' + esc(w.text) + '</div></div>';
        });
        return html + '</div>';
      }

      /** 把「以前被写成谁 / 后来删了什么」这类历史注脚剔出去：默认不摆，折叠里还留着 */
      function stripHistory(key, text) {
        const lines = String(text || '').split(/\r?\n/);
        const keep = [];
        const dropped = [];
        let skipping = false;
        for (const line of lines) {
          const t = line.trim();
          if (key === 'soul') {
            if (!skipping && /^这里原来写着/.test(t)) {
              skipping = true;
              dropped.push(line);
              continue;
            }
            if (skipping) {
              if (/^真有的是/.test(t)) {
                skipping = false;
                keep.push(line);
              } else if (t) {
                dropped.push(line);
              }
              continue;
            }
          } else if (key === 'identity') {
            if (/^##\s+删掉的/.test(t)) {
              skipping = true;
              dropped.push(line);
              continue;
            }
            if (skipping) {
              if (/^##\s/.test(t)) {
                skipping = false;
                keep.push(line);
              } else {
                dropped.push(line);
              }
              continue;
            }
          }
          keep.push(line);
        }
        return { text: keep.join('\n'), cut: dropped.join('\n').trim() };
      }

      /** md 里写死的「N 条记忆」按库里当前条数显示 */
      function liveNums(text, total) {
        if (!total) return text;
        return String(text).replace(/(\d[\d,]*)\s*条记忆/g, fmtNum(total) + ' 条记忆');
      }

      function load() {
        if (loaded) return;
        loaded = true;
        paneMsg(pane, '读人设文件…');
        Promise.all([
          fetchJson('/persona'),
          fetchJson('/event-words?name=' + encodeURIComponent(VIEW_EVENT)).catch(() => null),
          fetchJson('/ping').catch(() => null),
        ])
          .then(([j, vj, pj]) => {
            if (!j.ok) throw new Error(j.error || '读不到');
            const view = viewHtml(vj);
            const latest = vj && vj.ok && vj.words && vj.words.length ? vj.words[0] : null;
            const total = pj && pj.ok && pj.counts ? Number(pj.counts.memories || 0) : 0;
            const cuts = [];
            let html =
              '<div class="sx-pad"><h1 class="sx-h1">人设</h1>' +
              '<div class="sx-sub">' + esc(j.home) + ' · 五份 md，只读' +
              (total ? ' · 库里 ' + fmtNum(total) + ' 条话' : '') +
              (latest ? ' · 「看法」那一节读的是识海里最新的话' : '') + '</div>';
            for (const f of j.files) {
              const meta = f.ok ? f.bytes + ' 字节 · ' + fmtWhen(f.mtime) : '读不到';
              let text = f.ok ? liveNums(f.text, total) : '';
              if (f.ok) {
                const st = stripHistory(f.key, text);
                text = st.text;
                if (st.cut) cuts.push({ title: f.title, text: st.cut });
              }
              let body;
              if (!f.ok) {
                body = '<span style="color:var(--muted)">' + esc(f.path) + ' 读不到</span>';
              } else if (f.key === 'soul') {
                const sec = viewSection(text);
                if (sec && view) {
                  body = mdToHtml(sec.before) + '<div class="sx-view">' + view + '</div>' + mdToHtml(sec.after);
                } else {
                  body = mdToHtml(text); // 库里没这条 → 原文兜底
                }
              } else if (f.key === 'identity' && latest) {
                // 那一行原来是「看法：在识海里……」，改成直接显示最新那句
                body = mdToHtml(
                  String(text).replace(
                    /^-\s*\*\*看法：\*\*.*$/m,
                    '- **看法：** ' + String(latest.text).replace(/\r?\n/g, ' '),
                  ),
                );
              } else {
                body = mdToHtml(text);
              }
              html +=
                '<section class="sx-sec"><div class="sx-sech"><span class="n">' + esc(f.title) + '</span>' +
                '<span style="font-size:12px;color:var(--muted)">' + esc(f.hint) + '</span>' +
                '<span class="m">' + esc(meta) + '</span></div><div class="sx-secb md">' +
                body +
                '</div></section>';
            }
            // 历史注脚：默认收着，想看再点
            if (cuts.length) {
              html +=
                '<section class="sx-sec sx-hist"><div class="sx-sech"><span class="n">历史注脚</span>' +
                '<span style="font-size:12px;color:var(--muted)">以前被写成谁 / 后来删了什么 · 默认不显示</span>' +
                '<span class="m">点一下看</span></div><div class="sx-secb md" hidden>' +
                cuts
                  .map((c) => '<p style="color:var(--muted);font-size:12px;margin:0 0 12px">' + esc(c.title) + '</p>' + mdToHtml(c.text))
                  .join('') +
                '</div></section>';
            }
            html += '</div>';
            pane.innerHTML = html;
            const histHead = pane.querySelector('.sx-hist .sx-sech');
            const histBody = pane.querySelector('.sx-hist .sx-secb');
            if (histHead && histBody) {
              histHead.addEventListener('click', () => {
                histBody.hidden = !histBody.hidden;
                histHead.querySelector('.m').textContent = histBody.hidden ? '点一下看' : '收起';
              });
            }
          })
          .catch((err) => paneMsg(pane, '读不到人设：' + String(err.message || err)));
      }
      return {
        show() {
          load();
        },
        dispose() {},
      };
    }

    /** 页签五 · 时间：左边日期 + 一条细柱（柱高 = 当天条数），右边那天的话 */
    function initTimeline({ pane }) {
      let loaded = false;
      pane.innerHTML =
        '<div class="ms-page"><div id="tl-head">' +
        pageHead('时间', '左边一天一根细柱，柱高就是那天落了多少话') +
        '</div><div class="sx-split2"><div class="sx-side" id="tl-days"></div>' +
        '<div class="sx-body" id="tl-body"></div></div></div>';
      const daysEl = pane.querySelector('#tl-days');
      const bodyEl = pane.querySelector('#tl-body');
      const headEl = pane.querySelector('#tl-head');

      function paintDay(d) {
        daysEl.querySelectorAll('.sx-row').forEach((r) => r.classList.toggle('on', r.dataset.day === d));
        bodyEl.innerHTML = '<div class="sx-empty">读 ' + esc(d) + ' 的话…</div>';
        fetchJson('/day?day=' + encodeURIComponent(d))
          .then((j) => {
            if (!j.ok) throw new Error(j.error || '读不到');
            if (!j.words.length) {
              bodyEl.innerHTML = '<div class="sx-empty">' + esc(d) + ' 这天没有话</div>';
              return;
            }
            let html =
              '<div style="padding:0 24px 12px"><div class="sx-h1" style="font-size:16px">' + esc(d) + '</div>' +
              '<div class="sx-sub">' + j.count + ' 条 · 按时间正序</div></div>';
            for (const w of j.words) {
              const when = String(w.at || '').slice(11, 16);
              html +=
                '<div class="sx-line"><div class="w">' + esc(when) + '</div>' +
                '<div class="r">' + emoDots(w) + '</div>' +
                '<div class="c">' + esc(w.text) + '</div>' +
                '<button class="sx-fix" data-id="' + esc(w.id) + '" title="判错了？改门类或去处">改</button></div>';
            }
            bodyEl.innerHTML = html;
            bodyEl.scrollTop = 0;
            bindFix(d);
          })
          .catch((err) => {
            bodyEl.innerHTML = '<div class="sx-empty">读不到：' + esc(String(err.message || err)) + '</div>';
          });
      }

      /**
       * 「改」：判错的那条话，手动改门类 / 去处。
       * 行底下摊开一排小按钮，点一下就 POST 到 /mindsea/api/memory —— 只动这两列，原文不碰。
       */
      function bindFix(day) {
        bodyEl.querySelectorAll('.sx-fix').forEach((btn) => {
          btn.addEventListener('click', () => {
            const line = btn.closest('.sx-line');
            if (!line) return;
            const oldNext = line.nextElementSibling;
            if (oldNext && oldNext.classList.contains('sx-fixrow')) {
              oldNext.remove();
              return;
            }
            const row = document.createElement('div');
            row.className = 'sx-fixrow';
            // 门类各带自己的颜色（跟卡片墙那套一致），去处也有自己的调子
            const CATS = [
              ['闲聊', '#93a7c4'],
              ['暧昧', '#e8809f'],
              ['干活', '#4fc7a0'],
              ['知识', '#d9b45a'],
              ['规矩', '#b28cff'],
            ];
            const PLACES = [
              ['event', '进事', '#7c6cf0'],
              ['chat', '闲聊', '#93a7c4'],
              ['trash', '废料', '#7d8798'],
            ];
            row.innerHTML =
              '<span class="k">门类</span>' +
              CATS.map(([name, color]) => '<button data-cat="' + name + '" style="--c:' + color + '">' + name + '</button>').join('') +
              '<span class="k">去处</span>' +
              PLACES.map(([key, label, color]) => '<button data-place="' + key + '" style="--c:' + color + '">' + label + '</button>').join('') +
              '<span class="tip">点一下就存</span>';
            line.after(row);
            const id = Number(btn.dataset.id);
            row.querySelectorAll('button[data-cat]').forEach((b) => {
              b.addEventListener('click', () => saveFix(id, { category: b.dataset.cat }, day));
            });
            row.querySelectorAll('button[data-place]').forEach((b) => {
              b.addEventListener('click', () => saveFix(id, { place: b.dataset.place }, day));
            });
          });
        });
      }

      /** 存一下，存完把这天重读一遍 */
      function saveFix(id, patch, day) {
        fetch(API + '/memory', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, ...patch }),
        })
          .then((r) => r.json())
          .then((j) => {
            if (!j.ok) throw new Error(j.error || '没改成');
            paintDay(day);
          })
          .catch((err) => {
            alert('没改成：' + String((err && err.message) || err));
          });
      }

      function load() {
        if (loaded) return;
        loaded = true;
        daysEl.innerHTML = '<div class="sx-empty">读日期…</div>';
        fetchJson('/days?limit=800')
          .then((j) => {
            if (!j.ok) throw new Error(j.error || '读不到');
            if (!j.days.length) {
              daysEl.innerHTML = '<div class="sx-empty">还没有话</div>';
              bodyEl.innerHTML = '<div class="sx-empty">还没有话</div>';
              return;
            }
            let maxN = 1;
            for (const d of j.days) maxN = Math.max(maxN, Number(d.n) || 0);
            let html = '';
            for (const d of j.days) {
              const v = Number(d.n) || 0;
              // 柱高 = 当天条数（最满的那天 21px 封顶，最少也留 5px，别细到看不见）
              const bh = Math.max(5, Math.round((v / maxN) * 21));
              html +=
                '<div class="sx-row pick" data-day="' + esc(d.day) + '">' +
                '<i class="ms-daybar" style="height:' + bh + 'px"></i>' +
                '<span class="sx-day">' + esc(d.day) +
                '</span><span class="sx-cnt">' + fmtNum(v) + '</span></div>';
            }
            daysEl.innerHTML = html;
            if (headEl) {
              headEl.innerHTML = pageHead(
                '时间',
                fmtNum(j.days.length) + ' 天有记录 · 共 ' + fmtNum(j.total || 0) +
                  ' 条话 · 右边那一列一天一根细柱',
              );
            }
            daysEl.querySelectorAll('.sx-row').forEach((r) => {
              r.addEventListener('click', () => paintDay(r.dataset.day));
            });
            paintDay(j.days[0].day);
          })
          .catch((err) => {
            daysEl.innerHTML = '<div class="sx-empty">读不到：' + esc(String(err.message || err)) + '</div>';
          });
      }

      return {
        show() {
          load();
        },
        dispose() {},
      };
    }

    /** 页签六 · 遗忘：细节已清 / 已沉底 */
    function initForget({ pane }) {
      let loaded = false;

      function daysAgo(s) {
        const t = Date.parse(String(s || '').replace(' ', 'T'));
        if (!Number.isFinite(t)) return 9999;
        return Math.max(0, Math.round((Date.now() - t) / 86400000));
      }

      function section(title, sub, items, sunk) {
        if (!items.length) return '';
        let html =
          '<section class="sx-sec"><div class="sx-sech"><span class="n">' + esc(title) + '</span>' +
          '<span style="font-size:12px;color:var(--muted)">' + esc(sub) + '</span>' +
          '<span class="m">' + items.length + ' 件</span></div>';
        for (const it of items) {
          const ago = daysAgo(it.lastMention || it.lastAt);
          const yrs = ago >= 365 ? ' · ' + (ago / 365).toFixed(1) + ' 年没提' : ago > 0 ? ' · ' + ago + ' 天没提' : '';
          html +=
            '<div class="sx-eve">' +
            '<span class="nm">' + esc(it.name) + '</span>' +
            '<span class="mt">' + esc(String(it.lastMention || it.lastAt).slice(0, 10) + yrs) + '</span>' +
            '<span class="tag' + (sunk ? ' sunk' : '') + '">' + (sunk ? '已沉底' : '细节已清') + '</span></div>';
        }
        html += '</section>';
        return html;
      }

      function load() {
        if (loaded) return;
        loaded = true;
        paneMsg(pane, '读事件…');
        fetchJson('/forget')
          .then((j) => {
            if (!j.ok) throw new Error(j.error || '读不到');
            let html =
              '<div class="sx-pad"><h1 class="sx-h1">遗忘</h1>' +
              '<div class="sx-sub">共 ' + fmtNum(j.total) + ' 件事 · 沉底 ' + fmtNum(j.sunken.length) +
              ' 件 · 细节已清 ' + fmtNum(j.cleared.length) + ' 件 · 还完整 ' + fmtNum(j.live) +
              ' 件 · 365 天没提就清细节，730 天沉底（永不真删，日期留着）</div>' +
              leafStrip(j.sunken.concat(j.cleared)) +
              '<div class="sx-note">' + esc(j.note) + '</div>';
            if (!j.sunken.length && !j.cleared.length) {
              html += '<div class="sx-empty">一件事都没被清过，都还完整。</div>';
            }
            html += section('已沉底', 'status = sunken', j.sunken, true);
            html += section('细节已清', 'summary 为空', j.cleared, false);
            html += '</div>';
            pane.innerHTML = html;
          })
          .catch((err) => paneMsg(pane, '读不到：' + String(err.message || err)));
      }

      return {
        show() {
          load();
        },
        dispose() {},
      };
    }

    /** 页签七 · 走神：wanders 表 + 现在算一次（只算不记账） */
    function initWander({ pane }) {
      let loaded = false;
      pane.innerHTML =
        '<div class="ms-page"><div id="wd-head">' +
        pageHead('走神', '每分钟把几个现实的量凑成一个数，能被 541 整除才开口') +
        '</div><div class="ms-scroll" id="wd-main"></div></div>';
      const main = pane.querySelector('#wd-main');
      const headEl = pane.querySelector('#wd-head');

      function paintNow(j) {
        const st = j.state;
        const d = new Date();
        const p = (n) => ('0' + n).slice(-2);
        const now = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
        return (
          '<section class="sx-sec"><div class="sx-sech"><span class="n">现在这一拍</span>' +
          '<span class="m">' + esc(now) + ' 算的</span></div>' +
          '<div class="sx-secb" style="max-height:none">' +
          '<div class="ms-ringrow">' +
          ringSvg(j.value, j.divisor) +
          '<div style="flex:1 1 224px;min-width:0">' +
          '<div class="sx-verdict' + (j.hit ? ' hit' : '') + '" style="margin-top:0">' +
          (j.hit ? '撞上了 · 能被 ' + j.divisor + ' 整除，这一拍该走了' : '没撞上 · 差 ' + j.remain + ' 才到 ' + j.divisor) +
          '</div>' +
          '<div class="sx-kv" style="margin-top:12px">' +
          '<span>当天第 <b>' + st.minutesOfDay + '</b> 分钟</span>' +
          '<span>距上次说话 <b>' + st.sinceSpeakSec + '</b> 秒</span>' +
          '<span>今天落了 <b>' + st.todayCount + '</b> 条</span>' +
          '<span>距上次走神 <b>' + st.sinceWanderMin + '</b> 分钟</span>' +
          '<span>星期 <b>' + st.weekday + '</b></span>' +
          '</div>' +
          '<div style="margin-top:16px"><button class="sx-btn" id="wd-again">现在再算一次</button></div>' +
          '</div></div>' +
          '<div class="sx-sub" style="margin:16px 0 0">' + esc(j.note) + '</div>' +
          '</div></section>'
        );
      }

      function paintHistory(j) {
        if (!j.rows.length) {
          return (
            '<section class="sx-sec"><div class="sx-sech"><span class="n">走神记录</span>' +
            '<span class="m">wanders · 0 行</span></div>' +
            '<div class="sx-empty">还没走过神。真撞上以后由 heartbeat 记账，这一页只负责看。</div></section>'
          );
        }
        let html =
          '<section class="sx-sec"><div class="sx-sech"><span class="n">走神记录</span>' +
          '<span class="m">一共 ' + j.total + ' 次</span></div>';
        for (const r of j.rows) {
          html +=
            '<div class="sx-eve"><span class="nm">' + esc(r.startTag || '（没说）') + '</span>' +
            '<span class="mt">' + esc(r.at) + '</span>' +
            '<span class="tag">' + (r.spoke ? '说了' : '没说') + '</span></div>';
        }
        html += '</section>';
        return html;
      }

      function bindAgain() {
        const b = main.querySelector('#wd-again');
        if (b) b.addEventListener('click', again);
      }
      function again() {
        fetchJson('/wander/now')
          .then((j) => {
            const box = main.querySelector('#wd-nowbox');
            if (box && j.ok) box.innerHTML = paintNow(j);
            bindAgain();
          })
          .catch(() => {});
      }

      function load() {
        if (loaded) return;
        loaded = true;
        main.innerHTML = '<div class="sx-empty">读走神…</div>';
        Promise.all([fetchJson('/wander/now'), fetchJson('/wanders')])
          .then((results) => {
            const now = results[0];
            const list = results[1];
            if (!now.ok) throw new Error(now.error || '算不出来');
            if (headEl) {
              headEl.innerHTML = pageHead(
                '走神',
                '一共 <b>' + fmtNum(list.total || 0) + '</b> 次 · 每分钟把几个现实的量凑成一个数，能被 <b>' +
                  now.divisor + '</b> 整除才开口',
              );
            }
            main.innerHTML =
              '<div class="sx-pad"><div id="wd-nowbox">' + paintNow(now) + '</div>' +
              paintHistory(list) + '</div>';
            bindAgain();
          })
          .catch((err) => paneMsg(main, '读不到：' + String(err.message || err)));
      }

      return {
        show() {
          load();
        },
        dispose() {},
      };
    }

    /** 页签八 · 日记：memory/YYYY-MM-DD.md */
    function initDiary({ pane }) {
      let loaded = false;
      pane.innerHTML =
        '<div class="ms-page"><div id="dy-head">' +
        pageHead('日记', 'memory/YYYY-MM-DD.md · 左边挑一天，右边那份正文') +
        '</div><div class="sx-split2"><div class="sx-side" id="dy-days"></div>' +
        '<div class="sx-body" id="dy-body"></div></div></div>';
      const daysEl = pane.querySelector('#dy-days');
      const bodyEl = pane.querySelector('#dy-body');
      const headEl = pane.querySelector('#dy-head');

      function open(day) {
        daysEl.querySelectorAll('.sx-row').forEach((r) => r.classList.toggle('on', r.dataset.day === day));
        bodyEl.innerHTML = '<div class="sx-empty">读 ' + esc(day) + ' 的日记…</div>';
        fetchJson('/diary?day=' + encodeURIComponent(day))
          .then((j) => {
            if (!j.ok) {
              bodyEl.innerHTML = '<div class="sx-empty">' + esc(j.error || '读不到') + '</div>';
              return;
            }
            bodyEl.innerHTML =
              '<div class="sx-pad" style="max-width:none"><div class="sx-h1">' + esc(day) + '</div>' +
              '<div class="sx-sub">memory/' + esc(day) + '.md · ' + j.bytes + ' 字节 · ' +
              esc(fmtWhen(j.mtime)) + '</div>' +
              '<section class="sx-sec"><div class="sx-secb md" style="max-height:none">' + mdToHtml(j.text) +
              '</div></section></div>';
            bodyEl.scrollTop = 0;
          })
          .catch((err) => {
            bodyEl.innerHTML = '<div class="sx-empty">读不到：' + esc(String(err.message || err)) + '</div>';
          });
      }

      function load() {
        if (loaded) return;
        loaded = true;
        daysEl.innerHTML = '<div class="sx-empty">读日记…</div>';
        fetchJson('/diary/list')
          .then((j) => {
            if (!j.ok) throw new Error(j.error || '读不到');
            if (!j.days.length) {
              daysEl.innerHTML = '<div class="sx-empty">还没有日记</div>';
              bodyEl.innerHTML = '<div class="sx-empty">还没有日记</div>';
              return;
            }
            let html = '';
            for (const d of j.days) {
              html +=
                '<div class="sx-row pick" data-day="' + esc(d.day) + '"><span class="sx-day">' + esc(d.day) +
                '</span><span class="sx-cnt">' + (d.bytes > 1024 ? Math.round(d.bytes / 1024) + 'k' : d.bytes) +
                '</span></div>';
            }
            daysEl.innerHTML = html;
            let totalBytes = 0;
            for (const d of j.days) totalBytes += Number(d.bytes) || 0;
            if (headEl) {
              headEl.innerHTML = pageHead(
                '日记',
                '<b>' + fmtNum(j.days.length) + '</b> 篇 · 合计 <b>' +
                  fmtNum(Math.round(totalBytes / 1024)) + '</b> KB · 左边挑一天，右边那份正文',
              );
            }
            daysEl.querySelectorAll('.sx-row').forEach((r) => {
              r.addEventListener('click', () => open(r.dataset.day));
            });
            open(j.days[0].day);
          })
          .catch((err) => {
            daysEl.innerHTML = '<div class="sx-empty">读不到：' + esc(String(err.message || err)) + '</div>';
          });
      }

      return {
        show() {
          load();
        },
        dispose() {},
      };
    }

    /**
     * 页签九 · 自动化：自动沉淀的运行状况 + 「散着的几摊东西」文件清单
     *
     * 2026-10-23：自动沉淀钩子接上之后，这一页从「只看文件在不在」升级成
     * 先看它自己干了什么 —— 开着没、今天沉了几条、哪一轮跳过 / 失败、哪些事在长；
     * 下面仍旧接原来那份文件清单，一个字没删。
     */
    function initAuto({ pane }) {
      /** 日志级别 → 一条的调子（ok / partial / skip / fail） */
      function describe(entry) {
        const level = String((entry && entry.level) || '');
        const at = String((entry && entry.at) || '').slice(5, 16);
        if (level === 'ok' || level === 'partial') {
          const parts = ['沉了 ' + fmtNum(Number(entry.written) || 0) + ' 条'];
          const events = (entry.created && entry.created.events) || [];
          if (events.length) parts.push('新开 ' + events.join(' / '));
          if (Number(entry.lines) > 0) parts.push(entry.lines + ' 句 / ' + fmtNum(Number(entry.chars) || 0) + ' 字');
          if (Number(entry.dropped) > 0) parts.push('丢了 ' + entry.dropped + ' 句');
          return { at, text: parts.join(' · '), level };
        }
        if (level === 'skip') return { at, text: '跳过：' + (entry.reason || '没什么可记的'), level };
        if (level === 'fail') return { at, text: '失败：' + (entry.reason || '不知道为啥'), level };
        return { at, text: String(entry.reason || level || ''), level };
      }

      /** 文件清单那半：只看文件在不在 */
      function renderFiles(j) {
        if (!j.ok) return '<div class="sx-empty">读不到文件清单：' + esc(j.error || '') + '</div>';
        let inAll = 0;
        let inOk = 0;
        for (const it of j.items) {
          inAll += it.targets.length;
          inOk += it.targets.filter((t) => t.ok).length;
        }
        let html =
          '<section class="sx-sec"><div class="sx-sech"><span class="n">散着的几摊东西</span>' +
          '<span class="m">' + fmtNum(inOk) + ' / ' + fmtNum(inAll) + ' 个文件在</span></div>' +
          '<div class="sx-secb" style="font-size:14px;color:var(--muted)">' + esc(j.note) + '</div>';
        for (const it of j.items) {
          html +=
            '<div class="sx-eve"><span class="nm">' + esc(it.name) +
            '</span><span class="mt" style="max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
            esc(it.note) + '</span>' +
            '<span class="tag' + (it.targets.every((t) => t.ok) ? '' : ' sunk') + '">' +
            it.targets.filter((t) => t.ok).length + ' / ' + it.targets.length + '</span></div>';
          for (const t of it.targets) {
            html +=
              '<div class="sx-eve" style="padding-left:40px"><span class="nm" style="flex:none">' + esc(t.label) +
              '</span><span class="mt" style="max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
              esc(t.path) + '</span>' +
              '<span class="tag' + (t.ok ? '' : ' sunk') + '">' +
              (t.ok ? esc(fmtWhen(t.mtime)) : '不在') + '</span></div>';
          }
        }
        return html + '</section>';
      }

      function render(cap, auto) {
        let html = '<div class="sx-pad">';
        html += '<h1 class="sx-h1">自动化</h1>';
        html += '<div class="sx-sub">每轮聊完，它自己把这一轮的话判一遍、落进识海 —— 不用你喊。</div>';

        // 状态条：开没开 / 用哪个模型 / 库里多少条
        const known = cap && cap.ok;
        const on = known ? cap.enabled !== false : null;
        const routeText = known && cap.route && cap.route.provider
          ? cap.route.provider + ' / ' + (cap.route.model || '?')
          : '还没跑过';
        html += '<div class="sx-note" style="display:flex;gap:22px;flex-wrap:wrap;align-items:baseline;font-size:14px">';
        html += '<span>自动沉淀　<b style="color:' + (on === null ? 'var(--muted)' : on ? '#6f8f6a' : '#d4553f') + '">' +
          (on === null ? '读不到' : on ? '开' : '关') + '</b></span>';
        html += '<span>判话用的模型　<b>' + esc(routeText) + '</b></span>';
        if (known && cap.library) {
          html += '<span>库里 <b>' + fmtNum(cap.library.total) + '</b> 条 · 今天 <b>+' + fmtNum(cap.library.today) + '</b></span>';
        }
        html += '<button id="auto-refresh" class="wf-btn" style="margin-left:auto">刷新</button>';
        html += '</div>';

        if (!known) {
          html += '<div class="sx-empty">读不到沉淀状态：' + esc((cap && cap.error) || '接口没响应') + '</div>';
        } else {
          // 今天的账
          html +=
            '<div style="display:flex;gap:32px;flex-wrap:wrap;margin:20px 0 24px;font-size:13px;color:var(--muted)">' +
            '<span><b style="display:block;font-size:24px;font-weight:600;color:var(--text)">' + fmtNum(cap.stat.wrote) + '</b>今天写入</span>' +
            '<span><b style="display:block;font-size:24px;font-weight:600;color:var(--text)">' + fmtNum(cap.stat.runs) + '</b>判过的轮</span>' +
            '<span><b style="display:block;font-size:24px;font-weight:600;color:' + (cap.stat.failed ? '#d4553f' : 'var(--text)') + '">' + fmtNum(cap.stat.failed) + '</b>失败</span>' +
            '<span><b style="display:block;font-size:24px;font-weight:600;color:var(--text)">' + fmtNum(cap.stat.skipped) + '</b>跳过</span>' +
            '</div>';

          // 今天在长的事
          if (cap.events && cap.events.length) {
            html += '<section class="sx-sec"><div class="sx-sech"><span class="n">今天在长的事</span>' +
              '<span class="m">' + cap.events.length + ' 件</span></div>';
            for (const ev of cap.events.slice(0, 12)) {
              html += '<div class="sx-eve"><span class="nm" style="flex:1">' + esc(ev.name) +
                '</span><span class="tag">' + fmtNum(ev.times) + ' 次</span></div>';
            }
            html += '</section>';
          }

          // 最近流水
          if (!cap.entries || !cap.entries.length) {
            html += '<div class="sx-empty">还没有沉淀记录 —— 重启 DSH 之后聊两句，这儿就会长出来。</div>';
          } else {
            html += '<section class="sx-sec"><div class="sx-sech"><span class="n">最近流水</span>' +
              '<span class="m">' + cap.entries.length + ' 条</span></div>' +
              '<div style="max-height:520px;overflow:auto">';
            for (const entry of cap.entries) {
              const d = describe(entry);
              const bad = d.level === 'fail';
              html +=
                '<div class="sx-eve">' +
                '<span class="nm" style="min-width:76px;flex:none;color:var(--dim);font-variant-numeric:tabular-nums">' + esc(d.at) + '</span>' +
                '<span class="mt" style="flex:1;' + (bad ? 'color:#d4553f' : '') + '">' + esc(d.text) + '</span>' +
                '<span class="tag" style="' + (bad ? 'color:#d4553f;border-color:#d4553f' : '') + '">' + esc(d.level || '—') + '</span>' +
                '</div>';
            }
            html += '</div></section>';
          }
        }

        // 下面接原来的文件清单
        html += renderFiles(auto);
        html += '</div>';
        pane.innerHTML = html;
      }

      function load() {
        paneMsg(pane, '读沉淀日志…');
        Promise.all([
          fetchJson('/capture?limit=40').catch((err) => ({ ok: false, error: String((err && err.message) || err) })),
          fetchJson('/automation').catch((err) => ({ ok: false, error: String((err && err.message) || err) })),
        ])
          .then(([cap, auto]) => {
            render(cap, auto);
            const btn = pane.querySelector('#auto-refresh');
            if (btn) btn.addEventListener('click', () => load());
          })
          .catch((err) => paneMsg(pane, '读不到：' + esc(String((err && err.message) || err))));
      }

      return {
        show() {
          load();
        },
        dispose() {},
      };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 宿主（DSH）左侧栏：打开识海时把它收起来，让识海占满宽度；离开时还原
    // ══════════════════════════════════════════════════════════════════════════
    //
    // ⚠️ DSH 内部结构，版本升级可能失效：那个 div 的 class 是 CSS Modules
    // 生成的（现在是 `BynINW_sidebarCol`），哈希前缀每次构建都会变，所以只认
    // 中间那段语义名 `sidebarCol`。找不到就退回「不隐藏」，只在 console 里 warn
    // 一句 —— 宁可侧栏留着，也不能把宿主页面搞坏。
    const HOST_SIDEBAR_SELECTOR = '[class*="sidebarCol"]';


    /** 还原宿主左侧栏 */
    function showHostSidebar(saved) {
      if (!saved || !saved.el || !saved.el.style) return;
      try {
        if (saved.prev) saved.el.style.setProperty('display', saved.prev, saved.prevPrio);
        else saved.el.style.removeProperty('display');
      } catch (error) {
        console.warn('[mindsea] 还原宿主侧栏失败：' + String((error && error.message) || error));
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 整页组装：顶栏九页签 + 九个容器
    // ══════════════════════════════════════════════════════════════════════════
    const TABS = [
      
          { k: 'wall', label: '知识卡', g: '工作区', ic: '\u{1F9E0}' },
          { k: 'neb', label: '识海', g: '工作区', ic: '\u{1F30C}' },
          { k: 'flow', label: '工作流', g: '工作区', ic: '\u{1F5C2}' },
          { k: 'persona', label: '人设', g: '工作区', ic: '\u{1F3AD}' },
          { k: 'time', label: '时间', g: '工作区', ic: '\u{1F570}' },
          { k: 'diary', label: '日记', g: '工作区', ic: '\u{1F4D6}' },
          { k: 'wander', label: '走神', g: '系统', ic: '\u{1F4AD}' },
          { k: 'forget', label: '回收中心', g: '系统', ic: '\u{267B}' },
          { k: 'auto', label: '自动化', g: '系统', ic: '\u{2699}' },
          { k: 'log', label: '运行状态', g: '系统', ic: '\u{1F4DD}' },
          { k: 'err', label: '报错', g: '系统', ic: '\u{1F41B}' },
        ];


    const SHELL =
      '<div id="sidebar"><div id="sb-title">识海</div><div id="sb-note">' +
      TABS.length + ' 页 · 只读</div><div id="tabs">' +
      TABS.map((t, i) => ((i === 0 || TABS[i - 1].g !== t.g) ? '<div class="sb-group">' + t.g + '</div>' : '') + '<button class="tab' + (i === 0 ? ' on' : '') + '" data-tab="' + t.k + '"><span class="tab-ic">' + (t.ic || '') + '</span>' + t.label + '</button>').join('') +
      '</div><span id="count"></span></div><div id="stage">' +
        '<div class="pane on" id="pane-wall"></div>' +
      '<div class="pane" id="pane-flow"><div id="flow-head">' +
      '<button id="flow-back" hidden>← 返回</button>' +
      '<h1 id="flow-title">工作流</h1><span id="flow-meta"></span><span id="flow-alias"></span>' +
      '<span id="flow-tip">滚轮滚动 · Ctrl+滚轮缩放</span>' +
      '<span id="flow-zoombox" hidden>' +
      '<button id="flow-zout" title="缩小">−</button><button id="flow-zoom" title="点一下回 100%">100%</button>' +
      '<button id="flow-zin" title="放大">＋</button></span>' +
      '</div><div id="flow-view"><div id="flow-canvas"></div></div></div>' +
      '<div class="pane" id="pane-neb"><canvas id="c"></canvas>' +
      // 巨构：全面板只有这一页 —— 容器背后一个超大几何形（环 + 刻度环 + 菱形），
      // 3~5% 的 --frame，压在 canvas 之上但不抢星云；四角是取景框的 L 形角标。
      '<div id="neb-frame" aria-hidden="true">' +
      '<svg id="neb-mega" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet">' +
      '<circle class="ring" cx="200" cy="200" r="197"/>' +
      '<circle class="tick" cx="200" cy="200" r="186"/>' +
      '<circle class="ring" cx="200" cy="200" r="152"/>' +
      '<path class="diamond" d="M200 14 L386 200 L200 386 L14 200 Z"/>' +
      '</svg>' +
      '<i class="nb-corner tl"></i><i class="nb-corner tr"></i>' +
      '<i class="nb-corner bl"></i><i class="nb-corner br"></i></div>' +
      // 容器上方：极小的字距放宽的标题 + 一行小字（点数与团数等铺开后再填真数）
      '<div id="neb-title"><h1 class="nt">识海</h1>' +
      '<p class="ns" id="neb-ns">一句一点 · 你自己凑成 ' + CLUSTERS + ' 团</p></div>' +
      '<div id="hud">正在把记忆铺开…</div><div id="hint">拖动旋转 · 滚轮缩放 · 双击静止</div><div id="ntip"></div></div>' +
      '<div class="pane" id="pane-persona"></div>' +
      '<div class="pane" id="pane-time"></div>' +
      '<div class="pane" id="pane-forget"></div>' +
      '<div class="pane" id="pane-wander"></div>' +
      '<div class="pane" id="pane-diary"></div>' +
      '<div class="pane" id="pane-auto"></div>' +
      '<div class="pane" id="pane-log"></div>' +
      '<div class="pane" id="pane-err"></div>' +
      '</div><div id="tip"></div><div id="toast"></div>';

    function buildApp(root) {
      root.innerHTML = SHELL;

      const tipEl = root.querySelector('#tip');
      const toastEl = root.querySelector('#toast');
      const countEl = root.querySelector('#count');
      let toastT = null;

      function placeTip(cx, cy) {
        const rr = root.getBoundingClientRect();
        const w = tipEl.offsetWidth || 200;
        const hh = tipEl.offsetHeight || 80;
        let x = cx - rr.left + 16;
        let y = cy - rr.top + 16;
        if (x + w > rr.width - 10) x = cx - rr.left - w - 16;
        if (y + hh > rr.height - 10) y = Math.max(10, rr.height - hh - 10);
        tipEl.style.left = Math.max(10, x) + 'px';
        tipEl.style.top = Math.max(10, y) + 'px';
      }
      const shell = {
        placeTip,
        showTip(html, cx, cy) {
          tipEl.innerHTML = html;
          tipEl.classList.add('on');
          placeTip(cx, cy);
        },
        hideTip() {
          tipEl.classList.remove('on');
        },
        toast(msg) {
          toastEl.textContent = msg;
          toastEl.classList.add('on');
          clearTimeout(toastT);
          toastT = setTimeout(() => toastEl.classList.remove('on'), 1600);
        },
      };

      const panes = {};
      TABS.forEach((t) => {
        panes[t.k] = root.querySelector('#pane-' + t.k);
      });

      // ── 运行状态：写作流水 + 库的现状（照 memory-eternal 的「运行状态」）──
      function initLog({ pane }) {
        let out = null;
        let body = null;
        function today() {
          const d = new Date();
          const p2 = (x) => ('0' + x).slice(-2);
          return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
        }
        function ensure() {
          if (out) return;
          out = document.createElement('div');
          out.className = 'ms-page';
          out.innerHTML =
            '<div class="ms-head"><h1 class="ms-title">运行状态</h1>' +
            '<p class="ms-lede">写作流水 · 库里现在的数</p></div>' +
            '<div class="ms-scroll"><div class="sx-note" id="lg-body">读…</div></div>';
          pane.appendChild(out);
          body = out.querySelector('#lg-body');
        }
        function read() {
          ensure();
          Promise.all([
            fetch('/mindsea/api/ping').then((r) => r.json()).catch(() => null),
            fetch('/mindsea/api/day?day=' + today()).then((r) => r.json()).catch(() => null),
            fetch('/mindsea/api/words?limit=8').then((r) => r.json()).catch(() => null),
          ]).then((arr) => {
            const ping = arr[0]; const day = arr[1]; const recent = arr[2];
            const c = (ping && ping.counts) || {};
            const n = day && typeof day.count === 'number' ? day.count : 0;
            const rows = (recent && recent.words) || [];
            body.innerHTML =
              '<div class="sx-kv">' +
              '<span>今天写了 <b>' + n + '</b> 条</span>' +
              '<span>库里 <b>' + (c.memories || 0) + '</b> 条话</span>' +
              '<span><b>' + (c.events || 0) + '</b> 件事</span>' +
              '<span><b>' + (c.versions || 0) + '</b> 个版本</span>' +
              '<span><b>' + (c.stages || 0) + '</b> 个阶段</span>' +
              '<span><b>' + (c.decisions || 0) + '</b> 条决定</span>' +
              '</div><div style="height:24px"></div>' +
              rows.map((w) => '<div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)">' +
                '<span style="flex:none;color:var(--muted);font-size:12px;width:112px">' + esc(w.at) + '</span>' +
                '<span style="flex:1;min-width:0;font-size:14px;color:var(--text)">' + esc(String(w.text || '').slice(0, 80)) + '</span>' +
                '</div>').join('');
          }).catch(() => { body.textContent = '读不到'; });
        }
        return { show() { read(); }, dispose() {} };
      }

      // ── 报错：把前端撞到的问题攒在这儿（接口挂了 / 抛异常）──
      const ERR_BOX = [];
      function initErr({ pane }) {
        let out = null;
        let body = null;
        function ensure() {
          if (out) return;
          out = document.createElement('div');
          out.className = 'ms-page';
          out.innerHTML =
            '<div class="ms-head"><h1 class="ms-title">报错</h1>' +
            '<p class="ms-lede">前端撞到的问题，按时间倒着记</p></div>' +
            '<div class="ms-scroll"><div class="sx-note" id="er-body"></div></div>';
          pane.appendChild(out);
          body = out.querySelector('#er-body');
        }
        function read() {
          ensure();
          if (!ERR_BOX.length) { body.innerHTML = '<div class="empty">还没出过错 —— 这里是干净的。</div>'; return; }
          body.innerHTML = ERR_BOX.slice().reverse().map((e) =>
            '<div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)">' +
            '<span style="flex:none;color:var(--muted);font-size:12px;width:96px">' + esc(e.at) + '</span>' +
            '<span style="flex:1;min-width:0;font-size:13px;color:var(--text)">' + esc(e.msg) + '</span>' +
            '</div>').join('');
        }
        return { show() { read(); }, dispose() {} };
      }

      const mods = {
        wall: initWallV5({ pane: panes.wall, shell }),
        flow: initFlow({ pane: panes.flow }),
        neb: initNeb({ pane: panes.neb }),
        persona: initPersona({ pane: panes.persona }),
        time: initTimeline({ pane: panes.time }),
        forget: initForget({ pane: panes.forget }),
        wander: initWander({ pane: panes.wander }),
        diary: initDiary({ pane: panes.diary }),
        auto: initAuto({ pane: panes.auto }),
        log: initLog({ pane: panes.log }),
        err: initErr({ pane: panes.err }),
      };

      let cur = 'wall';
      let words = [];

      function activate(name) {
        if (!panes[name]) name = 'wall';
        if (cur === 'neb' && name !== 'neb') mods.neb.hide();
        cur = name;
        root.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
        TABS.forEach((t) => panes[t.k].classList.toggle('on', t.k === name));
        if (name === 'wall') {
          countEl.innerHTML = words.length ? '<b>' + fmtNum(words.length) + '</b> 条' : '';
          requestAnimationFrame(() => mods.wall.relayout());
        } else {
          countEl.innerHTML = '';
        }
        if (name === 'flow') mods.flow.show();
        else if (name === 'neb') mods.neb.show();
        else if (mods[name] && typeof mods[name].show === 'function') mods[name].show();
      }

      root.querySelectorAll('.tab').forEach((t) => {
        t.addEventListener('click', () => activate(t.dataset.tab));
      });

      // 话：一次拉全（分页拿），墙和星云共用这一份
      countEl.innerHTML = '读话…';
      fetchAllWords((got, total) => {
        countEl.innerHTML = '读话 ' + fmtNum(got) + ' / ' + fmtNum(total);
      })
        .then((list) => {
          words = list;
          countEl.innerHTML = '<b>' + fmtNum(list.length) + '</b> 条';
          mods.wall.setWords(list);
          mods.neb.setWords(list);
        })
        .catch((err) => {
          countEl.textContent = '读不到话';
          shell.toast('读不到话：' + String(err.message || err));
        });

      return {
        /**
         * 容器尺寸兜底：宿主给的格子要是没高度，别让整页塌成一条。
         * 高度只从宿主那个格子算（不用 100vh —— 那是「盖住宿主」的老毛病），
         * 量不到再退回窗口高度减一点，仍然嵌在自己的格子里。
         */
        fixHeight() {
          const rect = root.getBoundingClientRect();
          // 高度兜底
          if (rect.height < 240) {
            const host = root.parentElement ? root.parentElement.getBoundingClientRect().height : 0;
            const fallback = Math.max(320, window.innerHeight - 120);
            root.style.height = Math.round(host >= 240 ? host : fallback) + 'px';
          }
          // ⚠️ 宽度也要兜底：宿主那个格子在某些布局下宽度会塌成很窄一条，
          // 这时 width:100% 就等于那一条，卡片会被挤成竖长条（2026-10-23 踩过）。
          if (rect.width < 480) {
            const hostW = root.parentElement ? root.parentElement.getBoundingClientRect().width : 0;
            const fallbackW = Math.max(720, window.innerWidth - 320);
            root.style.width = Math.round(hostW >= 480 ? hostW : fallbackW) + 'px';
          }
        },
        dispose() {
          clearTimeout(toastT);
          TABS.forEach((t) => {
            const m = mods[t.k];
            if (m && typeof m.dispose === 'function') {
              try {
                m.dispose();
              } catch (e) {
                /* 卸不干净就算了 */
              }
            }
          });
        },
      };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 页面组件
    // ══════════════════════════════════════════════════════════════════════════
    function SeaPage() {
      const ref = React.useRef(null);
      React.useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        // ⚠️ 不碰宿主的侧栏。DSH 左上角本来就有收/放侧栏的开关，那是他的东西，
        // 我去 display:none 它，藏了忘还原就把人关死在里面（2026-10-23 踩了两次）。
        // 万一历史版本留下过 display:none，这里补一次还原兜底。
        try { showHostSidebar({ el: document.querySelector(HOST_SIDEBAR_SELECTOR), prev: '', prevPrio: '' }); } catch (e) { /* 静默 */ }
        const hostBar = null;
        const app = buildApp(el);
        app.fixHeight();
        // 宿主布局常在挂载之后才定型（面板刚插进去时宽度/高度都可能是 0），
        // 所以再量几刀，别只在挂载那一下量（2026-10-23：卡片被挤成竖条就是这个）
        const remeasure = [0, 120, 400, 1000].map((ms) => setTimeout(() => app.fixHeight(), ms));
        const onResize = () => app.fixHeight();
        window.addEventListener('resize', onResize);
        return () => {
          remeasure.forEach((t) => clearTimeout(t));
          window.removeEventListener('resize', onResize);
          app.dispose();
          // 离开识海（切会话 / 卸载插件）：宿主侧栏照原样回来
          showHostSidebar(hostBar);
        };
      }, []);
      return h('div', { className: 'mindsea-root', ref: ref });
    }

    /** 样式挂一次就够（组件内渲染，卸载即消失） */
    function SeaShell() {
      return h(React.Fragment, null, h('style', null, CSS), h(SeaPage, null));
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.slots;
        const disposers = [];
        disposers.push(
          slots.inject('sidebar.panellist', () =>
            slots.register(
              {
                name: 'sidebar.panellist',
                id: PANEL_ID,
                order: 41,
                label: () => '识海',
              },
              PanelIcon,
            ),
          ),
        );
        disposers.push(
          slots.inject('main', () =>
            slots.register(
              {
                name: 'main',
                key: PANEL_ID,
              },
              SeaShell,
            ),
          ),
        );
        ctx.effect(() => () => {
          for (const dispose of disposers.splice(0)) dispose();
        });
      },
    };
  },
});
