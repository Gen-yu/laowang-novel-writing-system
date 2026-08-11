/**
 * 写作大模型客户端（Chat Completions 接口）
 */
const { API_BASE_URL, WRITING_API_KEY, WRITING_MODEL } = require('../config');

/**
 * 调用写作模型
 * @param {string} system 系统提示词
 * @param {string} user 用户输入
 * @returns {Promise<string>} 模型输出文本
 */
async function chat(system, user) {
  if (!API_BASE_URL || !WRITING_API_KEY) {
    throw new Error('写作模型未配置：请检查 .env 中的 API_BASE_URL / WRITING_API_KEY');
  }

  const res = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${WRITING_API_KEY}`,
    },
    body: JSON.stringify({
      model: WRITING_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`写作模型请求失败（${res.status}）：${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('写作模型返回为空');
  return content.trim();
}

module.exports = { chat };
