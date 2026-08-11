/**
 * 写作页：按当前书籍加载与保存独立工作区。
 */
const readingArea = document.getElementById('reading-area');
const editor = document.getElementById('editor');
const chapterTitle = document.getElementById('chapter-title');
const btnConfirm = document.getElementById('btn-confirm');
const btnRecall = document.getElementById('btn-recall');
const aiOutput = document.getElementById('ai-output');
const aiOutputTitle = document.getElementById('ai-output-title');
const aiOutputBody = document.getElementById('ai-output-body');

const writingState = { paragraphs: [], draft: '', chapter: '', activeRecall: null };
let loadedBook = '';
let saveTimer = null;
let pendingSelection = null;

function resetWritingState() {
  Object.assign(writingState, { paragraphs: [], draft: '', chapter: '', activeRecall: null });
  editor.value = '';
  chapterTitle.value = '';
  hideRecall();
  renderReading();
  updateRecallMode();
}

async function loadWriting(book = getCurrentBook()) {
  if (!book) return;
  clearTimeout(saveTimer);
  resetWritingState();
  const data = await api(`/api/writing?book=${encodeURIComponent(book)}`);
  loadedBook = book;
  Object.assign(writingState, data);
  editor.value = data.draft;
  chapterTitle.value = data.chapter;
  renderReading();
  updateRecallMode();
}

window.addEventListener('books-ready', (event) => {
  loadWriting(event.detail.book).catch((err) => toast('载入写作状态失败：' + err.message, true));
});

window.addEventListener('book-changed', (event) => {
  loadWriting(event.detail.book).catch((err) => toast('切换写作状态失败：' + err.message, true));
});

function renderReading() {
  readingArea.innerHTML = '';
  if (!writingState.paragraphs.length) {
    readingArea.innerHTML = '<p class="reading-empty">尚无定稿内容。在右侧编辑区写作后，点击「确认归稿」归入此处。</p>';
    return;
  }
  writingState.paragraphs.forEach((text) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    readingArea.appendChild(paragraph);
  });
}

function updateRecallMode() {
  btnConfirm.textContent = writingState.activeRecall ? '确认替换' : '确认归稿';
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveWriting(), 600);
}

async function saveWriting(book = loadedBook || getCurrentBook()) {
  if (!book) return;
  writingState.draft = editor.value;
  writingState.chapter = chapterTitle.value;
  await api('/api/writing', { method: 'POST', body: { book, ...writingState } });
}

window.flushWritingSave = async function flushWritingSave() {
  clearTimeout(saveTimer);
  if (loadedBook) await saveWriting(loadedBook);
};

editor.addEventListener('input', scheduleSave);
chapterTitle.addEventListener('input', scheduleSave);

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
    saveWriting().catch((err) => toast('保存失败：' + err.message, true));
    toast(`已在原位置替换 ${newParas.length} 段`);
    return;
  }

  writingState.paragraphs.push(...newParas);
  editor.value = '';
  renderReading();
  readingArea.scrollTop = readingArea.scrollHeight;
  saveWriting().catch((err) => toast('保存失败：' + err.message, true));
  toast(`已归稿 ${newParas.length} 段`);
});

document.getElementById('btn-hint').addEventListener('click', (event) => {
  withLoading(event.currentTarget, async () => {
    const { hint } = await api('/api/ai/hint', {
      method: 'POST',
      body: {
        book: getCurrentBook(),
        reading: writingState.paragraphs.join('\n\n'),
        draft: editor.value,
      },
    });
    showAiOutput('AI 写作提示', hint);
  });
});

document.getElementById('btn-complete').addEventListener('click', (event) => {
  withLoading(event.currentTarget, async () => {
    const { text } = await api('/api/ai/complete', {
      method: 'POST',
      body: {
        book: getCurrentBook(),
        reading: writingState.paragraphs.join('\n\n'),
        outline: editor.value,
      },
    });
    editor.value = text;
    scheduleSave();
    showAiOutput('AI 补全结果（已写入编辑区）', text);
  });
});

document.getElementById('btn-summarize').addEventListener('click', (event) => {
  withLoading(event.currentTarget, async () => {
    const book = getCurrentBook();
    const result = await api('/api/ai/summarize', {
      method: 'POST',
      body: {
        book,
        content: writingState.paragraphs.join('\n\n'),
        chapter: chapterTitle.value,
      },
    });
    chapterTitle.value = result.chapterTitle;
    writingState.chapter = result.chapterTitle;
    await saveWriting();
    showAiOutput(
      `${result.chapterTitle}（正文：RAG/${book}/${result.bodyPath}；总结：RAG/${book}/${result.summaryPath}；术语已更新）`,
      result.summary
    );
    toast('章节正文、总结与术语已存入当前书籍');
  });
});

function showAiOutput(title, body) {
  aiOutputTitle.textContent = title;
  aiOutputBody.textContent = body;
  aiOutput.classList.remove('hidden');
}

document.getElementById('ai-output-close').addEventListener('click', () => {
  aiOutput.classList.add('hidden');
});

readingArea.addEventListener('mouseup', () => {
  setTimeout(() => {
    if (!writingState.paragraphs.length || writingState.activeRecall) return hideRecall();
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) return hideRecall();
    const domRange = selection.getRangeAt(0);
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

document.addEventListener('mousedown', (event) => {
  if (event.target !== btnRecall) hideRecall();
});

btnRecall.addEventListener('click', () => {
  if (!pendingSelection || writingState.activeRecall) return hideRecall();
  const { range, text } = pendingSelection;
  writingState.activeRecall = {
    originalParagraphs: [...writingState.paragraphs],
    range,
    previousDraft: editor.value,
  };
  editor.value = text;
  updateRecallMode();
  saveWriting().catch((err) => toast('保存失败：' + err.message, true));
  window.getSelection().removeAllRanges();
  hideRecall();
  editor.focus();
  toast('已放回编辑区，确认后将替换原位置');
});

function hideRecall() {
  btnRecall.classList.add('hidden');
  pendingSelection = null;
}

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

function getRangeText(paragraphs, range) {
  const { startParagraphIndex, startOffset, endParagraphIndex, endOffset } = range;
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

function replaceRangeInParagraphs(paragraphs, range, replacementText) {
  const { startParagraphIndex, startOffset, endParagraphIndex, endOffset } = range;
  const before = paragraphs.slice(0, startParagraphIndex);
  const after = paragraphs.slice(endParagraphIndex + 1);
  const head = paragraphs[startParagraphIndex].slice(0, startOffset);
  const tail = paragraphs[endParagraphIndex].slice(endOffset);
  const replacement = splitParagraphs(replacementText);
  if (!replacement.length) return [...before, head + tail, ...after].filter((paragraph) => paragraph.trim());
  if (replacement.length === 1) {
    return [...before, head + replacement[0] + tail, ...after].filter((paragraph) => paragraph.trim());
  }
  const inserted = [
    head + replacement[0],
    ...replacement.slice(1, -1),
    replacement[replacement.length - 1] + tail,
  ].filter((paragraph) => paragraph.trim());
  return [...before, ...inserted, ...after];
}
