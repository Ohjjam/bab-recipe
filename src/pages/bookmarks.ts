import { getAllBookmarks, deleteBookmark } from '../db';
import { subscribe, EVENTS } from '../state';
import type { Bookmark } from '../types';

export function renderBookmarks(container: HTMLElement): () => void {
  let expandedId: string | null = null;

  container.innerHTML = `<div id="bookmark-list"></div>`;
  const listEl = container.querySelector('#bookmark-list')!;

  async function renderList() {
    const items = await getAllBookmarks();

    if (items.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⭐</div>
          <div class="empty-state-text">저장된 레시피가 없습니다<br>레시피 추천에서 ⭐ 저장을 눌러보세요</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = items.map((b) => `
      <div class="bookmark-card" data-id="${b.id}">
        <div class="bookmark-title">${escapeHtml(b.title)}</div>
        <div class="bookmark-date">${formatDate(b.savedAt)}</div>
        ${expandedId === b.id ? `
          <div class="bookmark-content">${escapeHtml(b.content)}</div>
          <div class="bookmark-actions">
            <button class="btn btn-danger" data-delete="${b.id}" style="flex:1">🗑️ 삭제</button>
            <button class="btn btn-outline" data-close="${b.id}" style="flex:1">접기</button>
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  listEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    const deleteBtn = target.closest('[data-delete]') as HTMLElement | null;
    if (deleteBtn) {
      e.stopPropagation();
      await deleteBookmark(deleteBtn.dataset.delete!);
      expandedId = null;
      renderList();
      return;
    }

    const closeBtn = target.closest('[data-close]') as HTMLElement | null;
    if (closeBtn) {
      e.stopPropagation();
      expandedId = null;
      renderList();
      return;
    }

    const card = target.closest('.bookmark-card') as HTMLElement | null;
    if (card) {
      const id = card.dataset.id!;
      expandedId = expandedId === id ? null : id;
      renderList();
    }
  });

  renderList();

  const unsub = subscribe(EVENTS.BOOKMARKS_CHANGED, () => renderList());
  return unsub;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}
