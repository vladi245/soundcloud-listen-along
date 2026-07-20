import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'server/**'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
