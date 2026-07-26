import path from 'node:path';
import { mkdir } from 'node:fs/promises';
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

const HISTORY_FILE = path.resolve(process.cwd(), '.cache', 'visit-history.json');

async function readAll(): Promise<VisitHistoryItem[]> {
  try {
    return JSON.parse(await Bun.file(HISTORY_FILE).text()) as VisitHistoryItem[];
  } catch {
    return [];
  }
}

async function writeAll(items: VisitHistoryItem[]): Promise<void> {
  await mkdir(path.dirname(HISTORY_FILE), { recursive: true });
  await Bun.write(HISTORY_FILE, JSON.stringify(items, null, 2));
}

export async function listVisitHistory(type?: ContentType): Promise<VisitHistoryItem[]> {
  const items = await readAll();
  const sorted = items.sort((a, b) => b.visitedAt - a.visitedAt);
  return type ? sorted.filter((item) => item.type === type) : sorted;
}

export async function saveVisitHistory(item: VisitHistoryItem): Promise<void> {
  const items = await readAll();
  const next = [
    item,
    ...items.filter((entry) => !(
      entry.type === item.type
      && entry.sourceId === item.sourceId
      && entry.bookId === item.bookId
      && entry.chapterId === item.chapterId
      && entry.path === item.path
    )),
  ];
  await writeAll(next.slice(0, 50));
}
