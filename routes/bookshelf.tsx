import { createRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rootRoute } from "./__root";
import { readShelfBooks, removeBookFromShelf } from "../lib/bookshelf-api";
import type { ShelfBook } from "../lib/bookshelf-api";

export const bookshelfRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "bookshelf",
  component: BookshelfPage,
});

function BookshelfPage() {
  const queryClient = useQueryClient();
  const shelfQuery = useQuery({
    queryKey: ["bookshelf"],
    queryFn: readShelfBooks,
  });
  const removeMutation = useMutation({
    mutationFn: (book: ShelfBook) => removeBookFromShelf(
      book.contentType,
      book.sourceId,
      book.bookId,
    ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bookshelf"] }),
  });
  const books = shelfQuery.data ?? [];
  const error = shelfQuery.error || removeMutation.error;

  return (
    <div className="page bookshelf-page">
      <div className="bookshelf-header">
        <h2>书架</h2>
        <span>{books.length} 本</span>
      </div>

      {shelfQuery.isPending ? (
        <div className="empty-state">书架加载中...</div>
      ) : error instanceof Error ? (
        <div className="error-message">{error.message}</div>
      ) : books.length === 0 ? (
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
            <div className="bookshelf-item" key={`${book.contentType}_${book.sourceId}_${book.bookId}`}>
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
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(book)}
                  >
                    {removeMutation.isPending ? "移除中..." : "移除"}
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
