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

export interface ShoppingRecommendation {
  ingredient: string;     // 추천 식재료 이름 (예: 돼지고기)
  category: string;       // 카테고리 (예: 정육/계란, 채소)
  expectedCost: string;   // 예상 비용 범위 (예: "8,000원 ~ 12,000원")
  reason: string;         // 이 식재료를 추천하는 이유 (보유 재료와의 결합 설명)
  recipes: Recipe[];      // 이 식재료를 구매했을 때 만들 수 있는 요리 목록
}

export interface ShoppingSuggestionResult {
  recommendations: ShoppingRecommendation[];
}

