import type { ContentType } from './cache-types';

export interface VisitHistoryItem {
  type: ContentType;
  sourceId: string;
  bookId: string;
  bookName: string;
  chapterId?: string;
  chapterName?: string;
  path: string;
  visitedAt: number;
}

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export async function readVisitHistory(type: ContentType): Promise<VisitHistoryItem[]> {
  const res = await fetch(`/api/history/${type}`);
  const result = (await res.json()) as ApiResult<VisitHistoryItem[]>;
  if (!result.success) throw new Error(result.error || '历史记录读取失败');
  return result.data ?? [];
}

export async function getLatestVisit(
  type: ContentType,
  sourceId: string,
  bookId: string,
): Promise<VisitHistoryItem | null> {
  const res = await fetch(`/api/history/${type}/${sourceId}/${bookId}/latest`);
  const result = (await res.json()) as ApiResult<VisitHistoryItem | null>;
  if (!result.success) throw new Error(result.error || "历史记录读取失败");
  return result.data ?? null;
}

export async function saveVisitHistory(item: VisitHistoryItem): Promise<void> {
  const res = await fetch('/api/history/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  const result = (await res.json()) as ApiResult<unknown>;
  if (!result.success) throw new Error(result.error || '历史记录写入失败');
}
