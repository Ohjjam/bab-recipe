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
  applyTheme();
}

export function hasApiKey(): boolean {
  return getSettings().geminiApiKey.length > 0;
}

export function applyTheme(): void {
  const settings = getSettings();
  const html = document.documentElement;
  if (settings.theme === 'light') {
    html.setAttribute('data-theme', 'light');
  } else if (settings.theme === 'dark') {
    html.setAttribute('data-theme', 'dark');
  } else {
    html.removeAttribute('data-theme');
  }
}
