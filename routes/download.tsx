import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { DownloadCenterPanel } from "../components/download-center-panel";

export const downloadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "download",
  component: DownloadCenter,
});

function DownloadCenter() {
  return (
    <div className="page download-page">
      <DownloadCenterPanel />
    </div>
  );
}
