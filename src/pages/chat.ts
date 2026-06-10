import { getAllIngredients } from '../db';
import { getChatHistory, addChatMessage } from '../db';
import { streamChat } from '../gemini';
import { hasApiKey } from '../settings-store';
import { escapeHtml } from '../html-utils';
import type { ChatMessage } from '../types';

export function renderChat(container: HTMLElement): () => void {
  container.innerHTML = `
    <div class="chat-container">
      <div class="chat-messages" id="chat-messages"></div>
      <div class="chat-input-bar">
        <textarea id="chat-input" placeholder="메시지를 입력하세요..." rows="1"></textarea>
        <button class="chat-send-btn" id="chat-send">➤</button>
      </div>
    </div>
  `;

  const messagesEl = container.querySelector('#chat-messages')!;
  const inputEl = container.querySelector('#chat-input') as HTMLTextAreaElement;
  const sendBtn = container.querySelector('#chat-send') as HTMLButtonElement;

  let isStreaming = false;
  let chatMessages: ChatMessage[] = [];
  let abortController: AbortController | null = null;

  function renderMessages() {
    if (chatMessages.length === 0) {
      messagesEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💬</div>
          <div class="empty-state-text">냉장고 재료를 기반으로<br>요리에 대해 물어보세요</div>
        </div>
      `;
      return;
    }
    messagesEl.innerHTML = chatMessages.map(m =>
      `<div class="chat-bubble ${m.role}">${m.role === 'model' ? renderMarkdownLite(m.text) : escapeHtml(m.text)}</div>`
    ).join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function loadHistory() {
    chatMessages = await getChatHistory();
    renderMessages();
  }

  async function sendMessage() {
    if (isStreaming) return;
    const text = inputEl.value.trim();
    if (!text) return;

    if (!hasApiKey()) {
      chatMessages.push({
        id: crypto.randomUUID(),
        role: 'model',
        text: 'API 키를 먼저 설정해주세요. ⚙️ 설정 탭으로 이동하세요.',
        timestamp: Date.now(),
      });
      renderMessages();
      return;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      timestamp: Date.now(),
    };
    chatMessages.push(userMsg);
    await addChatMessage(userMsg);
    inputEl.value = '';
    inputEl.style.height = 'auto';
    renderMessages();

    // Add placeholder for model response
    const modelMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'model',
      text: '',
      timestamp: Date.now(),
    };
    chatMessages.push(modelMsg);

    isStreaming = true;
    sendBtn.disabled = true;
    abortController = new AbortController();

    try {
      const ingredients = await getAllIngredients();
      for await (const chunk of streamChat(chatMessages.slice(0, -1), ingredients, abortController.signal)) {
        modelMsg.text += chunk;
        renderMessages();
      }
      await addChatMessage(modelMsg);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // 페이지 이탈로 중단 — 받은 부분까지 저장해서 답변이 사라지지 않게
        if (modelMsg.text) await addChatMessage(modelMsg);
      } else {
        modelMsg.text = `오류: ${(err as Error).message}`;
        renderMessages();
      }
    } finally {
      isStreaming = false;
      sendBtn.disabled = false;
      abortController = null;
    }
  }

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
  });

  // Enter to send, Shift+Enter for newline
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  loadHistory();

  // 라우트 이탈 시 진행 중인 스트리밍 중단 (분리된 DOM에 계속 렌더링하는 것 방지)
  return () => {
    abortController?.abort();
  };
}

// AI 응답의 마크다운을 가볍게 렌더링.
// 그대로 두면 **굵게**, ## 제목, * 목록 기호가 날것으로 보여 "글자가 깨진" 것처럼 보인다.
// 반드시 escape를 먼저 한 뒤 제한된 패턴만 태그로 변환하므로 XSS 위험 없음.
function renderMarkdownLite(text: string): string {
  return escapeHtml(text)
    // 제목 (#, ##, ### ...) → 굵게
    .replace(/^#{1,4}\s+(.+)$/gm, '<strong>$1</strong>')
    // **굵게**
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    // `인라인 코드`
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    // 목록 기호 (* item / - item) → 불릿
    .replace(/^[ \t]*[*-]\s+/gm, '• ');
}
