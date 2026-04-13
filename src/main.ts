import './style.css';
import { registerRoute, initRouter, navigate } from './router';
import { renderIngredients } from './pages/ingredients';
import { renderRecipe } from './pages/recipe';
import { renderChat } from './pages/chat';
import { renderSettings } from './pages/settings';

registerRoute('/ingredients', renderIngredients);
registerRoute('/recipe', renderRecipe);
registerRoute('/chat', renderChat);
registerRoute('/settings', renderSettings);

const content = document.getElementById('content')!;
initRouter(content);

// Bottom nav click handling
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const route = btn.getAttribute('data-route');
    if (route) navigate(route);
  });
});
