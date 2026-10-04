import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Cortico is an optional host with its own SDK/source dependency. Its
    // unchanged integration suite is explicit: pnpm test:cortico.
    include: ['test/**/*.test.ts'],
  },
});
