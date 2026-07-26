import { getDb } from './db';
import type { ContentType } from './cache-types';

export interface VisitHistoryItem {
  type: ContentType;
  sourceId: string;
  bookId: string;
  bookName: string;
  chapterId?: string;
  chapterName?: string;
  path: string;
  visitedAt: number;
}

interface VisitHistoryRow {
  type: ContentType;
  source_id: string;
  book_id: string;
  book_name: string;
  chapter_id: string | null;
  chapter_name: string | null;
  path: string;
  visited_at: number;
}

const MAX_HISTORY_ITEMS = 50;

function rowToItem(row: VisitHistoryRow): VisitHistoryItem {
  return {
    type: row.type,
    sourceId: row.source_id,
    bookId: row.book_id,
    bookName: row.book_name,
    chapterId: row.chapter_id ?? undefined,
    chapterName: row.chapter_name ?? undefined,
    path: row.path,
    visitedAt: row.visited_at,
  };
}

export async function listVisitHistory(type?: ContentType): Promise<VisitHistoryItem[]> {
  const db = getDb();
  const rows = (
    type
      ? db.query('SELECT * FROM visit_history WHERE type = ? ORDER BY visited_at DESC').all(type)
      : db.query('SELECT * FROM visit_history ORDER BY visited_at DESC').all()
  ) as VisitHistoryRow[];
  return rows.map(rowToItem);
}

export async function getLatestVisit(
  type: ContentType,
  sourceId: string,
  bookId: string,
): Promise<VisitHistoryItem | null> {
  const db = getDb();
  const row = db.query(`
    SELECT * FROM visit_history
    WHERE type = ? AND source_id = ? AND book_id = ?
    ORDER BY visited_at DESC
    LIMIT 1
  `).get(type, sourceId, bookId) as VisitHistoryRow | null;
  return row ? rowToItem(row) : null;
}

export async function saveVisitHistory(item: VisitHistoryItem): Promise<void> {
  const db = getDb();

  db.transaction(() => {
    db.query(`
      DELETE FROM visit_history
      WHERE type = ? AND source_id = ? AND book_id = ? AND path = ? AND chapter_id IS ?
    `).run(item.type, item.sourceId, item.bookId, item.path, item.chapterId ?? null);

    db.query(`
      INSERT INTO visit_history (type, source_id, book_id, book_name, chapter_id, chapter_name, path, visited_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.type,
      item.sourceId,
      item.bookId,
      item.bookName,
      item.chapterId ?? null,
      item.chapterName ?? null,
      item.path,
      item.visitedAt,
    );

    db.query(`
      DELETE FROM visit_history
      WHERE id NOT IN (SELECT id FROM visit_history ORDER BY visited_at DESC LIMIT ?)
    `).run(MAX_HISTORY_ITEMS);
  })();
}
