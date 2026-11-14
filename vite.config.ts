import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          if (
            id.includes('/src/data/decks.generated') ||
            id.includes('\\src\\data\\decks.generated') ||
            id.includes('/src/data/opponents') ||
            id.includes('\\src\\data\\opponents')
          ) {
            return 'data-decks';
          }
          if (
            id.includes('/src/data/cards') ||
            id.includes('\\src\\data\\cards') ||
            id.includes('/src/data/effects') ||
            id.includes('\\src\\data\\effects')
          ) {
            return 'data-cards';
          }
        },
      },
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
});
