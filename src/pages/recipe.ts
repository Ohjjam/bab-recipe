import { getAllIngredients, addBookmark, addMeal } from '../db';
import { getRecipeSuggestions } from '../gemini';
import { hasApiKey } from '../settings-store';
import { navigate } from '../router';
import { escapeHtml } from '../html-utils';
import { openCookingGuide } from '../cooking-guide';
import type { Bookmark, MealEntry, Recipe } from '../types';

const PREFERENCE_CHIPS = [
  '간단한 거',
  '매콤한 거',
  '20분 이하',
  '밥반찬',
  '국물 요리',
  '한 그릇 음식',
];

let recipes: Recipe[] = [];
let expandedIdx: number | null = null;
let invalidRecipesList: { recipe: Recipe; reasons: string[] }[] = [];
let savedPreference = '';
let savedServing = '1인분';

export function renderRecipe(container: HTMLElement): void {
  container.innerHTML = `
    <div class="preference-section">
      <label class="preference-label">어떤 요리 원해? <span style="color:var(--text-secondary);font-weight:400">(선택)</span></label>
      <textarea id="pref-input" class="preference-input" rows="2" placeholder="예: 간단하게 30분 안에 매콤한 거 먹고 싶어">${escapeHtml(savedPreference)}</textarea>
      <div class="preference-chips" id="pref-chips">
        ${PREFERENCE_CHIPS.map((c) => `<button type="button" class="chip" data-chip="${c}">${c}</button>`).join('')}
      </div>
    </div>
    <div class="settings-group mb-16">
      <label class="preference-label">식사 분량</label>
      <select class="settings-select" id="serving-select">
        <option value="1인분" ${savedServing === '1인분' ? 'selected' : ''}>1인분 기준</option>
        <option value="2인분" ${savedServing === '2인분' ? 'selected' : ''}>2인분 기준</option>
        <option value="3~4인분" ${savedServing === '3~4인분' ? 'selected' : ''}>3~4인분 기준</option>
        <option value="5인분 이상" ${savedServing === '5인분 이상' ? 'selected' : ''}>5인분 이상 기준</option>
      </select>
    </div>
    <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 8px;" class="mb-16">
      <button class="btn btn-primary" id="suggest-btn">${recipes.length > 0 ? '🔄 다시 추천받기' : '🍳 레시피 추천'}</button>
      <button class="btn btn-outline" id="recipe-go-shopping-btn">🛒 장보기 추천</button>
    </div>
    <div id="recipe-result"></div>
  `;

  const prefInput = container.querySelector('#pref-input') as HTMLTextAreaElement;
  const chipsEl = container.querySelector('#pref-chips')!;
  const suggestBtn = container.querySelector('#suggest-btn') as HTMLButtonElement;
  const recipeGoShoppingBtn = container.querySelector('#recipe-go-shopping-btn') as HTMLButtonElement;
  const resultEl = container.querySelector('#recipe-result') as HTMLElement;
  const servingSelect = container.querySelector('#serving-select') as HTMLSelectElement;

  recipeGoShoppingBtn.addEventListener('click', () => {
    navigate('/shopping');
  });

  // Save inputs on change
  prefInput.addEventListener('input', () => {
    savedPreference = prefInput.value;
  });
  servingSelect.addEventListener('change', () => {
    savedServing = servingSelect.value;
  });

  // Chip click — append to preference input
  chipsEl.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('.chip') as HTMLElement | null;
    if (!chip) return;
    const text = chip.dataset.chip!;
    const current = prefInput.value.trim();
    prefInput.value = current ? `${current}, ${text}` : text;
    prefInput.focus();
  });

  let isGenerating = false;

  async function generate() {
    // 버튼은 disabled로 막히지만 Enter 키 경로는 막히지 않으므로 재진입 가드 필요
    if (isGenerating) return;

    if (!hasApiKey()) {
      resultEl.innerHTML = `<div class="status status-error">API 키를 먼저 설정해주세요. ⚙️ 설정 탭으로 이동하세요.</div>`;
      return;
    }

    const ingredients = await getAllIngredients();
    if (ingredients.length === 0) {
      resultEl.innerHTML = `<div class="status status-error">냉장고에 재료가 없습니다. 🧊 재료 탭에서 추가해주세요.</div>`;
      return;
    }

    isGenerating = true;
    suggestBtn.disabled = true;
    suggestBtn.textContent = '추천 중...';
    resultEl.innerHTML = `
      <div class="cooking-loader">
        <div class="loader-pot">🍳</div>
        <div class="loader-steam">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="loading-dots" style="font-size:14px;color:var(--text-secondary);font-weight:500;">AI가 냉장고 재료로 레시피를 맛있게 요리하고 있어요</div>
      </div>
    `;

    try {
      const result = await getRecipeSuggestions(ingredients, prefInput.value, servingSelect.value);
      recipes = result.recipes;
      invalidRecipesList = result.invalidRecipes;
      expandedIdx = null;
      if (recipes.length === 0) {
        let errorHtml = `
          <div class="status status-error">
            현재 재료로 만들 수 있는 레시피를 찾지 못했어요.<br>
            재료를 더 추가하거나 요구사항을 완화해주세요.
          </div>
          <div style="margin-top: 16px;">
            <button class="btn btn-outline btn-full" id="recipe-err-shopping-btn">🛒 냉장고 재료 맞춤 장보기 추천받기</button>
          </div>
        `;
        if (invalidRecipesList.length > 0) {
          errorHtml += `
            <div class="invalid-recipes-feedback" style="margin-top: 16px;">
              <div class="feedback-title">💡 이런 레시피를 구상했으나 재료가 부족합니다:</div>
              <ul class="feedback-list">
                ${invalidRecipesList.map(ir => `
                  <li>
                    <strong class="feedback-recipe-title">${escapeHtml(ir.recipe.title)}</strong>
                    <div class="feedback-reason">${escapeHtml(ir.reasons.join(' · '))}</div>
                  </li>
                `).join('')}
              </ul>
            </div>
          `;
        }
        resultEl.innerHTML = errorHtml;
        const errShoppingBtn = resultEl.querySelector('#recipe-err-shopping-btn');
        errShoppingBtn?.addEventListener('click', () => navigate('/shopping'));
      } else {
        renderRecipes();
      }
    } catch (err) {
      resultEl.innerHTML = `<div class="status status-error">오류: ${escapeHtml((err as Error).message)}</div>`;
    } finally {
      isGenerating = false;
      suggestBtn.disabled = false;
      suggestBtn.textContent = '🔄 다시 추천받기';
    }
  }

  function renderRecipes() {
    if (recipes.length === 0) {
      resultEl.innerHTML = '';
      return;
    }

    let html = recipes.map((r, i) => {
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
              <div class="recipe-section-title">필요한 재료 (${servingSelect.value} 기준)</div>
              <ul class="recipe-list">
                ${r.ingredients.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}
              </ul>
              <div class="recipe-section-title">조리 과정</div>
              <ol class="recipe-list">
                ${r.steps.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}
              </ol>
            </div>
          ` : ''}
          <div class="recipe-card-actions" style="margin-top: 10px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
            <button class="btn btn-outline" data-toggle="${i}">
              ${isExpanded ? '접기' : '자세히 보기'}
            </button>
            <button class="btn btn-outline" data-start="${i}">⏱️ 요리 시작</button>
            <button class="btn btn-primary" data-save="${i}">⭐ 저장</button>
            <button class="btn btn-primary" data-cook="${i}">📅 해먹음</button>
          </div>
          <div style="margin-top: 6px; display: flex; justify-content: flex-end;">
            <button class="btn btn-outline btn-sm" data-share="${i}" style="padding: 4px 8px; font-size:11px;">🔗 레시피 공유</button>
          </div>
        </div>
      `;
    }).join('');

    html += `
      <div style="margin-top:16px">
        <button class="btn btn-outline btn-full" id="chat-btn">💬 이 레시피로 추가 대화</button>
      </div>
    `;

    if (invalidRecipesList.length > 0) {
      html += `
        <div class="excluded-recipes-section">
          <details class="excluded-details">
            <summary class="excluded-summary">
              재료 부족 또는 기피 재료로 제외된 후보 레시피 (${invalidRecipesList.length}개)
            </summary>
            <div class="excluded-content">
              <ul class="feedback-list">
                ${invalidRecipesList.map(ir => `
                  <li>
                    <strong class="feedback-recipe-title">${escapeHtml(ir.recipe.title)}</strong>
                    <div class="feedback-reason">${escapeHtml(ir.reasons.join(' · '))}</div>
                  </li>
                `).join('')}
              </ul>
            </div>
          </details>
        </div>
      `;
    }

    resultEl.innerHTML = html;

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

    const startBtn = target.closest('[data-start]') as HTMLElement | null;
    if (startBtn) {
      const idx = parseInt(startBtn.dataset.start!);
      openCookingGuide(recipes[idx]);
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

    const shareBtn = target.closest('[data-share]') as HTMLButtonElement | null;
    if (shareBtn) {
      const idx = parseInt(shareBtn.dataset.share!);
      const recipe = recipes[idx];
      const text = formatRecipe(recipe);
      if (navigator.share) {
        try {
          await navigator.share({
            title: recipe.title,
            text: text,
          });
        } catch {
          // ignore abort
        }
      } else {
        await navigator.clipboard.writeText(text);
        alert('레시피가 클립보드에 복사되었습니다! 🔗');
      }
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

  // Restore state if available
  if (recipes.length > 0) {
    renderRecipes();
  } else if (invalidRecipesList.length > 0) {
    let errorHtml = `
      <div class="status status-error">
        현재 재료로 만들 수 있는 레시피를 찾지 못했어요.<br>
        재료를 더 추가하거나 요구사항을 완화해주세요.
      </div>
      <div style="margin-top: 16px;">
        <button class="btn btn-outline btn-full" id="recipe-err-shopping-btn">🛒 냉장고 재료 맞춤 장보기 추천받기</button>
      </div>
    `;
    errorHtml += `
      <div class="invalid-recipes-feedback" style="margin-top: 16px;">
        <div class="feedback-title">💡 이런 레시피를 구상했으나 재료가 부족합니다:</div>
        <ul class="feedback-list">
          ${invalidRecipesList.map(ir => `
            <li>
              <strong class="feedback-recipe-title">${escapeHtml(ir.recipe.title)}</strong>
              <div class="feedback-reason">${escapeHtml(ir.reasons.join(' · '))}</div>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
    resultEl.innerHTML = errorHtml;
    const errShoppingBtn = resultEl.querySelector('#recipe-err-shopping-btn');
    errShoppingBtn?.addEventListener('click', () => navigate('/shopping'));
  }
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
  btn.innerHTML = success;
  btn.disabled = true;
  setTimeout(() => {
    btn.innerHTML = original;
    btn.disabled = false;
  }, 2000);
}
