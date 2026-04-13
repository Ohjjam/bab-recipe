import { getMealsByMonth, getMealsByDate, addMeal, deleteMeal } from '../db';
import { subscribe, emit, EVENTS } from '../state';
import type { MealEntry } from '../types';

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

    // 이번 달 식사 기록 날짜 수집
    const meals = await getMealsByMonth(currentYear, currentMonth);
    mealDates = new Set(meals.map((m) => m.date));

    const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const todayStr = toDateStr(new Date());

    const dows = ['일', '월', '화', '수', '목', '금', '토'];
    let html = dows.map((d) => `<div class="calendar-dow">${d}</div>`).join('');

    // 빈 셀
    for (let i = 0; i < firstDay; i++) {
      html += `<div class="calendar-day empty"></div>`;
    }

    // 날짜 셀
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
    renderDayMeals();
  }

  async function renderDayMeals() {
    if (!selectedDate) {
      dayMealsEl.innerHTML = '';
      return;
    }

    const meals = await getMealsByDate(selectedDate);
    const [, m, d] = selectedDate.split('-');
    const label = `${parseInt(m)}월 ${parseInt(d)}일`;

    dayMealsEl.innerHTML = `
      <div class="day-meals-title">📅 ${label} 식사 기록</div>
      ${meals.length === 0 ? '<div style="color:var(--text-secondary);font-size:13px;margin-bottom:8px">기록이 없습니다</div>' : ''}
      ${meals.map((m) => `
        <div class="meal-item">
          <div class="meal-item-info">
            <div class="meal-item-title">${escapeHtml(m.title)}</div>
            ${m.memo ? `<div class="meal-item-memo">${escapeHtml(m.memo)}</div>` : ''}
          </div>
          <button class="ingredient-delete" data-meal-id="${m.id}">✕</button>
        </div>
      `).join('')}
      <form class="add-meal-form" id="add-meal-form">
        <input type="text" id="meal-title" placeholder="뭐 해먹었어?" required />
        <button type="submit" class="btn btn-primary">+</button>
      </form>
    `;
  }

  // Calendar date click
  calendarEl.addEventListener('click', (e) => {
    const day = (e.target as HTMLElement).closest('.calendar-day:not(.empty)') as HTMLElement | null;
    if (!day) return;
    selectedDate = day.dataset.date!;
    renderCalendar();
  });

  // Month navigation
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

  // Add meal form (event delegation since it's dynamically rendered)
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
    renderCalendar();
  });

  // Delete meal
  dayMealsEl.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('[data-meal-id]') as HTMLElement | null;
    if (!btn) return;
    await deleteMeal(btn.dataset.mealId!);
    emit(EVENTS.MEALS_CHANGED);
    renderCalendar();
  });

  renderCalendar();

  const unsub = subscribe(EVENTS.MEALS_CHANGED, () => renderCalendar());
  return unsub;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
