import type { BookMetadata, ContentType } from "./cache-types";
import type { ShelfBook } from "./bookshelf-manager";

export type { ShelfBook } from "./bookshelf-manager";

const LEGACY_SHELF_KEYS = ["bookshelf:novel", "bookshelf:comic"] as const;
let legacyMigration: Promise<void> | undefined;

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

async function readResult<T>(res: Response, fallbackError: string): Promise<T> {
  const result = await res.json() as ApiResult<T>;
  if (!result.success) throw new Error(result.error || fallbackError);
  return result.data as T;
}

async function postBookToShelf(book: BookMetadata): Promise<ShelfBook> {
  const res = await fetch("/api/bookshelf/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(book),
  });
  return readResult<ShelfBook>(res, "加入书架失败");
}

async function migrateLegacyShelfBooks(): Promise<void> {
  if (typeof window === "undefined") return;

  const legacyBooks: ShelfBook[] = [];
  for (const key of LEGACY_SHELF_KEYS) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) legacyBooks.push(...JSON.parse(raw) as ShelfBook[]);
    } catch {
      // 损坏的旧缓存无法迁移，但不应阻止 DB 书架正常使用。
    }
  }

  for (const book of legacyBooks.sort((a, b) => a.addedAt - b.addedAt)) {
    await postBookToShelf({
      bookId: book.bookId,
      sourceId: book.sourceId,
      contentType: book.contentType,
      name: book.name,
      author: book.author,
      coverImageUrl: book.coverImageUrl,
      description: book.description,
      detailPageUrl: book.detailPageUrl,
      cachedAt: book.addedAt,
    });
  }

  for (const key of LEGACY_SHELF_KEYS) {
    window.localStorage.removeItem(key);
  }
}

function ensureLegacyShelfMigrated(): Promise<void> {
  legacyMigration ??= migrateLegacyShelfBooks();
  return legacyMigration;
}

export async function readShelfBooks(): Promise<ShelfBook[]> {
  await ensureLegacyShelfMigrated();
  return readResult<ShelfBook[]>(await fetch("/api/bookshelf/"), "书架读取失败");
}

export async function isBookInShelf(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
): Promise<boolean> {
  await ensureLegacyShelfMigrated();
  const url = `/api/bookshelf/${contentType}/${encodeURIComponent(sourceId)}/${encodeURIComponent(bookId)}`;
  return readResult<boolean>(await fetch(url), "书架状态读取失败");
}

export async function addBookToShelf(book: BookMetadata): Promise<ShelfBook> {
  await ensureLegacyShelfMigrated();
  return postBookToShelf(book);
}

export async function removeBookFromShelf(
  contentType: ContentType,
  sourceId: string,
  bookId: string,
): Promise<boolean> {
  await ensureLegacyShelfMigrated();
  const url = `/api/bookshelf/${contentType}/${encodeURIComponent(sourceId)}/${encodeURIComponent(bookId)}`;
  return readResult<boolean>(await fetch(url, { method: "DELETE" }), "移出书架失败");
}
