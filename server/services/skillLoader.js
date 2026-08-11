/**
 * Skill 加载器
 *
 * skills/ 目录下每个子文件夹对应一个 agent 专用 skill（SKILL.md）。
 * 目前 skill 文件按需求留空占位；当 skill 正文为空时，回退到内置默认提示词，
 * 之后在 SKILL.md 正文中填入的内容会直接覆盖默认提示词（作为 system prompt）。
 */
const fs = require('fs');
const path = require('path');
const { SKILLS_DIR } = require('../config');

/** 去除 SKILL.md 的 frontmatter，返回正文 */
function stripFrontmatter(text) {
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? text.slice(m[0].length) : text;
}

/**
 * 读取 skill 正文；文件不存在或正文为空时返回空字符串
 * @param {string} skillName skills/ 下的文件夹名
 */
function loadSkill(skillName) {
  const file = path.join(SKILLS_DIR, skillName, 'SKILL.md');
  try {
    const body = stripFrontmatter(fs.readFileSync(file, 'utf8')).trim();
    return body;
  } catch {
    return '';
  }
}

/**
 * 获取 skill 提示词：优先使用 SKILL.md 正文，为空则回退默认提示词
 * @param {string} skillName
 * @param {string} fallback 内置默认提示词
 */
function resolvePrompt(skillName, fallback) {
  const body = loadSkill(skillName);
  return body || fallback;
}

module.exports = { loadSkill, resolvePrompt };
