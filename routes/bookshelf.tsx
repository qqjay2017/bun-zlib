import { useEffect, useState } from "react";
import { createRoute, Link } from "@tanstack/react-router";
import { rootRoute } from "./__root";

type ShelfBook = {
  bookId: string;
  sourceId: string;
  contentType: "novel" | "comic";
  name: string;
  author: string;
  coverImageUrl: string;
  description: string;
  detailPageUrl: string;
  addedAt: number;
};

const NOVEL_SHELF_KEY = "bookshelf:novel";
const COMIC_SHELF_KEY = "bookshelf:comic";

export const bookshelfRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "bookshelf",
  component: BookshelfPage,
});

function readShelfBooks(): ShelfBook[] {
  try {
    const novelRaw = localStorage.getItem(NOVEL_SHELF_KEY);
    const comicRaw = localStorage.getItem(COMIC_SHELF_KEY);
    const novels = novelRaw ? JSON.parse(novelRaw) as ShelfBook[] : [];
    const comics = comicRaw ? JSON.parse(comicRaw) as ShelfBook[] : [];
    return [...novels, ...comics].sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return [];
  }
}

function writeShelfBooks(books: ShelfBook[]): void {
  localStorage.setItem(NOVEL_SHELF_KEY, JSON.stringify(books.filter((book) => book.contentType === "novel")));
  localStorage.setItem(COMIC_SHELF_KEY, JSON.stringify(books.filter((book) => book.contentType === "comic")));
}

function BookshelfPage() {
  const [books, setBooks] = useState<ShelfBook[]>([]);

  useEffect(() => {
    setBooks(readShelfBooks());
  }, []);

  const handleRemove = (sourceId: string, bookId: string) => {
    const nextBooks = books.filter((book) => book.sourceId !== sourceId || book.bookId !== bookId);
    writeShelfBooks(nextBooks);
    setBooks(nextBooks);
  };

  return (
    <div className="page bookshelf-page">
      <div className="bookshelf-header">
        <h2>书架</h2>
        <span>{books.length} 本</span>
      </div>

      {books.length === 0 ? (
        <div className="empty-state">
          <p>书架为空</p>
          <Link to="/novel" className="btn-secondary">
            添加小说
          </Link>
          <Link to="/comic" className="btn-secondary">
            添加漫画
          </Link>
        </div>
      ) : (
        <div className="bookshelf-list">
          {books.map((book) => (
            <div className="bookshelf-item" key={`${book.sourceId}_${book.bookId}`}>
              <Link
                to={book.contentType === "comic" ? "/comic/$sourceId/$bookId" as any : "/novel/$sourceId/$bookId" as any}
                params={{ sourceId: book.sourceId, bookId: book.bookId } as any}
                className="bookshelf-cover"
              >
                <img
                  src={book.coverImageUrl || "https://placehold.co/120x168?text=No+Cover"}
                  alt={book.name}
                />
              </Link>
              <div className="bookshelf-meta">
                <Link
                  to={book.contentType === "comic" ? "/comic/$sourceId/$bookId" as any : "/novel/$sourceId/$bookId" as any}
                  params={{ sourceId: book.sourceId, bookId: book.bookId } as any}
                  className="bookshelf-title"
                >
                  {book.name}
                </Link>
                <p className="bookshelf-author">作者：{book.author}</p>
                <p className="bookshelf-source">
                  类型：{book.contentType === "comic" ? "漫画" : "小说"} / 来源：{book.sourceId} / ID：{book.bookId}
                </p>
                <p className="bookshelf-desc">{book.description}</p>
                <div className="bookshelf-actions">
                  <Link
                    to={book.contentType === "comic" ? "/comic/$sourceId/$bookId" as any : "/novel/$sourceId/$bookId" as any}
                    params={{ sourceId: book.sourceId, bookId: book.bookId } as any}
                    className="btn-secondary"
                  >
                    打开
                  </Link>
                  <button
                    className="btn-secondary"
                    onClick={() => handleRemove(book.sourceId, book.bookId)}
                  >
                    移除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
