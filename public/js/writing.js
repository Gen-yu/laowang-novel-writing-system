/**
 * 写作页：阅读区（定稿，只读） + 编辑区（草稿，读写）
 *
 * 设计思想：阅读区对 AI 只读、编辑区对 AI 读写，
 * AI 的改动只发生在编辑区，确认后才归入阅读区。
 */

const readingArea = document.getElementById('reading-area');
const editor = document.getElementById('editor');
const chapterTitle = document.getElementById('chapter-title');
const btnConfirm = document.getElementById('btn-confirm');
const btnRecall = document.getElementById('btn-recall');
const aiOutput = document.getElementById('ai-output');
const aiOutputTitle = document.getElementById('ai-output-title');
const aiOutputBody = document.getElementById('ai-output-body');

/** 内存中的写作状态（与 data/writing.json 同步） */
const writingState = { paragraphs: [], draft: '', chapter: '', activeRecall: null };

// ---------- 初始化：加载已保存的写作状态 ----------
(async function initWriting() {
  try {
    const data = await api('/api/writing');
    Object.assign(writingState, data);
    editor.value = data.draft;
    chapterTitle.value = data.chapter;
    renderReading();
    updateRecallMode();
  } catch (err) {
    toast('载入写作状态失败：' + err.message, true);
  }
})();

// ---------- 阅读区渲染 ----------
function renderReading() {
  readingArea.innerHTML = '';
  if (!writingState.paragraphs.length) {
    readingArea.innerHTML = '<p class="reading-empty">尚无定稿内容。在右侧编辑区写作后，点击「确认归稿」归入此处。</p>';
    return;
  }
  writingState.paragraphs.forEach((text) => {
    const p = document.createElement('p');
    p.textContent = text;
    readingArea.appendChild(p);
  });
}

function updateRecallMode() {
  btnConfirm.textContent = writingState.activeRecall ? '确认替换' : '确认归稿';
}

// ---------- 状态持久化（防抖自动保存） ----------
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveWriting, 600);
}

async function saveWriting() {
  writingState.draft = editor.value;
  writingState.chapter = chapterTitle.value;
  try {
    await api('/api/writing', { method: 'POST', body: writingState });
  } catch (err) {
    toast('保存失败：' + err.message, true);
  }
}

editor.addEventListener('input', scheduleSave);
chapterTitle.addEventListener('input', scheduleSave);

// ---------- 确认归稿：普通草稿追加；召回内容替换回原位置 ----------
btnConfirm.addEventListener('click', () => {
  const text = editor.value.trim();
  if (!text) return toast('编辑区为空，无可归稿内容', true);
  const newParas = splitParagraphs(text);

  if (writingState.activeRecall) {
    const { originalParagraphs, range, previousDraft } = writingState.activeRecall;
    writingState.paragraphs = replaceRangeInParagraphs(originalParagraphs, range, text);
    writingState.activeRecall = null;
    editor.value = previousDraft;
    renderReading();
    updateRecallMode();
    saveWriting();
    toast(`已在原位置替换 ${newParas.length} 段`);
    return;
  }

  writingState.paragraphs.push(...newParas);
  editor.value = '';
  renderReading();
  readingArea.scrollTop = readingArea.scrollHeight;
  saveWriting();
  toast(`已归稿 ${newParas.length} 段`);
});

// ---------- AI 提示 ----------
document.getElementById('btn-hint').addEventListener('click', (e) => {
  withLoading(e.currentTarget, async () => {
    const { hint } = await api('/api/ai/hint', {
      method: 'POST',
      body: { reading: writingState.paragraphs.join('\n\n'), draft: editor.value },
    });
    showAiOutput('AI 写作提示', hint);
  });
});

// ---------- AI 补全：编辑区大纲 -> 正式文段（写回编辑区） ----------
document.getElementById('btn-complete').addEventListener('click', (e) => {
  withLoading(e.currentTarget, async () => {
    const { text } = await api('/api/ai/complete', {
      method: 'POST',
      body: { reading: writingState.paragraphs.join('\n\n'), outline: editor.value },
    });
    editor.value = text;
    scheduleSave();
    showAiOutput('AI 补全结果（已写入编辑区）', text);
  });
});

// ---------- 总结本章：正文与总结分别存入资料页 ----------
document.getElementById('btn-summarize').addEventListener('click', (e) => {
  withLoading(e.currentTarget, async () => {
    const content = writingState.paragraphs.join('\n\n');
    const result = await api('/api/ai/summarize', {
      method: 'POST',
      body: { content, chapter: chapterTitle.value },
    });
    if (!result.bodyPath || !result.summaryPath) {
      throw new Error('服务器仍在运行旧版本，请重启 npm start 后再总结本章');
    }
    showAiOutput(
      `本章总结（正文：RAG/${result.bodyPath}；总结：RAG/${result.summaryPath}）`,
      result.summary
    );
    toast('章节正文与总结已存入资料库');
  });
});

// ---------- AI 输出面板 ----------
function showAiOutput(title, body) {
  aiOutputTitle.textContent = title;
  aiOutputBody.textContent = body;
  aiOutput.classList.remove('hidden');
}

document.getElementById('ai-output-close').addEventListener('click', () => {
  aiOutput.classList.add('hidden');
});

// ---------- 划选阅读区文字 -> 放回编辑区 ----------
let pendingSelection = null;

readingArea.addEventListener('mouseup', () => {
  setTimeout(() => {
    if (!writingState.paragraphs.length || writingState.activeRecall) return hideRecall();
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return hideRecall();
    const domRange = sel.getRangeAt(0);
    if (!readingArea.contains(domRange.commonAncestorContainer)) return hideRecall();

    const range = getSelectionRange(domRange);
    if (!range) return hideRecall();
    const text = getRangeText(writingState.paragraphs, range);
    if (!text.trim()) return hideRecall();

    pendingSelection = { range, text };
    const rect = domRange.getBoundingClientRect();
    btnRecall.style.left = `${rect.left + rect.width / 2 - 50}px`;
    btnRecall.style.top = `${rect.bottom + 8}px`;
    btnRecall.classList.remove('hidden');
  }, 10);
});

document.addEventListener('mousedown', (e) => {
  if (e.target !== btnRecall) hideRecall();
});

btnRecall.addEventListener('click', () => {
  if (!pendingSelection || writingState.activeRecall) return hideRecall();
  const { range, text } = pendingSelection;

  writingState.activeRecall = {
    originalParagraphs: [...writingState.paragraphs],
    range,
    previousDraft: editor.value,
  };

  // 阅读区保持原样，确认替换时再按记录的段落位置更新正文。
  editor.value = text;
  updateRecallMode();
  saveWriting();
  window.getSelection().removeAllRanges();
  hideRecall();
  editor.focus();
  toast('已放回编辑区，确认后将替换原位置');
});

function hideRecall() {
  btnRecall.classList.add('hidden');
  pendingSelection = null;
}

/** 将 DOM 选区转换为段落索引与段内偏移。 */
function getSelectionRange(range) {
  const start = getParagraphPosition(range.startContainer, range.startOffset);
  const end = getParagraphPosition(range.endContainer, range.endOffset);
  if (!start || !end) return null;
  return {
    startParagraphIndex: start.paragraphIndex,
    startOffset: start.offset,
    endParagraphIndex: end.paragraphIndex,
    endOffset: end.offset,
  };
}

function getParagraphPosition(node, offset) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const paragraph = element && element.closest('#reading-area > p');
  if (!paragraph || paragraph.classList.contains('reading-empty')) return null;

  const paragraphIndex = Array.from(readingArea.children).indexOf(paragraph);
  if (paragraphIndex < 0) return null;

  try {
    const before = document.createRange();
    before.selectNodeContents(paragraph);
    before.setEnd(node, offset);
    return { paragraphIndex, offset: before.toString().length };
  } catch {
    return null;
  }
}

/** 按原段落结构提取选区文字，跨段时保留段落换行。 */
function getRangeText(paragraphs, range) {
  const {
    startParagraphIndex,
    startOffset,
    endParagraphIndex,
    endOffset,
  } = range;

  if (startParagraphIndex === endParagraphIndex) {
    return paragraphs[startParagraphIndex].slice(startOffset, endOffset);
  }

  return [
    paragraphs[startParagraphIndex].slice(startOffset),
    ...paragraphs.slice(startParagraphIndex + 1, endParagraphIndex),
    paragraphs[endParagraphIndex].slice(0, endOffset),
  ].join('\n\n');
}

function splitParagraphs(text) {
  return text.split(/\n\s*\n|\n/).map((part) => part.trim()).filter(Boolean);
}

/**
 * 使用召回前的段落快照和段落坐标，将编辑内容替换回原位置。
 * 支持单段、跨段及将一段替换为多段。
 */
function replaceRangeInParagraphs(paragraphs, range, replacementText) {
  const {
    startParagraphIndex,
    startOffset,
    endParagraphIndex,
    endOffset,
  } = range;
  const before = paragraphs.slice(0, startParagraphIndex);
  const after = paragraphs.slice(endParagraphIndex + 1);
  const head = paragraphs[startParagraphIndex].slice(0, startOffset);
  const tail = paragraphs[endParagraphIndex].slice(endOffset);
  const replacement = splitParagraphs(replacementText);

  if (!replacement.length) {
    return [...before, head + tail, ...after].filter((paragraph) => paragraph.trim());
  }

  if (replacement.length === 1) {
    return [...before, head + replacement[0] + tail, ...after]
      .filter((paragraph) => paragraph.trim());
  }

  const inserted = [
    head + replacement[0],
    ...replacement.slice(1, -1),
    replacement[replacement.length - 1] + tail,
  ].filter((paragraph) => paragraph.trim());

  return [...before, ...inserted, ...after];
}
