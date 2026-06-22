import { defineConfig } from 'tsdown';

export default defineConfig({
    format: ['cjs', 'esm'],
    entry: ['./src/index.ts'],
    dts: true,
    shims: true,
    deps: {
      skipNodeModulesBundle: true,
    },
    clean: true,
  target: false,
});
