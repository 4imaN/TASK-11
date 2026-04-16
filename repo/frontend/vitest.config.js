import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, 'src/lib'),
      '$app/navigation': path.resolve(__dirname, 'src/tests/__mocks__/navigation.js'),
      '$app/stores': path.resolve(__dirname, 'src/tests/__mocks__/stores.js'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
