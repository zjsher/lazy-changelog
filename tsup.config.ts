import { defineConfig } from 'tsup';

export default defineConfig([
  // Main library build (for Nx and programmatic usage)
  {
    entry: ['src/index.ts', 'src/core.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    external: [
      'nx',
      '@ai-sdk/anthropic',
      '@ai-sdk/openai',
      '@ai-sdk/google',
      'ollama-ai-provider',
    ],
  },
  // CLI build (CommonJS only, with shebang)
  {
    entry: ['src/cli.ts'],
    format: ['cjs'],
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: false,
    external: [
      'nx',
      '@ai-sdk/anthropic',
      '@ai-sdk/openai',
      '@ai-sdk/google',
      'ollama-ai-provider',
    ],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
