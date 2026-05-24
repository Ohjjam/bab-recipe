import { getAllIngredients, getIngredientsByCategory, addIngredient, deleteIngredient, updateIngredient } from '../db';
import { subscribe, emit, EVENTS } from '../state';
import { CATEGORIES, type Category, type Ingredient } from '../types';
import { navigate } from '../router';

export function renderIngredients(container: HTMLElement): () => void {
  let activeCategory: Category | '전체' = '전체';
  let editingId: string | null = null;

  container.innerHTML = `
    <div class="shopping-banner mb-16" id="shopping-banner">
      <div class="banner-icon">🛒</div>
      <div class="banner-content">
        <div class="banner-title">장보기 추천받기</div>
        <div class="banner-subtitle">냉장고 재료 맞춤 가성비 식재료 추천</div>
      </div>
      <button type="button" class="banner-btn" id="go-shopping-btn">추천받기 →</button>
    </div>
    <div class="category-tabs" id="cat-tabs"></div>
    <form class="add-form" id="add-form">
      <input type="text" id="add-name" placeholder="재료 이름" autocomplete="off" required />
      <input type="text" id="add-memo" placeholder="메모" style="width:70px" />
      <input type="date" id="add-expiry" title="유통기한" style="width:115px; font-size:12px; padding: 4px 6px" />
      <select id="add-cat">
        ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
      <button type="submit" class="btn btn-primary">+</button>
      <button type="button" class="btn-voice" id="voice-btn" title="음성 입력">🎤</button>
    </form>
    <div id="voice-status" class="voice-status" style="display:none"></div>
    <div class="ingredient-list" id="ingredient-list"></div>
  `;

  const tabsEl = container.querySelector('#cat-tabs')!;
  const listEl = container.querySelector('#ingredient-list')!;
  const form = container.querySelector('#add-form') as HTMLFormElement;
  const nameInput = container.querySelector('#add-name') as HTMLInputElement;
  const memoInput = container.querySelector('#add-memo') as HTMLInputElement;
  const expiryInput = container.querySelector('#add-expiry') as HTMLInputElement;
  const catSelect = container.querySelector('#add-cat') as HTMLSelectElement;
  const voiceBtn = container.querySelector('#voice-btn') as HTMLButtonElement;
  const voiceStatus = container.querySelector('#voice-status') as HTMLElement;
  const goShoppingBtn = container.querySelector('#go-shopping-btn') as HTMLButtonElement;

  goShoppingBtn.addEventListener('click', () => {
    navigate('/shopping');
  });

  // --- Voice Input ---
  let recognition: SpeechRecognition | null = null;
  let isListening = false;

  const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognitionAPI) {
    voiceBtn.style.display = 'none'; // 음성 인식 미지원 브라우저
  }

  function startVoice() {
    if (!SpeechRecognitionAPI) return;

    const rec: SpeechRecognition = new SpeechRecognitionAPI();
    recognition = rec;
    rec.lang = 'ko-KR';
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = async (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i].isFinal) continue;
        const text = event.results[i][0].transcript.trim();
        if (!text) continue;

        const parsed = parseVoiceInput(text);
        const ingredient: Ingredient = {
          id: crypto.randomUUID(),
          name: parsed.name,
          category: parsed.category,
          addedAt: Date.now(),
        };
        await addIngredient(ingredient);
        emit(EVENTS.INGREDIENTS_CHANGED);
        voiceStatus.textContent = `✅ "${parsed.name}" 추가됨 (${parsed.category})`;
      }
    };

    rec.onerror = () => {
      stopVoice();
      voiceStatus.textContent = '❌ 음성 인식 오류. 다시 시도해주세요.';
    };

    rec.onend = () => {
      if (isListening) {
        try { recognition?.start(); } catch { stopVoice(); }
      }
    };

    rec.start();
    isListening = true;
    voiceBtn.classList.add('listening');
    voiceStatus.style.display = 'block';
    voiceStatus.textContent = '🎙️ 듣고 있어요... 재료 이름을 말해주세요';
  }

  function stopVoice() {
    isListening = false;
    recognition?.stop();
    recognition = null;
    voiceBtn.classList.remove('listening');
    setTimeout(() => { voiceStatus.style.display = 'none'; }, 2000);
  }

  voiceBtn.addEventListener('click', () => {
    if (isListening) {
      stopVoice();
    } else {
      startVoice();
    }
  });

  // --- Tabs ---
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

    // Sort: expiryDate ascending (closest first), then items without expiryDate by addedAt descending
    items.sort((a, b) => {
      if (a.expiryDate && b.expiryDate) {
        return a.expiryDate.localeCompare(b.expiryDate);
      }
      if (a.expiryDate) return -1;
      if (b.expiryDate) return 1;
      return b.addedAt - a.addedAt;
    });

    if (items.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🧊</div>
          <div class="empty-state-text">재료가 없습니다<br>위에서 재료를 추가해보세요</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = items.map(item => {
      if (editingId === item.id) {
        return `
          <div class="ingredient-item editing" data-id="${item.id}" style="flex-direction: column; align-items: stretch; gap: 8px;">
            <form class="edit-item-form" data-id="${item.id}">
              <div style="display:flex; gap: 6px; width: 100%">
                <input type="text" class="edit-name" value="${escapeHtml(item.name)}" style="flex:2" required />
                <input type="text" class="edit-memo" value="${escapeHtml(item.memo || '')}" placeholder="메모" style="flex:1" />
              </div>
              <div style="display:flex; gap: 6px; width: 100%; align-items: center;">
                <input type="date" class="edit-expiry" value="${item.expiryDate || ''}" style="flex:1.5" />
                <select class="edit-cat" style="flex:1">
                  ${CATEGORIES.map(c => `<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
              </div>
              <div class="form-actions" style="margin-top: 4px;">
                <button type="submit" class="btn btn-primary btn-sm">저장</button>
                <button type="button" class="btn btn-outline btn-sm edit-cancel">취소</button>
              </div>
            </form>
          </div>
        `;
      }

      return `
        <div class="ingredient-item" data-id="${item.id}">
          <div class="ingredient-info">
            <div class="ingredient-name" style="display:flex; align-items:center; gap: 4px;">
              <span>${escapeHtml(item.name)}</span>
              ${getDDayBadge(item.expiryDate)}
            </div>
            <div class="ingredient-meta">
              ${item.expiryDate ? `<span style="color:var(--primary); font-weight:500">기한: ${item.expiryDate}</span> · ` : ''}
              ${item.memo ? escapeHtml(item.memo) + ' · ' : ''}
              ${timeAgo(item.addedAt)}
            </div>
          </div>
          <span class="ingredient-badge">${item.category}</span>
          <button class="ingredient-edit" data-id="${item.id}" style="background:none; border:none; cursor:pointer; padding:6px; font-size:14px; margin-left:4px">✏️</button>
          <button class="ingredient-delete" data-id="${item.id}">✕</button>
        </div>
      `;
    }).join('');
  }

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
      expiryDate: expiryInput.value || undefined,
    };

    await addIngredient(ingredient);
    nameInput.value = '';
    memoInput.value = '';
    expiryInput.value = '';
    nameInput.focus();
    emit(EVENTS.INGREDIENTS_CHANGED);
  });

  // Handle Edit and Delete inside List
  listEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    // Delete
    const deleteBtn = target.closest('.ingredient-delete') as HTMLElement | null;
    if (deleteBtn) {
      const id = deleteBtn.dataset.id!;
      await deleteIngredient(id);
      if (editingId === id) editingId = null;
      emit(EVENTS.INGREDIENTS_CHANGED);
      return;
    }

    // Edit trigger
    const editBtn = target.closest('.ingredient-edit') as HTMLElement | null;
    if (editBtn) {
      editingId = editBtn.dataset.id!;
      renderList();
      return;
    }

    // Edit cancel
    const cancelBtn = target.closest('.edit-cancel') as HTMLElement | null;
    if (cancelBtn) {
      editingId = null;
      renderList();
      return;
    }
  });

  // Handle edit form submit
  listEl.addEventListener('submit', async (e) => {
    const editForm = e.target as HTMLFormElement;
    if (!editForm.classList.contains('edit-item-form')) return;
    e.preventDefault();

    const id = editForm.dataset.id!;
    const nameVal = (editForm.querySelector('.edit-name') as HTMLInputElement).value.trim();
    const memoVal = (editForm.querySelector('.edit-memo') as HTMLInputElement).value.trim() || undefined;
    const expiryVal = (editForm.querySelector('.edit-expiry') as HTMLInputElement).value || undefined;
    const catVal = (editForm.querySelector('.edit-cat') as HTMLSelectElement).value as Category;

    const ingredients = await getAllIngredients();
    const original = ingredients.find(i => i.id === id);
    if (!original || !nameVal) return;

    const updated: Ingredient = {
      ...original,
      name: nameVal,
      memo: memoVal,
      expiryDate: expiryVal,
      category: catVal,
    };

    await updateIngredient(updated);
    editingId = null;
    emit(EVENTS.INGREDIENTS_CHANGED);
  });

  renderTabs();
  renderList();

  const unsub = subscribe(EVENTS.INGREDIENTS_CHANGED, () => renderList());
  return () => {
    unsub();
    stopVoice();
  };
}

// "당근 냉장" → { name: "당근", category: "냉장" }
function parseVoiceInput(text: string): { name: string; category: Category } {
  const categories: Category[] = ['냉장', '냉동', '상온', '양념'];
  const words = text.split(/\s+/);
  const lastWord = words[words.length - 1];

  if (categories.includes(lastWord as Category) && words.length > 1) {
    return {
      name: words.slice(0, -1).join(' '),
      category: lastWord as Category,
    };
  }
  return { name: text, category: '냉장' };
}

function getDDayBadge(expiryDate?: string): string {
  if (!expiryDate) return '';
  const diff = new Date(expiryDate).getTime() - new Date().setHours(0, 0, 0, 0);
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return `<span class="expiry-badge expired">만료 ${Math.abs(days)}일 지남</span>`;
  if (days === 0) return `<span class="expiry-badge today">오늘 만료</span>`;
  if (days <= 3) return `<span class="expiry-badge warning">D-${days}</span>`;
  return `<span class="expiry-badge normal">D-${days}</span>`;
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

