/**
 * 全局：导航切换 + 通用工具（API 请求、Toast 提示、按钮加载态）
 */

// ---------- 导航切换 ----------
document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${btn.dataset.page}`));
    // 切到资料页时刷新目录树
    if (btn.dataset.page === 'resources' && window.loadRagTree) window.loadRagTree();
  });
});

// ---------- Toast ----------
const toastEl = document.getElementById('toast');
let toastTimer = null;

function toast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 3200);
}

// ---------- API 请求封装 ----------
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data;
}

// ---------- 按钮加载态 ----------
async function withLoading(btn, fn) {
  if (btn.classList.contains('loading')) return;
  const original = btn.textContent;
  btn.classList.add('loading');
  btn.disabled = true;
  try {
    await fn();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
    btn.textContent = original;
  }
}
