import { openDB, type IDBPDatabase } from 'idb';
import type { Ingredient, ChatMessage, Bookmark, MealEntry } from './types';

const DB_NAME = 'bab-recipe-db';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase>;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const ingredientStore = db.createObjectStore('ingredients', { keyPath: 'id' });
          ingredientStore.createIndex('category', 'category');
          ingredientStore.createIndex('addedAt', 'addedAt');
          db.createObjectStore('chat-history', { keyPath: 'id' });
        }
        if (oldVersion < 2) {
          const bookmarkStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
          bookmarkStore.createIndex('savedAt', 'savedAt');
          const mealStore = db.createObjectStore('meals', { keyPath: 'id' });
          mealStore.createIndex('date', 'date');
        }
      },
    });
  }
  return dbPromise;
}

// --- Ingredients ---

export async function getAllIngredients(): Promise<Ingredient[]> {
  const db = await getDB();
  const items = await db.getAll('ingredients');
  return items.sort((a, b) => b.addedAt - a.addedAt);
}

export async function getIngredientsByCategory(category: string): Promise<Ingredient[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex('ingredients', 'category', category);
  return items.sort((a, b) => b.addedAt - a.addedAt);
}

export async function addIngredient(ingredient: Ingredient): Promise<void> {
  const db = await getDB();
  await db.add('ingredients', ingredient);
  void triggerAutoBackup();
}

export async function deleteIngredient(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('ingredients', id);
  void triggerAutoBackup();
}

export async function updateIngredient(ingredient: Ingredient): Promise<void> {
  const db = await getDB();
  await db.put('ingredients', ingredient);
  void triggerAutoBackup();
}

// --- Chat History ---

export async function getChatHistory(): Promise<ChatMessage[]> {
  const db = await getDB();
  const msgs = await db.getAll('chat-history');
  return msgs.sort((a, b) => a.timestamp - b.timestamp);
}

export async function addChatMessage(msg: ChatMessage): Promise<void> {
  const db = await getDB();
  await db.add('chat-history', msg);
}

export async function clearChatHistory(): Promise<void> {
  const db = await getDB();
  await db.clear('chat-history');
}

// --- Bookmarks ---

export async function getAllBookmarks(): Promise<Bookmark[]> {
  const db = await getDB();
  const items = await db.getAll('bookmarks');
  return items.sort((a, b) => b.savedAt - a.savedAt);
}

export async function addBookmark(bookmark: Bookmark): Promise<void> {
  const db = await getDB();
  await db.add('bookmarks', bookmark);
  void triggerAutoBackup();
}

export async function deleteBookmark(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('bookmarks', id);
  void triggerAutoBackup();
}

// --- Meals ---

export async function getMealsByDate(date: string): Promise<MealEntry[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex('meals', 'date', date);
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getMealsByMonth(year: number, month: number): Promise<MealEntry[]> {
  const db = await getDB();
  const all = await db.getAll('meals');
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return all.filter((m) => m.date.startsWith(prefix));
}

export async function addMeal(meal: MealEntry): Promise<void> {
  const db = await getDB();
  await db.add('meals', meal);
  void triggerAutoBackup();
}

export async function updateMeal(meal: MealEntry): Promise<void> {
  const db = await getDB();
  await db.put('meals', meal);
  void triggerAutoBackup();
}

export async function deleteMeal(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('meals', id);
  void triggerAutoBackup();
}

// --- Backup & Restore ---

export async function triggerAutoBackup(): Promise<void> {
  try {
    const dataStr = await exportAllData();
    localStorage.setItem('bab-recipe-auto-backup', dataStr);
  } catch (err) {
    console.error('Auto backup failed:', err);
  }
}

export async function exportAllData(): Promise<string> {
  const db = await getDB();
  const ingredients = await db.getAll('ingredients');
  const bookmarks = await db.getAll('bookmarks');
  const meals = await db.getAll('meals');
  const chatHistory = await db.getAll('chat-history');
  const settings = localStorage.getItem('bab-recipe-settings');
  
  return JSON.stringify({
    ingredients,
    bookmarks,
    meals,
    chatHistory,
    settings: settings ? JSON.parse(settings) : null,
    exportedAt: Date.now()
  });
}

export async function importAllData(jsonStr: string): Promise<void> {
  const data = JSON.parse(jsonStr);

  // 형식 검증 — 엉뚱한 JSON 파일로 복원하면 모든 스토어가 clear()된 뒤
  // 빈 데이터로 남는 사고를 막는다. 백업 파일의 핵심 배열이 하나도 없으면 거부.
  const isBackupShape =
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    [data.ingredients, data.bookmarks, data.meals, data.chatHistory].some(Array.isArray);
  if (!isBackupShape) {
    throw new Error('밥 레시피 백업 파일이 아닙니다. (ingredients/meals 등 데이터가 없음)');
  }
  for (const key of ['ingredients', 'bookmarks', 'meals', 'chatHistory'] as const) {
    const arr = data[key];
    if (arr !== undefined && !Array.isArray(arr)) {
      throw new Error(`백업 파일 형식 오류: ${key}가 배열이 아닙니다.`);
    }
    if (Array.isArray(arr) && arr.some((item: unknown) => !item || typeof (item as { id?: unknown }).id !== 'string')) {
      throw new Error(`백업 파일 형식 오류: ${key} 항목에 id가 없습니다.`);
    }
  }

  const db = await getDB();
  
  const tx = db.transaction(['ingredients', 'bookmarks', 'meals', 'chat-history'], 'readwrite');
  
  await tx.objectStore('ingredients').clear();
  for (const item of data.ingredients || []) {
    await tx.objectStore('ingredients').put(item);
  }
  
  await tx.objectStore('bookmarks').clear();
  for (const item of data.bookmarks || []) {
    await tx.objectStore('bookmarks').put(item);
  }
  
  await tx.objectStore('meals').clear();
  for (const item of data.meals || []) {
    await tx.objectStore('meals').put(item);
  }
  
  await tx.objectStore('chat-history').clear();
  for (const item of data.chatHistory || []) {
    await tx.objectStore('chat-history').put(item);
  }
  
  await tx.done;
  
  if (data.settings) {
    localStorage.setItem('bab-recipe-settings', JSON.stringify(data.settings));
  }
}
