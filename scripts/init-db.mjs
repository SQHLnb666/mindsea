// 建一个空的识海库。
//
// 第一次用跑一次就行：
//   node scripts/init-db.mjs               # 默认建在插件目录的上一层：<repo>/sea2.db
//   node scripts/init-db.mjs D:/sea.db     # 或者指定一个路径
//
// 已经有库就不动它（不覆盖、不清空）。
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SCHEMA = `
CREATE TABLE memories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT,
  at          TEXT,
  speaker     INTEGER,
  body        TEXT,
  platform    INTEGER,
  emotion     TEXT,
  importance  INTEGER,
  hits        INTEGER DEFAULT 0,
  voiced      INTEGER DEFAULT 0,
  unconfirmed INTEGER DEFAULT 0,
  origin      TEXT,
  text        TEXT,
  occurred    TEXT,
  vector      BLOB,
  digest      TEXT,
  old_id      TEXT,
  event_id    INTEGER,
  version_id  INTEGER,
  stage_id    INTEGER,
  s           INTEGER,
  dec         INTEGER,
  emotion_old TEXT,
  place       TEXT,
  category    TEXT
);

CREATE TABLE events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT UNIQUE NOT NULL,
  topic        TEXT,
  n            INTEGER DEFAULT 0,
  dec_count    INTEGER DEFAULT 0,
  first_at     TEXT,
  last_at      TEXT,
  summary      TEXT,
  status       TEXT DEFAULT 'live',
  last_mention TEXT,
  category     TEXT
);

CREATE TABLE versions (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  name     TEXT NOT NULL,
  n        INTEGER DEFAULT 0,
  UNIQUE(event_id, name)
);

CREATE TABLE stages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER NOT NULL,
  version_id INTEGER,
  name       TEXT NOT NULL,
  n          INTEGER DEFAULT 0,
  UNIQUE(event_id, version_id, name)
);

CREATE TABLE decisions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id INTEGER,
  event_id  INTEGER,
  obj       TEXT,
  text      TEXT,
  at        TEXT
);

CREATE TABLE wanders (
  id        TEXT PRIMARY KEY,
  at        TEXT NOT NULL,
  start_tag TEXT,
  path      TEXT NOT NULL,
  spoke     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_memories_at ON memories(at);
CREATE INDEX idx_memories_speaker ON memories(speaker);
CREATE INDEX idx_memories_voiced ON memories(voiced);
CREATE INDEX idx_wanders_at ON wanders(at);
`;

const here = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] ? resolve(process.argv[2]) : resolve(here, '..', '..', 'sea2.db');

if (existsSync(target)) {
  console.log(`库已经在了，没动它：${target}`);
  process.exit(0);
}

const db = new DatabaseSync(target);
try {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  console.log(`建好了：${target}`);
  console.log('接下来：把插件装进 DSH profile（见 README），重启后就开始沉淀了。');
} finally {
  db.close();
}
