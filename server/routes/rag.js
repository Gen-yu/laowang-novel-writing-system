/**
 * 多书籍资料路由：资料树、文件读写、书籍列表与创建。
 * 客户端文件路径始终相对于 RAG/<book>/，后端负责边界校验。
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  createBook,
  ensureBookStructure,
  listBooks,
  resolveBookPath,
  resolveBookRoot,
} = require('../services/bookStorage');

const router = express.Router();

function requireBook(value) {
  const root = resolveBookRoot(value);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error('书籍不存在');
  }
  ensureBookStructure(value);
  return root;
}

function buildTree(dir, relBase = '') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, 'zh'))
    .map((entry) => {
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        return { type: 'dir', name: entry.name, path: rel, children: buildTree(path.join(dir, entry.name), rel) };
      }
      return { type: 'file', name: entry.name, path: rel };
    });
}

router.get('/books', (req, res) => {
  res.json({ books: listBooks() });
});

router.post('/books', (req, res) => {
  try {
    const book = createBook(req.body && req.body.name);
    res.status(201).json({ ok: true, book });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/tree', (req, res) => {
  try {
    const root = requireBook(req.query.book);
    res.json({ tree: buildTree(root) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/file', (req, res) => {
  try {
    requireBook(req.query.book);
    const abs = resolveBookPath(req.query.book, req.query.path);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      return res.status(404).json({ error: '文件不存在' });
    }
    res.json({ path: req.query.path, content: fs.readFileSync(abs, 'utf8') });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/file', (req, res) => {
  try {
    const { book, path: relPath, content = '' } = req.body || {};
    requireBook(book);
    if (!String(relPath || '').trim()) throw new Error('文件路径为空');
    const abs = resolveBookPath(book, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, String(content), 'utf8');
    res.json({ ok: true, path: relPath });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
