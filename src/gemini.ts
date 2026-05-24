import { getSettings } from './settings-store';
import type { Ingredient, ChatMessage, Recipe, Nutrition, ShoppingSuggestionResult } from './types';

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

【 규칙 0: 사용자 요구사항 최우선 — 최상위 규칙 】
- 사용자가 "요구사항"을 명시했다면, 추천 3개 중 최소 2개는 그 요구를 직접 충족해야 합니다.
- 요구사항에 특정 재료 이름이 언급되면(예: "다짐육 써서", "두부로", "삼겹살 요리"), 그 재료가 주재료인 요리를 우선 추천하세요. 그 재료가 안 들어간 요리만 3개 추천하는 것은 금지.
- 요구사항에 스타일/맛/시간이 언급되면(예: "매콤한 거", "20분 이하", "국물") 그 조건을 따르세요.
- 요구사항과 재료 제약이 충돌할 때만 재료 제약이 우선. (예: "오징어 요리" 요청인데 오징어 재료 없음 → 오징어 요리 추천 불가, 다른 요리로 대체)

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

// 재료 별칭 그룹 — 같은 그룹에 있는 재료들은 상호 대체 가능한 동의어로 간주
const ALIAS_GROUPS: string[][] = [
  ['다짐육', '다진 소고기', '다진소고기', '다진 돼지고기', '다진돼지고기', '다진 고기', '다진고기', '간 고기', '간고기', '다진 닭고기', '다진닭고기', '분쇄육', '소고기 다짐육', '돼지고기 다짐육'],
  ['계란', '달걀'],
  ['대파', '파', '쪽파', '실파'],
  ['식용유', '기름', '카놀라유', '포도씨유', '해바라기유'],
  ['올리브유', '올리브오일'],
  ['버터', '무염버터', '가염버터'],
  ['치즈', '모짜렐라', '체다치즈', '슬라이스치즈', '피자치즈'],
  ['우유', '멸균우유', '저지방우유'],
  ['돼지고기', '삼겹살', '목살', '앞다리살', '뒷다리살', '돼지 안심', '돼지 등심'],
  ['소고기', '한우', '우삼겹', '차돌박이', '소 안심', '소 등심', '불고기감'],
  ['닭고기', '닭가슴살', '닭다리', '닭 안심', '닭 정육'],
  ['두부', '연두부', '순두부', '부침두부', '찌개두부', '판두부'],
  ['햇반', '즉석밥', '밥', '쌀밥', '공깃밥'],
  ['파스타면', '스파게티면', '스파게티', '파스타', '링귀니', '페투치니'],
  ['김치', '묵은지', '배추김치', '신김치'],
];

// 양방향 별칭 맵 자동 생성
const ALIAS_MAP: Record<string, string[]> = {};
for (const group of ALIAS_GROUPS) {
  for (const item of group) {
    ALIAS_MAP[item] = [...new Set([...(ALIAS_MAP[item] || []), ...group])];
  }
}

function expandWithAliases(name: string): string[] {
  const result = new Set<string>([name]);
  const aliases = ALIAS_MAP[name];
  if (aliases) {
    for (const a of aliases) result.add(a);
  }
  return [...result];
}

function normalizeIngredientName(raw: string): string {
  // "삼겹살 300g" → "삼겹살", "양파 1/2개" → "양파"
  return raw
    .replace(/\s*\d[\d\/.]*\s*(g|kg|ml|l|큰술|작은술|개|쪽|장|줌|컵|포기|모|꼬집|큰\s*술|작은\s*술).*/gi, '')
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/\s*(약간|적당량|조금|선택사항)\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 모델 재료(name)가 사용자 재료(userIng) 또는 양념과 일치하는지.
// - 정확 일치는 항상 OK
// - 사용자 재료가 2글자 이상일 때만 `name.includes(userIng)` 허용
//   (모델이 "닭가슴살" 적었을 때 사용자가 "닭가슴살"/"닭" 가졌으면 통과시키지 않음 — 즉 사용자→모델 방향 includes는 짧으면 거부)
// - 반대 방향(`userIng.includes(name)`) 제거: 모델이 모호한 짧은 이름("고기") 적으면 탈락.
function matchesIngredient(name: string, candidates: string[]): boolean {
  if (!name) return true;
  for (const c of candidates) {
    if (!c) continue;
    if (name === c) return true;
    if (c.length >= 2 && name.includes(c)) return true;
  }
  return false;
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

// 레시피가 제외된 구체적인 이유(필수 재료 부족 등)를 반환하는 함수
export function getRecipeValidationErrors(recipe: Recipe, availableNames: string[]): string[] {
  const errors: string[] = [];
  const settings = getSettings();
  const excluded = settings.excludedIngredients
    ? settings.excludedIngredients.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : [];

  // 0) 기피 재료 검증 (제목 및 재료명 매칭 시 즉시 에러)
  for (const ex of excluded) {
    if (recipe.title.toLowerCase().includes(ex)) {
      errors.push(`기피 재료 포함(제목): ${ex}`);
      break;
    }
  }

  const normalizedAvail = availableNames.map(normalizeIngredientName).filter(Boolean);
  const expandedAvail = normalizedAvail.flatMap(expandWithAliases);
  const candidates = [...expandedAvail, ...BASIC_SEASONINGS];

  // 1) ingredients 배열 검증 — 모델이 적은 모든 재료가 사용자/별칭/양념에 매칭되어야 함
  const missingIngredients: string[] = [];
  for (const raw of recipe.ingredients) {
    const name = normalizeIngredientName(raw);
    if (!name) continue;

    // 기피 재료가 재료 목록에 포함되었는지 확인
    let isExcluded = false;
    for (const ex of excluded) {
      if (name.toLowerCase().includes(ex) || ex.includes(name.toLowerCase())) {
        errors.push(`기피 재료 포함: ${raw}`);
        isExcluded = true;
        break;
      }
    }
    if (isExcluded) continue;

    if (!matchesIngredient(name, candidates)) {
      missingIngredients.push(raw);
    }
  }
  if (missingIngredients.length > 0) {
    errors.push(`부족한 재료: ${missingIngredients.join(', ')}`);
  }

  // 2) 제목 검증 — 주재료 키워드가 제목에 있는데 사용자 재료(+별칭)에 없으면 탈락
  const missingTitleKeywords: string[] = [];
  for (const keyword of COMMON_INGREDIENT_KEYWORDS) {
    if (keyword.length < 2) continue;
    if (!recipe.title.includes(keyword)) continue;
    const userHas = expandedAvail.some((n) => n === keyword || n.includes(keyword) || keyword.includes(n));
    if (!userHas) {
      missingTitleKeywords.push(keyword);
    }
  }
  if (missingTitleKeywords.length > 0) {
    errors.push(`핵심 재료 부족: ${missingTitleKeywords.join(', ')}`);
  }

  return errors;
}

// 레시피가 유효한지 검증 (재료 + 제목 둘 다)
function isRecipeValid(recipe: Recipe, availableNames: string[]): boolean {
  return getRecipeValidationErrors(recipe, availableNames).length === 0;
}

export interface SuggestionResult {
  recipes: Recipe[];
  invalidRecipes: {
    recipe: Recipe;
    reasons: string[];
  }[];
}

// 구조화된 레시피 3개 반환 (JSON mode). 최대 2회 재시도로 재료 맞는 것만 필터.
export async function getRecipeSuggestions(
  ingredients: Ingredient[],
  preference?: string,
  servingSize: string = '1인분'
): Promise<SuggestionResult> {
  const availableNames = ingredients.map((i) => i.name);
  const collected: Recipe[] = [];
  const invalidRecipes: { recipe: Recipe; reasons: string[] }[] = [];
  const seenTitles = new Set<string>();

  for (let attempt = 0; attempt < 3 && collected.length < 3; attempt++) {
    const batch = await fetchRecipes(ingredients, preference, attempt, collected.map((r) => r.title), servingSize);
    for (const r of batch) {
      if (seenTitles.has(r.title)) continue;
      
      const validationErrors = getRecipeValidationErrors(r, availableNames);
      if (validationErrors.length > 0) {
        if (!invalidRecipes.some(ir => ir.recipe.title === r.title)) {
          invalidRecipes.push({ recipe: r, reasons: validationErrors });
        }
        continue;
      }
      
      collected.push(r);
      seenTitles.add(r.title);
      if (collected.length >= 3) break;
    }
  }

  return {
    recipes: collected,
    invalidRecipes,
  };
}

async function fetchRecipes(
  ingredients: Ingredient[],
  preference: string | undefined,
  attempt: number,
  excludeTitles: string[],
  servingSize: string
): Promise<Recipe[]> {
  const settings = getSettings();
  const { geminiApiKey, geminiModel, excludedIngredients } = settings;
  if (!geminiApiKey) throw new Error('API 키가 설정되지 않았습니다.');

  const ingredientsText = buildIngredientsPrompt(ingredients);
  const availableNames = ingredients.map((i) => i.name).join(', ');

  let prompt = '';
  if (preference && preference.trim()) {
    prompt += `🎯【 사용자 요구사항 — 최우선 】\n"${preference.trim()}"\n\n`;
    prompt += `위 요구사항이 추천의 가장 중요한 기준입니다. 3개 중 최소 2개는 이 요구를 직접 충족해야 합니다.\n`;
    prompt += `특정 재료가 언급되어 있고 그 재료가 아래 "사용 가능한 재료"에 있다면, 그 재료가 주재료인 요리를 우선 추천하세요.\n\n`;
  }
  
  prompt += `👥【 추천 분량 기준 】\n${servingSize} 기준 (모든 요리의 재료 분량을 이에 맞춰서 작성해주세요.)\n\n`;
  
  // 유통기한 임박 재료 우선 소진 힌트
  const expiringSoon = ingredients.filter(i => {
    if (!i.expiryDate) return false;
    const diff = new Date(i.expiryDate).getTime() - new Date().setHours(0, 0, 0, 0);
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days <= 3;
  });
  if (expiringSoon.length > 0) {
    prompt += `⚠️【 유통기한 임박 재료 — 최우선 소진 권장 】\n`;
    for (const item of expiringSoon) {
      const diff = new Date(item.expiryDate!).getTime() - new Date().setHours(0, 0, 0, 0);
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      const ddayStr = days < 0 ? `만료 ${Math.abs(days)}일 지남` : (days === 0 ? '오늘 만료' : `D-${days}`);
      prompt += `- ${item.name} (${ddayStr})\n`;
    }
    prompt += `위 재료들은 곧 상하거나 상온/냉장 보관 기한이 지난 것들이므로, 추천 3가지 중 가능한 요리에 이 재료들을 적극 반영하여 빨리 소진할 수 있도록 도와주세요.\n\n`;
  }

  // 기피 재료 절대 제외 힌트
  if (excludedIngredients && excludedIngredients.trim()) {
    prompt += `🚫【 절대 사용 금지 재료 (사용자 기피 재료) 】\n${excludedIngredients}\n`;
    prompt += `위 재료들은 사용자가 절대 먹지 못하는 재료들이므로, 요리 이름(title), 필요한 재료(ingredients), 조리 과정(steps) 등 레시피 전체에서 완벽히 제외해 주십시오.\n\n`;
  }

  prompt += `${ingredientsText}\n\n`;
  prompt += `【 사용 가능한 재료 (이것 외에는 기본 양념만 사용 가능) 】\n${availableNames}\n\n`;

  // 사용자 재료의 별칭이 있으면 모델에게 알려줘서 표기를 통일하도록 유도
  const aliasHints: string[] = [];
  for (const name of ingredients.map((i) => normalizeIngredientName(i.name))) {
    const aliases = ALIAS_MAP[name]?.filter((a) => a !== name);
    if (aliases && aliases.length > 0) {
      aliasHints.push(`- "${name}" = ${aliases.slice(0, 4).join(', ')} 등으로 표기 가능 (어느 표기든 같은 재료)`);
    }
  }
  if (aliasHints.length > 0) {
    prompt += `【 재료 표기 별칭 — 같은 재료로 취급 】\n${aliasHints.join('\n')}\n\n`;
  }

  prompt += `【 기본 양념 (위 목록에 없어도 자유롭게 사용 가능) 】\n소금, 설탕, 간장, 고추장, 된장, 식초, 식용유, 참기름, 들기름, 후추, 다진마늘, 물, 고춧가루\n\n`;
  prompt += `위 재료만으로 만들 수 있는 실제 한국/가정 요리 3가지를 추천하세요.\n\n`;
  prompt += `반드시 답변 전에 내부적으로 다음 체크리스트를 확인하세요:\n`;
  if (preference && preference.trim()) {
    prompt += `0) 사용자 요구사항을 3개 중 최소 2개의 추천이 직접 충족하는가? (특정 재료 언급 시 그 재료가 들어간 요리 포함)\n`;
  }
  prompt += `1) 추천하는 요리 이름이 실제 존재하는 정식 요리 이름인가? (재료 나열식 이름 아님)\n`;
  prompt += `2) 요리 이름에 있는 재료가 모두 "사용 가능한 재료" 목록에 있는가?\n`;
  prompt += `3) ingredients 배열의 모든 재료가 "사용 가능한 재료" 또는 "기본 양념"에 있는가?\n`;
  prompt += `하나라도 No면, 그 요리 대신 다른 요리를 고르세요.\n\n`;
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
        temperature: 0.4,
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

export async function estimateMealNutrition(title: string, memo?: string): Promise<Nutrition> {
  const { geminiApiKey, geminiModel } = getSettings();
  if (!geminiApiKey) throw new Error('API 키가 설정되지 않았습니다.');

  const prompt =
    `아래 식사 기록의 영양 정보를 한국 일반 가정식 기준으로 추정하세요.\n\n` +
    `식사 기록: ${title}\n` +
    (memo ? `메모: ${memo}\n` : '') +
    `\n【 입력 형태 】\n` +
    `- 단일 요리일 수도 있고("김치찌개"), 여러 음식을 쉼표/공백으로 나열한 자유 형식일 수도 있음("닭가슴살 한덩이, 김치, 샌드위치", "현미밥 반공기 + 계란 2개").\n` +
    `- 분량 표현이 모호할 수 있음: "한 덩이", "조금", "반공기", "한 줌", "한 조각" 등 → 일반적인 양으로 합리적으로 가정.\n` +
    `- 분량 명시가 전혀 없는 단일 요리는 1인분으로 간주.\n\n` +
    `【 출력 】\n` +
    `- 기록된 모든 음식의 합계를 칼로리(kcal), 탄수화물(g), 단백질(g), 지방(g)으로 반환.\n` +
    `- 0 이상의 정수만.`;

  const url = `${BASE_URL}/${geminiModel}:generateContent?key=${geminiApiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            calories: { type: 'integer' },
            carbs: { type: 'integer' },
            protein: { type: 'integer' },
            fat: { type: 'integer' },
          },
          required: ['calories', 'carbs', 'protein', 'fat'],
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
  const parsed = JSON.parse(jsonText) as Nutrition;
  return {
    calories: Math.max(0, Math.round(parsed.calories || 0)),
    carbs: Math.max(0, Math.round(parsed.carbs || 0)),
    protein: Math.max(0, Math.round(parsed.protein || 0)),
    fat: Math.max(0, Math.round(parsed.fat || 0)),
  };
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

export async function getShoppingSuggestions(
  ingredients: Ingredient[]
): Promise<ShoppingSuggestionResult> {
  const settings = getSettings();
  const { geminiApiKey, geminiModel, excludedIngredients } = settings;
  if (!geminiApiKey) throw new Error('API 키가 설정되지 않았습니다.');

  const availableNames = ingredients.map((i) => i.name).join(', ');
  
  const prompt = `당신은 한국 가정 요리 및 식재료 전문가입니다. 
사용자가 현재 냉장고에 보유하고 있는 재료 목록을 기반으로, 마트에서 추가로 장을 보면 좋을 만한 식재료(추천 재료) 3~4가지를 제안해 주세요.
각 추천 재료별로 사용자가 냉장고에 보유 중인 재료와 결합하여 해먹을 수 있는 맛있는 한국 가정식 또는 인기 요리 레시피를 1~2개씩 함께 추천해야 합니다.

【 입력 정보 】
- 사용자가 현재 보유 중인 재료 목록: [ ${availableNames || '없음(냉장고가 비어 있음)'} ]

【 규칙 】
1. 추천하는 식재료(추천 재료)는 반드시 사용자가 현재 보유한 재료 목록에 없는 것이어야 합니다.
2. 기피 재료(${excludedIngredients || '없음'})는 절대로 추천 재료로 제안하거나 레시피에 포함해서는 안 됩니다.
3. 각 추천 재료별 예상 비용 범위(expectedCost)는 한국 대형마트 기준으로 합리적으로 추정하여 예: "3,000원 내외", "5,000원 ~ 8,000원"과 같이 작성해 주세요.
4. 각 추천 재료별 추천 사유(reason)에는 보유 중인 어떤 재료와 조합하여 어떤 시너지를 내는지 친절하게 설명해 주세요.
5. 레시피(recipes)의 ingredients 필드에는 해당 요리에 실제로 사용하는 재료 전체를 구체적 분량과 함께 나열하되, 각 재료 이름 뒤에 "(보유)", "(추천)", "(기본 양념)"을 표시해 주세요.
   예: "돼지고기 300g (추천)", "김치 1/4포기 (보유)", "두부 1/2모 (보유)", "대파 1대 (기본 양념)"
6. 기본 양념(소금, 설탕, 간장, 고추장, 된장, 식초, 식용유, 참기름, 후추, 다진마늘, 물, 고춧가루, 대파 등)은 보유 목록에 없더라도 자유롭게 레시피에 사용하고 "(기본 양념)"으로 표시할 수 있습니다.
7. 요리 이름은 반드시 실제로 존재하는 정식 요리명만 사용하세요 (예: "제육볶음", "된장찌개", "김치찌개" 등. 재료를 나열한 조잡한 이름 금지).
8. 모든 텍스트는 한국어로 작성해 주세요.
`;

  const url = `${BASE_URL}/${geminiModel}:generateContent?key=${geminiApiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            recommendations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  ingredient: { type: 'string' },
                  category: { type: 'string' },
                  expectedCost: { type: 'string' },
                  reason: { type: 'string' },
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
                required: ['ingredient', 'category', 'expectedCost', 'reason', 'recipes'],
              },
            },
          },
          required: ['recommendations'],
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

  return JSON.parse(jsonText) as ShoppingSuggestionResult;
}

