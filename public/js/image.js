/**
 * 生图页：提示词优化（调用 image-prompt-optimize skill） + 图片生成
 */

const imagePrompt = document.getElementById('image-prompt');
const imageOptimized = document.getElementById('image-optimized');
const imageResult = document.getElementById('image-result');

// ---------- 优化提示词 ----------
document.getElementById('btn-optimize').addEventListener('click', (e) => {
  const prompt = imagePrompt.value.trim();
  if (!prompt) return toast('请先输入提示词', true);
  withLoading(e.currentTarget, async () => {
    const { optimized } = await api('/api/image/optimize', {
      method: 'POST',
      body: { prompt },
    });
    imageOptimized.value = optimized;
    toast('提示词已优化');
  });
});

// ---------- 生成图片 ----------
document.getElementById('btn-generate').addEventListener('click', (e) => {
  // 优先使用优化后的提示词，未优化则用原始输入
  const prompt = (imageOptimized.value.trim() || imagePrompt.value.trim());
  if (!prompt) return toast('请先输入提示词', true);

  withLoading(e.currentTarget, async () => {
    imageResult.innerHTML = '<p class="image-loading">正在生成，请稍候</p>';
    const { url } = await api('/api/image/generate', {
      method: 'POST',
      body: { prompt },
    });
    imageResult.innerHTML = '';
    const img = document.createElement('img');
    img.src = url;
    img.alt = prompt;
    imageResult.appendChild(img);
    toast('图片已生成');
  });
});
