import { getSettings } from './settings-store';
import type { Ingredient, ChatMessage, Recipe } from './types';

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

const SYSTEM_INSTRUCTION = `당신은 한국 가정 요리 전문가입니다. 실제로 존재하는 한국 요리를 추천하는 것이 핵심 역할입니다.

【 매우 중요: 요리 이름 규칙 】
- 반드시 실제로 존재하는 정식 한국 요리 이름을 사용하세요.
  예: "제육볶음", "김치찌개", "계란말이", "떡볶이", "된장찌애", "닭갈비", "비빔밥", "김치볶음밥", "미역국", "잡채", "김치전", "콩나물국", "순두부찌개", "부대찌개", "감자조림", "무생채", "어묵볶음", "멸치볶음", "간장계란밥", "참치마요덮밥", "오믈렛", "토마토파스타", "알리오올리오", "크림파스타", "카레라이스", "하이라이스" 등
- 절대로 재료를 나열한 이름을 만들지 마세요.
  ❌ 금지 예시: "오리 매콤 볶음밥", "양배추 닭고기 볶음", "계란 파프리카 볶음", "치즈 양파 감자조림"
  ✅ 올바른 예: "오므라이스", "닭볶음탕", "계란 스크램블", "감자채볶음"
- 한국인이 실제로 "오늘 뭐 먹을까?"라고 고민할 때 떠올리는 진짜 요리만 추천하세요.
- 애매하거나 생소한 이름이 떠오르면 그 요리는 추천하지 마세요.

【 기타 규칙 】
- 재료를 모두 사용할 필요는 없습니다. 요리 하나에 필요한 재료만 있으면 됩니다.
- 일반 가정에 있는 기본 양념(소금, 설탕, 간장, 고추장, 된장, 식용유, 참기름, 후추, 다진마늘 등)은 있다고 가정합니다.
- 사용자가 가진 재료로 만들 수 없는 요리는 추천하지 마세요. 주재료 1~2개는 반드시 사용자 재료에서 나와야 합니다.
- 한식이 떠오르지 않으면 양식/일식/중식 중 가정에서 흔히 해먹는 요리도 OK입니다.
- description은 "어떤 요리인지" 한 줄로 간단히 소개하세요. (재료 나열이 아닌 요리 특징)
- 모든 답변은 한국어로.`;

// 구조화된 레시피 3개 반환 (JSON mode)
export async function getRecipeSuggestions(
  ingredients: Ingredient[],
  preference?: string
): Promise<Recipe[]> {
  const { geminiApiKey, geminiModel } = getSettings();
  if (!geminiApiKey) throw new Error('API 키가 설정되지 않았습니다.');

  const ingredientsText = buildIngredientsPrompt(ingredients);
  let prompt = `${ingredientsText}\n\n이 재료들로 만들 수 있는 레시피 3가지를 추천해주세요.`;
  if (preference && preference.trim()) {
    prompt += `\n\n사용자 요구사항: ${preference.trim()}`;
  }
  prompt += `\n\n각 레시피는 title(요리명), difficulty(쉬움/보통/어려움), time(예상 시간 예: "15분"), description(한 줄 설명), ingredients(필요한 재료 배열), steps(조리 과정 배열) 필드를 포함해야 합니다.`;

  const url = `${BASE_URL}/${geminiModel}:generateContent?key=${geminiApiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            recipes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  difficulty: { type: 'string' },
                  time: { type: 'string' },
                  description: { type: 'string' },
                  ingredients: { type: 'array', items: { type: 'string' } },
                  steps: { type: 'array', items: { type: 'string' } },
                },
                required: ['title', 'difficulty', 'time', 'description', 'ingredients', 'steps'],
              },
            },
          },
          required: ['recipes'],
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API 오류 (${res.status}): ${err}`);
  }

  const data = await res.json();
  const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonText) throw new Error('응답이 비어있습니다');

  const parsed = JSON.parse(jsonText);
  return parsed.recipes || [];
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
