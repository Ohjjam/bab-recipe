import { getAllIngredients, addBookmark, addMeal, addIngredient } from '../db';
import { getShoppingSuggestions } from '../gemini';
import { hasApiKey } from '../settings-store';
import { navigate } from '../router';
import { emit, EVENTS } from '../state';
import type { Category, Ingredient, Recipe, Bookmark, MealEntry, ShoppingRecommendation } from '../types';

export function renderShopping(container: HTMLElement): () => void {
  let recommendations: ShoppingRecommendation[] = [];
  let expandedRecipeIdx: { cardIdx: number; recipeIdx: number } | null = null;
  let isLoading = false;

  container.innerHTML = `
    <div class="shopping-page-header mb-16">
      <button class="btn btn-outline btn-sm" id="shopping-back-btn">← 뒤로 가기</button>
      <h2 class="shopping-page-title">🛒 스마트 장보기 추천</h2>
    </div>
    <p class="shopping-page-desc mb-16">냉장고의 남은 재료를 100% 활용할 수 있도록 가성비 좋은 추가 식재료와 레시피를 제안합니다.</p>
    <div id="shopping-result"></div>
  `;

  const backBtn = container.querySelector('#shopping-back-btn') as HTMLButtonElement;
  const resultEl = container.querySelector('#shopping-result') as HTMLElement;

  backBtn.addEventListener('click', () => {
    // 이전 페이지로 가되, 히스토리가 없으면 기본 재료 탭으로
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate('/ingredients');
    }
  });

  async function generate() {
    if (!hasApiKey()) {
      resultEl.innerHTML = `
        <div class="status status-error">
          API 키를 먼저 설정해주세요. ⚙️ 설정 탭으로 이동해서 Gemini API 키를 등록하세요.
        </div>
      `;
      return;
    }

    isLoading = true;
    resultEl.innerHTML = `
      <div class="shopping-loader">
        <div class="loader-cart">🛒</div>
        <div class="loader-items">
          <span>🍅</span>
          <span>🥩</span>
          <span>🥚</span>
        </div>
        <div class="loading-dots" style="font-size:14px;color:var(--text-secondary);font-weight:500;margin-top:16px;">AI가 냉장고 재료를 분석하여 알뜰 장보기 목록을 구상하고 있어요</div>
      </div>
    `;

    try {
      const ingredients = await getAllIngredients();
      const result = await getShoppingSuggestions(ingredients);
      recommendations = result.recommendations || [];
      expandedRecipeIdx = null;

      if (recommendations.length === 0) {
        resultEl.innerHTML = `
          <div class="status status-error">
            추천 장보기 정보를 불러오지 못했습니다. 다시 시도해 주세요.
          </div>
        `;
      } else {
        renderRecommendations();
      }
    } catch (err) {
      resultEl.innerHTML = `<div class="status status-error">오류: ${(err as Error).message}</div>`;
    } finally {
      isLoading = false;
    }
  }

  function mapToAppCategory(aiCategory: string): Category {
    const cat = aiCategory.toLowerCase();
    if (cat.includes('양념') || cat.includes('소스') || cat.includes('조미료') || cat.includes('오일') || cat.includes('가루')) {
      return '양념';
    }
    if (cat.includes('냉동')) {
      return '냉동';
    }
    if (cat.includes('상온') || cat.includes('통조림') || cat.includes('실온') || cat.includes('라면') || cat.includes('파스타') || cat.includes('곡류')) {
      return '상온';
    }
    return '냉장';
  }

  function renderRecommendations() {
    if (recommendations.length === 0) {
      resultEl.innerHTML = '';
      return;
    }

    resultEl.innerHTML = recommendations.map((rec, cardIdx) => {
      return `
        <div class="shopping-card mb-16" data-card-idx="${cardIdx}">
          <div class="shopping-card-header">
            <div class="shopping-card-title-group">
              <span class="shopping-card-badge">${escapeHtml(rec.category)}</span>
              <h3 class="shopping-card-name">${escapeHtml(rec.ingredient)}</h3>
            </div>
            <span class="cost-badge">💵 ${escapeHtml(rec.expectedCost)}</span>
          </div>
          
          <div class="shopping-card-body mb-12">
            <p class="shopping-card-reason">${escapeHtml(rec.reason)}</p>
          </div>

          <div class="shopping-card-actions mb-12">
            <button class="btn btn-primary btn-sm btn-full add-fridge-btn" data-ingredient="${escapeHtml(rec.ingredient)}" data-category="${escapeHtml(rec.category)}">
              🧊 냉장고에 추가 (구매 완료)
            </button>
          </div>

          <div class="shopping-recipes-section">
            <div class="shopping-recipes-title">🍳 이 재료로 만드는 추천 레시피:</div>
            <div class="shopping-recipes-list">
              ${rec.recipes.map((recipe, recipeIdx) => {
                const isExpanded = expandedRecipeIdx && expandedRecipeIdx.cardIdx === cardIdx && expandedRecipeIdx.recipeIdx === recipeIdx;
                return `
                  <div class="shopping-recipe-item" data-recipe-idx="${recipeIdx}">
                    <div class="shopping-recipe-header">
                      <div class="shopping-recipe-title">${escapeHtml(recipe.title)}</div>
                      <div class="shopping-recipe-meta">
                        <span class="recipe-badge">${escapeHtml(recipe.difficulty)}</span>
                        <span class="recipe-badge">⏱ ${escapeHtml(recipe.time)}</span>
                      </div>
                    </div>
                    <div class="shopping-recipe-desc">${escapeHtml(recipe.description)}</div>
                    
                    ${isExpanded ? `
                      <div class="recipe-card-detail" style="margin-top: 10px;">
                        <div class="recipe-section-title">필요한 재료</div>
                        <ul class="recipe-list">
                          ${recipe.ingredients.map(ing => {
                            let itemClass = '';
                            if (ing.includes('(보유)')) itemClass = 'ing-owned';
                            else if (ing.includes('(추천)')) itemClass = 'ing-recommended';
                            else if (ing.includes('(기본 양념)')) itemClass = 'ing-seasoning';
                            return `<li class="${itemClass}">${escapeHtml(ing)}</li>`;
                          }).join('')}
                        </ul>
                        <div class="recipe-section-title">조리 과정</div>
                        <ol class="recipe-list">
                          ${recipe.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}
                        </ol>
                      </div>
                    ` : ''}

                    <div class="recipe-card-actions" style="margin-top: 8px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;">
                      <button class="btn btn-outline btn-sm toggle-recipe-btn">
                        ${isExpanded ? '접기' : '레시피 보기'}
                      </button>
                      <button class="btn btn-outline btn-sm start-cooking-btn">⏱️ 요리 시작</button>
                      <button class="btn btn-primary btn-sm save-recipe-btn">⭐ 저장</button>
                      <button class="btn btn-primary btn-sm cook-recipe-btn">📅 해먹음</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // 이벤트 리스너 바인딩
    resultEl.querySelectorAll('.shopping-card').forEach((cardEl) => {
      const cardIdx = parseInt(cardEl.getAttribute('data-card-idx')!);
      const rec = recommendations[cardIdx];

      // 냉장고에 추가 버튼
      const addBtn = cardEl.querySelector('.add-fridge-btn') as HTMLButtonElement;
      addBtn.addEventListener('click', async () => {
        const name = addBtn.getAttribute('data-ingredient')!;
        const aiCategory = addBtn.getAttribute('data-category')!;
        
        const newIngredient: Ingredient = {
          id: crypto.randomUUID(),
          name,
          category: mapToAppCategory(aiCategory),
          addedAt: Date.now(),
          memo: '장보기 추천으로 추가됨',
        };

        try {
          await addIngredient(newIngredient);
          emit(EVENTS.INGREDIENTS_CHANGED);
          
          addBtn.textContent = '✅ 냉장고에 추가됨';
          addBtn.disabled = true;
          addBtn.style.backgroundColor = 'var(--primary-dark)';
          addBtn.style.color = '#fff';
        } catch (err) {
          alert(`재료 추가 오류: ${(err as Error).message}`);
        }
      });

      // 레시피 목록 제어
      cardEl.querySelectorAll('.shopping-recipe-item').forEach((recipeEl) => {
        const recipeIdx = parseInt(recipeEl.getAttribute('data-recipe-idx')!);
        const recipe = rec.recipes[recipeIdx];

        // 토글 버튼
        const toggleBtn = recipeEl.querySelector('.toggle-recipe-btn')!;
        toggleBtn.addEventListener('click', () => {
          if (expandedRecipeIdx && expandedRecipeIdx.cardIdx === cardIdx && expandedRecipeIdx.recipeIdx === recipeIdx) {
            expandedRecipeIdx = null;
          } else {
            expandedRecipeIdx = { cardIdx, recipeIdx };
          }
          renderRecommendations();
        });

        // 요리 시작 버튼
        const startBtn = recipeEl.querySelector('.start-cooking-btn')!;
        startBtn.addEventListener('click', () => {
          openCookingGuide(recipe);
        });

        // 저장 버튼
        const saveBtn = recipeEl.querySelector('.save-recipe-btn') as HTMLButtonElement;
        saveBtn.addEventListener('click', async () => {
          const bookmark: Bookmark = {
            id: crypto.randomUUID(),
            title: recipe.title,
            content: formatRecipe(recipe),
            savedAt: Date.now(),
          };
          await addBookmark(bookmark);
          flashButton(saveBtn, '✅ 저장됨', '⭐ 저장');
        });

        // 해먹음 버튼
        const cookBtn = recipeEl.querySelector('.cook-recipe-btn') as HTMLButtonElement;
        cookBtn.addEventListener('click', async () => {
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
        });
      });
    });
  }

  generate();

  return () => {
    // cleanup if needed
  };
}

// --- Helper Functions ---

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
    btn.innerHTML = original;
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
    osc.frequency.setValueAtTime(880, ctx.currentTime);
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
          clearInterval(timerId);
          timerId = null;
          isTimerRunning = false;
          startBtn.textContent = '시작';
        } else {
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
