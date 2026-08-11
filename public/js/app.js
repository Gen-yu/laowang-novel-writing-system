/**
 * 全局：导航、当前书籍上下文与通用请求工具。
 */

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.page').forEach((page) => {
      page.classList.toggle('active', page.id === `page-${btn.dataset.page}`);
    });
    if (btn.dataset.page === 'resources' && window.loadRagTree) window.loadRagTree();
  });
});

const toastEl = document.getElementById('toast');
let toastTimer = null;

function toast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 3200);
}

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

const bookSelect = document.getElementById('book-select');
const bookContext = { current: '', books: [] };

function getCurrentBook() {
  return bookContext.current;
}

async function setCurrentBook(book, notify = true) {
  if (!book || book === bookContext.current) return;
  const previousBook = bookContext.current;
  if (window.flushWritingSave) await window.flushWritingSave();
  bookContext.current = book;
  bookSelect.value = book;
  localStorage.setItem('novel-current-book', book);
  if (notify) {
    window.dispatchEvent(new CustomEvent('book-changed', {
      detail: { book, previousBook },
    }));
  }
}

async function loadBooks(preferredBook, eventName = 'books-ready') {
  const { books } = await api('/api/rag/books');
  const previousBook = bookContext.current;
  bookContext.books = books;
  bookSelect.innerHTML = '';
  books.forEach((book) => {
    const option = document.createElement('option');
    option.value = book;
    option.textContent = book;
    bookSelect.appendChild(option);
  });
  if (!books.length) throw new Error('没有可用书籍，请先新建书籍');
  const stored = preferredBook || localStorage.getItem('novel-current-book');
  const selected = books.includes(stored) ? stored : (books.includes('example') ? 'example' : books[0]);
  bookContext.current = selected;
  bookSelect.value = selected;
  localStorage.setItem('novel-current-book', selected);
  window.dispatchEvent(new CustomEvent(eventName, {
    detail: { book: selected, books, previousBook },
  }));
}

bookSelect.addEventListener('change', () => {
  setCurrentBook(bookSelect.value).catch((err) => {
    bookSelect.value = bookContext.current;
    toast('切换书籍失败：' + err.message, true);
  });
});

document.getElementById('btn-new-book').addEventListener('click', async () => {
  const name = prompt('输入新书名称：');
  if (!name) return;
  try {
    const { book } = await api('/api/rag/books', { method: 'POST', body: { name } });
    if (window.flushWritingSave) await window.flushWritingSave();
    await loadBooks(book, 'book-changed');
    toast(`已创建并切换到《${book}》`);
  } catch (err) {
    toast('创建书籍失败：' + err.message, true);
  }
});

loadBooks().catch((err) => toast('加载书籍失败：' + err.message, true));
