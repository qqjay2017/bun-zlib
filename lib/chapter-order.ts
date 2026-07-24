type ChapterLike = {
  chapterName: string;
  chapterIndex: number;
};

const CHINESE_DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const CHINESE_UNITS: Record<string, number> = {
  十: 10,
  百: 100,
  千: 1000,
  万: 10000,
};

function parseChineseNumber(value: string): number | null {
  let total = 0;
  let section = 0;
  let number = 0;
  let matched = false;

  for (const char of value) {
    if (char in CHINESE_DIGITS) {
      number = CHINESE_DIGITS[char]!;
      matched = true;
      continue;
    }

    const unit = CHINESE_UNITS[char];
    if (!unit) return null;

    matched = true;
    if (unit === 10000) {
      section = (section + number) * unit;
      total += section;
      section = 0;
    } else {
      section += (number || 1) * unit;
    }
    number = 0;
  }

  if (!matched) return null;
  return total + section + number;
}

function getChapterNumber(chapterName: string): number | null {
  const match = chapterName.match(/^第\s*([0-9]+|[零〇一二两三四五六七八九十百千万]+)\s*章/);
  if (!match) return null;

  const value = match[1]!;
  const chapterNumber = /^\d+$/.test(value)
    ? Number(value)
    : parseChineseNumber(value);

  return chapterNumber && Number.isFinite(chapterNumber) ? chapterNumber : null;
}

export function normalizeChapterOrder<T extends ChapterLike>(chapters: T[]): T[] {
  return chapters
    .map((chapter, sourceIndex) => {
      const chapterNumber = getChapterNumber(chapter.chapterName);
      return {
        chapter,
        sourceIndex,
        order: chapterNumber === null ? sourceIndex : chapterNumber - 1,
      };
    })
    .sort((a, b) => a.order - b.order || a.sourceIndex - b.sourceIndex)
    .map(({ chapter }, chapterIndex) => ({ ...chapter, chapterIndex }));
}
