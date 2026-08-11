/**
 * AI 写作路由：提示、补全、章节总结与分卷总结。
 * 每项功能都从 skills/<name>/SKILL.md 读取纯文本伪 skill。
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { chat } = require('../services/llm');
const { requirePrompt } = require('../services/skillLoader');
const {
  atomicWrite,
  buildChapterTitle,
  ensureBookStructure,
  getChapterSummaries,
  getVolumes,
  resolveBookPath,
  resolveBookRoot,
} = require('../services/bookStorage');

const router = express.Router();

function requireExistingBook(book) {
  const root = resolveBookRoot(book);
  if (!fs.existsSync(root)) throw new Error('书籍不存在');
  ensureBookStructure(book);
}

function parseChapterSummaryOutput(text) {
  const match = String(text || '').match(
    /【章节总结】\s*([\s\S]*?)\s*【更新后术语】\s*([\s\S]+)$/
  );
  if (!match || !match[1].trim() || !match[2].trim()) {
    throw new Error('章节总结伪 skill 输出格式不正确，正文已保存，原术语未修改');
  }
  return { summary: match[1].trim(), terminology: match[2].trim() };
}

router.post('/hint', async (req, res) => {
  try {
    const { book, reading = '', draft = '' } = req.body || {};
    requireExistingBook(book);
    const system = requirePrompt('writing-hint');
    const user = [
      `【当前书籍】\n${book}`,
      reading ? `【已完成正文】\n${reading}` : '',
      draft ? `【当前草稿】\n${draft}` : '',
      '请给出写作提示。',
    ].filter(Boolean).join('\n\n');
    res.json({ hint: await chat(system, user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/complete', async (req, res) => {
  try {
    const { book, reading = '', outline = '' } = req.body || {};
    requireExistingBook(book);
    if (!outline.trim()) return res.status(400).json({ error: '编辑区大纲为空' });
    const system = requirePrompt('writing-complete');
    const user = [
      `【当前书籍】\n${book}`,
      reading ? `【已完成正文】\n${reading}` : '',
      `【简要大纲】\n${outline}`,
      '请把简要大纲扩写为正式文段。',
    ].filter(Boolean).join('\n\n');
    res.json({ text: await chat(system, user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/summarize', async (req, res) => {
  try {
    const { book, content = '', chapter = '' } = req.body || {};
    requireExistingBook(book);
    if (!content.trim()) return res.status(400).json({ error: '本章内容为空' });

    const { chapterNumber, chapterTitle } = buildChapterTitle(book, chapter);
    const bodyPath = path.posix.join('plots', 'chapter-bodies', `${chapterTitle}.md`);
    const summaryPath = path.posix.join('plots', 'chapter-summaries', `${chapterTitle}.md`);
    const terminologyPath = path.posix.join('settings', '术语.md');

    fs.writeFileSync(
      resolveBookPath(book, bodyPath),
      `# ${chapterTitle} · 章节正文\n\n${content.trim()}\n`,
      'utf8'
    );

    const terminologyFile = resolveBookPath(book, terminologyPath);
    const existingTerminology = fs.existsSync(terminologyFile)
      ? fs.readFileSync(terminologyFile, 'utf8').trim()
      : '';
    const system = requirePrompt('chapter-summary');
    const output = await chat(system, [
      `【当前书籍】\n${book}`,
      `【章节标题】\n${chapterTitle}`,
      `【已有术语】\n${existingTerminology || '（暂无）'}`,
      `【章节正文】\n${content.trim()}`,
    ].join('\n\n'));
    const { summary, terminology } = parseChapterSummaryOutput(output);

    fs.writeFileSync(
      resolveBookPath(book, summaryPath),
      `# ${chapterTitle} · 章节总结\n\n${summary}\n`,
      'utf8'
    );
    atomicWrite(terminologyFile, `${terminology}\n`);

    res.json({
      summary,
      chapterNumber,
      chapterTitle,
      bodyPath,
      summaryPath,
      terminologyPath,
    });
  } catch (err) {
    const status = /为空|不存在|请选择|非法/.test(err.message) ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.get('/volume-summary/meta', (req, res) => {
  try {
    const { book } = req.query;
    requireExistingBook(book);
    const volumes = getVolumes(book);
    const assigned = new Set();
    volumes.forEach((volume) => {
      if (!Number.isInteger(volume.startChapter) || !Number.isInteger(volume.endChapter)) return;
      for (let number = volume.startChapter; number <= volume.endChapter; number += 1) assigned.add(number);
    });
    const chapters = getChapterSummaries(book).map((chapter) => ({
      chapterNumber: chapter.chapterNumber,
      name: chapter.name.replace(/\.md$/i, ''),
      assigned: assigned.has(chapter.chapterNumber),
    }));
    res.json({
      nextVolumeNumber: volumes.length ? Math.max(...volumes.map((item) => item.volumeNumber)) + 1 : 1,
      volumes: volumes.map(({ volumeNumber, startChapter, endChapter, name }) => ({
        volumeNumber,
        startChapter,
        endChapter,
        name: name.replace(/\.md$/i, ''),
        structured: Number.isInteger(startChapter) && Number.isInteger(endChapter),
      })),
      chapters,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/volume-summary', async (req, res) => {
  try {
    const { book, volumeNumber, chapters = [] } = req.body || {};
    requireExistingBook(book);
    const volumes = getVolumes(book);
    const expectedVolume = volumes.length ? Math.max(...volumes.map((item) => item.volumeNumber)) + 1 : 1;
    const requestedVolume = Number(volumeNumber);
    if (!Number.isInteger(requestedVolume) || requestedVolume !== expectedVolume) {
      return res.status(400).json({ error: `卷号不正确，当前应总结第${expectedVolume}卷` });
    }

    const selected = chapters.map(Number);
    if (!selected.length || selected.some((number) => !Number.isInteger(number) || number < 1)) {
      return res.status(400).json({ error: '请至少选择一个有效章节' });
    }
    const unique = [...new Set(selected)];
    if (unique.length !== selected.length) return res.status(400).json({ error: '章节选择存在重复' });
    const sorted = [...unique].sort((a, b) => a - b);
    if (selected.some((number, index) => number !== sorted[index])) {
      return res.status(400).json({ error: '章节必须按章节号升序选择' });
    }
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index] !== sorted[index - 1] + 1) {
        return res.status(400).json({ error: '同一卷的章节必须连续' });
      }
    }
    const overlaps = volumes.some((volume) => (
      Number.isInteger(volume.startChapter) &&
      Number.isInteger(volume.endChapter) &&
      sorted.some((number) => number >= volume.startChapter && number <= volume.endChapter)
    ));
    if (overlaps) return res.status(400).json({ error: '所选章节已有归属卷，请重新选择' });

    const available = new Map(getChapterSummaries(book).map((chapter) => [chapter.chapterNumber, chapter]));
    const missing = sorted.filter((number) => !available.has(number));
    if (missing.length) return res.status(400).json({ error: `缺少第${missing.join('、')}章的章节总结` });

    const history = volumes.map((volume) => volume.content).join('\n\n---\n\n');
    const current = sorted.map((number) => available.get(number).content).join('\n\n---\n\n');
    const system = requirePrompt('volume-summary');
    const summary = (await chat(system, [
      `【当前书籍】\n${book}`,
      `【当前卷号】\n第${requestedVolume}卷`,
      `【历史分卷总结】\n${history || '（这是第一卷，暂无历史分卷总结）'}`,
      `【本卷章节总结】\n${current}`,
    ].join('\n\n'))).trim();
    if (!summary) throw new Error('分卷总结结果为空');

    const startChapter = sorted[0];
    const endChapter = sorted[sorted.length - 1];
    const title = `第${requestedVolume}卷：${startChapter}-${endChapter}`;
    const volumePath = path.posix.join('plots', 'volumes', `${title}.md`);
    fs.writeFileSync(
      resolveBookPath(book, volumePath),
      `# ${title}\n\n- 卷号：第${requestedVolume}卷\n- 章节范围：第${startChapter}章至第${endChapter}章\n\n${summary}\n`,
      'utf8'
    );
    res.json({ summary, title, path: volumePath });
  } catch (err) {
    const status = /不正确|请选择|重复|连续|归属|缺少|不存在|非法/.test(err.message) ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
