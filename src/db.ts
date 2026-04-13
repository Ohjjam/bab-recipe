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
}

export async function deleteIngredient(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('ingredients', id);
}

export async function updateIngredient(ingredient: Ingredient): Promise<void> {
  const db = await getDB();
  await db.put('ingredients', ingredient);
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
}

export async function deleteBookmark(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('bookmarks', id);
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
}

export async function deleteMeal(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('meals', id);
}
