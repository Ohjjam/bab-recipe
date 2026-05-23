import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

function getBuildSha(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

const buildSha = getBuildSha();
const buildDate = new Date().toISOString().slice(0, 10);

export default defineConfig({
  base: '/bab-recipe/',
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '밥 레시피',
        short_name: '밥레시피',
        description: '냉장고 재료 관리 & AI 레시피 추천',
        theme_color: '#4CAF50',
        background_color: '#FAFAF5',
        display: 'standalone',
        start_url: '/bab-recipe/',
        icons: [
          { src: '/bab-recipe/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/bab-recipe/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
});
