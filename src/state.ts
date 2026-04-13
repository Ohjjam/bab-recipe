type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribe(event: string, fn: Listener): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function emit(event: string): void {
  listeners.get(event)?.forEach((fn) => fn());
}

// Event names
export const EVENTS = {
  INGREDIENTS_CHANGED: 'ingredients-changed',
  CHAT_CHANGED: 'chat-changed',
  SETTINGS_CHANGED: 'settings-changed',
  BOOKMARKS_CHANGED: 'bookmarks-changed',
  MEALS_CHANGED: 'meals-changed',
} as const;
