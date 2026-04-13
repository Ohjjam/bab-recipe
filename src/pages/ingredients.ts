import { getAllIngredients, getIngredientsByCategory, addIngredient, deleteIngredient } from '../db';
import { subscribe, emit, EVENTS } from '../state';
import { CATEGORIES, type Category, type Ingredient } from '../types';

export function renderIngredients(container: HTMLElement): () => void {
  let activeCategory: Category | '전체' = '전체';

  container.innerHTML = `
    <div class="category-tabs" id="cat-tabs"></div>
    <form class="add-form" id="add-form">
      <input type="text" id="add-name" placeholder="재료 이름" autocomplete="off" required />
      <input type="text" id="add-memo" placeholder="메모" style="width:80px" />
      <select id="add-cat">
        ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
      <button type="submit" class="btn btn-primary">+</button>
    </form>
    <div class="ingredient-list" id="ingredient-list"></div>
  `;

  const tabsEl = container.querySelector('#cat-tabs')!;
  const listEl = container.querySelector('#ingredient-list')!;
  const form = container.querySelector('#add-form') as HTMLFormElement;
  const nameInput = container.querySelector('#add-name') as HTMLInputElement;
  const memoInput = container.querySelector('#add-memo') as HTMLInputElement;
  const catSelect = container.querySelector('#add-cat') as HTMLSelectElement;

  function renderTabs() {
    const allTabs: (Category | '전체')[] = ['전체', ...CATEGORIES];
    tabsEl.innerHTML = allTabs.map(c =>
      `<button type="button" class="category-tab ${c === activeCategory ? 'active' : ''}" data-cat="${c}">${c}</button>`
    ).join('');
  }

  async function renderList() {
    const items = activeCategory === '전체'
      ? await getAllIngredients()
      : await getIngredientsByCategory(activeCategory);

    if (items.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🧊</div>
          <div class="empty-state-text">재료가 없습니다<br>위에서 재료를 추가해보세요</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = items.map(item => `
      <div class="ingredient-item" data-id="${item.id}">
        <div class="ingredient-info">
          <div class="ingredient-name">${escapeHtml(item.name)}</div>
          <div class="ingredient-meta">${item.memo ? escapeHtml(item.memo) + ' · ' : ''}${timeAgo(item.addedAt)}</div>
        </div>
        <span class="ingredient-badge">${item.category}</span>
        <button class="ingredient-delete" data-id="${item.id}">✕</button>
      </div>
    `).join('');
  }

  // Tab click
  tabsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.category-tab') as HTMLElement | null;
    if (!btn) return;
    activeCategory = btn.dataset.cat as Category | '전체';
    renderTabs();
    renderList();
  });

  // Add form
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;

    const ingredient: Ingredient = {
      id: crypto.randomUUID(),
      name,
      category: catSelect.value as Category,
      addedAt: Date.now(),
      memo: memoInput.value.trim() || undefined,
    };

    await addIngredient(ingredient);
    nameInput.value = '';
    memoInput.value = '';
    nameInput.focus();
    emit(EVENTS.INGREDIENTS_CHANGED);
  });

  // Delete
  listEl.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('.ingredient-delete') as HTMLElement | null;
    if (!btn) return;
    const id = btn.dataset.id!;
    await deleteIngredient(id);
    emit(EVENTS.INGREDIENTS_CHANGED);
  });

  renderTabs();
  renderList();

  const unsub = subscribe(EVENTS.INGREDIENTS_CHANGED, () => renderList());
  return unsub;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}
