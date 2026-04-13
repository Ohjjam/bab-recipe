type RouteHandler = (container: HTMLElement) => void | (() => void);

const routes = new Map<string, RouteHandler>();
let currentCleanup: (() => void) | null = null;

export function registerRoute(path: string, handler: RouteHandler): void {
  routes.set(path, handler);
}

export function navigate(path: string): void {
  window.location.hash = path;
}

export function getCurrentRoute(): string {
  return window.location.hash.slice(1) || '/ingredients';
}

export function initRouter(container: HTMLElement): void {
  function handleRoute() {
    if (currentCleanup) {
      currentCleanup();
      currentCleanup = null;
    }

    const path = getCurrentRoute();
    const handler = routes.get(path);

    if (handler) {
      container.innerHTML = '';
      const cleanup = handler(container);
      if (cleanup) currentCleanup = cleanup;
    } else {
      navigate('/ingredients');
    }

    updateActiveNav(path);
  }

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

function updateActiveNav(path: string): void {
  document.querySelectorAll('.nav-item').forEach((item) => {
    const href = item.getAttribute('data-route');
    item.classList.toggle('active', href === path);
  });
}
