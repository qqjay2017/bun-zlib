import { useState, useEffect, useCallback } from "react";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";

export const downloadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "download",
  component: DownloadCenter,
});

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

function getTaskProgress(task: DownloadTask) {
  return task.progress;
}

function DownloadCenter() {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [loading, setLoading] = useState(true);

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

  const handleCancel = useCallback(async (taskId: string) => {
    await fetch(`/api/download/${taskId}`, { method: "DELETE" });
    fetchTasks();
  }, [fetchTasks]);

  if (loading) {
    return (
      <div className="page download-page">
        <h2>下载中心</h2>
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="page download-page">
      <h2>下载中心</h2>

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
            const progress = getTaskProgress(task);
            return (
              <div className="task-card" key={task.taskId}>
                <div className="task-header">
                  <span className="task-title">
                    {task.sourceId}_{task.bookId}
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

                {task.error && (
                  <div className="task-error">{task.error}</div>
                )}

                {(task.status === "pending" || task.status === "downloading") && (
                  <div className="task-actions">
                    <button
                      className="btn-cancel"
                      onClick={() => handleCancel(task.taskId)}
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
