import { getMealsByMonth, getMealsByDate, addMeal, deleteMeal, updateMeal } from '../db';
import { estimateMealNutrition } from '../gemini';
import { hasApiKey } from '../settings-store';
import { subscribe, emit, EVENTS } from '../state';
import type { MealEntry, Nutrition } from '../types';

export function renderDiary(container: HTMLElement): () => void {
  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth() + 1; // 1-based
  let selectedDate: string | null = toDateStr(now);
  let mealDates = new Set<string>();

  container.innerHTML = `
    <div class="diary-header">
      <button class="diary-nav-btn" id="prev-month">◀</button>
      <h2 id="month-label"></h2>
      <button class="diary-nav-btn" id="next-month">▶</button>
    </div>
    <div class="calendar-grid" id="calendar"></div>
    <div class="day-meals" id="day-meals"></div>
  `;

  const monthLabel = container.querySelector('#month-label')!;
  const calendarEl = container.querySelector('#calendar')!;
  const dayMealsEl = container.querySelector('#day-meals')!;

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
    await renderDayMeals();
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
      ${meals.map((meal) => `
        <div class="meal-item">
          <div class="meal-item-info">
            <div class="meal-item-title">${escapeHtml(meal.title)}</div>
            ${meal.memo ? `<div class="meal-item-memo">${escapeHtml(meal.memo)}</div>` : ''}
            ${renderMealNutrition(meal)}
          </div>
          <button class="ingredient-delete" data-meal-id="${meal.id}">✕</button>
        </div>
      `).join('')}
      <form class="add-meal-form" id="add-meal-form">
        <input type="text" id="meal-title" placeholder="예: 닭가슴살 한덩이, 김치, 샌드위치" required />
        <button type="submit" class="btn btn-primary">+</button>
      </form>
    `;

    // 영양정보 비어있는 식사 자동 추정 (API 키 있을 때만)
    if (hasApiKey()) {
      for (const meal of meals) {
        if (!meal.nutrition && meal.nutritionStatus !== 'pending') {
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
    renderCalendar();
  });

  container.querySelector('#prev-month')!.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    selectedDate = null;
    renderCalendar();
  });

  container.querySelector('#next-month')!.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    selectedDate = null;
    renderCalendar();
  });

  dayMealsEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
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
  });

  dayMealsEl.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('[data-meal-id]') as HTMLElement | null;
    if (!btn) return;
    await deleteMeal(btn.dataset.mealId!);
    emit(EVENTS.MEALS_CHANGED);
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
  return `
    <div class="nutrition-summary">
      <div class="nutrition-summary-cal">
        <span class="nutrition-summary-num">${t.calories}</span>
        <span class="nutrition-summary-unit">kcal</span>
      </div>
      <div class="nutrition-summary-macros">
        <div class="macro"><span class="macro-label">탄</span><span class="macro-val">${t.carbs}g</span></div>
        <div class="macro"><span class="macro-label">단</span><span class="macro-val">${t.protein}g</span></div>
        <div class="macro"><span class="macro-label">지</span><span class="macro-val">${t.fat}g</span></div>
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
    return `<div class="meal-nutrition meal-nutrition-failed">설정에서 API 키 등록 시 영양정보 자동 추정</div>`;
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
