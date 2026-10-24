# 识海 · MindSea

给 [DeepSeek Harness](https://github.com/deepseek-ai) 的一个记忆插件。

它做的事很简单：**你们聊完一轮，它把这一轮的话判一遍、存进本地 SQLite**，下次要用的时候能翻出来。
不是让模型「记住」——上下文的记忆会过期，这个不会。

数据全在本机一个 `.db` 文件里，不联网、不上传。

---

## 它跟别的记忆插件有什么不一样

大多数记忆插件存的是「知识卡」：一段话压缩成一张卡，卡上写标题、摘要。

识海存的是**原话**，然后在原话上面叠三层结构：

```
话（memories）—— 一句一句，原文不动
 └ 事（events）—— 这件事叫什么，比如「记忆系统重做」
    └ 版本（versions）—— 这套方案的一版，比如「卡片墙」
       └ 阶段（stages）—— 走到哪一步，比如「试跑」
决定（decisions）—— 某个节点上定下来的口径，单独记
```

好处是：话永远不会被改写，怎么归类都可以后来再改；坏处是库会长得比较快。

每条话还会带：分数（0~100 有多重要）、七情（喜/怒/哀/惧/爱/恶/欲）、门类（闲聊/暧昧/干活/知识/规矩）、去处（进事 / 闲聊池 / 废料池）。

---

## 安装

### 1. 建库

```bash
node scripts/init-db.mjs
```

默认在**插件目录的上一层**建 `sea2.db`；也可以指定路径：

```bash
node scripts/init-db.mjs D:/memory/sea2.db
```

### 2. 装进 DSH profile

把这个目录 link 进你的 profile（以 `~/.dsh/profiles/desktop` 为例）：

```bash
cd ~/.dsh/profiles/desktop
npm install <这个仓库的路径或压缩包>
```

或者手动在 `node_modules` 下做个软链：

```
node_modules/dsh-mindsea -> <这个仓库的目录>
```

然后编辑 `~/.dsh/profiles/desktop/package.json`，把 `dsh-mindsea` 加进 `dsh.profile.bundles` 数组。

### 3. 重启 DSH

重启后侧边栏会多一个「识海」入口。第一次聊完一轮，`sea2.db` 里就会有数据了。

> 库换个位置：设环境变量 `DSH_MINDSEA_DB=<路径>`，或者在 `cordis.patch.yml` 里给这行加 `config: { dbPath: '...' }`。

---

## 三个工具

模型自己能调用，你也可以在对话里让它用：

| 工具 | 干什么 |
|---|---|
| `memory_search(q, day, emo)` | 撞词 / 撞日期 / 撞七情 → 命中的事，按命中条数排 |
| `memory_event(name)` | 给一个事名，摊开它的版本、阶段、最近的决定 |
| `memory_write(items)` | 把一批判好的话写进库（事 / 版本 / 阶段同名自动复用） |

三根轴可以任意组合，多个条件是「并且」：

```
memory_search(q: "桌宠", day: "2026-10")
memory_search(emo: "爱", limit: 20)
```

---

## 自动沉淀是怎么跑的

挂的是 `agent/turn-stopping`：

1. 一轮结束，抓这一轮**新增**的 user / assistant 消息；
2. 剥掉运行时注入（环境快照、system-reminder、技能目录那些不是人说的话）；
3. 丢给模型判：这条归哪件事、多少分、什么情绪、是不是决定、哪个门类；
4. 落库。

几条设计上的取舍，用之前值得知道：

- **监听器里不等模型**。`turn-stopping` 是串行事件，在监听器里 await 会把整轮收尾拖住，所以抓完增量就丢后台队列。
- **原话不由模型回抄**。模型只输出编号和判断，正文用我们自己存的原话，一个字都不会被改写。
- **短轮也存**。一轮话太短就不问模型了，直接进闲聊池、40 分、不挂事——宁可留平，不要丢。
- **我的长回答看内容**。超过 400 字、又没信息量（纯过程叙述）的，进废料池：留档，但不挂事、不参加匹配。
- **只沉淀顶层会话**。子代理（工具工人）的话不进库。

想关掉自动沉淀：在 profile 的 `cordis.patch.yml` 里给 `mindsea` 那行加

```yaml
- id: mindsea
  config:
    autoCapture: false
```

沉淀失败不会打扰你，会写进 `data/capture-log.jsonl`；面板「自动化」页能看到最近流水。

---

## 面板

侧边栏「识海」进去，十一页：

- **记忆库** —— 卡片墙，按门类上色，能搜、能筛
- **知识星图** —— 把事 / 版本画成星图，能拖能转
- **工作流** —— 按话题 → 事 → 版本 / 阶段看
- **时间** —— 按天看话，每条话旁边可以改门类 / 去处（判错了手动纠）
- **人设 / 遗忘 / 走神 / 日记 / 自动化 / 运行状态 / 报错**

面板的数据接口全是只读 GET，只有一个写口子：`POST /mindsea/api/memory`，用来改一条话的门类或去处。

---

## 目录结构

```
index.js             插件入口：三个工具、两个钩子、面板路由
client.js            面板前端（一块 Web 组件）
lib/query.mjs        只读查询（memory_search / memory_event 走这里）
lib/write.mjs        写入（memory_write 和自动沉淀共用）
lib/capture.mjs      自动沉淀：切轮、剥噪声、判、落库
lib/routes.mjs       面板的 HTTP 路由
lib/api.mjs          面板各页要的数据
lib/tail.mjs         每个会话第一轮推最近 10 句
lib/sea-svg.mjs      现画一张识海图谱（SVG）
lib/ui/eternal.css   面板样式
scripts/init-db.mjs  建空库
test/capture-selftest.mjs  离线自测（假模型 + 库副本）
```

跑一遍自测：

```bash
npm test
```

它不碰真库、不调真模型，用一份库的副本走完整条链路。

---

## 已知限制

- **只在 DSH 跑着的时候沉淀**。关机、DSH 没开，那段时间的话不会进库。
- **判错要人来改**。模型会把某句判进错的事、错的分数，这个它自己发现不了；去「时间」页手动纠。
- **库只长不缩**。废料池的原文一直留着，目前没有自动归档。
- **界面那块是从 memory-eternal 借的**（见 NOTICE），不是原创设计。

---

## 许可

MIT。界面部分来自 [memory-eternal](https://github.com/EternalNight996/memory-eternal)（MIT，Copyright (c) 2026 EternalNight996），详见 `NOTICE`。
