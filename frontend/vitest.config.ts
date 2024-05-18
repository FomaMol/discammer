import { defineConfig } from 'vitest/config';

// The unit suite is pure logic with no DOM, so the fast `node` environment is
// enough — no jsdom needed. `include` is scoped to data/ + utils/ tests (which
// stub their own localStorage/window) so vitest never tries to evaluate the
// React islands themselves (which import CSS).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/data/**/*.test.ts', 'src/utils/**/*.test.ts'],
  },
});
