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
  let invalidRecipesList: { recipe: Recipe; reasons: string[] }[] = [];

  container.innerHTML = `
    <div class="preference-section">
      <label class="preference-label">어떤 요리 원해? <span style="color:var(--text-secondary);font-weight:400">(선택)</span></label>
      <textarea id="pref-input" class="preference-input" rows="2" placeholder="예: 간단하게 30분 안에 매콤한 거 먹고 싶어"></textarea>
      <div class="preference-chips" id="pref-chips">
        ${PREFERENCE_CHIPS.map((c) => `<button type="button" class="chip" data-chip="${c}">${c}</button>`).join('')}
      </div>
    </div>
    <div class="settings-group mb-16">
      <label class="preference-label">식사 분량</label>
      <select class="settings-select" id="serving-select">
        <option value="1인분" selected>1인분 기준</option>
        <option value="2인분">2인분 기준</option>
        <option value="3~4인분">3~4인분 기준</option>
        <option value="5인분 이상">5인분 이상 기준</option>
      </select>
    </div>
    <button class="btn btn-primary btn-full mb-16" id="suggest-btn">🍳 레시피 추천받기</button>
    <div id="recipe-result"></div>
  `;

  const prefInput = container.querySelector('#pref-input') as HTMLTextAreaElement;
  const chipsEl = container.querySelector('#pref-chips')!;
  const suggestBtn = container.querySelector('#suggest-btn') as HTMLButtonElement;
  const resultEl = container.querySelector('#recipe-result') as HTMLElement;
  const servingSelect = container.querySelector('#serving-select') as HTMLSelectElement;

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
        `;
        if (invalidRecipesList.length > 0) {
          errorHtml += `
            <div class="invalid-recipes-feedback">
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
      } else {
        renderRecipes();
      }
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

// --- Step-by-step Cooking Guide overlay & timer ---

function extractTimeFromStep(step: string): number | null {
  const hourMatch = step.match(/(\d+)\s*시간/);
  const minMatch = step.match(/(\d+)\s*분/);
  const secMatch = step.match(/(\d+)\s*초/);
  
  if (!hourMatch && !minMatch && !secMatch) return null;
  
  let totalSeconds = 0;
  if (hourMatch) totalSeconds += parseInt(hourMatch[1]) * 3600;
  if (minMatch) totalSeconds += parseInt(minMatch[1]) * 60;
  if (secMatch) totalSeconds += parseInt(secMatch[1]);
  
  return totalSeconds;
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (err) {
    console.error('Audio play failed:', err);
  }
}

function openCookingGuide(recipe: Recipe) {
  let currentStep = 0;
  let timerId: any = null;
  let timerSeconds = 0;
  let isTimerRunning = false;

  const overlay = document.createElement('div');
  overlay.className = 'cooking-guide-overlay';
  document.body.appendChild(overlay);

  function renderGuideStep() {
    const stepText = recipe.steps[currentStep];
    const totalSteps = recipe.steps.length;
    const extractedSeconds = extractTimeFromStep(stepText);

    // Clean up active timer when switching steps
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    isTimerRunning = false;

    overlay.innerHTML = `
      <header class="cooking-guide-header">
        <button class="cooking-guide-close" id="guide-close">✕</button>
        <div class="cooking-guide-title">${escapeHtml(recipe.title)}</div>
        <div style="width:20px"></div>
      </header>
      <div class="cooking-guide-content">
        <div class="cooking-step-card">
          <div class="cooking-step-num">Step ${currentStep + 1} / ${totalSteps}</div>
          <div class="cooking-step-text">${escapeHtml(stepText)}</div>
        </div>
        
        ${extractedSeconds !== null ? `
          <div class="timer-container">
            <div class="timer-display" id="timer-display">${formatDuration(extractedSeconds)}</div>
            <div class="timer-actions">
              <button class="btn btn-primary btn-sm" id="timer-start-btn">시작</button>
              <button class="btn btn-outline btn-sm" id="timer-reset-btn">리셋</button>
            </div>
          </div>
        ` : ''}
      </div>
      <footer class="cooking-guide-footer">
        <button class="btn btn-outline" id="guide-prev" style="flex:1" ${currentStep === 0 ? 'disabled' : ''}>이전</button>
        <button class="btn btn-primary" id="guide-next" style="flex:2">
          ${currentStep === totalSteps - 1 ? '완료' : '다음 단계'}
        </button>
      </footer>
    `;

    // Bind event listeners
    overlay.querySelector('#guide-close')!.addEventListener('click', closeGuide);
    overlay.querySelector('#guide-prev')!.addEventListener('click', () => {
      if (currentStep > 0) {
        currentStep--;
        renderGuideStep();
      }
    });
    overlay.querySelector('#guide-next')!.addEventListener('click', () => {
      if (currentStep < totalSteps - 1) {
        currentStep++;
        renderGuideStep();
      } else {
        closeGuide();
      }
    });

    if (extractedSeconds !== null) {
      timerSeconds = extractedSeconds;
      const displayEl = overlay.querySelector('#timer-display')!;
      const startBtn = overlay.querySelector('#timer-start-btn') as HTMLButtonElement;
      const resetBtn = overlay.querySelector('#timer-reset-btn')!;

      startBtn.addEventListener('click', () => {
        if (isTimerRunning) {
          // Pause
          clearInterval(timerId);
          timerId = null;
          isTimerRunning = false;
          startBtn.textContent = '시작';
        } else {
          // Start
          isTimerRunning = true;
          startBtn.textContent = '일시정지';
          timerId = setInterval(() => {
            timerSeconds--;
            displayEl.textContent = formatDuration(timerSeconds);
            if (timerSeconds <= 0) {
              clearInterval(timerId);
              timerId = null;
              isTimerRunning = false;
              startBtn.textContent = '시작';
              startBtn.disabled = true;
              playBeep();
              if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
              alert('시간이 다 되었습니다! 🍳');
            }
          }, 1000);
        }
      });

      resetBtn.addEventListener('click', () => {
        if (timerId) {
          clearInterval(timerId);
          timerId = null;
        }
        isTimerRunning = false;
        timerSeconds = extractedSeconds;
        displayEl.textContent = formatDuration(timerSeconds);
        startBtn.textContent = '시작';
        startBtn.disabled = false;
      });
    }
  }

  function formatDuration(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function closeGuide() {
    if (timerId) clearInterval(timerId);
    overlay.remove();
  }

  renderGuideStep();
}

