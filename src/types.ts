export type Category = '냉장' | '냉동' | '상온' | '양념';

export const CATEGORIES: Category[] = ['냉장', '냉동', '상온', '양념'];

export interface Ingredient {
  id: string;
  name: string;
  category: Category;
  addedAt: number;
  memo?: string;
  expiryDate?: string; // 'YYYY-MM-DD'
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
  excludedIngredients: string; // Comma-separated list of ingredients to exclude
  targetCalories: number;
  targetCarbs: number;
  targetProtein: number;
  targetFat: number;
  theme: 'system' | 'light' | 'dark';
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

export interface Nutrition {
  calories: number; // kcal
  carbs: number;    // g
  protein: number;  // g
  fat: number;      // g
}

export interface MealEntry {
  id: string;
  date: string;       // 'YYYY-MM-DD'
  title: string;
  memo?: string;
  createdAt: number;
  nutrition?: Nutrition;
  nutritionStatus?: 'pending' | 'failed';
}

export const DEFAULT_SETTINGS: AppSettings = {
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash-lite',
  excludedIngredients: '',
  targetCalories: 2000,
  targetCarbs: 250,
  targetProtein: 100,
  targetFat: 60,
  theme: 'system',
};
