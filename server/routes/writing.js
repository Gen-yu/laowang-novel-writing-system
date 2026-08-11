/**
 * 按书籍持久化写作状态：data/writing/<书名>.json
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const { validateBookName, resolveBookRoot } = require('../services/bookStorage');

const router = express.Router();

function stateFile(book) {
  const name = validateBookName(book);
  const bookRoot = resolveBookRoot(name);
  if (!fs.existsSync(bookRoot)) throw new Error('书籍不存在');
  return path.join(DATA_DIR, 'writing', `${name}.json`);
}

function normalizeActiveRecall(value) {
  if (!value || typeof value !== 'object') return null;
  const { originalParagraphs, range, previousDraft } = value;
  if (!Array.isArray(originalParagraphs) || !range || typeof range !== 'object') return null;

  const positions = [
    range.startParagraphIndex,
    range.startOffset,
    range.endParagraphIndex,
    range.endOffset,
  ];
  if (!positions.every(Number.isInteger)) return null;

  return {
    originalParagraphs: originalParagraphs.filter((paragraph) => typeof paragraph === 'string'),
    range: {
      startParagraphIndex: range.startParagraphIndex,
      startOffset: range.startOffset,
      endParagraphIndex: range.endParagraphIndex,
      endOffset: range.endOffset,
    },
    previousDraft: typeof previousDraft === 'string' ? previousDraft : '',
  };
}

function emptyState() {
  return { paragraphs: [], draft: '', chapter: '', activeRecall: null };
}

function readState(book) {
  try {
    const data = JSON.parse(fs.readFileSync(stateFile(book), 'utf8'));
    return {
      paragraphs: Array.isArray(data.paragraphs) ? data.paragraphs : [],
      draft: typeof data.draft === 'string' ? data.draft : '',
      chapter: typeof data.chapter === 'string' ? data.chapter : '',
      activeRecall: normalizeActiveRecall(data.activeRecall),
    };
  } catch (err) {
    if (err.code === 'ENOENT') return emptyState();
    throw err;
  }
}

router.get('/', (req, res) => {
  try {
    res.json(readState(req.query.book));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { book, paragraphs = [], draft = '', chapter = '', activeRecall = null } = req.body || {};
    const file = stateFile(book);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        paragraphs: Array.isArray(paragraphs) ? paragraphs : [],
        draft: typeof draft === 'string' ? draft : '',
        chapter: typeof chapter === 'string' ? chapter : '',
        activeRecall: normalizeActiveRecall(activeRecall),
      }, null, 2),
      'utf8'
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
