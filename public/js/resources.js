/**
 * 资料页：左侧 RAG 资源管理器 + 右侧文件查看 / 编辑
 * 数据存储在 RAG/ 目录（人物设定 / 分卷剧情 / 章节正文 / 章节总结 / 设定集）
 */

const ragTree = document.getElementById('rag-tree');
const resourceTitle = document.getElementById('resource-title');
const resourceEditor = document.getElementById('resource-editor');
const btnSaveFile = document.getElementById('btn-save-file');

let currentFilePath = null;

// ---------- 目录树 ----------
window.loadRagTree = async function loadRagTree() {
  try {
    const { tree } = await api('/api/rag/tree');
    ragTree.innerHTML = '';
    ragTree.appendChild(renderTree(tree));
  } catch (err) {
    toast('加载资料库失败：' + err.message, true);
  }
};

const DIR_LABELS = {
  characters: '人物设定',
  plots: '剧情',
  volumes: '分卷剧情',
  'chapter-bodies': '章节正文',
  'chapter-summaries': '章节总结',
  settings: '设定集',
};

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
    icon.textContent = node.type === 'dir' ? '▸' : '✎';

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
      icon.textContent = '▾'; // 默认展开
    } else {
      row.addEventListener('click', () => openFile(node.path, node.name, row));
    }

    frag.appendChild(item);
  });
  return frag;
}

// ---------- 打开文件 ----------
async function openFile(path, name, row) {
  try {
    const { content } = await api(`/api/rag/file?path=${encodeURIComponent(path)}`);
    currentFilePath = path;
    resourceTitle.textContent = name;
    resourceEditor.value = content;
    resourceEditor.disabled = false;
    btnSaveFile.disabled = false;
    ragTree.querySelectorAll('.tree-row.selected').forEach((el) => el.classList.remove('selected'));
    if (row) row.classList.add('selected');
  } catch (err) {
    toast('打开文件失败：' + err.message, true);
  }
}

// ---------- 保存文件 ----------
btnSaveFile.addEventListener('click', () => {
  if (!currentFilePath) return;
  withLoading(btnSaveFile, async () => {
    await api('/api/rag/file', {
      method: 'POST',
      body: { path: currentFilePath, content: resourceEditor.value },
    });
    toast('已保存');
  });
});

// ---------- 新建文件 ----------
document.getElementById('btn-new-file').addEventListener('click', async () => {
  const path = prompt(
    '输入新文件路径（相对于 RAG/ 目录）：\n\n例如 characters/新角色.md、plots/volumes/第二卷.md',
    'characters/新文件.md'
  );
  if (!path) return;
  try {
    await api('/api/rag/file', { method: 'POST', body: { path, content: '' } });
    toast('已创建');
    await window.loadRagTree();
  } catch (err) {
    toast('创建失败：' + err.message, true);
  }
});

// ---------- 刷新 ----------
document.getElementById('btn-refresh-tree').addEventListener('click', () => window.loadRagTree());

// 首次加载
window.loadRagTree();
