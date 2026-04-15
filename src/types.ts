export type Category = '냉장' | '냉동' | '상온' | '양념';

export const CATEGORIES: Category[] = ['냉장', '냉동', '상온', '양념'];

export interface Ingredient {
  id: string;
  name: string;
  category: Category;
  addedAt: number;
  memo?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface AppSettings {
  geminiApiKey: string;
  geminiModel: string;
}

export interface Recipe {
  title: string;
  difficulty: string;
  time: string;
  description: string;
  ingredients: string[];
  steps: string[];
}

export interface Bookmark {
  id: string;
  title: string;
  content: string;
  savedAt: number;
}

export interface MealEntry {
  id: string;
  date: string;       // 'YYYY-MM-DD'
  title: string;
  memo?: string;
  createdAt: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash-lite',
};
