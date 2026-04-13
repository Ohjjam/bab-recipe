import { getAllIngredients } from '../db';
import { getChatHistory, addChatMessage, clearChatHistory } from '../db';
import { streamChat } from '../gemini';
import { hasApiKey } from '../settings-store';
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
      `<div class="chat-bubble ${m.role}">${escapeHtml(m.text)}</div>`
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

    try {
      const ingredients = await getAllIngredients();
      for await (const chunk of streamChat(chatMessages.slice(0, -1), ingredients)) {
        modelMsg.text += chunk;
        renderMessages();
      }
      await addChatMessage(modelMsg);
    } catch (err) {
      modelMsg.text = `오류: ${(err as Error).message}`;
      renderMessages();
    } finally {
      isStreaming = false;
      sendBtn.disabled = false;
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

  return () => {};
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
