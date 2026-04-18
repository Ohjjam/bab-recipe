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

【 규칙 1: 요리 이름은 실제 존재하는 정식 요리명만 】
- 반드시 실제로 존재하는 정식 요리 이름을 사용하세요.
  예: "제육볶음", "김치찌개", "계란말이", "떡볶이", "된장찌개", "닭갈비", "비빔밥", "김치볶음밥", "미역국", "잡채", "김치전", "콩나물국", "순두부찌개", "부대찌개", "감자조림", "무생채", "어묵볶음", "멸치볶음", "간장계란밥", "참치마요덮밥", "오믈렛", "토마토파스타", "알리오올리오", "크림파스타", "카레라이스", "하이라이스", "계란볶음밥", "돼지고기김치찌개", "오므라이스", "닭볶음탕", "감자채볶음"
- 절대로 재료를 나열한 이름을 만들지 마세요.
  ❌ 금지: "오리 매콤 볶음밥", "양배추 닭고기 볶음", "계란 파프리카 볶음", "치즈 양파 감자조림", "김치 치즈 볶음밥", "치즈 삼겹살 구이", "양파 계란 볶음"
- 재료 2개 이상을 그냥 붙여놓은 이름(예: "A B C")은 금지. 메뉴판에 그대로 쓸 수 있는 정식 요리명만.
- 한국인이 실제로 "오늘 뭐 먹을까?"라고 고민할 때 떠올리는 진짜 요리만 추천하세요.

【 규칙 2: 재료 제약 — 매우 중요 】
- 사용자가 가진 재료 리스트(입력으로 제공됨)에 없는 재료는 절대로 주재료로 사용하지 마세요.
- 예시: 사용자 재료에 "김치"가 없으면, 김치찌개/김치볶음밥/김치전 같은 김치가 주재료인 요리는 추천 금지.
- 예시: "닭고기"가 없으면 닭갈비/닭볶음탕 추천 금지. "오징어"가 없으면 오징어볶음 추천 금지.
- ingredients 필드에 "(있다면)", "(선택사항)" 같은 주재료를 넣지 마세요. 주재료는 확실히 사용자에게 있는 것만.
- 예외로 허용되는 "기본 양념"만 자유롭게 써도 됩니다: 소금, 설탕, 간장, 고추장, 된장, 식초, 식용유, 참기름, 들기름, 후추, 다진마늘, 물, 고춧가루. 이 외 재료는 사용자 리스트에 반드시 있어야 합니다.
- 재료가 부족해서 3가지 요리가 안 떠오르면, 같은 메인 재료로 변형을 제안하거나(예: 삼겹살 → 제육볶음/삼겹살구이/삼겹살숙주볶음) 간단한 요리 위주로 선택하세요.

【 규칙 2-1: 이름과 재료 일치 】
- 요리 이름에 들어간 재료는 반드시 ingredients 배열에도 있어야 합니다.
- ❌ 금지: 이름이 "삼겹살 김치볶음밥"인데 실제 재료에 김치 없음 (김치 없으면 그냥 "삼겹살볶음밥" 혹은 다른 요리로 바꾸세요)
- ❌ 금지: 이름이 "치즈 계란말이"인데 치즈 없음
- 요리 이름에 있는 재료가 사용자 리스트에 없으면, 그 요리 자체를 추천하지 마세요.

【 규칙 3: 답변 형식 】
- ingredients 배열에는 해당 요리에 실제로 사용하는 재료만 구체적 분량과 함께 나열하세요. (예: "삼겹살 300g", "양파 1/2개")
- steps 배열에는 순서대로 조리 과정을 문장 단위로 나열하세요.
- description은 어떤 요리인지 한 줄로 간단히 (재료 나열 금지).
- 모든 답변은 한국어로.`;

// 기본 양념 화이트리스트 (재료 리스트에 없어도 허용)
const BASIC_SEASONINGS = [
  '소금', '설탕', '간장', '진간장', '국간장', '고추장', '된장', '쌈장', '초고추장',
  '식초', '식용유', '참기름', '들기름', '후추', '다진마늘', '마늘', '물', '고춧가루',
  '올리고당', '물엿', '맛술', '미림', '굴소스', '참깨', '통깨', '대파',
];

function normalizeIngredientName(raw: string): string {
  // "삼겹살 300g" → "삼겹살", "양파 1/2개" → "양파"
  return raw
    .replace(/\s*\d[\d\/.]*\s*(g|kg|ml|l|큰술|작은술|개|쪽|장|줌|컵|포기|모|꼬집|큰\s*술|작은\s*술).*/gi, '')
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/\s*(약간|적당량|조금|선택사항)\s*/g, '')
    .trim();
}

// 제목에 자주 등장하는 주재료 (사용자가 없는데 제목에 들어가면 탈락)
const COMMON_INGREDIENT_KEYWORDS = [
  '김치', '두부', '닭', '소고기', '돼지고기', '삼겹살', '목살', '오징어', '새우', '문어',
  '꽁치', '고등어', '삼치', '연어', '참치', '멸치', '김', '미역', '다시마',
  '콩나물', '시금치', '무', '배추', '상추', '깻잎', '부추', '쑥갓',
  '감자', '고구마', '당근', '오이', '호박', '애호박', '가지', '피망', '파프리카',
  '양파', '대파', '마늘', '생강', '계란', '달걀', '치즈', '우유', '버터',
  '버섯', '팽이버섯', '새송이버섯', '표고버섯', '느타리버섯',
  '만두', '떡', '라면', '우동', '소바', '파스타', '스파게티', '햇반', '밥',
  '토마토', '베이컨', '햄', '소시지', '참치캔', '스팸',
];

// 레시피가 유효한지 검증 (재료 + 제목 둘 다)
function isRecipeValid(recipe: Recipe, availableNames: string[]): boolean {
  const avail = [...availableNames, ...BASIC_SEASONINGS];

  // 1) ingredients 배열 검증
  for (const raw of recipe.ingredients) {
    const name = normalizeIngredientName(raw);
    if (!name) continue;
    const found = avail.some((a) => name.includes(a) || a.includes(name));
    if (!found) return false;
  }

  // 2) 제목 검증 — 주재료 키워드가 제목에 있는데 사용자 재료에 없으면 탈락
  for (const keyword of COMMON_INGREDIENT_KEYWORDS) {
    if (!recipe.title.includes(keyword)) continue;
    const userHas = availableNames.some((n) => n.includes(keyword) || keyword.includes(n));
    if (!userHas) return false;
  }

  return true;
}

// 구조화된 레시피 3개 반환 (JSON mode). 최대 2회 재시도로 재료 맞는 것만 필터.
export async function getRecipeSuggestions(
  ingredients: Ingredient[],
  preference?: string
): Promise<Recipe[]> {
  const availableNames = ingredients.map((i) => i.name);
  const collected: Recipe[] = [];
  const seenTitles = new Set<string>();

  for (let attempt = 0; attempt < 2 && collected.length < 3; attempt++) {
    const batch = await fetchRecipes(ingredients, preference, attempt, collected.map((r) => r.title));
    for (const r of batch) {
      if (seenTitles.has(r.title)) continue;
      if (!isRecipeValid(r, availableNames)) continue;
      collected.push(r);
      seenTitles.add(r.title);
      if (collected.length >= 3) break;
    }
  }

  // 3개 못 채우면 그냥 필터 통과한 것만 반환 (최소 1개 보장 위해 빈 배열이면 마지막 batch 반환)
  if (collected.length === 0) {
    return await fetchRecipes(ingredients, preference, 0, []);
  }
  return collected;
}

async function fetchRecipes(
  ingredients: Ingredient[],
  preference: string | undefined,
  attempt: number,
  excludeTitles: string[]
): Promise<Recipe[]> {
  const { geminiApiKey, geminiModel } = getSettings();
  if (!geminiApiKey) throw new Error('API 키가 설정되지 않았습니다.');

  const ingredientsText = buildIngredientsPrompt(ingredients);
  const availableNames = ingredients.map((i) => i.name).join(', ');

  let prompt = `${ingredientsText}\n\n`;
  prompt += `【 사용 가능한 재료 (이것 외에는 기본 양념만 사용 가능) 】\n${availableNames}\n\n`;
  prompt += `【 기본 양념 (위 목록에 없어도 자유롭게 사용 가능) 】\n소금, 설탕, 간장, 고추장, 된장, 식초, 식용유, 참기름, 들기름, 후추, 다진마늘, 물, 고춧가루\n\n`;
  prompt += `위 재료만으로 만들 수 있는 실제 한국/가정 요리 3가지를 추천하세요.\n\n`;
  prompt += `반드시 답변 전에 내부적으로 다음 체크리스트를 확인하세요:\n`;
  prompt += `1) 추천하는 요리 이름이 실제 존재하는 정식 요리 이름인가? (재료 나열식 이름 아님)\n`;
  prompt += `2) 요리 이름에 있는 재료가 모두 "사용 가능한 재료" 목록에 있는가?\n`;
  prompt += `3) ingredients 배열의 모든 재료가 "사용 가능한 재료" 또는 "기본 양념"에 있는가?\n`;
  prompt += `셋 중 하나라도 No면, 그 요리 대신 다른 요리를 고르세요.\n\n`;
  if (preference && preference.trim()) {
    prompt += `【 사용자 요구사항 】 ${preference.trim()}\n\n`;
  }
  if (excludeTitles.length > 0) {
    prompt += `【 이미 추천된 요리 (제외) 】 ${excludeTitles.join(', ')}\n\n`;
  }
  if (attempt > 0) {
    prompt += `⚠️ 이전 시도에서 일부 레시피가 "사용 가능한 재료"에 없는 재료를 포함해 탈락했습니다. 이번엔 반드시 "사용 가능한 재료" + "기본 양념"만 사용하세요.\n\n`;
  }
  prompt += `각 레시피는 title, difficulty(쉬움/보통/어려움), time(예: "15분"), description(한 줄), ingredients(분량 포함), steps(순서대로) 필드를 포함합니다.`;

  const url = `${BASE_URL}/${geminiModel}:generateContent?key=${geminiApiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
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
