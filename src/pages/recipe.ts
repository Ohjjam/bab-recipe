import { getAllIngredients, addBookmark, addMeal } from '../db';
import { getRecipeSuggestions } from '../gemini';
import { hasApiKey } from '../settings-store';
import { navigate } from '../router';
import type { Bookmark, MealEntry, Recipe } from '../types';

const PREFERENCE_CHIPS = [
  '간단한 거',
  '매콤한 거',
  '20분 이하',
  '밥반찬',
  '국물 요리',
  '한 그릇 음식',
];

export function renderRecipe(container: HTMLElement): void {
  let recipes: Recipe[] = [];
  let expandedIdx: number | null = null;

  container.innerHTML = `
    <div class="preference-section">
      <label class="preference-label">어떤 요리 원해? <span style="color:var(--text-secondary);font-weight:400">(선택)</span></label>
      <textarea id="pref-input" class="preference-input" rows="2" placeholder="예: 간단하게 30분 안에 매콤한 거 먹고 싶어"></textarea>
      <div class="preference-chips" id="pref-chips">
        ${PREFERENCE_CHIPS.map((c) => `<button type="button" class="chip" data-chip="${c}">${c}</button>`).join('')}
      </div>
    </div>
    <button class="btn btn-primary btn-full mb-16" id="suggest-btn">🍳 레시피 추천받기</button>
    <div id="recipe-result"></div>
  `;

  const prefInput = container.querySelector('#pref-input') as HTMLTextAreaElement;
  const chipsEl = container.querySelector('#pref-chips')!;
  const suggestBtn = container.querySelector('#suggest-btn') as HTMLButtonElement;
  const resultEl = container.querySelector('#recipe-result') as HTMLElement;

  // Chip click — append to preference input
  chipsEl.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('.chip') as HTMLElement | null;
    if (!chip) return;
    const text = chip.dataset.chip!;
    const current = prefInput.value.trim();
    prefInput.value = current ? `${current}, ${text}` : text;
    prefInput.focus();
  });

  async function generate() {
    if (!hasApiKey()) {
      resultEl.innerHTML = `<div class="status status-error">API 키를 먼저 설정해주세요. ⚙️ 설정 탭으로 이동하세요.</div>`;
      return;
    }

    const ingredients = await getAllIngredients();
    if (ingredients.length === 0) {
      resultEl.innerHTML = `<div class="status status-error">냉장고에 재료가 없습니다. 🧊 재료 탭에서 추가해주세요.</div>`;
      return;
    }

    suggestBtn.disabled = true;
    suggestBtn.textContent = '추천 중...';
    resultEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⏳</div>
        <div class="empty-state-text loading-dots">레시피를 만들고 있어요</div>
      </div>
    `;

    try {
      recipes = await getRecipeSuggestions(ingredients, prefInput.value);
      expandedIdx = null;
      renderRecipes();
    } catch (err) {
      resultEl.innerHTML = `<div class="status status-error">오류: ${(err as Error).message}</div>`;
    } finally {
      suggestBtn.disabled = false;
      suggestBtn.textContent = '🔄 다시 추천받기';
    }
  }

  function renderRecipes() {
    if (recipes.length === 0) {
      resultEl.innerHTML = '';
      return;
    }

    resultEl.innerHTML = recipes.map((r, i) => {
      const isExpanded = expandedIdx === i;
      return `
        <div class="recipe-card" data-idx="${i}">
          <div class="recipe-card-header">
            <div class="recipe-card-title">${escapeHtml(r.title)}</div>
            <div class="recipe-card-meta">
              <span class="recipe-badge">${escapeHtml(r.difficulty)}</span>
              <span class="recipe-badge">⏱ ${escapeHtml(r.time)}</span>
            </div>
          </div>
          <div class="recipe-card-desc">${escapeHtml(r.description)}</div>
          ${isExpanded ? `
            <div class="recipe-card-detail">
              <div class="recipe-section-title">필요한 재료</div>
              <ul class="recipe-list">
                ${r.ingredients.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}
              </ul>
              <div class="recipe-section-title">조리 과정</div>
              <ol class="recipe-list">
                ${r.steps.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}
              </ol>
            </div>
          ` : ''}
          <div class="recipe-card-actions">
            <button class="btn btn-outline" data-toggle="${i}" style="flex:1">
              ${isExpanded ? '접기' : '자세히 보기'}
            </button>
            <button class="btn btn-primary" data-save="${i}" style="flex:1">⭐ 저장</button>
            <button class="btn btn-primary" data-cook="${i}" style="flex:1">📅 해먹음</button>
          </div>
        </div>
      `;
    }).join('') + `
      <div style="margin-top:16px">
        <button class="btn btn-outline btn-full" id="chat-btn">💬 이 레시피로 추가 대화</button>
      </div>
    `;

    const chatBtn = resultEl.querySelector('#chat-btn');
    chatBtn?.addEventListener('click', () => navigate('/chat'));
  }

  resultEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    const toggleBtn = target.closest('[data-toggle]') as HTMLElement | null;
    if (toggleBtn) {
      const idx = parseInt(toggleBtn.dataset.toggle!);
      expandedIdx = expandedIdx === idx ? null : idx;
      renderRecipes();
      return;
    }

    const saveBtn = target.closest('[data-save]') as HTMLButtonElement | null;
    if (saveBtn) {
      const idx = parseInt(saveBtn.dataset.save!);
      const recipe = recipes[idx];
      const bookmark: Bookmark = {
        id: crypto.randomUUID(),
        title: recipe.title,
        content: formatRecipe(recipe),
        savedAt: Date.now(),
      };
      await addBookmark(bookmark);
      flashButton(saveBtn, '✅ 저장됨', '⭐ 저장');
      return;
    }

    const cookBtn = target.closest('[data-cook]') as HTMLButtonElement | null;
    if (cookBtn) {
      const idx = parseInt(cookBtn.dataset.cook!);
      const recipe = recipes[idx];
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const meal: MealEntry = {
        id: crypto.randomUUID(),
        date: dateStr,
        title: recipe.title,
        createdAt: Date.now(),
      };
      await addMeal(meal);
      flashButton(cookBtn, '✅ 기록됨', '📅 해먹음');
      return;
    }
  });

  suggestBtn.addEventListener('click', generate);

  // Enter to submit preference
  prefInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      generate();
    }
  });
}

function formatRecipe(r: Recipe): string {
  return [
    r.title,
    `난이도: ${r.difficulty} · ${r.time}`,
    '',
    r.description,
    '',
    '[필요한 재료]',
    ...r.ingredients.map((i) => `- ${i}`),
    '',
    '[조리 과정]',
    ...r.steps.map((s, i) => `${i + 1}. ${s}`),
  ].join('\n');
}

function flashButton(btn: HTMLButtonElement, success: string, original: string): void {
  const old = btn.innerHTML;
  btn.innerHTML = success;
  btn.disabled = true;
  setTimeout(() => {
    btn.innerHTML = old.includes('저장') ? original : original;
    btn.disabled = false;
  }, 2000);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
