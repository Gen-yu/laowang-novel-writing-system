/**
 * 生图路由：提示词优化 / 图片生成
 *
 * 提示词优化对应 skills/image-prompt-optimize 纯文本伪 skill。
 */
const express = require('express');
const { chat } = require('../services/llm');
const { requirePrompt } = require('../services/skillLoader');
const { generateImage } = require('../services/imageService');

const router = express.Router();

// 优化提示词（调用 image-prompt-optimize skill）
router.post('/optimize', async (req, res) => {
  try {
    const { prompt = '' } = req.body || {};
    if (!prompt.trim()) return res.status(400).json({ error: '提示词为空' });
    const system = requirePrompt('image-prompt-optimize');
    const optimized = await chat(system, prompt);
    res.json({ optimized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 生成图片
router.post('/generate', async (req, res) => {
  try {
    const { prompt = '' } = req.body || {};
    if (!prompt.trim()) return res.status(400).json({ error: '提示词为空' });
    const result = await generateImage(prompt);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
