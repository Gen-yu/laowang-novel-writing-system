/**
 * 小说辅助系统 · 服务器入口
 * 静态托管 public/ 前端，并提供 /api/* 后端接口
 */
const express = require('express');
const path = require('path');
const config = require('./config');

const app = express();

// 启动时把旧版单书目录安全迁移为 RAG/example/，并迁移写作状态。
require('./services/bookStorage').migrateLegacyStorage();

app.use(express.json({ limit: '10mb' }));

// 前端静态资源
app.use(express.static(path.join(config.ROOT, 'public')));

// API 路由
app.use('/api/ai', require('./routes/ai'));
app.use('/api/image', require('./routes/image'));
app.use('/api/rag', require('./routes/rag'));
app.use('/api/writing', require('./routes/writing'));

app.listen(config.PORT, () => {
  console.log(`小说辅助系统已启动：http://localhost:${config.PORT}`);
});
