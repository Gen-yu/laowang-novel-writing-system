const fs = require('fs');
const path = require('path');
const { RAG_DIR, DATA_DIR } = require('../config');

const BOOK_DIRECTORIES = [
  'characters',
  'plots/volumes',
  'plots/chapter-bodies',
  'plots/chapter-summaries',
  'settings',
];

function validateBookName(value) {
  const name = String(value || '').trim();
  if (!name) throw new Error('请选择书籍');
  if (name === '.' || name === '..' || /[\\/:*?"<>|\x00-\x1f]/.test(name)) {
    throw new Error('书名包含非法字符');
  }
  return name;
}

function resolveBookRoot(book) {
  const name = validateBookName(book);
  const root = path.resolve(RAG_DIR, name);
  if (!root.startsWith(path.resolve(RAG_DIR) + path.sep)) {
    throw new Error('非法书籍路径');
  }
  return root;
}

function resolveBookPath(book, relPath = '') {
  const root = resolveBookRoot(book);
  const rel = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error('非法资料路径');
  }
  return abs;
}

function ensureBookStructure(book) {
  const root = resolveBookRoot(book);
  fs.mkdirSync(root, { recursive: true });
  BOOK_DIRECTORIES.forEach((rel) => fs.mkdirSync(path.join(root, rel), { recursive: true }));
  return root;
}

function listBooks() {
  if (!fs.existsSync(RAG_DIR)) return [];
  return fs.readdirSync(RAG_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => BOOK_DIRECTORIES.some((rel) => fs.existsSync(path.join(RAG_DIR, entry.name, rel))))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh'));
}

function createBook(book) {
  const name = validateBookName(book);
  const root = resolveBookRoot(name);
  if (fs.existsSync(root)) throw new Error('该书籍已存在');
  ensureBookStructure(name);
  return name;
}

function readMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => ({
      name: entry.name,
      path: path.join(dir, entry.name),
      content: fs.readFileSync(path.join(dir, entry.name), 'utf8'),
    }));
}

const CHINESE_DIGITS = {
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

function parseChineseNumber(value) {
  const text = String(value || '');
  if (/^\d+$/.test(text)) return Number(text);
  if (!text || !/^[零〇一二两三四五六七八九十百千万]+$/.test(text)) return null;

  let total = 0;
  let section = 0;
  let digit = 0;
  const units = { 十: 10, 百: 100, 千: 1000 };

  for (const char of text) {
    if (Object.prototype.hasOwnProperty.call(CHINESE_DIGITS, char)) {
      digit = CHINESE_DIGITS[char];
    } else if (char === '万') {
      section += digit;
      total += section * 10000;
      section = 0;
      digit = 0;
    } else {
      const unit = units[char];
      section += (digit || 1) * unit;
      digit = 0;
    }
  }

  return total + section + digit;
}

function parseChapterNumber(filename) {
  const match = String(filename || '').match(
    /^第([零〇一二两三四五六七八九十百千万\d]+)章(?:[：:].*)?\.md$/i
  );
  return match ? parseChineseNumber(match[1]) : null;
}

function parseVolume(filename) {
  const match = String(filename || '').match(
    /^第([零〇一二两三四五六七八九十百千万\d]+)卷(?:[：:](\d+)-(\d+))?\.md$/i
  );
  if (!match) return null;
  return {
    volumeNumber: parseChineseNumber(match[1]),
    startChapter: match[2] ? Number(match[2]) : null,
    endChapter: match[3] ? Number(match[3]) : null,
  };
}

function getChapterSummaries(book) {
  const dir = resolveBookPath(book, 'plots/chapter-summaries');
  return readMarkdownFiles(dir)
    .map((file) => ({ ...file, chapterNumber: parseChapterNumber(file.name) }))
    .filter((file) => Number.isInteger(file.chapterNumber))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
}

function getVolumes(book) {
  const dir = resolveBookPath(book, 'plots/volumes');
  return readMarkdownFiles(dir)
    .map((file) => ({ ...file, ...parseVolume(file.name) }))
    .filter((file) => Number.isInteger(file.volumeNumber))
    .sort((a, b) => a.volumeNumber - b.volumeNumber);
}

function nextChapterNumber(book) {
  const dirs = ['plots/chapter-bodies', 'plots/chapter-summaries'];
  const numbers = dirs.flatMap((rel) => readMarkdownFiles(resolveBookPath(book, rel)))
    .map((file) => parseChapterNumber(file.name))
    .filter(Number.isInteger);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

function sanitizeTitle(value) {
  return String(value || '')
    .trim()
    .replace(/^第[零〇一二两三四五六七八九十百千万\d]+章\s*[：:]?\s*/, '')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildChapterTitle(book, requestedTitle) {
  const chapterNumber = nextChapterNumber(book);
  const subtitle = sanitizeTitle(requestedTitle);
  return {
    chapterNumber,
    chapterTitle: subtitle ? `第${chapterNumber}章：${subtitle}` : `第${chapterNumber}章`,
  };
}

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, content, 'utf8');
  fs.renameSync(temp, file);
}

function uniqueConflictPath(target) {
  const ext = path.extname(target);
  const base = target.slice(0, -ext.length);
  let index = 1;
  let candidate = `${base}（迁移冲突）${ext}`;
  while (fs.existsSync(candidate)) {
    index += 1;
    candidate = `${base}（迁移冲突${index}）${ext}`;
  }
  return candidate;
}

function moveFilePreserving(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) {
    fs.renameSync(source, target);
    return;
  }
  if (fs.readFileSync(source).equals(fs.readFileSync(target))) {
    fs.unlinkSync(source);
    return;
  }
  fs.renameSync(source, uniqueConflictPath(target));
}

function mergeDirectory(source, target) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source, { withFileTypes: true }).forEach((entry) => {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) mergeDirectory(from, to);
    else moveFilePreserving(from, to);
  });
  if (!fs.readdirSync(source).length) fs.rmdirSync(source);
}

function migrateLegacyStorage() {
  fs.mkdirSync(RAG_DIR, { recursive: true });
  ensureBookStructure('example');
  const example = resolveBookRoot('example');

  ['characters', 'settings'].forEach((name) => {
    mergeDirectory(path.join(RAG_DIR, name), path.join(example, name));
  });
  ['volumes', 'chapter-bodies', 'chapter-summaries'].forEach((name) => {
    mergeDirectory(path.join(RAG_DIR, 'plots', name), path.join(example, 'plots', name));
  });
  mergeDirectory(
    path.join(RAG_DIR, 'plots', 'chapters'),
    path.join(example, 'plots', 'chapter-summaries')
  );
  const legacyPlots = path.join(RAG_DIR, 'plots');
  if (fs.existsSync(legacyPlots) && !fs.readdirSync(legacyPlots).length) fs.rmdirSync(legacyPlots);

  const legacyWriting = path.join(DATA_DIR, 'writing.json');
  if (fs.existsSync(legacyWriting)) {
    const writingDir = path.join(DATA_DIR, 'writing');
    const target = path.join(writingDir, 'example.json');
    fs.mkdirSync(writingDir, { recursive: true });
    moveFilePreserving(legacyWriting, target);
  }
}

module.exports = {
  atomicWrite,
  buildChapterTitle,
  createBook,
  ensureBookStructure,
  getChapterSummaries,
  getVolumes,
  listBooks,
  migrateLegacyStorage,
  parseChapterNumber,
  resolveBookPath,
  resolveBookRoot,
  validateBookName,
};
