import { getSettings } from './settings-store';
import type { Ingredient, ChatMessage } from './types';
import type { Category } from './types';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function buildIngredientsPrompt(ingredients: Ingredient[]): string {
  const grouped = ingredients.reduce<Record<string, Ingredient[]>>((acc, item) => {
    (acc[item.category] ||= []).push(item);
    return acc;
  }, {});

  let text = '현재 냉장고 재료:\n';
  for (const [cat, items] of Object.entries(grouped)) {
    text += `\n[${cat}]\n`;
    for (const item of items) {
      text += `- ${item.name}${item.memo ? ` (${item.memo})` : ''}\n`;
    }
  }
  return text;
}

const SYSTEM_INSTRUCTION = `당신은 한국 가정 요리 전문가입니다.
사용자의 냉장고 재료를 보고 만들 수 있는 현실적인 레시피를 추천해주세요.
- 재료를 모두 사용할 필요는 없습니다
- 일반 가정에 있는 기본 양념(소금, 설탕, 간장, 고추장, 된장, 식용유 등)은 있다고 가정합니다
- 조리 난이도와 예상 시간을 함께 알려주세요
- 한국어로 답변하세요`;

export async function* streamRecipeSuggestions(
  ingredients: Ingredient[]
): AsyncGenerator<string> {
  const { geminiApiKey, geminiModel } = getSettings();
  if (!geminiApiKey) throw new Error('API 키가 설정되지 않았습니다.');

  const ingredientsText = buildIngredientsPrompt(ingredients);
  const userMessage = `${ingredientsText}\n\n이 재료들로 만들 수 있는 레시피 3가지를 추천해주세요. 각 레시피마다 필요한 재료, 조리 과정, 난이도, 예상 시간을 알려주세요.`;

  yield* streamGemini(geminiApiKey, geminiModel, [
    { role: 'user', parts: [{ text: userMessage }] },
  ], SYSTEM_INSTRUCTION);
}

export async function* streamChat(
  messages: ChatMessage[],
  ingredients: Ingredient[]
): AsyncGenerator<string> {
  const { geminiApiKey, geminiModel } = getSettings();
  if (!geminiApiKey) throw new Error('API 키가 설정되지 않았습니다.');

  const ingredientsText = buildIngredientsPrompt(ingredients);
  const systemWithContext = `${SYSTEM_INSTRUCTION}\n\n${ingredientsText}`;

  const contents = messages.map((m) => ({
    role: m.role === 'model' ? 'model' as const : 'user' as const,
    parts: [{ text: m.text }],
  }));

  yield* streamGemini(geminiApiKey, geminiModel, contents, systemWithContext);
}

export async function testConnection(): Promise<boolean> {
  const { geminiApiKey, geminiModel } = getSettings();
  if (!geminiApiKey) return false;

  const url = `${BASE_URL}/${geminiModel}:generateContent?key=${geminiApiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: '안녕' }] }],
      generationConfig: { maxOutputTokens: 10 },
    }),
  });
  return res.ok;
}

async function* streamGemini(
  apiKey: string,
  model: string,
  contents: Array<{ role: string; parts: Array<{ text: string }> }>,
  systemInstruction: string
): AsyncGenerator<string> {
  const url = `${BASE_URL}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 4096,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API 오류 (${res.status}): ${err}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;

      try {
        const data = JSON.parse(jsonStr);
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch {
        // skip malformed JSON chunks
      }
    }
  }
}
