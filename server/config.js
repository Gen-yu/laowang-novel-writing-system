/**
 * 全局配置：从 .env 读取大模型接口配置
 */
require('dotenv').config();
const path = require('path');

const ROOT = path.join(__dirname, '..');

module.exports = {
  PORT: Number(process.env.PORT) || 4000,

  API_BASE_URL: (process.env.API_BASE_URL || '').replace(/\/+$/, ''),

  // 写作模型（Chat Completions）
  WRITING_API_KEY: process.env.WRITING_API_KEY || '',
  WRITING_MODEL: process.env.WRITING_MODEL || '',

  // 生图模型（Images Generations）
  IMAGE_API_KEY: process.env.IMAGE_API_KEY || '',
  IMAGE_MODEL: process.env.IMAGE_MODEL || '',

  // 目录
  ROOT,
  RAG_DIR: path.join(ROOT, 'RAG'),
  SKILLS_DIR: path.join(ROOT, 'skills'),
  DATA_DIR: path.join(ROOT, 'data'),
  GENERATED_DIR: path.join(ROOT, 'public', 'generated'),
};
