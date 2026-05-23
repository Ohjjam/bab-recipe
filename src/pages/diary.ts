import { getMealsByMonth, getMealsByDate, addMeal, deleteMeal, updateMeal } from '../db';
import { estimateMealNutrition } from '../gemini';
import { hasApiKey, getSettings } from '../settings-store';
import { subscribe, emit, EVENTS } from '../state';
import type { MealEntry, Nutrition } from '../types';

export function renderDiary(container: HTMLElement): () => void {
  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth() + 1; // 1-based
  let selectedDate: string | null = toDateStr(now);
  let mealDates = new Set<string>();
  let editingMealId: string | null = null;

  container.innerHTML = `
    <div class="diary-header">
      <button class="diary-nav-btn" id="prev-month">◀</button>
      <h2 id="month-label"></h2>
      <button class="diary-nav-btn" id="next-month">▶</button>
    </div>
    <div class="calendar-grid" id="calendar"></div>
    <details class="monthly-stats-section" id="monthly-stats" style="margin-bottom:16px">
      <summary class="monthly-stats-summary">
        <span>📊 월간 영양 통계 보기</span>
        <span>▼</span>
      </summary>
      <div class="monthly-stats-content" id="monthly-stats-content"></div>
    </details>
    <div class="day-meals" id="day-meals"></div>
  `;

  const monthLabel = container.querySelector('#month-label')!;
  const calendarEl = container.querySelector('#calendar')!;
  const dayMealsEl = container.querySelector('#day-meals')!;
  const statsContentEl = container.querySelector('#monthly-stats-content') as HTMLElement;

  async function renderCalendar() {
    monthLabel.textContent = `${currentYear}년 ${currentMonth}월`;

    const meals = await getMealsByMonth(currentYear, currentMonth);
    mealDates = new Set(meals.map((m) => m.date));

    const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const todayStr = toDateStr(new Date());

    const dows = ['일', '월', '화', '수', '목', '금', '토'];
    let html = dows.map((d) => `<div class="calendar-dow">${d}</div>`).join('');

    for (let i = 0; i < firstDay; i++) {
      html += `<div class="calendar-day empty"></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === selectedDate;
      const hasMeal = mealDates.has(dateStr);

      let cls = 'calendar-day';
      if (isToday) cls += ' today';
      if (isSelected) cls += ' selected';

      html += `
        <div class="${cls}" data-date="${dateStr}">
          <span class="calendar-day-num">${d}</span>
          ${hasMeal ? '<span class="calendar-day-dot"></span>' : ''}
        </div>
      `;
    }

    calendarEl.innerHTML = html;
    await renderMonthlyStats();
    await renderDayMeals();
  }

  async function renderMonthlyStats() {
    if (!statsContentEl) return;
    const meals = await getMealsByMonth(currentYear, currentMonth);
    
    // Get unique days with meals in this month
    const mealDays = new Set(meals.filter(m => m.nutrition).map(m => m.date));
    const activeDaysCount = mealDays.size;

    let totalCalories = 0;
    let totalCarbs = 0;
    let totalProtein = 0;
    let totalFat = 0;

    for (const m of meals) {
      if (m.nutrition) {
        totalCalories += m.nutrition.calories;
        totalCarbs += m.nutrition.carbs;
        totalProtein += m.nutrition.protein;
        totalFat += m.nutrition.fat;
      }
    }

    const avgCalories = activeDaysCount > 0 ? Math.round(totalCalories / activeDaysCount) : 0;

    // Carb:Protein:Fat ratio
    const totalMacros = totalCarbs + totalProtein + totalFat;
    const carbPercent = totalMacros > 0 ? Math.round((totalCarbs / totalMacros) * 100) : 0;
    const proteinPercent = totalMacros > 0 ? Math.round((totalProtein / totalMacros) * 100) : 0;
    const fatPercent = totalMacros > 0 ? 100 - (carbPercent + proteinPercent) : 0;

    statsContentEl.innerHTML = `
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-val">${activeDaysCount}일</div>
          <div class="stat-label">기록된 일수</div>
        </div>
        <div class="stat-card">
          <div class="stat-val">${totalCalories.toLocaleString()} kcal</div>
          <div class="stat-label">총 섭취량</div>
        </div>
        <div class="stat-card">
          <div class="stat-val">${avgCalories.toLocaleString()} kcal</div>
          <div class="stat-label">일평균 (기록일)</div>
        </div>
      </div>
      
      <div style="font-size:12px; font-weight:600; margin-bottom: 6px; color:var(--text)">섭취 영양소 비율 (탄 : 단 : 지)</div>
      ${totalMacros > 0 ? `
        <div class="macro-ratio-bar">
          <div class="macro-ratio-segment carbs" style="width: ${carbPercent}%; background: #4CAF50;">${carbPercent}%</div>
          <div class="macro-ratio-segment protein" style="width: ${proteinPercent}%; background: #2196F3;">${proteinPercent}%</div>
          <div class="macro-ratio-segment fat" style="width: ${fatPercent}%; background: #FFC107;">${fatPercent}%</div>
        </div>
        <div class="macro-ratio-legend">
          <div class="legend-item"><span class="legend-color carbs"></span>탄 ${totalCarbs}g</div>
          <div class="legend-item"><span class="legend-color protein"></span>단 ${totalProtein}g</div>
          <div class="legend-item"><span class="legend-color fat"></span>지 ${totalFat}g</div>
        </div>
      ` : `
        <div style="color:var(--text-secondary); font-size:12px; text-align:center; padding: 12px 0;">영양 기록이 쌓이면 비율 통계가 제공됩니다.</div>
      `}
    `;
  }

  async function renderDayMeals() {
    if (!selectedDate) {
      dayMealsEl.innerHTML = '';
      return;
    }

    const meals = await getMealsByDate(selectedDate);
    const [, m, d] = selectedDate.split('-');
    const label = `${parseInt(m)}월 ${parseInt(d)}일`;
    const totals = sumNutrition(meals);
    const hasAnyNutrition = meals.some((mm) => mm.nutrition);

    dayMealsEl.innerHTML = `
      <div class="day-meals-title">📅 ${label} 식사 기록</div>
      ${hasAnyNutrition ? renderTotals(totals) : ''}
      ${meals.length === 0 ? '<div style="color:var(--text-secondary);font-size:13px;margin-bottom:8px">기록이 없습니다</div>' : ''}
      
      ${meals.map((meal) => {
        const isEditing = editingMealId === meal.id;
        if (isEditing) {
          return `
            <div class="meal-item editing" style="flex-direction: column; align-items: stretch; gap: 8px;">
              <form class="edit-nutrition-form" data-meal-id="${meal.id}">
                <div style="font-size:12px; font-weight:600; margin-bottom: 6px;">✏️ ${escapeHtml(meal.title)} 영양소 편집</div>
                <div class="form-grid">
                  <div>
                    <label>칼로리</label>
                    <input type="number" class="edit-cal" value="${meal.nutrition?.calories ?? 0}" required />
                  </div>
                  <div>
                    <label>탄수화물</label>
                    <input type="number" class="edit-carbs" value="${meal.nutrition?.carbs ?? 0}" required />
                  </div>
                  <div>
                    <label>단백질</label>
                    <input type="number" class="edit-protein" value="${meal.nutrition?.protein ?? 0}" required />
                  </div>
                  <div>
                    <label>지방</label>
                    <input type="number" class="edit-fat" value="${meal.nutrition?.fat ?? 0}" required />
                  </div>
                </div>
                <div class="form-actions">
                  <button type="submit" class="btn btn-primary btn-sm">저장</button>
                  <button type="button" class="btn btn-outline btn-sm edit-nutrition-cancel">취소</button>
                </div>
              </form>
            </div>
          `;
        }

        return `
          <div class="meal-item">
            <div class="meal-item-info">
              <div class="meal-item-title">${escapeHtml(meal.title)}</div>
              ${meal.memo ? `<div class="meal-item-memo">${escapeHtml(meal.memo)}</div>` : ''}
              ${renderMealNutrition(meal)}
            </div>
            <button class="meal-item-edit-btn" data-edit-meal-id="${meal.id}">✏️</button>
            <button class="ingredient-delete" data-meal-id="${meal.id}">✕</button>
          </div>
        `;
      }).join('')}
      
      <form class="add-meal-form" id="add-meal-form">
        <input type="text" id="meal-title" placeholder="예: 닭가슴살 한덩이, 김치, 샌드위치" required />
        <button type="submit" class="btn btn-primary">+</button>
      </form>
    `;

    // 영양정보 비어있는 식사 자동 추정 (API 키 있을 때만)
    if (hasApiKey()) {
      for (const meal of meals) {
        if (!meal.nutrition && meal.nutritionStatus !== 'pending' && meal.nutritionStatus !== 'failed') {
          void estimateAndPersist(meal);
        }
      }
    }
  }

  async function estimateAndPersist(meal: MealEntry): Promise<void> {
    try {
      await updateMeal({ ...meal, nutritionStatus: 'pending' });
      const nutrition = await estimateMealNutrition(meal.title, meal.memo);
      await updateMeal({ ...meal, nutrition, nutritionStatus: undefined });
      emit(EVENTS.MEALS_CHANGED);
    } catch {
      await updateMeal({ ...meal, nutritionStatus: 'failed' });
      emit(EVENTS.MEALS_CHANGED);
    }
  }

  calendarEl.addEventListener('click', (e) => {
    const day = (e.target as HTMLElement).closest('.calendar-day:not(.empty)') as HTMLElement | null;
    if (!day) return;
    selectedDate = day.dataset.date!;
    editingMealId = null;
    renderCalendar();
  });

  container.querySelector('#prev-month')!.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    selectedDate = null;
    editingMealId = null;
    renderCalendar();
  });

  container.querySelector('#next-month')!.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    selectedDate = null;
    editingMealId = null;
    renderCalendar();
  });

  // Handle forms submits
  dayMealsEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;

    // Manual Edit Submission
    if (form.classList.contains('edit-nutrition-form')) {
      const mealId = form.dataset.mealId!;
      const cal = parseInt((form.querySelector('.edit-cal') as HTMLInputElement).value) || 0;
      const carbs = parseInt((form.querySelector('.edit-carbs') as HTMLInputElement).value) || 0;
      const protein = parseInt((form.querySelector('.edit-protein') as HTMLInputElement).value) || 0;
      const fat = parseInt((form.querySelector('.edit-fat') as HTMLInputElement).value) || 0;

      const meals = await getMealsByDate(selectedDate!);
      const original = meals.find(m => m.id === mealId);
      if (original) {
        await updateMeal({
          ...original,
          nutrition: { calories: cal, carbs, protein, fat },
          nutritionStatus: undefined
        });
        editingMealId = null;
        emit(EVENTS.MEALS_CHANGED);
      }
      return;
    }

    // Add Meal Submission
    if (form.id === 'add-meal-form') {
      const input = form.querySelector('#meal-title') as HTMLInputElement;
      const title = input.value.trim();
      if (!title || !selectedDate) return;

      const meal: MealEntry = {
        id: crypto.randomUUID(),
        date: selectedDate,
        title,
        createdAt: Date.now(),
      };
      await addMeal(meal);
      emit(EVENTS.MEALS_CHANGED);
      if (hasApiKey()) void estimateAndPersist(meal);
    }
  });

  dayMealsEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    // Delete Meal
    const deleteBtn = target.closest('[data-meal-id]') as HTMLElement | null;
    if (deleteBtn) {
      await deleteMeal(deleteBtn.dataset.mealId!);
      editingMealId = null;
      emit(EVENTS.MEALS_CHANGED);
      return;
    }

    // Edit Trigger
    const editBtn = target.closest('[data-edit-meal-id]') as HTMLElement | null;
    if (editBtn) {
      editingMealId = editBtn.dataset.editMealId!;
      renderDayMeals();
      return;
    }

    // Edit Cancel
    const cancelBtn = target.closest('.edit-nutrition-cancel') as HTMLElement | null;
    if (cancelBtn) {
      editingMealId = null;
      renderDayMeals();
      return;
    }
  });

  renderCalendar();

  const unsub = subscribe(EVENTS.MEALS_CHANGED, () => renderCalendar());
  return unsub;
}

function sumNutrition(meals: MealEntry[]): Nutrition {
  return meals.reduce<Nutrition>(
    (acc, m) => {
      if (!m.nutrition) return acc;
      return {
        calories: acc.calories + m.nutrition.calories,
        carbs: acc.carbs + m.nutrition.carbs,
        protein: acc.protein + m.nutrition.protein,
        fat: acc.fat + m.nutrition.fat,
      };
    },
    { calories: 0, carbs: 0, protein: 0, fat: 0 }
  );
}

function renderTotals(t: Nutrition): string {
  const { targetCalories, targetCarbs, targetProtein, targetFat } = getSettings();
  
  const calPercent = Math.min(100, Math.round((t.calories / targetCalories) * 100)) || 0;
  const carbsPercent = Math.min(100, Math.round((t.carbs / targetCarbs) * 100)) || 0;
  const proteinPercent = Math.min(100, Math.round((t.protein / targetProtein) * 100)) || 0;
  const fatPercent = Math.min(100, Math.round((t.fat / targetFat) * 100)) || 0;

  return `
    <div class="nutrition-summary" style="flex-direction: column; align-items: stretch; gap: 8px;">
      <div style="display:flex; align-items:center; gap: 14px;">
        <div class="nutrition-summary-cal">
          <span class="nutrition-summary-num">${t.calories}</span>
          <span class="nutrition-summary-unit">/ ${targetCalories} kcal</span>
          <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${calPercent}%"></div>
          </div>
        </div>
        <div class="nutrition-summary-macros" style="display:flex; flex:1; gap:10px; justify-content:space-around">
          <div class="macro" style="display:flex; flex-direction:column; align-items:center; gap:2px; flex:1">
            <span class="macro-label" style="font-size:10px;">탄 (${carbsPercent}%)</span>
            <span class="macro-val" style="font-size:11px; font-weight:600">${t.carbs}g</span>
            <div class="progress-bar-container" style="height:4px; margin-top:2px"><div class="progress-bar" style="width: ${carbsPercent}%; background:#4CAF50"></div></div>
          </div>
          <div class="macro" style="display:flex; flex-direction:column; align-items:center; gap:2px; flex:1">
            <span class="macro-label" style="font-size:10px;">단 (${proteinPercent}%)</span>
            <span class="macro-val" style="font-size:11px; font-weight:600">${t.protein}g</span>
            <div class="progress-bar-container" style="height:4px; margin-top:2px"><div class="progress-bar" style="width: ${proteinPercent}%; background:#2196F3"></div></div>
          </div>
          <div class="macro" style="display:flex; flex-direction:column; align-items:center; gap:2px; flex:1">
            <span class="macro-label" style="font-size:10px;">지 (${fatPercent}%)</span>
            <span class="macro-val" style="font-size:11px; font-weight:600">${t.fat}g</span>
            <div class="progress-bar-container" style="height:4px; margin-top:2px"><div class="progress-bar" style="width: ${fatPercent}%; background:#FFC107"></div></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderMealNutrition(meal: MealEntry): string {
  if (meal.nutrition) {
    const n = meal.nutrition;
    return `
      <div class="meal-nutrition">
        <span class="meal-nutrition-cal">${n.calories} kcal</span>
        <span class="meal-nutrition-macro">탄 ${n.carbs}g</span>
        <span class="meal-nutrition-macro">단 ${n.protein}g</span>
        <span class="meal-nutrition-macro">지 ${n.fat}g</span>
      </div>
    `;
  }
  if (meal.nutritionStatus === 'pending') {
    return `<div class="meal-nutrition meal-nutrition-pending">영양정보 추정 중<span class="loading-dots"></span></div>`;
  }
  if (meal.nutritionStatus === 'failed') {
    return `<div class="meal-nutrition meal-nutrition-failed">영양정보 추정 실패</div>`;
  }
  if (!hasApiKey()) {
    return `<div class="meal-nutrition meal-nutrition-failed" style="font-style:normal;">설정에서 API 키 등록 시 영양 정보 자동 분석</div>`;
  }
  return '';
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
