/**
 * 伪 skill 加载器。
 * SKILL.md 只是供模型读取的纯文本 system prompt，不执行标准 Agent Skill。
 */
const fs = require('fs');
const path = require('path');
const { SKILLS_DIR } = require('../config');

function stripFrontmatter(text) {
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? text.slice(match[0].length) : text;
}

function loadSkill(skillName) {
  const file = path.join(SKILLS_DIR, skillName, 'SKILL.md');
  try {
    return stripFrontmatter(fs.readFileSync(file, 'utf8')).trim();
  } catch {
    return '';
  }
}

function requirePrompt(skillName) {
  const prompt = loadSkill(skillName);
  if (!prompt) {
    throw new Error(`伪 skill「${skillName}」缺失或正文为空，请检查 skills/${skillName}/SKILL.md`);
  }
  return prompt;
}

module.exports = { loadSkill, requirePrompt, stripFrontmatter };
