/**
 * 生图服务（Images Generations 接口）
 * 生成的图片保存到 public/generated/，前端通过 /generated/<文件名> 访问
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { API_BASE_URL, IMAGE_API_KEY, IMAGE_MODEL, GENERATED_DIR } = require('../config');

/**
 * 生成图片并保存到本地
 * @param {string} prompt 图片提示词
 * @returns {Promise<{url: string, file: string}>} 可访问的图片地址
 */
async function generateImage(prompt) {
  if (!API_BASE_URL || !IMAGE_API_KEY) {
    throw new Error('生图模型未配置：请检查 .env 中的 API_BASE_URL / IMAGE_API_KEY');
  }

  const res = await fetch(`${API_BASE_URL}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${IMAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      n: 1,
      size: '1024x1024',
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`生图请求失败（${res.status}）：${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const item = data?.data?.[0];
  if (!item) throw new Error('生图接口返回为空');

  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.png`;
  const filepath = path.join(GENERATED_DIR, filename);

  // 兼容两种返回：b64_json 或 url
  if (item.b64_json) {
    fs.writeFileSync(filepath, Buffer.from(item.b64_json, 'base64'));
  } else if (item.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) throw new Error(`下载生成图片失败（${imgRes.status}）`);
    fs.writeFileSync(filepath, Buffer.from(await imgRes.arrayBuffer()));
  } else {
    throw new Error('生图接口未返回图片数据');
  }

  return { url: `/generated/${filename}`, file: filename };
}

module.exports = { generateImage };
