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
  const catSelect = container.querySelector('#add-cat') as HTMLSelectElement;
  const voiceBtn = container.querySelector('#voice-btn') as HTMLButtonElement;
  const voiceStatus = container.querySelector('#voice-status') as HTMLElement;

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
