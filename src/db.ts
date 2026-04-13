import { openDB, type IDBPDatabase } from 'idb';
import type { Ingredient, ChatMessage } from './types';

const DB_NAME = 'bab-recipe-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase>;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const ingredientStore = db.createObjectStore('ingredients', { keyPath: 'id' });
        ingredientStore.createIndex('category', 'category');
        ingredientStore.createIndex('addedAt', 'addedAt');

        db.createObjectStore('chat-history', { keyPath: 'id' });
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
