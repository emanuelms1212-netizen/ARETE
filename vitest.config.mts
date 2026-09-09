import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Next requires `jsx: "preserve"` in tsconfig so that it owns the transform.
  // Vitest has no Next compiler in front of it, so the JSX runtime is set here
  // explicitly rather than inherited from tsconfig.
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'react' },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    env: {
      NEXT_PUBLIC_APP_MODE: 'demo',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/app/**'],
    },
  },
});
