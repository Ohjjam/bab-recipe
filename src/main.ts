import './style.css';
import { registerRoute, initRouter, navigate } from './router';
import { renderIngredients } from './pages/ingredients';
import { renderRecipe } from './pages/recipe';
import { renderChat } from './pages/chat';
import { renderSettings } from './pages/settings';
import { importFromUrl } from './import';

registerRoute('/ingredients', renderIngredients);
registerRoute('/recipe', renderRecipe);
registerRoute('/chat', renderChat);
registerRoute('/settings', renderSettings);

const content = document.getElementById('content')!;

// URL 파라미터로 재료 일괄 입력 처리
importFromUrl().then(() => initRouter(content));

// Bottom nav click handling
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const route = btn.getAttribute('data-route');
    if (route) navigate(route);
  });
});
