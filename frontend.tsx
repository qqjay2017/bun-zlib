/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { queryClient } from "./lib/query";
import { router } from "./lib/router";
import "./index.css";

const container = document.getElementById("root");
const root = createRoot(container!);

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {import.meta.env.DEV && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      )}
    </QueryClientProvider>
  </StrictMode>,
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => root.unmount());
}
