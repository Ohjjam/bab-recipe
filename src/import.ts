import { addIngredient, getAllIngredients } from './db';
import type { Category, Ingredient } from './types';

/**
 * URL 쿼리 파라미터에서 재료를 읽어 DB에 일괄 추가.
 * 예: ?import=대파:냉장,양파:냉장,쌈장:양념
 * 카테고리 생략 시 기본값 '냉장'.
 * 이미 같은 이름의 재료가 있으면 건너뜀.
 */
export async function importFromUrl(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('import');
  if (!raw) return;

  const existing = await getAllIngredients();
  const existingNames = new Set(existing.map((i) => i.name));

  const validCategories = new Set(['냉장', '냉동', '상온', '양념']);
  const items = raw.split(',').map((s) => s.trim()).filter(Boolean);

  let added = 0;
  for (const item of items) {
    const [name, cat] = item.split(':').map((s) => s.trim());
    if (!name || existingNames.has(name)) continue;

    const category: Category = (validCategories.has(cat) ? cat : '냉장') as Category;
    const ingredient: Ingredient = {
      id: crypto.randomUUID(),
      name,
      category,
      addedAt: Date.now(),
    };
    await addIngredient(ingredient);
    existingNames.add(name);
    added++;
  }

  if (added > 0) {
    // 쿼리 파라미터 제거 (재방문 시 중복 입력 방지)
    const url = new URL(window.location.href);
    url.searchParams.delete('import');
    window.history.replaceState({}, '', url.toString());
    alert(`${added}개 재료가 추가되었습니다!`);
  }
}
