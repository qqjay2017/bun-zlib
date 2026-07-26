import { DownloadCenterPanel } from "./download-center-panel";

interface DownloadCenterModalProps {
  onClose: () => void;
}

export function DownloadCenterModal({ onClose }: DownloadCenterModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content download-page" onClick={(event) => event.stopPropagation()}>
        <DownloadCenterPanel onClose={onClose} />
      </div>
    </div>
  );
}
