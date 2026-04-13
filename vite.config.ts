import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/bab-recipe/',
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
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
});
