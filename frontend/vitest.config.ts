import { defineConfig } from 'vitest/config';

// The unit suite is pure logic with no DOM, so the fast `node` environment is
// enough — no jsdom needed. data/ + utils/ tests stub their own
// localStorage/window.
//
// UX-4 added the first island test (components/**/*.test.tsx). It stays in this
// same `node` environment deliberately: with no DOM there is no
// @testing-library, so the island is rendered through react-dom/server (already
// a dependency) and its effect body is exported and driven directly. That buys
// the coverage without adding jsdom + testing-library to package.json, which the
// UX-4 constraints forbid. The trade is honest and bounded — SSR rendering
// exercises render-time logic only, so anything living in an effect must be
// exported to be testable rather than merely asserted around.
//
// `include` still leaves main.tsx alone: it imports CSS, which this config has
// no plugin to transform.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/data/**/*.test.ts',
      'src/utils/**/*.test.ts',
      'src/components/**/*.test.tsx',
    ],
  },
});
