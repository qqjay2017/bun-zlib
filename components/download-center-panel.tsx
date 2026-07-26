import { useCallback, useEffect, useState } from "react";

type TaskStatus = "pending" | "downloading" | "completed" | "failed" | "cancelled";

interface ChapterDownloadItem {
  chapterId: string;
  chapterName: string;
  chapterDetailUrl: string;
  status: "pending" | "downloading" | "completed" | "failed";
}

interface TaskProgress {
  total: number;
  completed: number;
  failed: number;
  percent: number;
}

interface DownloadTask {
  taskId: string;
  sourceId: string;
  bookId: string;
  contentType: string;
  chapters: ChapterDownloadItem[];
  status: TaskStatus;
  progress: TaskProgress;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: "#888",
  downloading: "#4a90d9",
  completed: "#52c41a",
  failed: "#f5222d",
  cancelled: "#fa8c16",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "等待中",
  downloading: "下载中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

const STALL_WARNING_MS = 60_000;

const CHAPTER_STATUS_LABELS: Record<ChapterDownloadItem["status"], string> = {
  pending: "等待中",
  downloading: "下载中",
  completed: "已完成",
  failed: "失败",
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  novel: "小说",
  comic: "漫画",
};

function titleCacheKey(task: DownloadTask): string {
  return `${task.contentType}:${task.sourceId}:${task.bookId}`;
}

interface DownloadCenterPanelProps {
  onClose?: () => void;
}

export function DownloadCenterPanel({ onClose }: DownloadCenterPanelProps = {}) {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [mutatingTaskId, setMutatingTaskId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const fetchTasks = useCallback(() => {
    fetch("/api/download/tasks")
      .then((res) => res.json())
      .then((result: { success: boolean; data: DownloadTask[] }) => {
        if (result.success) setTasks(result.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 初始加载
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // SSE 实时订阅进度
  useEffect(() => {
    const es = new EventSource('/api/download/progress');
    es.onmessage = (event) => {
      const updatedTask: DownloadTask = JSON.parse(event.data);
      setTasks(prev => {
        const idx = prev.findIndex(t => t.taskId === updatedTask.taskId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updatedTask;
          return next;
        }
        return [...prev, updatedTask];
      });
    };
    return () => es.close();
  }, []);

  // 有下载中的任务时，定时刷新“已停滞”提示
  useEffect(() => {
    if (!tasks.some((t) => t.status === "downloading")) return;
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, [tasks]);

  // 补齐还没取到书名的任务
  useEffect(() => {
    const missing = tasks.filter((t) => !(titleCacheKey(t) in titles));
    if (missing.length === 0) return;

    missing.forEach((task) => {
      const key = titleCacheKey(task);
      fetch(`/api/cache/${task.contentType}/${task.sourceId}/${task.bookId}/metadata`)
        .then((res) => res.json())
        .then((result: { success: boolean; data: { name: string } | null }) => {
          setTitles((prev) => ({
            ...prev,
            [key]: result.success && result.data ? result.data.name : "",
          }));
        })
        .catch(() => {
          setTitles((prev) => ({ ...prev, [key]: "" }));
        });
    });
  }, [tasks, titles]);

  const toggleExpanded = useCallback((taskId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const handleCancel = useCallback(async (taskId: string) => {
    if (mutatingTaskId) return;

    setMutatingTaskId(taskId);
    try {
      await fetch(`/api/download/${taskId}`, { method: "DELETE" });
      fetchTasks();
    } finally {
      setMutatingTaskId(null);
    }
  }, [fetchTasks, mutatingTaskId]);

  const handleRetry = useCallback(async (taskId: string) => {
    if (mutatingTaskId) return;

    setMutatingTaskId(taskId);
    try {
      await fetch(`/api/download/${taskId}/retry`, { method: "POST" });
      fetchTasks();
    } finally {
      setMutatingTaskId(null);
    }
  }, [fetchTasks, mutatingTaskId]);

  const handleClearAll = useCallback(async () => {
    if (clearing || tasks.length === 0) return;
    const confirmed = window.confirm("确定要清空全部下载任务吗？");
    if (!confirmed) return;

    setClearing(true);
    try {
      await fetch("/api/download/tasks", { method: "DELETE" });
      setTasks([]);
      fetchTasks();
    } finally {
      setClearing(false);
    }
  }, [clearing, fetchTasks, tasks.length]);

  if (loading) {
    return (
      <>
        <div className="download-page-header">
          <h2>下载中心</h2>
          {onClose && (
            <button className="modal-close-btn" onClick={onClose}>
              ×
            </button>
          )}
        </div>
        <p>加载中...</p>
      </>
    );
  }

  return (
    <>
      <div className="download-page-header">
        <h2>下载中心</h2>
        <div className="download-page-header-actions">
          <button
            className="btn-clear-all"
            disabled={tasks.length === 0 || clearing}
            onClick={handleClearAll}
          >
            {clearing ? "清空中..." : "清空全部"}
          </button>
          {onClose && (
            <button className="modal-close-btn" onClick={onClose}>
              ×
            </button>
          )}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state">
          <p>暂无下载任务</p>
          <p style={{ color: "#888", fontSize: 14 }}>
            请在小说页面发起下载
          </p>
        </div>
      ) : (
        <div className="task-list">
          {tasks.map((task) => {
            const progress = task.progress;
            const downloadingChapters = task.chapters.filter((ch) => ch.status === "downloading");
            const stalledMs = now - task.updatedAt;
            const isStalled = task.status === "downloading" && stalledMs > STALL_WARNING_MS;
            const title = titles[titleCacheKey(task)];
            const isExpanded = expanded.has(task.taskId);
            const isMutating = mutatingTaskId === task.taskId;
            return (
              <div className="task-card" key={task.taskId}>
                <div className="task-header">
                  <span className="task-title-group">
                    <span className="task-title">
                      {title || `${task.sourceId}_${task.bookId}`}
                    </span>
                    <span className="task-type-badge">
                      {CONTENT_TYPE_LABELS[task.contentType] ?? task.contentType}
                    </span>
                  </span>
                  <span className="task-chapters">
                    共{progress.total}章
                  </span>
                </div>

                <div className="task-progress">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${progress.percent}%`,
                        backgroundColor: STATUS_COLORS[task.status],
                      }}
                    />
                  </div>
                  <span className="progress-text">
                    {progress.percent}% ({progress.completed}/{progress.total})
                  </span>
                  {progress.failed > 0 && (
                    <span className="progress-failed"> 失败:{progress.failed}</span>
                  )}
                  <span
                    className="task-status"
                    style={{ color: STATUS_COLORS[task.status] }}
                  >
                    状态: {STATUS_LABELS[task.status]}
                  </span>
                </div>

                {downloadingChapters.length > 0 && (
                  <div className="task-current-chapter">
                    正在下载：
                    {downloadingChapters
                      .map((chapter) => chapter.chapterName)
                      .join("、")}
                  </div>
                )}

                {isStalled && (
                  <div className="task-error">
                    已 {Math.round(stalledMs / 1000)} 秒无进展，可能已卡住，可尝试"取消"后重新发起缓存
                  </div>
                )}

                {task.error && (
                  <div className="task-error">{task.error}</div>
                )}

                <button
                  type="button"
                  className="task-expand-btn"
                  onClick={() => toggleExpanded(task.taskId)}
                >
                  {isExpanded ? "收起章节 ▲" : "展开章节 ▼"}
                </button>

                {isExpanded && (
                  <div className="chapter-list">
                    {task.chapters.map((ch, idx) => (
                      <div className="chapter-row" key={ch.chapterId}>
                        <span className="chapter-row-name">
                          {idx + 1}. {ch.chapterName}
                        </span>
                        <span
                          className="chapter-row-status"
                          style={{ color: STATUS_COLORS[ch.status] }}
                        >
                          {CHAPTER_STATUS_LABELS[ch.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {(task.status === "pending" || task.status === "downloading") && (
                  <div className="task-actions">
                    <button
                      className="btn-cancel"
                      disabled={isMutating}
                      onClick={() => handleCancel(task.taskId)}
                    >
                      {isMutating ? "取消中..." : "取消"}
                    </button>
                  </div>
                )}

                {task.status === "cancelled" && (
                  <div className="task-actions">
                    <button
                      className="btn-cancel"
                      disabled={isMutating}
                      onClick={() => handleRetry(task.taskId)}
                    >
                      {isMutating ? "重试中..." : "重试"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
