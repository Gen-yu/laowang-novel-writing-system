# 小说辅助系统

一个模拟纸质阅读风格的小说创作辅助系统，包含 **写作页**、**资料页**、**生图页** 三大功能，由 Node.js 服务器驱动，AI 能力通过专用 skill 扩展。

## 功能说明

### 1. 写作页（核心：AI 提示与补全）

页面分为左右两栏：

- **左侧 · 阅读区**：已定稿的正文，可上下滑动阅读。用鼠标**划选**任意文字后，点击浮现的「放回编辑区」按钮，即可在编辑区修改；点击「确认替换」后，修改内容会回到原来的段落位置，而不是追加到正文末尾。召回编辑状态会自动保存，刷新后仍可继续替换。
- **右侧 · 编辑区**：在此写作。功能按钮：
  - **确认归稿 / 确认替换**：普通草稿归入阅读区末尾；从阅读区召回的内容则替换回原位置；
  - **AI 提示**：AI 结合已定稿正文与当前草稿，给出 3~5 条写作提示（调用 `writing-hint` skill）；
  - **AI 补全**：把编辑区中的简要大纲扩写为正式文段并写回编辑区（调用 `writing-complete` skill）；
  - **总结本章**：先把本章定稿正文归档到 `RAG/plots/chapter-bodies/`，再由 AI 生成剧情摘要并存入 `RAG/plots/chapter-summaries/`（均可在资料页查看）。

> 设计思想：**阅读区对 AI 只读，编辑区对 AI 读写**。AI 的改动只发生在编辑区，经用户确认后才归入阅读区，避免 AI 大幅更改已定稿内容。

写作状态（定稿段落、草稿、章节名及进行中的召回编辑）自动保存在 `data/writing.json`，刷新不丢失。召回编辑时，原有草稿会暂存；完成原位替换后会自动恢复。

### 2. 资料页（核心：RAG 资料管理）

- 左侧为资源管理器，右侧查看 / 编辑选中文件，可保存、新建、刷新。
- 所有资料以 Markdown 文件存储在 `RAG/` 目录：
  - `RAG/characters/` —— 人物设定
  - `RAG/plots/volumes/` —— 分卷剧情
  - `RAG/plots/chapter-bodies/` —— 章节正文（写作页总结本章时自动写入）
  - `RAG/plots/chapter-summaries/` —— 章节总结（写作页总结本章时自动写入）
  - `RAG/settings/` —— 设定集（术语）

### 3. 生图页（核心：提示词优化 + 生成图片）

- 输入图片描述后，可先点 **优化提示词**（调用 `image-prompt-optimize` skill）再生成，也可直接 **生成图片**。
- 生成的图片保存在 `public/generated/`，页面内即时展示。

## 目录结构

```
├── server/              # 后端
│   ├── index.js         #   服务器入口
│   ├── config.js        #   .env 配置加载
│   ├── routes/          #   路由（ai / image / rag / writing）
│   └── services/        #   LLM 客户端、生图服务、skill 加载器
├── public/              # 前端
│   ├── index.html       #   单页应用（导航栏 + 三个功能页）
│   ├── css/style.css    #   纸质阅读风格样式
│   ├── js/              #   各页面前端逻辑
│   └── generated/       #   AI 生成的图片
├── skills/              # agent 专用 skill（当前留空占位）
│   ├── writing-hint/SKILL.md
│   ├── writing-complete/SKILL.md
│   └── image-prompt-optimize/SKILL.md
├── RAG/                 # 资料库（人物 / 剧情 / 设定集）
├── data/                # 写作状态持久化
├── .env                 # 大模型接口配置
└── package.json
```

## 使用方法

```bash
npm install     # 首次运行安装依赖
npm start       # 启动服务
```

然后浏览器访问 **http://localhost:4000**（端口以 `.env` 中 `PORT` 为准）。

开发调试可用 `npm run dev`（代码改动自动重启）。

## Skill 扩展

`skills/` 下每个文件夹对应一个 agent 专用 skill（`SKILL.md`）。当前按需求**留空占位**，系统使用服务器内置默认提示词。

在任意 `SKILL.md` 的 frontmatter 下方**填入正文**后，正文将作为该功能的系统提示词（system prompt），覆盖内置默认提示词 —— 无需改动任何代码即可定制 AI 行为。

## 大模型依赖

见 `.env` 文件：

| 用途 | 接口 | 模型 |
| --- | --- | --- |
| 写作（提示/补全/总结/提示词优化） | `/v1/chat/completions` | `WRITING_MODEL` |
| 生图 | `/v1/images/generations` | `IMAGE_MODEL` |

## 注意事项

- `.env` 包含 API 密钥，请勿提交到公共仓库。
- 资料页的所有读写都限制在 `RAG/` 目录内，防止路径穿越。
