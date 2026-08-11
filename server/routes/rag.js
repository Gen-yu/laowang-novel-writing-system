/**
 * RAG 资料路由：读写 RAG/ 目录下的资料文件
 *
 * 目录约定：
 *   RAG/characters/                 人物设定
 *   RAG/plots/volumes/              分卷剧情
 *   RAG/plots/chapter-bodies/       章节正文（“总结本章”时自动写入）
 *   RAG/plots/chapter-summaries/    章节总结（“总结本章”时自动写入）
 *   RAG/settings/                   设定集（术语）
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { RAG_DIR } = require('../config');

const router = express.Router();

/** 把请求路径安全地解析到 RAG_DIR 内，防止目录穿越 */
function safeResolve(relPath) {
  const rel = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const abs = path.resolve(RAG_DIR, rel);
  if (abs !== RAG_DIR && !abs.startsWith(RAG_DIR + path.sep)) {
    throw new Error('非法路径');
  }
  return abs;
}

/** 递归构建目录树 */
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

// 目录树
router.get('/tree', (req, res) => {
  res.json({ tree: buildTree(RAG_DIR) });
});

// 读取文件
router.get('/file', (req, res) => {
  try {
    const abs = safeResolve(req.query.path);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      return res.status(404).json({ error: '文件不存在' });
    }
    res.json({ path: req.query.path, content: fs.readFileSync(abs, 'utf8') });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 保存 / 新建文件
router.post('/file', (req, res) => {
  try {
    const { path: relPath, content = '' } = req.body || {};
    const abs = safeResolve(relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
    res.json({ ok: true, path: relPath });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
