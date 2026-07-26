import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { Database } from 'bun:sqlite';

// 独立于 cache-manager.ts 定义，避免循环依赖（cache-manager.ts 会导入 getDb）
function getCacheRoot(): string {
  return path.resolve(process.cwd(), '.cache');
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS books (
  content_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  detail_page_url TEXT NOT NULL DEFAULT '',
  cached_at INTEGER NOT NULL DEFAULT 0,
  chapter_list_updated_at INTEGER,
  PRIMARY KEY (content_type, source_id, book_id)
);

CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  chapter_detail_url TEXT NOT NULL,
  chapter_index INTEGER NOT NULL,
  chapter_name TEXT NOT NULL,
  content TEXT,
  cached_at INTEGER NOT NULL,
  UNIQUE (content_type, source_id, book_id, chapter_id)
);
CREATE INDEX IF NOT EXISTS idx_chapters_book_order
  ON chapters (content_type, source_id, book_id, chapter_index);

CREATE TABLE IF NOT EXISTS visit_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  book_name TEXT NOT NULL,
  chapter_id TEXT,
  chapter_name TEXT,
  path TEXT NOT NULL,
  visited_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visit_history_type_visited
  ON visit_history (type, visited_at DESC);

CREATE TABLE IF NOT EXISTS download_tasks (
  task_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  status TEXT NOT NULL,
  total INTEGER NOT NULL,
  completed INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  percent INTEGER NOT NULL,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS download_task_chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES download_tasks(task_id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  chapter_id TEXT NOT NULL,
  chapter_name TEXT NOT NULL,
  chapter_detail_url TEXT NOT NULL,
  status TEXT NOT NULL,
  UNIQUE (task_id, chapter_id)
);
CREATE INDEX IF NOT EXISTS idx_dtc_task_seq ON download_task_chapters (task_id, seq);
`;

let db: Database | null = null;

/** 获取全局共享的 SQLite 连接（惰性初始化，自动建表） */
export function getDb(): Database {
  if (db) return db;

  mkdirSync(getCacheRoot(), { recursive: true });
  db = new Database(path.join(getCacheRoot(), 'data.sqlite'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);

  return db;
}
