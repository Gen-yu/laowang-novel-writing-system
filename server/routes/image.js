/**
 * 生图路由：提示词优化 / 图片生成
 *
 * 提示词优化对应 skills/image-prompt-optimize（skill 正文为空时使用默认提示词）。
 */
const express = require('express');
const { chat } = require('../services/llm');
const { resolvePrompt } = require('../services/skillLoader');
const { generateImage } = require('../services/imageService');

const router = express.Router();

const DEFAULT_OPTIMIZE_PROMPT = [
  '你是一位 AI 绘画提示词专家。请优化用户给出的图片提示词：',
  '补充画面主体、构图、光影、色彩、风格与细节描述，使其更适合文生图模型。',
  '直接输出优化后的提示词本身，不要输出解释。',
].join('\n');

// 优化提示词（调用 image-prompt-optimize skill）
router.post('/optimize', async (req, res) => {
  try {
    const { prompt = '' } = req.body || {};
    if (!prompt.trim()) return res.status(400).json({ error: '提示词为空' });
    const system = resolvePrompt('image-prompt-optimize', DEFAULT_OPTIMIZE_PROMPT);
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
