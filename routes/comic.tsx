import { createRoute, Outlet, useMatches } from "@tanstack/react-router";
import { rootRoute } from "./__root";

export const comicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "comic",
  component: ComicPage,
});

function ComicPage() {
  const matches = useMatches();
  const showDefault = matches.length === 2;

  return (
    <>
      {showDefault && (
        <div className="page comic-page">
          <p className="placeholder-text">漫画功能即将开放，敬请期待...</p>
        </div>
      )}
      <Outlet />
    </>
  );
}
