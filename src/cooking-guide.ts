import { escapeHtml } from './html-utils';
import type { Recipe } from './types';

// --- Step-by-step Cooking Guide overlay & timer ---
// (recipe.ts / shopping.ts에 중복돼 있던 코드를 공용 모듈로 통합)

function extractTimeFromStep(step: string): number | null {
  const hourMatch = step.match(/(\d+)\s*시간/);
  const minMatch = step.match(/(\d+)\s*분/);
  const secMatch = step.match(/(\d+)\s*초/);

  if (!hourMatch && !minMatch && !secMatch) return null;

  let totalSeconds = 0;
  if (hourMatch) totalSeconds += parseInt(hourMatch[1]) * 3600;
  if (minMatch) totalSeconds += parseInt(minMatch[1]) * 60;
  if (secMatch) totalSeconds += parseInt(secMatch[1]);

  return totalSeconds;
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (err) {
    console.error('Audio play failed:', err);
  }
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function openCookingGuide(recipe: Recipe): void {
  let currentStep = 0;
  let timerId: any = null;
  let timerSeconds = 0;
  let isTimerRunning = false;

  const overlay = document.createElement('div');
  overlay.className = 'cooking-guide-overlay';
  document.body.appendChild(overlay);

  // 폰 뒤로가기 등으로 라우트(해시)가 바뀌면 오버레이를 정리해
  // 새 페이지가 가려지거나 타이머가 백그라운드에 남지 않게 함
  function onRouteChange() {
    closeGuide();
  }
  window.addEventListener('hashchange', onRouteChange);

  function closeGuide() {
    if (timerId) clearInterval(timerId);
    window.removeEventListener('hashchange', onRouteChange);
    overlay.remove();
  }

  function renderGuideStep() {
    const stepText = recipe.steps[currentStep];
    const totalSteps = recipe.steps.length;
    const extractedSeconds = extractTimeFromStep(stepText);

    // Clean up active timer when switching steps
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    isTimerRunning = false;

    overlay.innerHTML = `
      <header class="cooking-guide-header">
        <button class="cooking-guide-close" id="guide-close">✕</button>
        <div class="cooking-guide-title">${escapeHtml(recipe.title)}</div>
        <div style="width:20px"></div>
      </header>
      <div class="cooking-guide-content">
        <div class="cooking-step-card">
          <div class="cooking-step-num">Step ${currentStep + 1} / ${totalSteps}</div>
          <div class="cooking-step-text">${escapeHtml(stepText)}</div>
        </div>

        ${extractedSeconds !== null ? `
          <div class="timer-container">
            <div class="timer-display" id="timer-display">${formatDuration(extractedSeconds)}</div>
            <div class="timer-actions">
              <button class="btn btn-primary btn-sm" id="timer-start-btn">시작</button>
              <button class="btn btn-outline btn-sm" id="timer-reset-btn">리셋</button>
            </div>
          </div>
        ` : ''}
      </div>
      <footer class="cooking-guide-footer">
        <button class="btn btn-outline" id="guide-prev" style="flex:1" ${currentStep === 0 ? 'disabled' : ''}>이전</button>
        <button class="btn btn-primary" id="guide-next" style="flex:2">
          ${currentStep === totalSteps - 1 ? '완료' : '다음 단계'}
        </button>
      </footer>
    `;

    // Bind event listeners
    overlay.querySelector('#guide-close')!.addEventListener('click', closeGuide);
    overlay.querySelector('#guide-prev')!.addEventListener('click', () => {
      if (currentStep > 0) {
        currentStep--;
        renderGuideStep();
      }
    });
    overlay.querySelector('#guide-next')!.addEventListener('click', () => {
      if (currentStep < totalSteps - 1) {
        currentStep++;
        renderGuideStep();
      } else {
        closeGuide();
      }
    });

    if (extractedSeconds !== null) {
      timerSeconds = extractedSeconds;
      const displayEl = overlay.querySelector('#timer-display')!;
      const startBtn = overlay.querySelector('#timer-start-btn') as HTMLButtonElement;
      const resetBtn = overlay.querySelector('#timer-reset-btn')!;

      startBtn.addEventListener('click', () => {
        if (isTimerRunning) {
          // Pause
          clearInterval(timerId);
          timerId = null;
          isTimerRunning = false;
          startBtn.textContent = '시작';
        } else {
          // Start
          isTimerRunning = true;
          startBtn.textContent = '일시정지';
          timerId = setInterval(() => {
            timerSeconds--;
            displayEl.textContent = formatDuration(timerSeconds);
            if (timerSeconds <= 0) {
              clearInterval(timerId);
              timerId = null;
              isTimerRunning = false;
              startBtn.textContent = '시작';
              startBtn.disabled = true;
              playBeep();
              if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
              alert('시간이 다 되었습니다! 🍳');
            }
          }, 1000);
        }
      });

      resetBtn.addEventListener('click', () => {
        if (timerId) {
          clearInterval(timerId);
          timerId = null;
        }
        isTimerRunning = false;
        timerSeconds = extractedSeconds;
        displayEl.textContent = formatDuration(timerSeconds);
        startBtn.textContent = '시작';
        startBtn.disabled = false;
      });
    }
  }

  renderGuideStep();
}
