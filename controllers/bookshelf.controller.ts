import type { BookMetadata, ContentType } from "../lib/cache-types";
import {
  addBookToShelf,
  isBookInShelf,
  listShelfBooks,
  removeBookFromShelf,
} from "../lib/bookshelf-manager";
import { defineController } from "../lib/controller";

function parseContentType(value: string | undefined): ContentType {
  if (value === "novel" || value === "comic") return value;
  throw new Error("无效的书籍类型");
}

defineController("/api/bookshelf", {
  "GET /": () => Response.json({ success: true, data: listShelfBooks() }),

  "GET /:type/:sourceId/:bookId": (_req, params) => {
    const data = isBookInShelf(
      parseContentType(params.type),
      params.sourceId!,
      params.bookId!,
    );
    return Response.json({ success: true, data });
  },

  "POST /": async (req) => {
    const book = await req.json() as BookMetadata;
    parseContentType(book.contentType);
    if (!book.sourceId || !book.bookId || !book.name) {
      return Response.json(
        { success: false, error: "书籍信息不完整" },
        { status: 400 },
      );
    }
    return Response.json({ success: true, data: addBookToShelf(book) });
  },

  "DELETE /:type/:sourceId/:bookId": (_req, params) => {
    const data = removeBookFromShelf(
      parseContentType(params.type),
      params.sourceId!,
      params.bookId!,
    );
    return Response.json({ success: true, data });
  },
});
