import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom', // Support basic DOM environments
    include: ['test/**/*.test.ts'],
  },
});
