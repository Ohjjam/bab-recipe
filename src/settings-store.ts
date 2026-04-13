import type { AppSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

const STORAGE_KEY = 'bab-recipe-settings';

export function getSettings(): AppSettings {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Partial<AppSettings>): void {
  const current = getSettings();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...settings }));
}

export function hasApiKey(): boolean {
  return getSettings().geminiApiKey.length > 0;
}
