import { getAllIngredients } from '../db';
import { streamRecipeSuggestions } from '../gemini';
import { hasApiKey } from '../settings-store';
import { navigate } from '../router';

export function renderRecipe(container: HTMLElement): void {
  container.innerHTML = `
    <button class="btn btn-primary btn-full mb-16" id="suggest-btn">🍳 레시피 추천받기</button>
    <div class="recipe-output" id="recipe-output">
      <div class="empty-state">
        <div class="empty-state-icon">📖</div>
        <div class="empty-state-text">버튼을 눌러 현재 재료로<br>만들 수 있는 레시피를 확인하세요</div>
      </div>
    </div>
    <div class="recipe-actions" id="recipe-actions" style="display:none">
      <button class="btn btn-outline" id="retry-btn" style="flex:1">🔄 다시 추천</button>
      <button class="btn btn-primary" id="chat-btn" style="flex:1">💬 이 레시피로 대화</button>
    </div>
  `;

  const suggestBtn = container.querySelector('#suggest-btn') as HTMLButtonElement;
  const output = container.querySelector('#recipe-output')!;
  const actions = container.querySelector('#recipe-actions')!;
  const retryBtn = container.querySelector('#retry-btn')!;
  const chatBtn = container.querySelector('#chat-btn')!;

  async function generate() {
    if (!hasApiKey()) {
      output.innerHTML = `<div class="status status-error">API 키를 먼저 설정해주세요. ⚙️ 설정 탭으로 이동하세요.</div>`;
      return;
    }

    const ingredients = await getAllIngredients();
    if (ingredients.length === 0) {
      output.innerHTML = `<div class="status status-error">냉장고에 재료가 없습니다. 🧊 재료 탭에서 추가해주세요.</div>`;
      return;
    }

    suggestBtn.disabled = true;
    suggestBtn.textContent = '추천 중...';
    output.textContent = '';
    (actions as HTMLElement).style.display = 'none';

    try {
      for await (const chunk of streamRecipeSuggestions(ingredients)) {
        output.textContent += chunk;
        output.scrollTop = output.scrollHeight;
      }
      (actions as HTMLElement).style.display = 'flex';
    } catch (err) {
      output.innerHTML = `<div class="status status-error">오류: ${(err as Error).message}</div>`;
    } finally {
      suggestBtn.disabled = false;
      suggestBtn.textContent = '🍳 레시피 추천받기';
    }
  }

  suggestBtn.addEventListener('click', generate);
  retryBtn.addEventListener('click', generate);
  chatBtn.addEventListener('click', () => navigate('/chat'));
}
