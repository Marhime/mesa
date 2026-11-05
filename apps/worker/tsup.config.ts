import { defineConfig } from 'tsup';

// One ESM file. @mesa/shared ships TypeScript source, so it is bundled in; the npm dependencies stay
// external and are installed next to dist/ (see the Dockerfile).
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: ['@mesa/shared'],
});
