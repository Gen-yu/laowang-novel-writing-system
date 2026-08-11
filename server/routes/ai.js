/**
 * AI 写作路由：提示 / 补全 / 本章总结
 *
 * 每个功能对应 skills/ 下的一个 agent skill：
 *   writing-hint      -> AI 提示
 *   writing-complete  -> AI 补全
 * skill 正文为空时使用下方内置默认提示词。
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { chat } = require('../services/llm');
const { resolvePrompt } = require('../services/skillLoader');
const { RAG_DIR } = require('../config');

const router = express.Router();

const DEFAULT_PROMPTS = {
  hint: [
    '你是一位资深小说创作助手。用户会给你一段正在创作的小说内容（可能包含已完成正文与当前草稿）。',
    '请给出 3~5 条具体、可执行的写作提示，帮助用户推进剧情、丰富细节或改善文笔。',
    '提示应简短明确，分条列出，不要代写正文。',
  ].join('\n'),
  complete: [
    '你是一位资深小说执笔助手。用户会给你已完成的正文（作为上下文）和编辑区中的简要大纲。',
    '请把简要大纲扩写为正式的小说文段，风格与上下文保持一致，情节严格遵循大纲，不要擅自大幅改动设定。',
    '只输出扩写后的正文，不要输出解释。',
  ].join('\n'),
  summarize: [
    '你是一位小说剧情整理助手。请把用户给出的章节正文总结为简明扼要的剧情摘要，',
    '包含：主要事件、出场人物、关键转折与悬念。控制在 200~400 字，直接输出摘要正文。',
  ].join('\n'),
};

// AI 提示：阅读区（只读上下文）+ 编辑区（草稿）-> 写作提示
router.post('/hint', async (req, res) => {
  try {
    const { reading = '', draft = '' } = req.body || {};
    const system = resolvePrompt('writing-hint', DEFAULT_PROMPTS.hint);
    const user = [
      reading ? `【已完成正文】\n${reading}` : '',
      draft ? `【当前草稿】\n${draft}` : '',
      '\n请给出写作提示。',
    ].filter(Boolean).join('\n\n');
    const hint = await chat(system, user);
    res.json({ hint });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI 补全：编辑区简要大纲 -> 正式文段
router.post('/complete', async (req, res) => {
  try {
    const { reading = '', outline = '' } = req.body || {};
    if (!outline.trim()) return res.status(400).json({ error: '编辑区大纲为空' });
    const system = resolvePrompt('writing-complete', DEFAULT_PROMPTS.complete);
    const user = [
      reading ? `【已完成正文】\n${reading}` : '',
      `【简要大纲】\n${outline}`,
      '\n请把简要大纲扩写为正式文段。',
    ].filter(Boolean).join('\n\n');
    const text = await chat(system, user);
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 本章总结：先归档章节正文，再生成摘要并存入独立的章节总结目录
router.post('/summarize', async (req, res) => {
  try {
    const { content = '', chapter = '' } = req.body || {};
    if (!content.trim()) return res.status(400).json({ error: '本章内容为空' });

    const title = (chapter || '未命名章节').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名章节';
    const bodyDir = path.join(RAG_DIR, 'plots', 'chapter-bodies');
    const summaryDir = path.join(RAG_DIR, 'plots', 'chapter-summaries');
    fs.mkdirSync(bodyDir, { recursive: true });
    fs.mkdirSync(summaryDir, { recursive: true });

    const bodyPath = path.posix.join('plots', 'chapter-bodies', `${title}.md`);
    const summaryPath = path.posix.join('plots', 'chapter-summaries', `${title}.md`);

    // 正文先落盘，避免 AI 总结失败时本章内容也未归档。
    fs.writeFileSync(
      path.join(RAG_DIR, bodyPath),
      `# ${title} · 章节正文\n\n${content.trim()}\n`,
      'utf8'
    );

    const system = DEFAULT_PROMPTS.summarize;
    const summary = await chat(system, `【章节正文】\n${content}`);
    fs.writeFileSync(
      path.join(RAG_DIR, summaryPath),
      `# ${title} · 章节总结\n\n${summary}\n`,
      'utf8'
    );

    res.json({ summary, bodyPath, summaryPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
