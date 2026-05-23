import { getSettings, saveSettings } from '../settings-store';
import { testConnection } from '../gemini';
import { clearChatHistory, exportAllData, importAllData } from '../db';
import { emit, EVENTS } from '../state';

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
      <div class="settings-label">테마 모드</div>
      <select class="settings-select" id="theme-select">
        <option value="system" ${settings.theme === 'system' ? 'selected' : ''}>시스템 기본</option>
        <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>라이트 모드</option>
        <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>다크 모드</option>
      </select>
    </div>

    <div class="settings-group">
      <div class="settings-label">기피/제외 재료 설정</div>
      <input type="text" class="settings-input" id="excluded-ingredients"
        value="${escapeAttr(settings.excludedIngredients || '')}"
        placeholder="예: 오이, 고수, 당근 (쉼표로 구분)" />
    </div>

    <div class="settings-group">
      <div class="settings-label">일일 목표 영양소 설정</div>
      <div class="settings-row" style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
        <div>
          <label style="font-size:10px; color:var(--text-secondary); font-weight:600; display:block; margin-bottom:4px;">칼로리</label>
          <input type="number" class="settings-input" id="target-cal" value="${settings.targetCalories}" style="text-align:center; padding: 8px 6px;" />
        </div>
        <div>
          <label style="font-size:10px; color:var(--text-secondary); font-weight:600; display:block; margin-bottom:4px;">탄수(g)</label>
          <input type="number" class="settings-input" id="target-carbs" value="${settings.targetCarbs}" style="text-align:center; padding: 8px 6px;" />
        </div>
        <div>
          <label style="font-size:10px; color:var(--text-secondary); font-weight:600; display:block; margin-bottom:4px;">단백(g)</label>
          <input type="number" class="settings-input" id="target-protein" value="${settings.targetProtein}" style="text-align:center; padding: 8px 6px;" />
        </div>
        <div>
          <label style="font-size:10px; color:var(--text-secondary); font-weight:600; display:block; margin-bottom:4px;">지방(g)</label>
          <input type="number" class="settings-input" id="target-fat" value="${settings.targetFat}" style="text-align:center; padding: 8px 6px;" />
        </div>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-label">데이터 백업 및 복구</div>
      <div class="settings-row">
        <button class="btn btn-outline" id="btn-export" style="flex:1">📤 JSON 백업</button>
        <button class="btn btn-outline" id="btn-import-trigger" style="flex:1">📥 백업 복구</button>
        <input type="file" id="file-import" accept=".json" style="display:none" />
      </div>
      <div id="backup-status" style="margin-top: 8px;"></div>
      ${localStorage.getItem('bab-recipe-auto-backup') ? `
        <button class="btn btn-outline btn-full" id="btn-restore-auto" style="margin-top: 8px; font-size:12px; color: var(--primary)">
          🔄 최근 자동 백업에서 복원하기
        </button>
      ` : ''}
    </div>

    <div class="settings-group">
      <div class="settings-label">데이터 관리</div>
      <button class="btn btn-danger btn-full" id="clear-chat">채팅 기록 삭제</button>
    </div>

    <div class="settings-group">
      <div class="settings-label">앱 업데이트</div>
      <button class="btn btn-outline btn-full" id="force-update">🔄 앱 강제 업데이트</button>
      <div style="color: var(--text-secondary); font-size: 12px; margin-top: 8px;">
        앱 캐시만 비우고 새로고침합니다. 재료·기록 등 저장된 데이터는 유지됩니다.
      </div>
    </div>

    <div class="settings-group text-center" style="color: var(--text-secondary); font-size: 12px;">
      밥 레시피 v1.0.0 · <code style="font-size:11px">${__BUILD_SHA__}</code> · ${__BUILD_DATE__}<br>
      데이터는 이 기기에만 저장됩니다
    </div>
  `;

  const apiKeyInput = container.querySelector('#api-key') as HTMLInputElement;
  const toggleBtn = container.querySelector('#toggle-key') as HTMLButtonElement;
  const testBtn = container.querySelector('#test-key') as HTMLButtonElement;
  const testResult = container.querySelector('#test-result')!;
  const modelSelect = container.querySelector('#model-select') as HTMLSelectElement;
  const themeSelect = container.querySelector('#theme-select') as HTMLSelectElement;
  const excludedInput = container.querySelector('#excluded-ingredients') as HTMLInputElement;
  const clearBtn = container.querySelector('#clear-chat') as HTMLButtonElement;
  const forceUpdateBtn = container.querySelector('#force-update') as HTMLButtonElement;

  const calInput = container.querySelector('#target-cal') as HTMLInputElement;
  const carbsInput = container.querySelector('#target-carbs') as HTMLInputElement;
  const proteinInput = container.querySelector('#target-protein') as HTMLInputElement;
  const fatInput = container.querySelector('#target-fat') as HTMLInputElement;

  const exportBtn = container.querySelector('#btn-export') as HTMLButtonElement;
  const importTrigger = container.querySelector('#btn-import-trigger') as HTMLButtonElement;
  const fileInput = container.querySelector('#file-import') as HTMLInputElement;
  const restoreAutoBtn = container.querySelector('#btn-restore-auto') as HTMLButtonElement | null;
  const backupStatus = container.querySelector('#backup-status')!;

  // Save API key
  apiKeyInput.addEventListener('change', () => {
    saveSettings({ geminiApiKey: apiKeyInput.value.trim() });
  });

  // Toggle API key visibility
  toggleBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleBtn.textContent = '키 숨기기';
    } else {
      apiKeyInput.type = 'password';
      toggleBtn.textContent = '키 보기';
    }
  });

  // Connection Test
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

  // Model Selection
  modelSelect.addEventListener('change', () => {
    saveSettings({ geminiModel: modelSelect.value });
  });

  // Theme Mode
  themeSelect.addEventListener('change', () => {
    saveSettings({ theme: themeSelect.value as any });
  });

  // Excluded ingredients
  excludedInput.addEventListener('change', () => {
    saveSettings({ excludedIngredients: excludedInput.value.trim() });
  });

  // Daily nutrition targets
  const saveTargets = () => {
    saveSettings({
      targetCalories: parseInt(calInput.value) || 2000,
      targetCarbs: parseInt(carbsInput.value) || 250,
      targetProtein: parseInt(proteinInput.value) || 100,
      targetFat: parseInt(fatInput.value) || 60,
    });
  };
  calInput.addEventListener('change', saveTargets);
  carbsInput.addEventListener('change', saveTargets);
  proteinInput.addEventListener('change', saveTargets);
  fatInput.addEventListener('change', saveTargets);

  // Backup data
  exportBtn.addEventListener('click', async () => {
    try {
      const dataStr = await exportAllData();
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bab-recipe-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      backupStatus.innerHTML = '<div class="status status-success">✅ 백업 완료! JSON 파일이 다운로드되었습니다.</div>';
      setTimeout(() => { backupStatus.innerHTML = ''; }, 3000);
    } catch (err) {
      alert('백업 실패: ' + (err as Error).message);
    }
  });

  // Restore data from file
  importTrigger.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    if (!confirm('⚠️ 데이터 복구를 진행하면 기존에 작성된 모든 재료, 식단 일기, 북마크 내역이 삭제되고 이 백업 파일의 데이터로 대체됩니다.\n정말로 복구하시겠습니까?')) {
      fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        await importAllData(text);
        
        emit(EVENTS.INGREDIENTS_CHANGED);
        emit(EVENTS.BOOKMARKS_CHANGED);
        emit(EVENTS.MEALS_CHANGED);
        
        backupStatus.innerHTML = '<div class="status status-success">✅ 성공적으로 복구되었습니다! 잠시 후 화면을 새로고침합니다.</div>';
        setTimeout(() => { location.reload(); }, 1500);
      } catch (err) {
        alert('복구 오류: 유효한 백업 파일이 아니거나 형식이 다릅니다. ' + (err as Error).message);
      } finally {
        fileInput.value = '';
      }
    };
    reader.readAsText(file);
  });

  // Restore from local auto backup
  restoreAutoBtn?.addEventListener('click', async () => {
    const backupStr = localStorage.getItem('bab-recipe-auto-backup');
    if (!backupStr) return;

    if (!confirm('⚠️ 최근에 저장된 자동 로컬 백업에서 데이터를 복원합니다.\n기존의 모든 데이터는 복구 데이터로 대체됩니다.\n진행할까요?')) return;

    try {
      await importAllData(backupStr);
      emit(EVENTS.INGREDIENTS_CHANGED);
      emit(EVENTS.BOOKMARKS_CHANGED);
      emit(EVENTS.MEALS_CHANGED);
      backupStatus.innerHTML = '<div class="status status-success">✅ 자동 백업에서 성공적으로 복원했습니다! 새로고침합니다.</div>';
      setTimeout(() => { location.reload(); }, 1500);
    } catch (err) {
      alert('자동 복원 오류: ' + (err as Error).message);
    }
  });

  // Clear Chat History
  clearBtn.addEventListener('click', async () => {
    if (confirm('채팅 기록을 모두 삭제하시겠습니까?')) {
      await clearChatHistory();
      clearBtn.textContent = '삭제 완료!';
      setTimeout(() => { clearBtn.textContent = '채팅 기록 삭제'; }, 2000);
    }
  });

  // Force Update
  forceUpdateBtn.addEventListener('click', async () => {
    if (!confirm('앱을 강제로 업데이트합니다.\n저장된 재료·기록·레시피는 그대로 유지됩니다.\n계속할까요?')) return;
    forceUpdateBtn.disabled = true;
    forceUpdateBtn.textContent = '업데이트 중...';
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      location.reload();
    } catch (err) {
      forceUpdateBtn.disabled = false;
      forceUpdateBtn.textContent = '🔄 앱 강제 업데이트';
      alert('업데이트 실패: ' + (err as Error).message);
    }
  });
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
