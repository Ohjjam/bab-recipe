import { getSettings, saveSettings } from '../settings-store';
import { testConnection } from '../gemini';
import { clearChatHistory } from '../db';

export function renderSettings(container: HTMLElement): void {
  const settings = getSettings();

  container.innerHTML = `
    <div class="settings-group">
      <div class="settings-label">Gemini API 키</div>
      <input type="password" class="settings-input" id="api-key"
        value="${escapeAttr(settings.geminiApiKey)}"
        placeholder="Google AI Studio에서 발급받은 API 키" />
      <div class="settings-row">
        <button class="btn btn-outline" id="toggle-key" style="flex:1">키 보기</button>
        <button class="btn btn-primary" id="test-key" style="flex:1">연결 테스트</button>
      </div>
      <div id="test-result"></div>
    </div>

    <div class="settings-group">
      <div class="settings-label">AI 모델</div>
      <select class="settings-select" id="model-select">
        <option value="gemini-2.5-flash-lite" ${settings.geminiModel === 'gemini-2.5-flash-lite' ? 'selected' : ''}>Gemini 2.5 Flash Lite (가볍고 빠름)</option>
        <option value="gemini-2.5-flash" ${settings.geminiModel === 'gemini-2.5-flash' ? 'selected' : ''}>Gemini 2.5 Flash (빠름)</option>
        <option value="gemini-2.5-pro" ${settings.geminiModel === 'gemini-2.5-pro' ? 'selected' : ''}>Gemini 2.5 Pro (정확)</option>
      </select>
    </div>

    <div class="settings-group">
      <div class="settings-label">데이터 관리</div>
      <button class="btn btn-danger btn-full" id="clear-chat">채팅 기록 삭제</button>
    </div>

    <div class="settings-group text-center" style="color: var(--text-secondary); font-size: 12px;">
      밥 레시피 v1.0.0<br>
      데이터는 이 기기에만 저장됩니다
    </div>
  `;

  const apiKeyInput = container.querySelector('#api-key') as HTMLInputElement;
  const toggleBtn = container.querySelector('#toggle-key') as HTMLButtonElement;
  const testBtn = container.querySelector('#test-key') as HTMLButtonElement;
  const testResult = container.querySelector('#test-result')!;
  const modelSelect = container.querySelector('#model-select') as HTMLSelectElement;
  const clearBtn = container.querySelector('#clear-chat') as HTMLButtonElement;

  // Save API key on change
  apiKeyInput.addEventListener('change', () => {
    saveSettings({ geminiApiKey: apiKeyInput.value.trim() });
  });

  // Toggle key visibility
  toggleBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleBtn.textContent = '키 숨기기';
    } else {
      apiKeyInput.type = 'password';
      toggleBtn.textContent = '키 보기';
    }
  });

  // Test connection
  testBtn.addEventListener('click', async () => {
    saveSettings({ geminiApiKey: apiKeyInput.value.trim() });
    testBtn.disabled = true;
    testBtn.textContent = '테스트 중...';
    testResult.innerHTML = '';

    try {
      const ok = await testConnection();
      testResult.innerHTML = ok
        ? '<div class="status status-success">✅ 연결 성공!</div>'
        : '<div class="status status-error">❌ 연결 실패. API 키를 확인해주세요.</div>';
    } catch (err) {
      testResult.innerHTML = `<div class="status status-error">❌ 오류: ${(err as Error).message}</div>`;
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = '연결 테스트';
    }
  });

  // Model change
  modelSelect.addEventListener('change', () => {
    saveSettings({ geminiModel: modelSelect.value });
  });

  // Clear chat
  clearBtn.addEventListener('click', async () => {
    if (confirm('채팅 기록을 모두 삭제하시겠습니까?')) {
      await clearChatHistory();
      clearBtn.textContent = '삭제 완료!';
      setTimeout(() => { clearBtn.textContent = '채팅 기록 삭제'; }, 2000);
    }
  });
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
