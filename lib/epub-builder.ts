import JSZip from "jszip";

// ─── 公共接口 ────────────────────────────────────────────────────────────────

/** 单个章节 */
export interface EpubChapter {
  /** 章节标题 */
  title: string;
  /** 章节正文（HTML 片段，无需包含 <html>/<body> 等外壳） */
  content: string;
}

/** 封面图片来源 */
export type EpubCover = Buffer | Uint8Array | string;

/** EPUB 构建选项 */
export interface EpubOptions {
  /** 书名 */
  title: string;
  /** 作者 */
  author: string;
  /** 简介 / 描述 */
  description?: string;
  /** 封面图片：Buffer / Uint8Array 或本地文件路径 */
  cover?: EpubCover;
  /** 章节列表（按顺序） */
  chapters: EpubChapter[];
  /** 语言代码，默认 "zh" */
  language?: string;
  /** 书籍唯一标识符，默认自动生成 UUID */
  identifier?: string;
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * 根据图片二进制头部判断 MIME 类型。
 * 支持 JPEG / PNG / WEBP / GIF，未知时回退到 image/jpeg。
 */
function detectImageMime(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return "image/webp";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  return "image/jpeg";
}

/** 将章节序号格式化为三位数文件名 */
function chapterFilename(index: number): string {
  return `chapter_${String(index + 1).padStart(3, "0")}.xhtml`;
}

// ─── EPUB 模板文件 ────────────────────────────────────────────────────────────

function buildContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

interface OpfParams {
  identifier: string;
  title: string;
  author: string;
  description: string;
  language: string;
  coverMime: string | null;
  chapterCount: number;
}

function buildContentOpf(p: OpfParams): string {
  const coverMeta = p.coverMime
    ? `    <item id="cover-image" href="cover.${mimeToExt(p.coverMime)}" media-type="${p.coverMime}"/>`
    : "";
  const coverMetaRef = p.coverMime
    ? `\n    <meta name="cover" content="cover-image"/>`
    : "";

  const manifestItems = [
    `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    coverMeta,
    ...Array.from({ length: p.chapterCount }, (_, i) => {
      const id = `chapter_${i + 1}`;
      return `    <item id="${id}" href="${chapterFilename(i)}" media-type="application/xhtml+xml"/>`;
    }),
  ]
    .filter(Boolean)
    .join("\n");

  const spineItems = Array.from(
    { length: p.chapterCount },
    (_, i) => `    <itemref idref="chapter_${i + 1}"/>`,
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeXml(p.language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="book-id">urn:uuid:${escapeXml(p.identifier)}</dc:identifier>
    <dc:title>${escapeXml(p.title)}</dc:title>
    <dc:creator opf:role="aut">${escapeXml(p.author)}</dc:creator>
    <dc:description>${escapeXml(p.description)}</dc:description>
    <dc:language>${escapeXml(p.language)}</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta>${coverMetaRef}
  </metadata>
  <manifest>
${manifestItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`;
}

function buildTocNcx(
  identifier: string,
  title: string,
  chapters: EpubChapter[],
): string {
  const navPoints = chapters
    .map(
      (ch, i) => `    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(ch.title)}</text></navLabel>
      <content src="${chapterFilename(i)}"/>
    </navPoint>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${escapeXml(identifier)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;
}

function buildNavXhtml(title: string, chapters: EpubChapter[]): string {
  const items = chapters
    .map(
      (ch, i) =>
        `      <li><a href="${chapterFilename(i)}">${escapeXml(ch.title)}</a></li>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)} - 目录</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
${items}
    </ol>
  </nav>
</body>
</html>`;
}

function buildChapterXhtml(
  title: string,
  content: string,
  language: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)}</title>
  <style type="text/css">
    body { font-family: serif; line-height: 1.6; padding: 1em; }
    h1 { text-align: center; margin: 1em 0; }
    p { text-indent: 2em; margin: 0.4em 0; }
  </style>
</head>
<body>
  <h1>${escapeXml(title)}</h1>
  <div>${content}</div>
</body>
</html>`;
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

// ─── 核心构建 ─────────────────────────────────────────────────────────────────

async function resolveBytes(cover: EpubCover): Promise<Uint8Array> {
  if (typeof cover === "string") {
    const file = await Bun.file(cover).arrayBuffer();
    return new Uint8Array(file);
  }
  return cover instanceof Buffer ? new Uint8Array(cover) : cover;
}

/**
 * 构建 EPUB 文件并返回 Buffer。
 *
 * @example
 * ```ts
 * const buf = await buildEpub({
 *   title: "我的小说",
 *   author: "作者名",
 *   description: "简介",
 *   cover: Bun.file("cover.jpg").arrayBuffer().then(b => new Uint8Array(b)),
 *   chapters: [
 *     { title: "第一章", content: "<p>正文内容</p>" },
 *   ],
 * });
 * await Bun.write("output.epub", buf);
 * ```
 */
export async function buildEpub(options: EpubOptions): Promise<Buffer> {
  const {
    title,
    author,
    description = "",
    chapters,
    language = "zh",
    identifier = generateUUID(),
  } = options;

  if (!chapters || chapters.length === 0) {
    throw new Error("chapters 不能为空，至少需要一个章节");
  }

  const zip = new JSZip();

  // mimetype 必须 uncompressed 且位于 ZIP 首位
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  // META-INF
  zip.file("META-INF/container.xml", buildContainerXml());

  // 封面处理
  let coverMime: string | null = null;
  if (options.cover) {
    const coverBytes = await resolveBytes(options.cover);
    coverMime = detectImageMime(coverBytes);
    zip.file(`OEBPS/cover.${mimeToExt(coverMime)}`, coverBytes);
  }

  // OEBPS/content.opf
  zip.file(
    "OEBPS/content.opf",
    buildContentOpf({
      identifier,
      title,
      author,
      description,
      language,
      coverMime,
      chapterCount: chapters.length,
    }),
  );

  // OEBPS/toc.ncx
  zip.file("OEBPS/toc.ncx", buildTocNcx(identifier, title, chapters));

  // OEBPS/nav.xhtml
  zip.file("OEBPS/nav.xhtml", buildNavXhtml(title, chapters));

  // 各章节 XHTML
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i]!;
    zip.file(
      `OEBPS/${chapterFilename(i)}`,
      buildChapterXhtml(ch.title, ch.content, language),
    );
  }

  const arrayBuffer = await zip.generateAsync({
    type: "arraybuffer",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  return Buffer.from(arrayBuffer);
}

/**
 * 构建 EPUB 文件并写入指定路径。
 *
 * @example
 * ```ts
 * await buildEpubToFile(
 *   { title: "我的小说", author: "作者", chapters: [...] },
 *   "./output.epub",
 * );
 * ```
 */
export async function buildEpubToFile(
  options: EpubOptions,
  outputPath: string,
): Promise<void> {
  const buf = await buildEpub(options);
  await Bun.write(outputPath, buf);
}
