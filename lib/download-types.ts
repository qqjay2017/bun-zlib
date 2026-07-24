import type { ContentType } from './cache-types';

export type TaskStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';

export interface ChapterDownloadItem {
  chapterId: string;
  chapterName: string;
  chapterDetailUrl: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
}

export interface TaskProgress {
  total: number;
  completed: number;
  failed: number;
  percent: number;
}

export interface DownloadTask {
  taskId: string;
  sourceId: string;
  bookId: string;
  contentType: ContentType;
  chapters: ChapterDownloadItem[];
  status: TaskStatus;
  progress: TaskProgress;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export interface CreateDownloadRequest {
  sourceId: string;
  bookId: string;
  contentType: ContentType;
  chapters: Omit<ChapterDownloadItem, 'status'>[];
}

export type ProgressListener = (task: DownloadTask) => void;
