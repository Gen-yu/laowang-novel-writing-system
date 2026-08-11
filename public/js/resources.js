/**
 * 资料页：当前书籍下的资源管理与分卷总结。
 */
const ragTree = document.getElementById('rag-tree');
const resourceTitle = document.getElementById('resource-title');
const resourceEditor = document.getElementById('resource-editor');
const btnSaveFile = document.getElementById('btn-save-file');
const volumeModal = document.getElementById('volume-modal');
const volumeNumber = document.getElementById('volume-number');
const volumeChapters = document.getElementById('volume-chapters');
const volumeWarning = document.getElementById('volume-warning');

let currentFilePath = null;

const DIR_LABELS = {
  characters: '人物设定',
  plots: '剧情',
  volumes: '分卷剧情',
  'chapter-bodies': '章节正文',
  'chapter-summaries': '章节总结',
  settings: '设定集',
};

function resetResourceEditor() {
  currentFilePath = null;
  resourceTitle.textContent = '未选择文件';
  resourceEditor.value = '';
  resourceEditor.disabled = true;
  btnSaveFile.disabled = true;
}

window.loadRagTree = async function loadRagTree() {
  const book = getCurrentBook();
  if (!book) return;
  try {
    const { tree } = await api(`/api/rag/tree?book=${encodeURIComponent(book)}`);
    ragTree.innerHTML = '';
    ragTree.appendChild(renderTree(tree));
  } catch (err) {
    toast('加载资料库失败：' + err.message, true);
  }
};

window.addEventListener('books-ready', () => window.loadRagTree());
window.addEventListener('book-changed', () => {
  resetResourceEditor();
  closeVolumeModal();
  window.loadRagTree();
});

function renderTree(nodes) {
  const frag = document.createDocumentFragment();
  nodes.forEach((node) => {
    const item = document.createElement('div');
    item.className = 'tree-item';
    const row = document.createElement('div');
    row.className = 'tree-row';
    row.dataset.path = node.path;
    if (node.path === currentFilePath) row.classList.add('selected');

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = node.type === 'dir' ? '▾' : '✎';
    const label = document.createElement('span');
    label.textContent = node.type === 'dir' ? (DIR_LABELS[node.name] || node.name) : node.name;
    row.append(icon, label);
    item.appendChild(row);

    if (node.type === 'dir') {
      const children = document.createElement('div');
      children.className = 'tree-children';
      children.appendChild(renderTree(node.children || []));
      item.appendChild(children);
      row.addEventListener('click', () => {
        children.classList.toggle('collapsed');
        icon.textContent = children.classList.contains('collapsed') ? '▸' : '▾';
      });
    } else {
      row.addEventListener('click', () => openFile(node.path, node.name, row));
    }
    frag.appendChild(item);
  });
  return frag;
}

async function openFile(filePath, name, row) {
  try {
    const query = new URLSearchParams({ book: getCurrentBook(), path: filePath });
    const { content } = await api(`/api/rag/file?${query}`);
    currentFilePath = filePath;
    resourceTitle.textContent = name;
    resourceEditor.value = content;
    resourceEditor.disabled = false;
    btnSaveFile.disabled = false;
    ragTree.querySelectorAll('.tree-row.selected').forEach((element) => element.classList.remove('selected'));
    if (row) row.classList.add('selected');
  } catch (err) {
    toast('打开文件失败：' + err.message, true);
  }
}

btnSaveFile.addEventListener('click', () => {
  if (!currentFilePath) return;
  withLoading(btnSaveFile, async () => {
    await api('/api/rag/file', {
      method: 'POST',
      body: { book: getCurrentBook(), path: currentFilePath, content: resourceEditor.value },
    });
    toast('已保存');
  });
});

document.getElementById('btn-new-file').addEventListener('click', async () => {
  const filePath = prompt(
    `输入新文件路径（相对于《${getCurrentBook()}》目录）：\n\n例如 characters/新角色.md、settings/新设定.md`,
    'characters/新文件.md'
  );
  if (!filePath) return;
  try {
    await api('/api/rag/file', {
      method: 'POST',
      body: { book: getCurrentBook(), path: filePath, content: '' },
    });
    toast('已创建');
    await window.loadRagTree();
  } catch (err) {
    toast('创建失败：' + err.message, true);
  }
});

document.getElementById('btn-refresh-tree').addEventListener('click', () => window.loadRagTree());

document.getElementById('btn-volume-summary').addEventListener('click', async () => {
  try {
    const query = new URLSearchParams({ book: getCurrentBook() });
    const meta = await api(`/api/ai/volume-summary/meta?${query}`);
    volumeNumber.value = meta.nextVolumeNumber;
    volumeNumber.dataset.expected = meta.nextVolumeNumber;
    volumeChapters.innerHTML = '';
    if (!meta.chapters.length) {
      volumeChapters.innerHTML = '<p class="modal-empty">当前书籍还没有可用的章节总结。</p>';
    }
    let previous = null;
    meta.chapters.forEach((chapter) => {
      const label = document.createElement('label');
      label.className = `chapter-option${chapter.assigned ? ' assigned' : ''}`;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = chapter.chapterNumber;
      checkbox.disabled = chapter.assigned;
      const continuesDefaultRange = !chapter.assigned && (
        previous === null || chapter.chapterNumber === previous + 1
      );
      checkbox.checked = continuesDefaultRange;
      if (continuesDefaultRange) previous = chapter.chapterNumber;
      const text = document.createElement('span');
      text.textContent = `${chapter.name}${chapter.assigned ? '（已归卷）' : ''}`;
      label.append(checkbox, text);
      volumeChapters.appendChild(label);
    });
    updateVolumeWarning();
    volumeModal.classList.remove('hidden');
  } catch (err) {
    toast('加载分卷信息失败：' + err.message, true);
  }
});

volumeNumber.addEventListener('input', updateVolumeWarning);

function updateVolumeWarning() {
  const expected = Number(volumeNumber.dataset.expected);
  const actual = Number(volumeNumber.value);
  const wrong = actual !== expected;
  volumeWarning.textContent = wrong ? `卷号不正确，当前应总结第${expected}卷。` : '';
  volumeWarning.classList.toggle('hidden', !wrong);
}

function closeVolumeModal() {
  volumeModal.classList.add('hidden');
  volumeWarning.classList.add('hidden');
}

document.getElementById('btn-close-volume').addEventListener('click', closeVolumeModal);
document.getElementById('btn-cancel-volume').addEventListener('click', closeVolumeModal);
volumeModal.addEventListener('click', (event) => {
  if (event.target === volumeModal) closeVolumeModal();
});

document.getElementById('btn-generate-volume').addEventListener('click', (event) => {
  withLoading(event.currentTarget, async () => {
    const chapters = Array.from(volumeChapters.querySelectorAll('input:checked'))
      .map((input) => Number(input.value))
      .sort((a, b) => a - b);
    const result = await api('/api/ai/volume-summary', {
      method: 'POST',
      body: {
        book: getCurrentBook(),
        volumeNumber: Number(volumeNumber.value),
        chapters,
      },
    });
    closeVolumeModal();
    await window.loadRagTree();
    await openFile(result.path, `${result.title}.md`);
    toast(`已生成${result.title}`);
  });
});
