import type { BookMetadata, ContentType } from "./cache-types";
import { getDb } from "./db";

export type ShelfBook = Omit<BookMetadata, "cachedAt"> & {
  addedAt: number;
};

interface ShelfBookRow {
  content_type: ContentType;
  source_id: string;
  book_id: string;
  name: string;
  author: string;
  cover_image_url: string;
  description: string;
  detail_page_url: string;
  added_at: number;
}

function rowToShelfBook(row: ShelfBookRow): ShelfBook {
  return {
    contentType: row.content_type,
    sourceId: row.source_id,
    bookId: row.book_id,
    name: row.name,
    author: row.author,
    coverImageUrl: row.cover_image_url,
    description: row.description,
    detailPageUrl: row.detail_page_url,
    addedAt: row.added_at,
  };
}

export function listShelfBooks(): ShelfBook[] {
  const rows = getDb().query(`
    SELECT
      b.content_type,
      b.source_id,
      b.book_id,
      b.name,
      b.author,
      b.cover_image_url,
      b.description,
      b.detail_page_url,
      s.added_at
    FROM bookshelf s
    JOIN books b
      ON b.content_type = s.content_type
      AND b.source_id = s.source_id
      AND b.book_id = s.book_id
    ORDER BY s.added_at DESC
  `).all() as ShelfBookRow[];

  return rows.map(rowToShelfBook);
}

export function isBookInShelf(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
): boolean {
  const row = getDb().query(`
    SELECT 1 FROM bookshelf
    WHERE content_type = ? AND source_id = ? AND book_id = ?
    LIMIT 1
  `).get(contentType, sourceId, bookId);
  return row !== null;
}

export function addBookToShelf(book: BookMetadata): ShelfBook {
  const db = getDb();
  const addedAt = Date.now();

  db.transaction(() => {
    db.query(`
      INSERT INTO books (
        content_type, source_id, book_id, name, author, cover_image_url,
        description, detail_page_url, cached_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (content_type, source_id, book_id) DO UPDATE SET
        name = excluded.name,
        author = excluded.author,
        cover_image_url = excluded.cover_image_url,
        description = excluded.description,
        detail_page_url = excluded.detail_page_url,
        cached_at = MAX(books.cached_at, excluded.cached_at)
    `).run(
      book.contentType,
      book.sourceId,
      book.bookId,
      book.name,
      book.author,
      book.coverImageUrl,
      book.description,
      book.detailPageUrl,
      book.cachedAt,
    );

    db.query(`
      INSERT INTO bookshelf (content_type, source_id, book_id, added_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (content_type, source_id, book_id) DO UPDATE SET
        added_at = excluded.added_at
    `).run(book.contentType, book.sourceId, book.bookId, addedAt);
  })();

  const { cachedAt: _cachedAt, ...shelfBook } = book;
  return { ...shelfBook, addedAt };
}

export function removeBookFromShelf(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
): boolean {
  const result = getDb().query(`
    DELETE FROM bookshelf
    WHERE content_type = ? AND source_id = ? AND book_id = ?
  `).run(contentType, sourceId, bookId);
  return result.changes > 0;
}
