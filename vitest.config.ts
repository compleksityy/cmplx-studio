import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/renderer/__tests__/**/*.test.ts'],
    globals: false
  }
});