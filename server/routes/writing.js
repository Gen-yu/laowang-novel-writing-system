/**
 * 写作状态路由：持久化阅读区（已定稿段落）与编辑区（草稿）
 * 存储在 data/writing.json
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');

const router = express.Router();
const FILE = () => path.join(DATA_DIR, 'writing.json');

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

function readState() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE(), 'utf8'));
    return {
      paragraphs: Array.isArray(data.paragraphs) ? data.paragraphs : [],
      draft: typeof data.draft === 'string' ? data.draft : '',
      chapter: typeof data.chapter === 'string' ? data.chapter : '',
      activeRecall: normalizeActiveRecall(data.activeRecall),
    };
  } catch {
    return { paragraphs: [], draft: '', chapter: '', activeRecall: null };
  }
}

router.get('/', (req, res) => {
  res.json(readState());
});

router.post('/', (req, res) => {
  try {
    const { paragraphs = [], draft = '', chapter = '', activeRecall = null } = req.body || {};
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      FILE(),
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
